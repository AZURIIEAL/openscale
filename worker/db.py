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
) -> None:
    with conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE control_plane.job_runs
            SET status = %s, finished_at = now(), exit_code = %s, error = %s, log_output = %s,
                rows_processed = %s, metrics = %s
            WHERE id = %s
            """,
            (
                status,
                exit_code,
                error,
                log_output,
                rows_processed,
                psycopg2.extras.Json(metrics) if metrics is not None else None,
                job_id,
            ),
        )
