-- Saved queries: named SELECTs over a project's datasets. One with a chart
-- spec is a tile on the project's dashboard, so dashboards are rows too.
CREATE TABLE IF NOT EXISTS control_plane.saved_queries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES control_plane.projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{0,62}$'),
    sql        TEXT NOT NULL,
    -- {"type": "line"|"bar"|"hbar"|"number", "x": column, "y": column}, or NULL.
    chart      JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);
