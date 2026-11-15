package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
	"github.com/AZURIIEAL/openscale/control-plane/internal/pipelines"
)

const pipelineColumns = `id::text, project_id::text, name, description, steps, created_at, updated_at`

func scanPipeline(row pgx.Row) (pipelines.Pipeline, error) {
	var p pipelines.Pipeline
	var steps []byte
	if err := row.Scan(&p.ID, &p.ProjectID, &p.Name, &p.Description, &steps, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return p, err
	}
	if err := json.Unmarshal(steps, &p.Steps); err != nil {
		return p, fmt.Errorf("db: pipeline %s: bad steps json: %w", p.ID, err)
	}
	return p, nil
}

func notFound(err error, what string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("db: %s: %w", what, ErrNotFound)
	}
	return fmt.Errorf("db: %s: %w", what, err)
}

// ListPipelines returns a project's pipelines by name.
func (d *DB) ListPipelines(ctx context.Context, projectID string) ([]pipelines.Pipeline, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+pipelineColumns+` FROM control_plane.pipelines WHERE project_id = $1::uuid ORDER BY name`, projectID)
	if err != nil {
		return nil, fmt.Errorf("db: list pipelines: %w", err)
	}
	defer rows.Close()
	out := []pipelines.Pipeline{}
	for rows.Next() {
		p, err := scanPipeline(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetPipeline fetches one pipeline by name.
func (d *DB) GetPipeline(ctx context.Context, projectID, name string) (pipelines.Pipeline, error) {
	p, err := scanPipeline(d.pool.QueryRow(ctx,
		`SELECT `+pipelineColumns+` FROM control_plane.pipelines WHERE project_id = $1::uuid AND name = $2`, projectID, name))
	if err != nil {
		return p, notFound(err, "pipeline "+name)
	}
	return p, nil
}

// CreatePipeline inserts a pipeline; a taken name is ErrConflict.
func (d *DB) CreatePipeline(ctx context.Context, projectID, name, description string, steps []pipelines.Step) (pipelines.Pipeline, error) {
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return pipelines.Pipeline{}, err
	}
	p, err := scanPipeline(d.pool.QueryRow(ctx,
		`INSERT INTO control_plane.pipelines (project_id, name, description, steps)
		 VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING `+pipelineColumns,
		projectID, name, description, stepsJSON))
	if err != nil {
		if isUniqueViolation(err) {
			return p, fmt.Errorf("db: create pipeline: name %q: %w", name, ErrConflict)
		}
		return p, fmt.Errorf("db: create pipeline: %w", err)
	}
	return p, nil
}

// UpdatePipeline replaces a pipeline's description and steps. Runs already
// going keep the steps they started with.
func (d *DB) UpdatePipeline(ctx context.Context, projectID, name, description string, steps []pipelines.Step) (pipelines.Pipeline, error) {
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return pipelines.Pipeline{}, err
	}
	p, err := scanPipeline(d.pool.QueryRow(ctx,
		`UPDATE control_plane.pipelines SET description = $3, steps = $4::jsonb, updated_at = now()
		 WHERE project_id = $1::uuid AND name = $2 RETURNING `+pipelineColumns,
		projectID, name, description, stepsJSON))
	if err != nil {
		return p, notFound(err, "pipeline "+name)
	}
	return p, nil
}

// DeletePipeline removes a pipeline. Its runs stay, unlinked.
func (d *DB) DeletePipeline(ctx context.Context, projectID, name string) error {
	tag, err := d.pool.Exec(ctx,
		`DELETE FROM control_plane.pipelines WHERE project_id = $1::uuid AND name = $2`, projectID, name)
	if err != nil {
		return fmt.Errorf("db: delete pipeline: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: pipeline %s: %w", name, ErrNotFound)
	}
	return nil
}

// pipelineRunColumns reads a run from alias r, with its step jobs.
const pipelineRunColumns = `r.id::text, r.project_id::text, r.pipeline_id::text, r.pipeline_name, r.steps, r.status,
	r.current_step, r.error, r.submitted_at, r.finished_at,
	COALESCE((SELECT json_agg(json_build_object('stepIndex', j.step_index, 'runId', j.id::text, 'status', j.status)
	                          ORDER BY j.step_index)
	            FROM control_plane.job_runs j WHERE j.pipeline_run_id = r.id), '[]'::json)`

func scanPipelineRun(row pgx.Row) (pipelines.Run, error) {
	var r pipelines.Run
	var steps, stepJobs []byte
	err := row.Scan(&r.ID, &r.ProjectID, &r.PipelineID, &r.PipelineName, &steps, &r.Status,
		&r.CurrentStep, &r.Error, &r.SubmittedAt, &r.FinishedAt, &stepJobs)
	if err != nil {
		return r, err
	}
	if err := json.Unmarshal(steps, &r.Steps); err != nil {
		return r, fmt.Errorf("db: pipeline run %s: bad steps json: %w", r.ID, err)
	}
	if err := json.Unmarshal(stepJobs, &r.Jobs); err != nil {
		return r, fmt.Errorf("db: pipeline run %s: bad jobs json: %w", r.ID, err)
	}
	return r, nil
}

func (d *DB) queryPipelineRuns(ctx context.Context, where string, args ...any) ([]pipelines.Run, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+pipelineRunColumns+` FROM control_plane.pipeline_runs r WHERE `+where, args...)
	if err != nil {
		return nil, fmt.Errorf("db: list pipeline runs: %w", err)
	}
	defer rows.Close()
	out := []pipelines.Run{}
	for rows.Next() {
		r, err := scanPipelineRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// StartPipelineRun records a new running run of p with the given steps;
// the orchestrator queues its first job.
func (d *DB) StartPipelineRun(ctx context.Context, p pipelines.Pipeline, steps []pipelines.Step) (pipelines.Run, error) {
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return pipelines.Run{}, err
	}
	r, err := scanPipelineRun(d.pool.QueryRow(ctx,
		`WITH r AS (
		   INSERT INTO control_plane.pipeline_runs (project_id, pipeline_id, pipeline_name, steps)
		   VALUES ($1::uuid, $2::uuid, $3, $4::jsonb) RETURNING *)
		 SELECT `+pipelineRunColumns+` FROM r`,
		p.ProjectID, p.ID, p.Name, stepsJSON))
	if err != nil {
		return r, fmt.Errorf("db: start pipeline run: %w", err)
	}
	return r, nil
}

// ListPipelineRuns returns a project's newest pipeline runs.
func (d *DB) ListPipelineRuns(ctx context.Context, projectID string, limit int) ([]pipelines.Run, error) {
	return d.queryPipelineRuns(ctx, `r.project_id = $1::uuid ORDER BY r.submitted_at DESC LIMIT $2`, projectID, limit)
}

// GetPipelineRun fetches one of a project's pipeline runs.
func (d *DB) GetPipelineRun(ctx context.Context, projectID, id string) (pipelines.Run, error) {
	r, err := scanPipelineRun(d.pool.QueryRow(ctx,
		`SELECT `+pipelineRunColumns+` FROM control_plane.pipeline_runs r WHERE r.project_id = $1::uuid AND r.id::text = $2`,
		projectID, id))
	if err != nil {
		return r, notFound(err, "pipeline run "+id)
	}
	return r, nil
}

// RunningPipelineRuns returns every project's running pipeline runs, oldest
// first: the orchestrator's work list.
func (d *DB) RunningPipelineRuns(ctx context.Context) ([]pipelines.Run, error) {
	return d.queryPipelineRuns(ctx, `r.status = 'running' ORDER BY r.submitted_at`)
}

// AdvancePipelineRun moves a running run from step `from` to the next one.
// It is a no-op when the run already moved or stopped.
func (d *DB) AdvancePipelineRun(ctx context.Context, id string, from int) (bool, error) {
	tag, err := d.pool.Exec(ctx,
		`UPDATE control_plane.pipeline_runs SET current_step = current_step + 1
		 WHERE id = $1::uuid AND status = 'running' AND current_step = $2`, id, from)
	if err != nil {
		return false, fmt.Errorf("db: advance pipeline run: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// FinishPipelineRun ends a running run with status (and an error message
// for failed/cancelled). It is a no-op on a run that already ended.
func (d *DB) FinishPipelineRun(ctx context.Context, id string, status jobs.Status, errMsg *string) (bool, error) {
	tag, err := d.pool.Exec(ctx,
		`UPDATE control_plane.pipeline_runs SET status = $2, error = $3, finished_at = now()
		 WHERE id = $1::uuid AND status = 'running'`, id, string(status), errMsg)
	if err != nil {
		return false, fmt.Errorf("db: finish pipeline run: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// CancelRunningPipelineRuns cancels every running pipeline run of a project
// (the Pipelines screen's Stop all). Their jobs are cancelled separately.
func (d *DB) CancelRunningPipelineRuns(ctx context.Context, projectID string) error {
	_, err := d.pool.Exec(ctx,
		`UPDATE control_plane.pipeline_runs SET status = 'cancelled', error = 'Cancelled by user', finished_at = now()
		 WHERE project_id = $1::uuid AND status = 'running'`, projectID)
	if err != nil {
		return fmt.Errorf("db: cancel pipeline runs: %w", err)
	}
	return nil
}

// InsertStepJobRun creates the queued job run for one step of a pipeline
// run, but only while that run is still running: FOR SHARE makes a
// concurrent cancel wait for this insert (and then cancel the new job too)
// or win outright (and then nothing is inserted). ok is false when the run
// had stopped or the step already has a job.
func (d *DB) InsertStepJobRun(ctx context.Context, pipelineRunID string, stepIndex int, jobType string, params []byte) (run jobs.Run, ok bool, err error) {
	run, err = scanRun(d.pool.QueryRow(ctx,
		`INSERT INTO control_plane.job_runs (project_id, job_type, params, pipeline_run_id, step_index)
		 SELECT project_id, $3, $4, id, $2 FROM control_plane.pipeline_runs
		  WHERE id = $1::uuid AND status = 'running' FOR SHARE
		 ON CONFLICT (pipeline_run_id, step_index) WHERE pipeline_run_id IS NOT NULL DO NOTHING
		 RETURNING `+runColumns,
		pipelineRunID, stepIndex, jobType, params))
	if errors.Is(err, pgx.ErrNoRows) {
		return jobs.Run{}, false, nil
	}
	if err != nil {
		return jobs.Run{}, false, fmt.Errorf("db: insert step job run: %w", err)
	}
	return run, true, nil
}
