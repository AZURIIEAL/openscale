CREATE SCHEMA IF NOT EXISTS control_plane;

CREATE TABLE IF NOT EXISTS control_plane.job_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type     TEXT NOT NULL,
    params       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status       TEXT NOT NULL DEFAULT 'queued',   -- queued | running | succeeded | failed
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    log_output   TEXT,
    exit_code    INTEGER
);

CREATE INDEX IF NOT EXISTS job_runs_submitted_at_idx ON control_plane.job_runs (submitted_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_status_idx ON control_plane.job_runs (status);
