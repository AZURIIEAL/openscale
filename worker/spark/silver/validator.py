"""
OpenScale Silver Layer validator: the IO wrapper around spark/silver/rules.py.

For every Bronze period in MinIO it produces:

- A clean Silver dataset    -> s3://openscale-lake/silver/trips/silver_trips_{year}_{month}.parquet
- Per-rule quarantine files -> s3://openscale-lake/silver/quarantine/{rule}_{year}_{month}.parquet
- A JSON quality report     -> docs/quality-reports/quality-report-{year}-{month}.json (local, human-readable)

The rule logic itself (tiers, priorities, the report's fields) lives in
rules.apply_rules so it can be tested without a lake.

Usage:
    python spark/silver/validator.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd

from spark.common.storage import STORAGE_OPTIONS, lake_path, list_lake
from spark.silver.rules import apply_rules

QUALITY_REPORTS_DIR = Path(__file__).resolve().parents[2] / "docs" / "quality-reports"


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

    outcome = apply_rules(df, year, month)

    QUALITY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    period = f"{year:04d}_{month:02d}"
    outcome.accepted.to_parquet(
        lake_path("silver", "trips", f"silver_trips_{period}.parquet"),
        engine="pyarrow",
        storage_options=STORAGE_OPTIONS,
    )
    for name, frame in outcome.quarantine.items():
        frame.to_parquet(
            lake_path("silver", "quarantine", f"{name}_{period}.parquet"),
            engine="pyarrow",
            storage_options=STORAGE_OPTIONS,
        )

    report_path = QUALITY_REPORTS_DIR / f"quality-report-{year:04d}-{month:02d}.json"
    with open(report_path, "w") as f:
        json.dump(outcome.report, f, indent=2)

    return outcome.report


def run():
    """Yields one quality report per period as it completes -- a generator
    (not a plain function returning a list) so a caller streaming this over
    a job queue/WebSocket sees real per-period progress, matching
    ingestion/run_ingestion.py's same generator conversion."""
    for year, month in available_periods():
        yield process_period(year, month)


if __name__ == "__main__":
    for result in run():
        print(json.dumps(result, indent=2))
