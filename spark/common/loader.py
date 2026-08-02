"""
Shared helper for loading combined Silver-layer output, used by every Gold job.
"""

import pandas as pd

from spark.common.storage import STORAGE_OPTIONS, LAKE_BUCKET, list_lake


def load_silver_trips() -> pd.DataFrame:
    files = list_lake("silver", "trips")
    if not files:
        raise FileNotFoundError(f"No Silver trip files found under s3://{LAKE_BUCKET}/silver/trips")
    return pd.concat(
        (pd.read_parquet(f"s3://{f}", engine="pyarrow", storage_options=STORAGE_OPTIONS) for f in files),
        ignore_index=True,
    )
