"""dataset_ingest job: raw/ -> data/ Parquet + schema + profile for one
dataset, then mark the datasets row ready (or failed)."""

import os

import db
from datasets.ingest_core import NoRawFiles, ingest_dataset
from jobs.outcome import format_exception

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")


def run(params: dict, on_log_line) -> tuple:
    from openscale.duck import connect

    log_lines: list[str] = []

    def log(line: str) -> None:
        log_lines.append(line)
        on_log_line(line)

    project_id = params["project_id"]
    dataset_id = params["dataset_id"]
    name = params.get("dataset_name", dataset_id)

    conn = db.get_connection()
    try:
        try:
            con = connect(memory_limit=MEMORY_LIMIT)
            log(f"ingesting dataset {name}")
            outcome = ingest_dataset(con, project_id, dataset_id, log)
            db.mark_dataset_ready(
                conn,
                dataset_id,
                outcome.result.columns,
                outcome.result.row_count,
                outcome.size_bytes,
                outcome.profile,
            )
            log(f"dataset {name} is ready")
            metrics = {"dataset_id": dataset_id, "size_bytes": outcome.size_bytes, "columns": len(outcome.result.columns)}
            return "succeeded", None, log_lines, outcome.result.row_count, metrics
        except NoRawFiles as exc:
            error = str(exc)
        except Exception as exc:
            error = format_exception(exc)
        log(error)
        db.mark_dataset_failed(conn, dataset_id, error)
        return "failed", error, log_lines, None, None
    finally:
        conn.close()
