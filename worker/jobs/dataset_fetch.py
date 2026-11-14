"""dataset_fetch job: download a dataset's source URL into raw/, then run
the ingest in the same job so one run takes a URL all the way to ready."""

import os

import requests

import db
from datasets.fetch_core import fetch_to_raw
from jobs import dataset_ingest
from jobs.outcome import format_exception

MAX_FETCH_BYTES = int(os.environ.get("MAX_FETCH_BYTES", str(2 * 1024 * 1024 * 1024)))


def _s3_open():
    import s3fs

    from spark.common.storage import LAKE_BUCKET, MINIO_ACCESS_KEY, MINIO_ENDPOINT, MINIO_SECRET_KEY

    fs = s3fs.S3FileSystem(key=MINIO_ACCESS_KEY, secret=MINIO_SECRET_KEY, client_kwargs={"endpoint_url": MINIO_ENDPOINT})
    return lambda key, mode: fs.open(f"{LAKE_BUCKET}/{key}", mode)


def run(params: dict, on_log_line) -> tuple:
    log_lines: list[str] = []

    def log(line: str) -> None:
        log_lines.append(line)
        on_log_line(line)

    project_id = params["project_id"]
    dataset_id = params["dataset_id"]
    url = params["url"]

    conn = db.get_connection()
    try:
        try:
            with requests.Session() as session:
                result = fetch_to_raw(session, _s3_open(), url, project_id, dataset_id, MAX_FETCH_BYTES, log)
            log(f"downloaded {result.bytes_written} bytes in {result.seconds:.1f}s")
        except Exception as exc:
            error = format_exception(exc)
            log(error)
            db.mark_dataset_failed(conn, dataset_id, error)
            return "failed", error, log_lines, None, None
    finally:
        conn.close()

    status, error, ingest_lines, rows, metrics = dataset_ingest.run(params, on_log_line)
    return status, error, log_lines + ingest_lines, rows, metrics
