-- Phase 4b: generic job types, and taxi jobs limited to the taxi project.

-- A job can require a project feature flag (the taxi stages need
-- `legacy_taxi`); the run endpoint refuses it elsewhere and the Pipelines
-- screen doesn't list it. NULL = runs in every project.
ALTER TABLE control_plane.job_definitions
    ADD COLUMN IF NOT EXISTS requires_feature TEXT;

-- The generic `train` job takes the plan's name; the taxi trainer it
-- replaces in Phase 4e is now `fare_model`. Its run history moves with it so
-- the taxi dashboards' model-quality chart keeps its points.
UPDATE control_plane.job_runs SET job_type = 'fare_model' WHERE job_type = 'train';
