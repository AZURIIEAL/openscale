package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"nhooyr.io/websocket"

	"github.com/AZURIIEAL/openscale/control-plane/internal/streaming"
	"github.com/AZURIIEAL/openscale/control-plane/internal/ws"
)

const streamingAdminTimeout = 5 * time.Second

// StreamingHandler serves the Streaming screen's Kafka topic snapshot and
// live WebSocket feed. Topics mirrors QueryHandler's "always 200, put the
// failure in the payload" convention; WS mirrors ws.Handler's
// origin/upgrade pattern, against streaming.StreamHub instead of the
// per-job ws.Hub.
type StreamingHandler struct {
	client        *streaming.Client
	hub           *streaming.StreamHub
	allowedOrigin string
}

func NewStreamingHandler(client *streaming.Client, hub *streaming.StreamHub, allowedOrigin string) *StreamingHandler {
	return &StreamingHandler{client: client, hub: hub, allowedOrigin: ws.OriginPattern(allowedOrigin)}
}

type topicsResponse struct {
	Topics          []streaming.TopicInfo `json:"topics"`
	BrokerReachable bool                  `json:"brokerReachable"`
}

// Topics handles GET /api/streaming/topics. Always responds HTTP 200 -- a
// Kafka dial failure (broker not up yet, briefly restarting) is a normal
// state for this screen to represent as brokerReachable:false, not a
// transport error; see query_handler.go's Run for the same convention.
func (h *StreamingHandler) Topics(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), streamingAdminTimeout)
	defer cancel()

	w.Header().Set("Content-Type", "application/json")

	topics, err := h.client.ListTopics(ctx)
	if err != nil {
		_ = json.NewEncoder(w).Encode(topicsResponse{Topics: []streaming.TopicInfo{}, BrokerReachable: false})
		return
	}
	_ = json.NewEncoder(w).Encode(topicsResponse{Topics: topics, BrokerReachable: true})
}

// WS handles GET /api/streaming/ws, relaying every broadcast Frame to this
// connection until the client disconnects or the request context ends. No
// connect-time backfill (unlike ws.Handler's per-job socket) -- a fresh tab
// intentionally starts empty and waits for the next live tick rather than
// replaying history nobody asked for.
func (h *StreamingHandler) WS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{h.allowedOrigin},
	})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	ctx := r.Context()
	frames, unsubscribe := h.hub.Subscribe()
	defer unsubscribe()

	for {
		select {
		case <-ctx.Done():
			return
		case frame, ok := <-frames:
			if !ok {
				return
			}
			if err := h.write(ctx, conn, frame); err != nil {
				return
			}
		}
	}
}

func (h *StreamingHandler) write(ctx context.Context, conn *websocket.Conn, frame streaming.Frame) error {
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	data, err := json.Marshal(frame)
	if err != nil {
		return nil // malformed frame -- skip rather than kill the connection
	}
	return conn.Write(writeCtx, websocket.MessageText, data)
}

// ProjectTopics handles GET /api/projects/{p}/streaming/topics: the
// project's own topics (`{slug}.*`), same shape and convention as Topics.
func (h *StreamingHandler) ProjectTopics(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), streamingAdminTimeout)
	defer cancel()

	all, err := h.client.ListTopics(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, topicsResponse{Topics: []streaming.TopicInfo{}, BrokerReachable: false})
		return
	}
	mine := []streaming.TopicInfo{}
	for _, t := range all {
		if streaming.TopicAllowed(project.Slug, t.Name) {
			mine = append(mine, t)
		}
	}
	writeJSON(w, http.StatusOK, topicsResponse{Topics: mine, BrokerReachable: true})
}

// ProjectWS handles GET /api/projects/{p}/streaming/ws?topic=: a live tail
// of one of the project's topics (streaming.Client.Tail), from now on.
func (h *StreamingHandler) ProjectWS(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	topic := r.URL.Query().Get("topic")
	if !streaming.TopicAllowed(project.Slug, topic) {
		http.Error(w, "topic must be one of this project's ("+streaming.ProjectTopicPrefix(project.Slug)+"*)", http.StatusBadRequest)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{h.allowedOrigin}})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	// CloseRead ends ctx when the browser goes away (this socket only sends).
	ctx := conn.CloseRead(r.Context())
	h.client.Tail(ctx, topic, func(frame streaming.TailFrame) error {
		data, err := json.Marshal(frame)
		if err != nil {
			return nil
		}
		writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return conn.Write(writeCtx, websocket.MessageText, data)
	})
}
