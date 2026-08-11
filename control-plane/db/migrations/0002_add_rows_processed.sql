ALTER TABLE control_plane.job_runs ADD COLUMN IF NOT EXISTS rows_processed BIGINT;
