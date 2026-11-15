-- Job definitions: the job catalog, published by the worker at startup from
-- its @job registry (worker/registry.py). The control-plane serves it as
-- GET /api/jobs/catalog and only queues job types that have a live row here,
-- validating run params against params_schema first.
CREATE TABLE IF NOT EXISTS control_plane.job_definitions (
    type          TEXT PRIMARY KEY CHECK (type ~ '^[a-z][a-z0-9_]{0,62}$'),
    label         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    -- Optional badge shown next to the label ("Bronze", "Model", ...).
    stage         TEXT,
    -- [{"name","type","label","description"?,"required"?,"default"?,
    --   "options"?,"min"?,"max"?,"gte"?}, ...]; see worker/registry.Param.
    params_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- false keeps a job out of the Pipelines run list; it can still be
    -- queued by another screen or the API (replay, reset, dataset jobs).
    listed        BOOLEAN NOT NULL DEFAULT true,
    sort_order    INTEGER NOT NULL DEFAULT 100,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Set when the worker stops registering the type; retired types are
    -- hidden from the catalog and refused by the run endpoint.
    retired_at    TIMESTAMPTZ
);
