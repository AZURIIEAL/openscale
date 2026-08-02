"""
Gold: daily_revenue -- trip counts and revenue totals per pickup date,
across all available Silver months.

Usage:
    python spark/gold/daily_revenue.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.loader import load_silver_trips
from spark.common.storage import STORAGE_OPTIONS, lake_path


def build(df: pd.DataFrame) -> pd.DataFrame:
    # SLV-008 flags pickups outside the reporting period (e.g. the stray 2002
    # timestamps found in 01_dataset_exploration.ipynb) but keeps them in
    # Silver -- exclude them here so they don't create bogus single-digit
    # revenue days decades away from the actual dataset period.
    df = df[~df["flag_pickup_year_mismatch"]]
    daily = (
        df.assign(pickup_date=df["tpep_pickup_datetime"].dt.date)
        .groupby("pickup_date")
        .agg(
            trip_count=("total_amount", "count"),
            total_revenue=("total_amount", "sum"),
            total_fare=("fare_amount", "sum"),
            total_tips=("tip_amount", "sum"),
            avg_fare=("fare_amount", "mean"),
        )
        .reset_index()
        .sort_values("pickup_date")
    )
    return daily


def run() -> str:
    daily = build(load_silver_trips())
    path = lake_path("gold", "daily_revenue.parquet")
    daily.to_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    return path


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
