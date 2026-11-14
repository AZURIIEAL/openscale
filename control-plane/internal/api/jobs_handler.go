package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// maxParamsBytes caps a run request body; params are a handful of fields.
const maxParamsBytes = 64 << 10

// JobsHandler serves the job catalog and the job-trigger and job-history
// endpoints -- the read/write surface backing the frontend's Pipelines domain.
type JobsHandler struct {
	db         *db.DB
	redis      *redis.Client
	dispatcher *Dispatcher
}

func NewJobsHandler(database *db.DB, redisClient *redis.Client) *JobsHandler {
	return &JobsHandler{db: database, redis: redisClient, dispatcher: NewDispatcher(database, redisClient)}
}

// Catalog handles GET /api/jobs/catalog: every job type the worker
// publishes, with the params schema the frontend renders run forms from.
func (h *JobsHandler) Catalog(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	defs, err := h.db.ListJobDefinitions(ctx)
	if err != nil {
		writeJobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, defs)
}

// Run handles POST /api/projects/{projectId}/jobs/{type}/run. The type must
// be published in the job catalog and the body must satisfy its params
// schema; see Dispatcher for the insert-then-enqueue contract.
func (h *JobsHandler) Run(w http.ResponseWriter, r *http.Request) {
	project, _ := ProjectFromContext(r.Context())
	jobType := chi.URLParam(r, "type")

	body, err := io.ReadAll(io.LimitReader(r.Body, maxParamsBytes+1))
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	if len(body) > maxParamsBytes {
		http.Error(w, "params body too large", http.StatusRequestEntityTooLarge)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	def, err := h.db.GetJobDefinition(ctx, jobType)
	if err == nil {
		err = def.CheckAvailable(project.HasFeature)
	}
	if err != nil {
		writeJobErr(w, err)
		return
	}
	params, err := jobs.ParseParams(body)
	if err == nil {
		err = def.ValidateParams(params)
	}
	if err != nil {
		writeJobErr(w, err)
		return
	}

	run, err := h.dispatcher.Dispatch(ctx, project.ID, jobType, body)
	if err != nil {
		writeJobErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(run)
}

// ListRunsResponse wraps the page of runs with whether older rows remain,
// so the frontend can render/disable a next-page arrow without a count query.
type ListRunsResponse struct {
	Runs    []jobs.Run `json:"runs"`
	HasMore bool       `json:"hasMore"`
}

// ListRuns handles GET /api/projects/{projectId}/jobs/runs?limit=10&offset=0.
func (h *JobsHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	project, _ := ProjectFromContext(r.Context())
	runs, hasMore, err := h.db.ListJobRuns(ctx, project.ID, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ListRunsResponse{Runs: runs, HasMore: hasMore})
}

// ClearRuns handles DELETE /api/projects/{projectId}/jobs/runs, removing every terminal run so
// the history table can be reset. In-flight (queued/running) rows are left
// alone -- see db.ClearTerminalRuns.
func (h *JobsHandler) ClearRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	project, _ := ProjectFromContext(r.Context())
	if err := h.db.ClearTerminalRuns(ctx, project.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// CancelAllResponse reports which runs were cancelled.
type CancelAllResponse struct {
	Cancelled []jobs.Run `json:"cancelled"`
}

// CancelAll handles POST /api/projects/{projectId}/jobs/cancel-all. Every
// queued or running run of the project is marked cancelled at once. Queued
// runs are skipped by the worker when it reaches them (worker/db.py's
// mark_running). Each running run gets its Redis control flag set: the
// worker runs every job in its own child process and stops that process on
// the flag (worker/runner.py), so only those jobs end -- the worker
// container and other projects' runs carry on.
func (h *JobsHandler) CancelAll(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	project, _ := ProjectFromContext(r.Context())
	cancelled, err := h.db.CancelActiveRuns(ctx, project.ID)
	if err != nil {
		writeJobErr(w, err)
		return
	}

	runs := make([]jobs.Run, 0, len(cancelled))
	for _, c := range cancelled {
		runs = append(runs, c.Run)
		if c.WasRunning {
			if err := h.redis.SetJobControlField(ctx, c.Run.ID, "cancelled", "true"); err != nil {
				http.Error(w, "cancelled in the database, but could not signal the worker: "+err.Error(), http.StatusBadGateway)
				return
			}
		}
		_ = h.redis.PublishJobEvent(ctx, redis.JobEvent{
			JobID:  c.Run.ID,
			Type:   "status",
			Status: string(jobs.StatusCancelled),
			At:     time.Now().UTC().Format(time.RFC3339),
		})
	}

	writeJSON(w, http.StatusOK, CancelAllResponse{Cancelled: runs})
}

// controlRequest is the body of POST /api/jobs/{id}/control.
type controlRequest struct {
	Action          string   `json:"action"`
	SpeedMultiplier *float64 `json:"speedMultiplier,omitempty"`
}

// validSpeedMultipliers are the only playback-speed values the Streaming
// screen's UI exposes -- anything else is rejected rather than silently
// clamped, since a bogus value here almost certainly means a frontend bug.
var validSpeedMultipliers = map[float64]bool{1: true, 2: true, 3: true, 5: true, 10: true}

// Control handles POST /api/projects/{projectId}/jobs/{id}/control -- a live command into a
// running job's Redis control hash (openscale:jobs:{id}:control). `cancel`
// works for every job (the worker's runner stops the job's process);
// pause, resume and setSpeed are only read by the `replay` job's send loop
// (worker/jobs/replay.py).
// This deliberately doesn't check the run's current DB status first: the
// same "fire and let the worker notice, or no-op if nobody's listening"
// tolerance for staleness this feature already has elsewhere (a command
// reaching a job that already finished is harmless -- the control hash
// TTLs out on its own).
func (h *JobsHandler) Control(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req controlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var err error
	switch req.Action {
	case "pause":
		err = h.redis.SetJobControlField(ctx, id, "paused", "true")
	case "resume":
		err = h.redis.SetJobControlField(ctx, id, "paused", "false")
	case "cancel":
		err = h.redis.SetJobControlField(ctx, id, "cancelled", "true")
	case "setSpeed":
		if req.SpeedMultiplier == nil || !validSpeedMultipliers[*req.SpeedMultiplier] {
			http.Error(w, "speedMultiplier must be one of 1, 2, 3, 5, 10", http.StatusBadRequest)
			return
		}
		err = h.redis.SetJobControlField(ctx, id, "speed", strconv.Itoa(int(*req.SpeedMultiplier)))
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// writeJobErr maps the job domain's errors to HTTP statuses.
func writeJobErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, jobs.ErrInvalidParams), errors.Is(err, jobs.ErrUnavailable):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "unknown job type", http.StatusNotFound)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
