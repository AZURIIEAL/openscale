"""
The Silver-layer rule set (docs/silver-layer-specification.md v1) as a pure
function over a DataFrame: no MinIO, no filesystem, no Spark. validator.py
wraps this with the Bronze read and the Silver/quarantine writes, which
means the rules themselves can be unit-tested on a small fixture and
golden-checked against etl-exposure/docs/quality-reports/ without a stack.

Rule tiers:
  REJECT     SLV-001/002 (null pickup/dropoff), SLV-003 (dropoff <= pickup),
             SLV-004 (negative trip distance) -- structurally invalid records.
  QUARANTINE SLV-005 (passenger_count <= 0), SLV-006 (negative fare),
             SLV-007 (negative total), SLV-010 (trip_distance > 100mi).
  FLAG       SLV-008/009 (pickup/dropoff year outside the reporting period)
             -- record stays in Silver, just annotated.
  MONITOR    Nulls in passenger_count, RatecodeID, store_and_fwd_flag,
             congestion_surcharge, Airport_fee -- counted only.

A record can trip more than one rule; it is assigned to a single quarantine
category by priority (timestamp > distance > passenger > fare > total) so no
row is written twice.
"""

from dataclasses import dataclass

import pandas as pd

MAX_TRIP_DISTANCE_MILES = 100

MISSING_VALUE_COLUMNS = [
    "passenger_count",
    "RatecodeID",
    "store_and_fwd_flag",
    "congestion_surcharge",
    "Airport_fee",
]

# Quarantine file names, in priority order.
QUARANTINE_CATEGORIES = [
    "invalid_timestamps",
    "distance_outliers",
    "invalid_passenger_count",
    "negative_fares",
    "negative_total_amounts",
]


@dataclass
class RuleOutcome:
    """What one period's rule pass produced, before anything is written."""

    accepted: pd.DataFrame
    quarantine: dict[str, pd.DataFrame]
    report: dict


def apply_rules(df: pd.DataFrame, year: int, month: int) -> RuleOutcome:
    """Applies every Silver rule to one Bronze period and returns the clean
    frame, the per-category quarantine frames and the quality report. The
    input is not modified."""
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
    missing_value_counts = {col: int(df[col].isna().sum()) for col in MISSING_VALUE_COLUMNS if col in df.columns}

    quarantine = {
        "invalid_timestamps": df[cat_timestamps],
        "distance_outliers": df[cat_distance],
        "invalid_passenger_count": df[cat_passenger],
        "negative_fares": df[cat_fare],
        "negative_total_amounts": df[cat_total],
    }

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

    return RuleOutcome(accepted=accepted, quarantine=quarantine, report=report)
