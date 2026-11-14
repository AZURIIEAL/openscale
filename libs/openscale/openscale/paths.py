"""Lake layout. Mirrors control-plane/internal/datasets: ids, not names, so
a rename never moves a file.

    openscale-lake/
      projects/{project_id}/
        datasets/{dataset_id}/
          raw/    files exactly as uploaded or downloaded
          data/   Parquet the query engine reads (part-*.parquet)
"""

import os

LAKE_BUCKET = os.environ.get("LAKE_BUCKET", "openscale-lake")


def dataset_prefix(project_id: str, dataset_id: str) -> str:
    return f"projects/{project_id}/datasets/{dataset_id}/"


def raw_prefix(project_id: str, dataset_id: str) -> str:
    return dataset_prefix(project_id, dataset_id) + "raw/"


def data_prefix(project_id: str, dataset_id: str) -> str:
    return dataset_prefix(project_id, dataset_id) + "data/"


def s3(key: str, bucket: str = LAKE_BUCKET) -> str:
    return f"s3://{bucket}/{key}"


def raw_glob(project_id: str, dataset_id: str) -> str:
    """Every raw file, whatever its extension."""
    return s3(raw_prefix(project_id, dataset_id) + "*")


def data_glob(project_id: str, dataset_id: str) -> str:
    """The Parquet files a query reads. Same string the control-plane
    builds for the query engine (api.DatasetRef)."""
    return s3(data_prefix(project_id, dataset_id) + "*.parquet")


def data_part(project_id: str, dataset_id: str, index: int = 0) -> str:
    return s3(data_prefix(project_id, dataset_id) + f"part-{index:05d}.parquet")


def project_scope(project_id: str) -> str:
    """The S3 prefix a project's DuckDB secret is scoped to, so reads outside
    the project have no credentials."""
    return s3(f"projects/{project_id}/")
