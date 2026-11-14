"""dataset_fetch job: download a dataset's source URL into raw/, then run
the ingest in the same job so one run takes a URL all the way to ready."""

import os

import requests

import db
from datasets.fetch_core import fetch_to_raw
from jobs.dataset_ingest import DATASET_PARAMS, ingest_into_dataset
from jobs.outcome import format_exception
from registry import JobCancelled, JobContext, JobFailed, Param, job

MAX_FETCH_BYTES = int(os.environ.get("MAX_FETCH_BYTES", str(2 * 1024 * 1024 * 1024)))


def _s3_open():
    import s3fs

    from spark.common.storage import LAKE_BUCKET, MINIO_ACCESS_KEY, MINIO_ENDPOINT, MINIO_SECRET_KEY

    fs = s3fs.S3FileSystem(key=MINIO_ACCESS_KEY, secret=MINIO_SECRET_KEY, client_kwargs={"endpoint_url": MINIO_ENDPOINT})
    return lambda key, mode: fs.open(f"{LAKE_BUCKET}/{key}", mode)


@job(
    "dataset_fetch",
    "Fetch dataset",
    "Download a dataset's source URL into its raw/ folder, then ingest it.",
    params_schema=[*DATASET_PARAMS, Param("url", "string", "Source URL", required=True)],
    # Queued by the datasets API for a URL source, not from the run list.
    listed=False,
)
def dataset_fetch(ctx: JobContext) -> None:
    project_id = ctx.project_id or ctx.params["project_id"]
    dataset_id = ctx.params["dataset_id"]

    conn = db.get_connection()
    try:
        try:
            with requests.Session() as session:
                result = fetch_to_raw(
                    session, _s3_open(), ctx.params["url"], project_id, dataset_id, MAX_FETCH_BYTES, ctx.log
                )
        except JobCancelled:
            db.mark_dataset_failed(conn, dataset_id, "fetch cancelled")
            raise
        except Exception as exc:
            error = format_exception(exc)
            db.mark_dataset_failed(conn, dataset_id, error)
            raise JobFailed(error) from exc
    finally:
        conn.close()

    ctx.log(f"downloaded {result.bytes_written} bytes in {result.seconds:.1f}s")
    ingest_into_dataset(ctx)
