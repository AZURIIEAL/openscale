"""The dataset ingest, as a function of a DuckDB connection and ids, so the
job module stays a thin status/log wrapper. Raw files under raw/ become
one Parquet file under data/; the schema, row count, lake size and
profile come back for the datasets row."""

from dataclasses import dataclass

import duckdb

from openscale import paths
from openscale.ingest import IngestResult, convert_to_parquet, list_raw_files, profile


@dataclass
class DatasetIngestOutcome:
    result: IngestResult
    size_bytes: int
    profile: dict


class NoRawFiles(RuntimeError):
    pass


def ingest_dataset(con: duckdb.DuckDBPyConnection, project_id: str, dataset_id: str, log) -> DatasetIngestOutcome:
    raw_glob = paths.raw_glob(project_id, dataset_id)
    files = list_raw_files(con, raw_glob)
    if not files:
        raise NoRawFiles(f"no supported raw files under {raw_glob}")
    log(f"reading {len(files)} raw file(s)")
    for f in files:
        log(f"  {f}")

    # One output part. Re-ingest overwrites it, so adding a file to a
    # dataset rewrites the whole Parquet; fine at the sizes a single
    # upload produces, and the simplest thing that keeps data/ consistent.
    part = paths.data_part(project_id, dataset_id, 0)
    log(f"writing {part}")
    result = convert_to_parquet(con, files, part)
    log(f"{result.row_count} rows, {len(result.columns)} columns")

    size_bytes = int(con.execute("SELECT COALESCE(SUM(size), 0) FROM glob(?)", [paths.data_glob(project_id, dataset_id)]).fetchone()[0] or 0)
    if size_bytes == 0:
        # glob() does not expose size on every DuckDB version; fall back to
        # the Parquet metadata, which does.
        size_bytes = int(con.execute("SELECT COALESCE(SUM(total_compressed_size), 0) FROM parquet_metadata(?)", [part]).fetchone()[0] or 0)

    log("profiling columns")
    prof = profile(con, f"read_parquet('{part}')")
    return DatasetIngestOutcome(result=result, size_bytes=size_bytes, profile=prof)
