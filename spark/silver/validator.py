"""
OpenScale Silver Layer validator.

Transforms a raw Bronze NYC Yellow Taxi parquet file into a validated
Silver dataset plus per-rule quarantine datasets and a JSON quality report.

Usage:
    python spark/silver/validator.py [path/to/raw.parquet]
"""

import json
import sys
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_RAW_PATH = BASE_DIR / "data" / "raw" / "yellow_taxi" / "2024-01.parquet"
SILVER_DIR = BASE_DIR / "data" / "silver" / "trips"
QUARANTINE_DIR = BASE_DIR / "data" / "silver" / "quarantine"
REPORTS_DIR = BASE_DIR / "data" / "reports"


def build_masks(df: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    valid_timestamp = df["tpep_dropoff_datetime"] > df["tpep_pickup_datetime"]
    valid_passenger = df["passenger_count"] > 0
    valid_fare = df["fare_amount"] >= 0
    valid_distance = df["trip_distance"] >= 0
    return valid_timestamp, valid_passenger, valid_fare, valid_distance


def run(raw_path: Path = DEFAULT_RAW_PATH) -> dict:
    period = raw_path.stem.replace("-", "_")  # e.g. "2024_01"

    df = pd.read_parquet(raw_path, engine="pyarrow")

    valid_timestamp, valid_passenger, valid_fare, valid_distance = build_masks(df)

    negative_fares = df[df["fare_amount"] < 0]
    invalid_passengers = df[df["passenger_count"] <= 0]
    invalid_timestamps = df[df["tpep_dropoff_datetime"] < df["tpep_pickup_datetime"]]

    silver_df = df[valid_timestamp & valid_passenger & valid_fare & valid_distance]

    SILVER_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    silver_df.to_parquet(SILVER_DIR / f"silver_trips_{period}.parquet", engine="pyarrow")
    negative_fares.to_parquet(QUARANTINE_DIR / "negative_fares.parquet", engine="pyarrow")
    invalid_passengers.to_parquet(QUARANTINE_DIR / "invalid_passengers.parquet", engine="pyarrow")
    invalid_timestamps.to_parquet(QUARANTINE_DIR / "invalid_timestamps.parquet", engine="pyarrow")

    report = {
        "records_processed": int(len(df)),
        "records_valid": int(len(silver_df)),
        "records_quarantined": int(len(df) - len(silver_df)),
        "negative_fares": int(len(negative_fares)),
        "invalid_passengers": int(len(invalid_passengers)),
        "invalid_timestamps": int(len(invalid_timestamps)),
        "negative_distances": int((df["trip_distance"] < 0).sum()),
    }

    report_path = REPORTS_DIR / f"quality_report_{period}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    return report


if __name__ == "__main__":
    raw_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RAW_PATH
    result = run(raw_path)
    print(json.dumps(result, indent=2))
