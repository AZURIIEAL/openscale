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
	"github.com/AZURIIEAL/openscale/control-plane/internal/docker"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// workerContainerName is the single worker container that consumes the
// Redis job-request stream one message at a time -- restarting it is the
// only way to hard-stop a job that's actively running (see CancelAll).
const workerContainerName = "openscale-worker"

// JobsHandler serves the job-trigger and job-history endpoints -- the
// read/write surface backing the frontend's Pipelines domain.
type JobsHandler struct {
	db      *db.DB
	redis   *redis.Client
	watcher *docker.Watcher
}

func NewJobsHandler(database *db.DB, redisClient *redis.Client, watcher *docker.Watcher) *JobsHandler {
	return &JobsHandler{db: database, redis: redisClient, watcher: watcher}
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

// CancelAllResponse reports which runs were cancelled.
type CancelAllResponse struct {
	Cancelled []jobs.Run `json:"cancelled"`
}

// CancelAll handles POST /api/jobs/cancel-all. Queued runs are cooperatively
// cancelled (the worker checks each run's status before executing it and
// skips ones already marked cancelled, see worker/db.py's mark_running).
// A running run has no such interrupt point -- the worker runs a single
// synchronous Spark call per job with nothing polling for a cancel signal --
// so the only way to actually stop it is to restart the worker container,
// same Docker action the Infrastructure screen already exposes per-service.
func (h *JobsHandler) CancelAll(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	cancelled, err := h.db.CancelActiveRuns(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	runs := make([]jobs.Run, 0, len(cancelled))
	hadRunning := false
	for _, c := range cancelled {
		runs = append(runs, c.Run)
		if c.WasRunning {
			hadRunning = true
		}
		_ = h.redis.PublishJobEvent(ctx, redis.JobEvent{
			JobID:  c.Run.ID,
			Type:   "status",
			Status: string(jobs.StatusCancelled),
			At:     time.Now().UTC().Format(time.RFC3339),
		})
	}

	if hadRunning {
		if err := h.watcher.Restart(ctx, workerContainerName); err != nil {
			http.Error(w, "cancelled in the database, but failed to restart the worker: "+err.Error(), http.StatusBadGateway)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(CancelAllResponse{Cancelled: runs})
}
