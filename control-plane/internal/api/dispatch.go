package api

import (
	"context"
	"encoding/json"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/db"
	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/redis"
)

// Dispatcher is the one way a job gets queued: insert the row first (so a
// job_id exists even if Redis or the worker is briefly down), then enqueue,
// and mark the row failed if enqueuing fails rather than leave it lying
// about being queued. Shared by the Pipelines "run" endpoint and by the
// dataset handlers, which queue fetch/ingest jobs on the user's behalf.
type Dispatcher struct {
	db    *db.DB
	redis *redis.Client
}

func NewDispatcher(database *db.DB, redisClient *redis.Client) *Dispatcher {
	return &Dispatcher{db: database, redis: redisClient}
}

// Dispatch queues one job for a project. params is the JSON the DB row
// keeps verbatim (for audit fidelity); the Redis copy additionally carries
// job_id and project_id so the worker knows its own run.
func (d *Dispatcher) Dispatch(ctx context.Context, projectID, jobType string, params []byte) (jobs.Run, error) {
	if len(params) == 0 {
		params = []byte("{}")
	}
	run, err := d.db.InsertJobRun(ctx, projectID, jobType, params)
	if err != nil {
		return jobs.Run{}, err
	}

	var paramsMap map[string]any
	if err := json.Unmarshal(params, &paramsMap); err != nil || paramsMap == nil {
		paramsMap = map[string]any{}
	}
	paramsMap["job_id"] = run.ID
	paramsMap["project_id"] = run.ProjectID
	enqueueParams, err := json.Marshal(paramsMap)
	if err != nil {
		return d.failRun(ctx, run, "failed to encode enqueue params: "+err.Error()), nil
	}

	if err := d.redis.EnqueueJob(ctx, redis.JobRequest{
		JobID:       run.ID,
		JobType:     jobType,
		Params:      enqueueParams,
		SubmittedAt: run.SubmittedAt.Format(time.RFC3339),
	}); err != nil {
		return d.failRun(ctx, run, "failed to enqueue: "+err.Error()), nil
	}
	return run, nil
}

// failRun records an enqueue failure on the already-inserted row and
// returns the run as the caller should report it. The row insert itself
// succeeded, so this is not an error from the caller's point of view: the
// run exists, it just failed immediately.
func (d *Dispatcher) failRun(ctx context.Context, run jobs.Run, msg string) jobs.Run {
	_ = d.db.MarkFailed(ctx, run.ID, msg)
	run.Status = jobs.StatusFailed
	run.Error = &msg
	return run
}
