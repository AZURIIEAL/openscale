package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// JobsHandler serves the job-trigger and job-history endpoints -- the
// read/write surface backing the frontend's Pipelines domain.
type JobsHandler struct {
	db    *db.DB
	redis *redis.Client
}

func NewJobsHandler(database *db.DB, redisClient *redis.Client) *JobsHandler {
	return &JobsHandler{db: database, redis: redisClient}
}

// Run handles POST /api/jobs/{type}/run. It inserts the queued row first
// (so a job_id exists immediately, even if enqueuing or the worker is
// briefly unavailable) and only then enqueues onto Redis -- if enqueuing
// fails, the row is marked failed right away rather than left lying about
// being queued.
func (h *JobsHandler) Run(w http.ResponseWriter, r *http.Request) {
	jobType := chi.URLParam(r, "type")
	if !jobs.IsKnownJobType(jobType) {
		http.Error(w, "unknown job type", http.StatusNotFound)
		return
	}

	params, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	if len(params) == 0 {
		params = []byte("{}")
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	run, err := h.db.InsertJobRun(ctx, jobType, params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	enqueueErr := h.redis.EnqueueJob(ctx, redis.JobRequest{
		JobID:       run.ID,
		JobType:     jobType,
		Params:      params,
		SubmittedAt: run.SubmittedAt.Format(time.RFC3339),
	})
	if enqueueErr != nil {
		errMsg := "failed to enqueue: " + enqueueErr.Error()
		_ = h.db.MarkFailed(ctx, run.ID, errMsg)
		run.Status = jobs.StatusFailed
		run.Error = &errMsg
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

// ListRuns handles GET /api/jobs/runs?limit=10&offset=0.
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

	runs, hasMore, err := h.db.ListJobRuns(ctx, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ListRunsResponse{Runs: runs, HasMore: hasMore})
}

// ClearRuns handles DELETE /api/jobs/runs, removing every terminal run so
// the history table can be reset. In-flight (queued/running) rows are left
// alone -- see db.ClearTerminalRuns.
func (h *JobsHandler) ClearRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.db.ClearTerminalRuns(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
