"""
Writes a schema-validated DataFrame into the Bronze layer in MinIO.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.storage import STORAGE_OPTIONS, lake_path


def upload(df: pd.DataFrame, year: int, month: int) -> str:
    path = lake_path("bronze", "yellow_taxi", f"{year:04d}-{month:02d}.parquet")
    df.to_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    return path
