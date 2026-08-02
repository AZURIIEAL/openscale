"""
Bronze ingestion pipeline: locate -> validate schema -> write to Bronze,
for every raw period available under data/raw/yellow_taxi/.

Usage:
    python ingestion/run_ingestion.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from ingestion.downloader.downloader import available_periods, locate
from ingestion.uploader.uploader import upload
from ingestion.validator.schema_validator import SchemaValidationError, validate


def run() -> list[dict]:
    results = []
    for year, month in available_periods():
        period = f"{year:04d}-{month:02d}"
        raw_path = locate(year, month)
        df = pd.read_parquet(raw_path, engine="pyarrow")

        try:
            validate(df)
        except SchemaValidationError as exc:
            results.append({"period": period, "status": "REJECTED", "reason": str(exc)})
            continue

        bronze_path = upload(df, year, month)
        results.append(
            {"period": period, "status": "OK", "bronze_path": str(bronze_path), "rows": len(df)}
        )

    return results


if __name__ == "__main__":
    for result in run():
        print(result)
