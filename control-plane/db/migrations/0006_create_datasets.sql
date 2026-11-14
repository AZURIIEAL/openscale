-- Datasets: one named table inside a project. Files live in the lake under
-- projects/{project_id}/datasets/{id}/ (raw/ as uploaded, data/ as Parquet);
-- this row carries everything the UI and the query engine need without
-- reading the files: schema, counts, profile and the quality rules.
CREATE TABLE IF NOT EXISTS control_plane.datasets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES control_plane.projects(id) ON DELETE CASCADE,
    -- Becomes the view name in SQL, hence a plain lowercase identifier.
    name        TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{0,62}$'),
    layer       TEXT NOT NULL DEFAULT 'bronze' CHECK (layer IN ('bronze', 'silver', 'gold')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    -- {"kind":"upload","filename":"..."} | {"kind":"url","url":"..."}
    source      JSONB NOT NULL,
    -- [{"name":"fare_amount","type":"DOUBLE"}, ...] from DuckDB's inference
    columns     JSONB,
    -- Per-column stats (null share, distinct count, min/max/mean) written at
    -- the end of ingest, so the UI never has to scan the data for them.
    profile     JSONB,
    row_count   BIGINT,
    size_bytes  BIGINT,
    -- Quality rules as data (Phase 4): [{"id","tier","when","note"}]
    rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS datasets_project_idx
    ON control_plane.datasets (project_id, created_at);
