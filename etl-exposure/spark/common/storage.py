"""
MinIO (S3-compatible) connection config for the OpenScale data lake.

Local dev only: points at the MinIO container defined in docker-compose.yml
at the repo root (default creds, localhost-only, `docker compose up -d`).
"""

import fsspec

MINIO_ENDPOINT = "http://localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
LAKE_BUCKET = "openscale-lake"

STORAGE_OPTIONS = {
    "key": MINIO_ACCESS_KEY,
    "secret": MINIO_SECRET_KEY,
    "client_kwargs": {"endpoint_url": MINIO_ENDPOINT},
}


def lake_path(*parts: str) -> str:
    """Build an s3:// path under the lake bucket, e.g. lake_path("bronze", "yellow_taxi", "2024-01.parquet")."""
    return "s3://" + "/".join((LAKE_BUCKET, *parts))


def list_lake(*prefix_parts: str) -> list[str]:
    """List object keys (bucket/key form, no s3:// prefix) under a lake prefix."""
    fs = fsspec.filesystem("s3", **STORAGE_OPTIONS)
    prefix = "/".join((LAKE_BUCKET, *prefix_parts))
    return sorted(fs.ls(prefix)) if fs.exists(prefix) else []
