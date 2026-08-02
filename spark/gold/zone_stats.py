"""
Gold: zone_stats -- pickup-zone level trip statistics (by PULocationID),
aggregated across all available Silver months.

Usage:
    python spark/gold/zone_stats.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.loader import load_silver_trips
from spark.common.storage import STORAGE_OPTIONS, lake_path


def build(df: pd.DataFrame) -> pd.DataFrame:
    zones = (
        df.groupby("PULocationID")
        .agg(
            trip_count=("total_amount", "count"),
            total_revenue=("total_amount", "sum"),
            avg_fare=("fare_amount", "mean"),
            avg_trip_distance=("trip_distance", "mean"),
            avg_tip=("tip_amount", "mean"),
        )
        .reset_index()
        .sort_values("trip_count", ascending=False)
    )
    return zones


def run() -> str:
    zones = build(load_silver_trips())
    path = lake_path("gold", "zone_stats.parquet")
    zones.to_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    return path


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
