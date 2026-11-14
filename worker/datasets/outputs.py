"""
Helpers for jobs that write a dataset (validate, sql_transform): the lake
side of an output dataset, before and after the job writes its Parquet.
The row itself is claimed with db.claim_output_dataset.
"""

from dataclasses import dataclass

import duckdb

import db
from openscale import paths
from openscale.ingest import IngestResult, describe_parquet, files_size_bytes, profile
from spark.common.storage import delete_prefix


@dataclass
class OutputSummary:
    result: IngestResult
    size_bytes: int


def derived_source(job_type: str, run_id: str | None, inputs: list[str], **extra) -> dict:
    """The datasets.source of a job's output: which job, which run and which
    datasets it read -- table-level lineage."""
    return {"kind": "derived", "job": job_type, "runId": run_id, "inputs": sorted(set(inputs)), **extra}


def clear_output_files(project_id: str, dataset_id: str) -> None:
    """Removes the previous run's data/ and quarantine/ files, so a re-run
    never leaves stale parts (a Spark run writes several) behind."""
    for prefix in (paths.data_prefix(project_id, dataset_id), paths.quarantine_prefix(project_id, dataset_id)):
        delete_prefix(prefix.rstrip("/"))


def finish_output(conn, con: duckdb.DuckDBPyConnection, project_id: str, dataset_id: str, log) -> OutputSummary:
    """Reads back what the job wrote under data/ and marks the dataset ready
    with its schema, row count, size and column profile."""
    glob = paths.data_glob(project_id, dataset_id)
    result = describe_parquet(con, glob)
    size = files_size_bytes(con, glob)
    log("profiling columns")
    prof = profile(con, f"read_parquet('{glob}')")
    db.mark_dataset_ready(conn, dataset_id, result.columns, result.row_count, size, prof)
    return OutputSummary(result=result, size_bytes=size)
