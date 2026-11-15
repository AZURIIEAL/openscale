-- Phase 4d: pipelines as data. A pipeline is an ordered list of job steps;
-- the control-plane's orchestrator (internal/api/orchestrator.go) runs each
-- step after the previous one succeeds, reading all of its state from here
-- so a restart picks up where it left off.
CREATE TABLE IF NOT EXISTS control_plane.pipelines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES control_plane.projects(id),
    name        TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{0,62}$'),
    description TEXT NOT NULL DEFAULT '',
    -- [{"jobType": "silver", "params": {...}}, ...], run in order.
    steps       JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS control_plane.pipeline_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES control_plane.projects(id),
    pipeline_id   UUID REFERENCES control_plane.pipelines(id) ON DELETE SET NULL,
    pipeline_name TEXT NOT NULL,
    -- The steps as they were when the run started; editing the pipeline
    -- doesn't change a run already going.
    steps         JSONB NOT NULL,
    status        TEXT NOT NULL DEFAULT 'running', -- running | succeeded | failed | cancelled
    current_step  INTEGER NOT NULL DEFAULT 0,
    error         TEXT,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_runs_project_submitted_idx
    ON control_plane.pipeline_runs (project_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_running_idx
    ON control_plane.pipeline_runs (status) WHERE status = 'running';

-- A step's job run points back at its pipeline run. The unique index makes
-- queuing the same step twice impossible, whatever the orchestrator does.
ALTER TABLE control_plane.job_runs
    ADD COLUMN IF NOT EXISTS pipeline_run_id UUID REFERENCES control_plane.pipeline_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS step_index INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS job_runs_pipeline_step_idx
    ON control_plane.job_runs (pipeline_run_id, step_index) WHERE pipeline_run_id IS NOT NULL;

-- The taxi chain the Pipelines screen's "Run all" used to drive from the
-- browser. Phase 4e moves it into samples/nyc_taxi/project.json.
INSERT INTO control_plane.pipelines (project_id, name, description, steps)
SELECT id, 'taxi', 'Bronze -> Silver -> Gold -> Features -> Model for a month range.',
       '[{"jobType": "ingest", "params": {"start": "2025-01", "end": "2025-01"}},
         {"jobType": "silver", "params": {}},
         {"jobType": "gold", "params": {}},
         {"jobType": "features", "params": {}},
         {"jobType": "fare_model", "params": {}}]'::jsonb
  FROM control_plane.projects WHERE slug = 'nyc-taxi'
ON CONFLICT (project_id, name) DO NOTHING;
