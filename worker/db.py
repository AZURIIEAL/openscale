"""Tiny Postgres helpers for the job-queue worker -- only this module
touches psycopg2. Writes directly to the control_plane.job_runs table
(the system of record); Redis is dispatch/live-relay only."""

import os

import psycopg2

POSTGRES_DSN = os.environ.get(
    "POSTGRES_DSN",
    "postgresql://openscale:openscale@localhost:5432/openscale",
)


def get_connection():
    return psycopg2.connect(POSTGRES_DSN)


def mark_running(conn, job_id: str) -> None:
    with conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE control_plane.job_runs SET status = 'running', started_at = now() WHERE id = %s",
            (job_id,),
        )


def mark_terminal(conn, job_id: str, status: str, exit_code: int | None, error: str | None, log_output: str) -> None:
    with conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE control_plane.job_runs
            SET status = %s, finished_at = now(), exit_code = %s, error = %s, log_output = %s
            WHERE id = %s
            """,
            (status, exit_code, error, log_output, job_id),
        )
