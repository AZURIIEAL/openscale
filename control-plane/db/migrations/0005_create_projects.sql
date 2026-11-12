-- Projects: the top-level namespace. Every dataset, run, query and
-- dashboard belongs to exactly one project. With no auth yet this is an
-- organisational boundary, not a security one.
CREATE TABLE IF NOT EXISTS control_plane.projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    -- Feature flags, e.g. {"legacy_taxi": true} marks the one project whose
    -- Pipelines/Dashboards/Streaming screens still show the hardcoded taxi
    -- stages. Removed once those stages become ordinary pipeline rows.
    features    JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Per-project assistant settings (enabled, data_sharing, budgets).
    ai_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

-- The pre-existing taxi pipeline becomes the sample project, so the job
-- history already in job_runs has a home.
INSERT INTO control_plane.projects (slug, name, description, features)
VALUES ('nyc-taxi', 'NYC Taxi',
        'Sample project: the original NYC Yellow Taxi lakehouse (Bronze -> Silver -> Gold -> Features -> Model).',
        '{"legacy_taxi": true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE control_plane.job_runs
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES control_plane.projects(id);

UPDATE control_plane.job_runs
   SET project_id = (SELECT id FROM control_plane.projects WHERE slug = 'nyc-taxi')
 WHERE project_id IS NULL;

ALTER TABLE control_plane.job_runs ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS job_runs_project_submitted_idx
    ON control_plane.job_runs (project_id, submitted_at DESC);
