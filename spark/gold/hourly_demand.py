"""
Gold: hourly_demand -- trip counts and average fare by hour-of-day (0-23),
aggregated across all available Silver months. Answers "when is demand
highest", not a per-day time series (see daily_revenue for that axis).

Usage:
    python spark/gold/hourly_demand.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.loader import load_silver_trips
from spark.common.storage import STORAGE_OPTIONS, lake_path


def build(df: pd.DataFrame) -> pd.DataFrame:
    hourly = (
        df.assign(pickup_hour=df["tpep_pickup_datetime"].dt.hour)
        .groupby("pickup_hour")
        .agg(
            trip_count=("total_amount", "count"),
            avg_fare=("fare_amount", "mean"),
            avg_trip_distance=("trip_distance", "mean"),
            avg_passenger_count=("passenger_count", "mean"),
        )
        .reset_index()
        .sort_values("pickup_hour")
    )
    return hourly


def run() -> str:
    hourly = build(load_silver_trips())
    path = lake_path("gold", "hourly_demand.parquet")
    hourly.to_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    return path


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
