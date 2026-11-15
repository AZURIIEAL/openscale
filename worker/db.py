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
                    (type, label, description, stage, params_schema, listed, sort_order, requires_feature,
                     published_at, retired_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now(), NULL)
                ON CONFLICT (type) DO UPDATE SET
                    label = EXCLUDED.label, description = EXCLUDED.description, stage = EXCLUDED.stage,
                    params_schema = EXCLUDED.params_schema, listed = EXCLUDED.listed,
                    sort_order = EXCLUDED.sort_order, requires_feature = EXCLUDED.requires_feature,
                    published_at = now(), retired_at = NULL
                """,
                (
                    e["type"],
                    e["label"],
                    e["description"],
                    e["stage"],
                    psycopg2.extras.Json(e["params_schema"]),
                    e["listed"],
                    e["sort_order"],
                    e["requires_feature"],
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


class OutputConflict(Exception):
    """The output name belongs to a dataset no job produced (an upload or a
    URL fetch); a job never overwrites one of those."""


_DATASET_COLUMNS = "id::text, name, layer, status, source, columns, rules"


def _dataset_row(row) -> dict | None:
    if row is None:
        return None
    keys = ("id", "name", "layer", "status", "source", "columns", "rules")
    return dict(zip(keys, row))


def get_dataset(conn, project_id: str, name: str) -> dict | None:
    with conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT {_DATASET_COLUMNS} FROM control_plane.datasets WHERE project_id = %s AND name = %s",
            (project_id, name),
        )
        return _dataset_row(cur.fetchone())


def list_ready_datasets(conn, project_id: str) -> list[dict]:
    with conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT {_DATASET_COLUMNS} FROM control_plane.datasets WHERE project_id = %s AND status = 'ready' ORDER BY name",
            (project_id,),
        )
        return [_dataset_row(r) for r in cur.fetchall()]


def claim_output_dataset(conn, project_id: str, name: str, layer: str, source: dict) -> str:
    """Returns the id of the dataset a job writes its output to, set to
    pending: a new row, or an existing one an earlier job derived (re-running
    a transform replaces its output). Raises OutputConflict for a name taken
    by an uploaded or fetched dataset."""
    with conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id::text, source FROM control_plane.datasets WHERE project_id = %s AND name = %s FOR UPDATE",
            (project_id, name),
        )
        row = cur.fetchone()
        if row is not None:
            dataset_id, existing = row
            if (existing or {}).get("kind") != "derived":
                raise OutputConflict(
                    f"dataset {name!r} already exists and was not produced by a job; choose another output name"
                )
            cur.execute(
                """
                UPDATE control_plane.datasets
                SET status = 'pending', error = NULL, layer = %s, source = %s, updated_at = now()
                WHERE id = %s
                """,
                (layer, psycopg2.extras.Json(source), dataset_id),
            )
            return dataset_id
        cur.execute(
            """
            INSERT INTO control_plane.datasets (project_id, name, layer, status, source)
            VALUES (%s, %s, %s, 'pending', %s) RETURNING id::text
            """,
            (project_id, name, layer, psycopg2.extras.Json(source)),
        )
        return cur.fetchone()[0]


def get_project_slug(conn, project_id: str) -> str:
    with conn, conn.cursor() as cur:
        cur.execute("SELECT slug FROM control_plane.projects WHERE id = %s", (project_id,))
        row = cur.fetchone()
        return row[0] if row else project_id

