"""
Gold: congestion_metrics -- congestion-surcharge totals and incidence rate
per pickup date, across all available Silver months.

Usage:
    python spark/gold/congestion_metrics.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.loader import load_silver_trips
from spark.common.storage import STORAGE_OPTIONS, lake_path


def build(df: pd.DataFrame) -> pd.DataFrame:
    # See daily_revenue.py: exclude SLV-008 year-mismatched pickups so they
    # don't create bogus dates decades away from the actual dataset period.
    df = df[~df["flag_pickup_year_mismatch"]]
    has_congestion = df["congestion_surcharge"].fillna(0) > 0
    congestion = (
        df.assign(pickup_date=df["tpep_pickup_datetime"].dt.date, has_congestion=has_congestion)
        .groupby("pickup_date")
        .agg(
            trip_count=("total_amount", "count"),
            trips_with_congestion=("has_congestion", "sum"),
            total_congestion_surcharge=("congestion_surcharge", "sum"),
        )
        .reset_index()
        .sort_values("pickup_date")
    )
    congestion["congestion_trip_pct"] = (
        congestion["trips_with_congestion"] / congestion["trip_count"] * 100
    )
    return congestion


def run() -> str:
    congestion = build(load_silver_trips())
    path = lake_path("gold", "congestion_metrics.parquet")
    congestion.to_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    return path


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
