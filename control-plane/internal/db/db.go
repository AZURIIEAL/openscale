// Package db is the only package that touches pgx directly -- everything
// outside it works with plain internal/jobs structs, same discipline as
// internal/docker -> internal/health.
//
// Note: db/queries/job_runs.sql + sqlc.yaml describe these same three
// queries in sqlc's format, intended to generate this file's SQL-handling
// code. sqlc's CLI couldn't be installed in this environment (its
// dependency tree needs a working 64-bit CGO toolchain, which this
// machine's gcc doesn't have -- "cc1.exe: sorry, unimplemented: 64-bit
// mode not compiled in"), so this package is hand-written against pgx
// directly instead. If a working sqlc setup becomes available later,
// `sqlc generate` against the existing db/queries/*.sql would produce
// equivalent generated code to swap in.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AZURIIEAL/openscale/control-plane/internal/jobs"
)

type DB struct {
	pool *pgxpool.Pool
}

func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("db: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("db: ping: %w", err)
	}
	return pool, nil
}

func New(pool *pgxpool.Pool) *DB {
	return &DB{pool: pool}
}

// id is cast to text explicitly rather than relying on pgx's implicit
// uuid->string scan support, which varies by version -- this guarantees a
// plain string lands in jobs.Run.ID regardless.
const runColumns = `id::text, job_type, params, status, submitted_at, started_at, finished_at, error, log_output, rows_processed`

func scanRun(row pgx.Row) (jobs.Run, error) {
	var run jobs.Run
	err := row.Scan(
		&run.ID, &run.JobType, &run.Params, &run.Status, &run.SubmittedAt,
		&run.StartedAt, &run.FinishedAt, &run.Error, &run.LogOutput, &run.RowsProcessed,
	)
	return run, err
}

// InsertJobRun creates a new queued run and returns it (with its
// Postgres-generated ID) -- called before enqueuing onto Redis, so a
// job_id exists immediately even if the worker hasn't picked it up yet.
func (d *DB) InsertJobRun(ctx context.Context, jobType string, params []byte) (jobs.Run, error) {
	row := d.pool.QueryRow(ctx,
		`INSERT INTO control_plane.job_runs (job_type, params) VALUES ($1, $2) RETURNING `+runColumns,
		jobType, params,
	)
	run, err := scanRun(row)
	if err != nil {
		return jobs.Run{}, fmt.Errorf("db: insert job run: %w", err)
	}
	return run, nil
}

// ListJobRuns returns up to `limit` runs starting at `offset`, newest first,
// plus whether more rows exist beyond this page. It fetches limit+1 rows and
// trims the extra one rather than running a separate COUNT query.
func (d *DB) ListJobRuns(ctx context.Context, limit, offset int) ([]jobs.Run, bool, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT `+runColumns+` FROM control_plane.job_runs ORDER BY submitted_at DESC LIMIT $1 OFFSET $2`,
		limit+1, offset,
	)
	if err != nil {
		return nil, false, fmt.Errorf("db: list job runs: %w", err)
	}
	defer rows.Close()

	runs := []jobs.Run{}
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, false, fmt.Errorf("db: scan job run: %w", err)
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	hasMore := len(runs) > limit
	if hasMore {
		runs = runs[:limit]
	}
	return runs, hasMore, nil
}

// ClearTerminalRuns deletes every run that isn't currently queued or
// running, so "clear history" can't make an in-flight job's row vanish out
// from under its live log panel.
func (d *DB) ClearTerminalRuns(ctx context.Context) error {
	_, err := d.pool.Exec(ctx,
		`DELETE FROM control_plane.job_runs WHERE status NOT IN ('queued', 'running')`,
	)
	if err != nil {
		return fmt.Errorf("db: clear terminal runs: %w", err)
	}
	return nil
}

// CancelledRun pairs a now-cancelled run with whether it was `running`
// (rather than merely `queued`) at the moment it got cancelled -- only a
// `running` run needs the worker container restarted to actually stop; a
// `queued` one is cooperatively skipped by the worker on its own (see
// worker/db.py's mark_running).
type CancelledRun struct {
	Run        jobs.Run
	WasRunning bool
}

// CancelActiveRuns transitions every queued or running run straight to
// cancelled. RETURNING only ever reflects the row's *post*-update state, so
// this reads the pre-update status first (locking the rows with FOR UPDATE
// against a concurrent worker mark_running/mark_terminal) and updates by id,
// all inside one transaction.
func (d *DB) CancelActiveRuns(ctx context.Context) ([]CancelledRun, error) {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("db: cancel active runs: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx,
		`SELECT id::text, status FROM control_plane.job_runs WHERE status IN ('queued', 'running') FOR UPDATE`,
	)
	if err != nil {
		return nil, fmt.Errorf("db: cancel active runs: select active: %w", err)
	}
	wasRunning := map[string]bool{}
	var ids []string
	for rows.Next() {
		var id, status string
		if err := rows.Scan(&id, &status); err != nil {
			rows.Close()
			return nil, fmt.Errorf("db: cancel active runs: scan active: %w", err)
		}
		ids = append(ids, id)
		wasRunning[id] = status == string(jobs.StatusRunning)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, tx.Commit(ctx)
	}

	updated, err := tx.Query(ctx,
		`UPDATE control_plane.job_runs
		 SET status = 'cancelled', finished_at = now(), error = 'Cancelled by user'
		 WHERE id = ANY($1::uuid[])
		 RETURNING `+runColumns,
		ids,
	)
	if err != nil {
		return nil, fmt.Errorf("db: cancel active runs: update: %w", err)
	}
	var cancelled []CancelledRun
	for updated.Next() {
		run, err := scanRun(updated)
		if err != nil {
			updated.Close()
			return nil, fmt.Errorf("db: cancel active runs: scan updated: %w", err)
		}
		cancelled = append(cancelled, CancelledRun{Run: run, WasRunning: wasRunning[run.ID]})
	}
	updated.Close()
	if err := updated.Err(); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("db: cancel active runs: commit: %w", err)
	}
	return cancelled, nil
}

// GetJobRun fetches a single run by ID.
func (d *DB) GetJobRun(ctx context.Context, id string) (jobs.Run, error) {
	row := d.pool.QueryRow(ctx,
		`SELECT `+runColumns+` FROM control_plane.job_runs WHERE id = $1`,
		id,
	)
	run, err := scanRun(row)
	if err != nil {
		return jobs.Run{}, fmt.Errorf("db: get job run %s: %w", id, err)
	}
	return run, nil
}

// MarkFailed transitions a run straight to failed -- used when enqueuing
// onto Redis fails right after the row was inserted, so the row doesn't
// keep lying about being queued.
func (d *DB) MarkFailed(ctx context.Context, id string, errMsg string) error {
	_, err := d.pool.Exec(ctx,
		`UPDATE control_plane.job_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
		id, errMsg,
	)
	return err
}
