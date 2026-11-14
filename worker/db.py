"""Tiny Postgres helpers for the job-queue worker -- only this module
touches psycopg2. Writes directly to the control_plane.job_runs table
(the system of record); Redis is dispatch/live-relay only."""

import os

import psycopg2
import psycopg2.extras

POSTGRES_DSN = os.environ.get(
    "POSTGRES_DSN",
    "postgresql://openscale:openscale@localhost:5432/openscale",
)


def get_connection():
    return psycopg2.connect(POSTGRES_DSN)


def mark_running(conn, job_id: str) -> bool:
    """Transitions a run to 'running', but only if it's still 'queued' --
    returns False without changing anything if the control-plane already
    cancelled it out from under us (see api.CancelAll). This is the entire
    cooperative-cancellation guard for queued jobs: no Redis Stream surgery
    needed, the worker just declines to start work whose row already says
    'cancelled'."""
    with conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE control_plane.job_runs SET status = 'running', started_at = now() "
            "WHERE id = %s AND status = 'queued'",
            (job_id,),
        )
        return cur.rowcount > 0


def mark_terminal(
    conn,
    job_id: str,
    status: str,
    exit_code: int | None,
    error: str | None,
    log_output: str,
    rows_processed: int | None = None,
    metrics: dict | None = None,
) -> str | None:
    """Writes a run's outcome and returns the status actually stored. A run
    the control-plane already marked cancelled (cancel-all) stays cancelled,
    keeping its finish time and error, even if the job managed to finish
    before it was stopped -- the run list must not flip back after the user
    saw it cancelled. Its log and counts are still saved."""
    with conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE control_plane.job_runs
            SET status = CASE WHEN status = 'cancelled' THEN status ELSE %s END,
                finished_at = CASE WHEN status = 'cancelled' THEN finished_at ELSE now() END,
                error = CASE WHEN status = 'cancelled' THEN error ELSE %s END,
                exit_code = %s, log_output = %s, rows_processed = %s, metrics = %s
            WHERE id = %s
            RETURNING status
            """,
            (
                status,
                error,
                exit_code,
                log_output,
                rows_processed,
                psycopg2.extras.Json(metrics) if metrics is not None else None,
                job_id,
            ),
        )
        row = cur.fetchone()
        return row[0] if row else None


def fail_orphaned_runs(conn) -> int:
    """Marks every `running` run failed. Called once at worker startup: with
    the single worker container this stack runs, any run still `running`
    then was cut off by a crash or restart and will never finish."""
    with conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE control_plane.job_runs
            SET status = 'failed', finished_at = now(),
                error = 'The worker restarted while this run was in progress.'
            WHERE status = 'running'
            """
        )
        return cur.rowcount


def publish_job_definitions(conn, entries: list[dict]) -> None:
    """Upserts the worker's job catalog into control_plane.job_definitions
    and retires rows for job types this worker no longer registers, so the
    control-plane stops accepting them."""
    with conn, conn.cursor() as cur:
        for e in entries:
            cur.execute(
                """
                INSERT INTO control_plane.job_definitions
                    (type, label, description, stage, params_schema, listed, sort_order, published_at, retired_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, now(), NULL)
                ON CONFLICT (type) DO UPDATE SET
                    label = EXCLUDED.label, description = EXCLUDED.description, stage = EXCLUDED.stage,
                    params_schema = EXCLUDED.params_schema, listed = EXCLUDED.listed,
                    sort_order = EXCLUDED.sort_order, published_at = now(), retired_at = NULL
                """,
                (
                    e["type"],
                    e["label"],
                    e["description"],
                    e["stage"],
                    psycopg2.extras.Json(e["params_schema"]),
                    e["listed"],
                    e["sort_order"],
                ),
            )
        cur.execute(
            """
            UPDATE control_plane.job_definitions SET retired_at = now()
            WHERE retired_at IS NULL AND NOT (type = ANY(%s))
            """,
            ([e["type"] for e in entries],),
        )


# --- datasets (control_plane.datasets) ---


def mark_dataset_ready(conn, dataset_id: str, columns: list, row_count: int, size_bytes: int, profile: dict) -> None:
    with conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE control_plane.datasets
            SET status = 'ready', error = NULL, columns = %s, row_count = %s, size_bytes = %s,
                profile = %s, updated_at = now()
            WHERE id = %s
            """,
            (
                psycopg2.extras.Json(columns),
                row_count,
                size_bytes,
                psycopg2.extras.Json(profile),
                dataset_id,
            ),
        )


def mark_dataset_failed(conn, dataset_id: str, error: str) -> None:
    with conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE control_plane.datasets SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
            (error[:2000], dataset_id),
        )
