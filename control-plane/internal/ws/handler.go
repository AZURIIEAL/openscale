package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"nhooyr.io/websocket"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

// RunLookup fetches a job run's current state for the connect-time
// backfill frame. An interface, not a concrete *db.DB, so this package
// doesn't need to import internal/db -- keeps ws a leaf dependency.
type RunLookup interface {
	GetJobRun(ctx context.Context, id string) (jobs.Run, error)
}

// Handler serves the job-status WebSocket endpoint.
type Handler struct {
	hub           *Hub
	lookup        RunLookup
	allowedOrigin string
}

// NewHandler builds a Handler. allowedOrigin is the frontend's origin
// (e.g. "http://localhost:5173") -- nhooyr enforces its own Origin check on
// the WS upgrade independent of chi's CORS middleware (which is HTTP-only
// and doesn't cover the upgrade), so this must be set explicitly or every
// browser connection gets rejected.
func NewHandler(hub *Hub, lookup RunLookup, allowedOrigin string) *Handler {
	return &Handler{hub: hub, lookup: lookup, allowedOrigin: OriginPattern(allowedOrigin)}
}

// OriginPattern strips the scheme off origin so it matches nhooyr's
// OriginPatterns matcher, which compares against the bare host:port.
// Exported so internal/streaming's WS handler (same origin-check
// requirement, different Hub) can reuse it instead of duplicating the
// scheme-stripping logic.
func OriginPattern(origin string) string {
	origin = strings.TrimPrefix(origin, "https://")
	origin = strings.TrimPrefix(origin, "http://")
	return origin
}

// HandleJobWS upgrades to a WebSocket, sends one backfill frame for the
// run's current state, then relays live events until the run reaches a
// terminal status, the client disconnects, or the request context ends.
func (h *Handler) HandleJobWS(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{h.allowedOrigin},
	})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ctx := r.Context()

	run, err := h.lookup.GetJobRun(ctx, jobID)
	if err != nil {
		_ = conn.Close(websocket.StatusNormalClosure, "job not found")
		return
	}
	if writeJSON(ctx, conn, run) != nil {
		return
	}
	if isTerminal(run.Status) {
		_ = conn.Close(websocket.StatusNormalClosure, "terminal")
		return
	}

	events, unsubscribe := h.hub.Subscribe(jobID)
	defer unsubscribe()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if writeJSON(ctx, conn, event) != nil {
				return
			}
			if event.Type == "status" && isTerminal(jobs.Status(event.Status)) {
				_ = conn.Close(websocket.StatusNormalClosure, "terminal")
				return
			}
		}
	}
}

func isTerminal(s jobs.Status) bool {
	return s == jobs.StatusSucceeded || s == jobs.StatusPartial || s == jobs.StatusFailed
}

func writeJSON(ctx context.Context, conn *websocket.Conn, v any) error {
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return conn.Write(writeCtx, websocket.MessageText, data)
}
