"""
OpenScale Silver Layer validator.

Implements the rule set from docs/silver-layer-specification.md (v1) against
the Bronze NYC Yellow Taxi dataset in MinIO. For every Bronze period it produces:

- A clean Silver dataset    -> s3://openscale-lake/silver/trips/silver_trips_{year}_{month}.parquet
- Per-rule quarantine files -> s3://openscale-lake/silver/quarantine/{rule}_{year}_{month}.parquet
- A JSON quality report     -> docs/quality-reports/quality-report-{year}-{month}.json (local, human-readable)

Rule tiers, per the spec:
  REJECT     SLV-001/002 (null pickup/dropoff), SLV-003 (dropoff <= pickup),
             SLV-004 (negative trip distance) -- structurally invalid records.
  QUARANTINE SLV-005 (passenger_count <= 0), SLV-006 (negative fare),
             SLV-007 (negative total), SLV-010 (trip_distance > 100mi).
  FLAG       SLV-008/009 (pickup/dropoff year outside the reporting period)
             -- record stays in Silver, just annotated.
  MONITOR    Nulls in passenger_count, RatecodeID, store_and_fwd_flag,
             congestion_surcharge, Airport_fee -- counted only.

A record can trip more than one rule; for the physical quarantine files it is
assigned to a single file by rule priority (timestamp > distance > passenger
> fare > total) so no row is written twice.

Usage:
    python spark/silver/validator.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.storage import STORAGE_OPTIONS, lake_path, list_lake

QUALITY_REPORTS_DIR = Path(__file__).resolve().parents[2] / "docs" / "quality-reports"

MAX_TRIP_DISTANCE_MILES = 100

MISSING_VALUE_COLUMNS = [
    "passenger_count",
    "RatecodeID",
    "store_and_fwd_flag",
    "congestion_surcharge",
    "Airport_fee",
]


def available_periods() -> list[tuple[int, int]]:
    periods = []
    for key in list_lake("bronze", "yellow_taxi"):
        stem = Path(key).stem  # "2024-01"
        year_str, month_str = stem.split("-")
        periods.append((int(year_str), int(month_str)))
    return periods


def process_period(year: int, month: int) -> dict:
    bronze_path = lake_path("bronze", "yellow_taxi", f"{year:04d}-{month:02d}.parquet")
    df = pd.read_parquet(bronze_path, engine="pyarrow", storage_options=STORAGE_OPTIONS)
    n = len(df)

    # --- REJECT tier: SLV-001, SLV-002, SLV-003, SLV-004 ---
    invalid_timestamp = (
        df["tpep_pickup_datetime"].isna()
        | df["tpep_dropoff_datetime"].isna()
        | (df["tpep_dropoff_datetime"] <= df["tpep_pickup_datetime"])
    )
    negative_distance = df["trip_distance"] < 0

    # --- QUARANTINE tier: SLV-005, SLV-006, SLV-007, SLV-010 ---
    distance_outlier = df["trip_distance"] > MAX_TRIP_DISTANCE_MILES
    invalid_passenger_count = df["passenger_count"] <= 0
    negative_fare = df["fare_amount"] < 0
    negative_total = df["total_amount"] < 0

    # Priority assignment so a row lands in exactly one quarantine file.
    cat_timestamps = invalid_timestamp
    cat_distance = (negative_distance | distance_outlier) & ~cat_timestamps
    cat_passenger = invalid_passenger_count & ~cat_timestamps & ~cat_distance
    cat_fare = negative_fare & ~cat_timestamps & ~cat_distance & ~cat_passenger
    cat_total = negative_total & ~cat_timestamps & ~cat_distance & ~cat_passenger & ~cat_fare

    excluded_mask = cat_timestamps | cat_distance | cat_passenger | cat_fare | cat_total
    accepted = df[~excluded_mask].copy()

    reject_mask = cat_timestamps | (cat_distance & negative_distance)
    quarantine_mask = excluded_mask & ~reject_mask

    # --- FLAG tier: SLV-008, SLV-009 (kept in Silver, just annotated) ---
    accepted["flag_pickup_year_mismatch"] = accepted["tpep_pickup_datetime"].dt.year != year
    accepted["flag_dropoff_year_mismatch"] = accepted["tpep_dropoff_datetime"].dt.year < year

    # --- MONITOR: known-missing columns, counted only ---
    missing_value_counts = {col: int(df[col].isna().sum()) for col in MISSING_VALUE_COLUMNS}

    QUALITY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    period = f"{year:04d}_{month:02d}"
    accepted.to_parquet(
        lake_path("silver", "trips", f"silver_trips_{period}.parquet"),
        engine="pyarrow",
        storage_options=STORAGE_OPTIONS,
    )
    quarantine_frames = {
        "invalid_timestamps": df[cat_timestamps],
        "distance_outliers": df[cat_distance],
        "invalid_passenger_count": df[cat_passenger],
        "negative_fares": df[cat_fare],
        "negative_total_amounts": df[cat_total],
    }
    for name, frame in quarantine_frames.items():
        frame.to_parquet(
            lake_path("silver", "quarantine", f"{name}_{period}.parquet"),
            engine="pyarrow",
            storage_options=STORAGE_OPTIONS,
        )

    report = {
        "period": f"{year:04d}-{month:02d}",
        "records_processed": int(n),
        "records_accepted": int(len(accepted)),
        "records_rejected": int(reject_mask.sum()),
        "records_quarantined": int(quarantine_mask.sum()),
        "duplicate_records": int(df.duplicated().sum()),
        "invalid_timestamps": int(cat_timestamps.sum()),
        "negative_fares": int(cat_fare.sum()),
        "invalid_passenger_counts": int(cat_passenger.sum()),
        "distance_outliers": int(cat_distance.sum()),
        "negative_total_amounts": int(cat_total.sum()),
        "records_flagged_pickup_year_mismatch": int(accepted["flag_pickup_year_mismatch"].sum()),
        "records_flagged_dropoff_year_mismatch": int(accepted["flag_dropoff_year_mismatch"].sum()),
        "missing_value_counts": missing_value_counts,
    }

    report_path = QUALITY_REPORTS_DIR / f"quality-report-{year:04d}-{month:02d}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    return report


def run() -> list[dict]:
    return [process_period(year, month) for year, month in available_periods()]


if __name__ == "__main__":
    for result in run():
        print(json.dumps(result, indent=2))
