"""dataset_ingest job: raw/ -> data/ Parquet + schema + profile for one
dataset, then mark the datasets row ready (or failed)."""

import os

import db
from datasets.ingest_core import NoRawFiles, ingest_dataset
from jobs.outcome import format_exception
from registry import JobCancelled, JobContext, JobFailed, Param, job

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")

DATASET_PARAMS = [
    Param("dataset_id", "string", "Dataset id", required=True),
    Param("dataset_name", "string", "Dataset name"),
]


def ingest_into_dataset(ctx: JobContext) -> None:
    """The ingest itself, shared with dataset_fetch. Whatever happens, the
    datasets row leaves `pending`: ready on success, failed otherwise."""
    from openscale.duck import connect

    project_id = ctx.project_id or ctx.params["project_id"]
    dataset_id = ctx.params["dataset_id"]
    name = ctx.params.get("dataset_name") or dataset_id

    conn = db.get_connection()
    try:
        try:
            con = connect(memory_limit=MEMORY_LIMIT)
            ctx.log(f"ingesting dataset {name}")
            outcome = ingest_dataset(con, project_id, dataset_id, ctx.log)
            db.mark_dataset_ready(
                conn,
                dataset_id,
                outcome.result.columns,
                outcome.result.row_count,
                outcome.size_bytes,
                outcome.profile,
            )
        except NoRawFiles as exc:
            db.mark_dataset_failed(conn, dataset_id, str(exc))
            raise JobFailed(str(exc)) from exc
        except JobCancelled:
            db.mark_dataset_failed(conn, dataset_id, "ingest cancelled")
            raise
        except Exception as exc:
            db.mark_dataset_failed(conn, dataset_id, format_exception(exc))
            raise
    finally:
        conn.close()

    ctx.log(f"dataset {name} is ready")
    ctx.set_rows(outcome.result.row_count)
    ctx.set_metrics({"dataset_id": dataset_id, "size_bytes": outcome.size_bytes, "columns": len(outcome.result.columns)})


@job(
    "dataset_ingest",
    "Ingest dataset",
    "Convert a dataset's raw files to Parquet, infer its schema and profile its columns.",
    params_schema=DATASET_PARAMS,
    # Queued by the datasets API after an upload, not from the run list.
    listed=False,
)
def dataset_ingest(ctx: JobContext) -> None:
    ingest_into_dataset(ctx)
