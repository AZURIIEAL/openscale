"""DuckDB over the MinIO lake.

connect() builds an in-memory connection with httpfs and a MinIO secret
from the same env vars the Go control-plane and the worker use
(MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY). Pass `scope` to limit
the secret to one project's prefix: reads outside it then carry no
credentials and fail against a private bucket, which is how the query
engine keeps one project's SQL out of another's files.
"""

import os
from dataclasses import dataclass
from urllib.parse import urlparse

import duckdb

from .paths import project_scope


@dataclass(frozen=True)
class DatasetView:
    name: str
    path: str  # s3://.../data/*.parquet


def _minio_settings() -> dict[str, str]:
    endpoint = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
    u = urlparse(endpoint)
    return {
        "endpoint": u.netloc or endpoint,
        "use_ssl": "true" if u.scheme == "https" else "false",
        "key_id": os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
        "secret": os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
    }


def _q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def connect(*, project_id: str | None = None, memory_limit: str | None = None, threads: int | None = None) -> duckdb.DuckDBPyConnection:
    """A fresh in-memory connection that can read (and, for the worker,
    write) the lake. With project_id, the S3 credentials are scoped to that
    project's prefix."""
    con = duckdb.connect(database=":memory:")
    con.execute("INSTALL httpfs; LOAD httpfs;")
    s = _minio_settings()
    scope = f", SCOPE {_q(project_scope(project_id))}" if project_id else ""
    con.execute(
        "CREATE SECRET lake ("
        " TYPE s3,"
        f" KEY_ID {_q(s['key_id'])},"
        f" SECRET {_q(s['secret'])},"
        f" ENDPOINT {_q(s['endpoint'])},"
        f" USE_SSL {s['use_ssl']},"
        " URL_STYLE 'path',"
        " REGION 'us-east-1'"
        f"{scope}"
        ")"
    )
    if memory_limit:
        con.execute(f"SET memory_limit = {_q(memory_limit)}")
    if threads:
        con.execute(f"SET threads = {int(threads)}")
    return con


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def attach_views(con: duckdb.DuckDBPyConnection, views: list[DatasetView]) -> None:
    """One view per dataset, named after it, over its Parquet glob. The view
    is lazy: a dataset with no files yet only fails when queried."""
    for v in views:
        con.execute(f"CREATE OR REPLACE VIEW {quote_ident(v.name)} AS SELECT * FROM read_parquet({_q(v.path)})")


def lockdown(con: duckdb.DuckDBPyConnection) -> None:
    """Turns the connection into a query-only sandbox for untrusted SQL:
    no local filesystem, and the configuration (secrets included) frozen.
    Must run after connect() and attach_views(). External (S3) access stays
    on because that is where the data is; the scoped secret bounds it."""
    con.execute("SET disabled_filesystems = 'LocalFileSystem'")
    con.execute("SET lock_configuration = true")
