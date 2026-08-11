-- name: InsertJobRun :one
INSERT INTO control_plane.job_runs (job_type, params)
VALUES ($1, $2)
RETURNING *;

-- name: ListJobRuns :many
SELECT * FROM control_plane.job_runs
ORDER BY submitted_at DESC
LIMIT $1;

-- name: GetJobRun :one
SELECT * FROM control_plane.job_runs WHERE id = $1;
