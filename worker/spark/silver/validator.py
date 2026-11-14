"""
OpenScale Silver Layer validator: runs the taxi rules (silver_rules.json,
through libs/openscale's rule engine) over each Bronze period in MinIO.

For every period it produces:

- A clean Silver dataset    -> s3://openscale-lake/silver/trips/silver_trips_{year}_{month}.parquet
- Per-rule quarantine files -> s3://openscale-lake/silver/quarantine/{rule id}_{year}_{month}.parquet
- A JSON quality report     -> docs/quality-reports/quality-report-{year}-{month}.json (local, human-readable)

Usage:
    python spark/silver/validator.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from openscale.duck import connect
from openscale.rules import apply_rules

import fsspec

from spark.common.storage import LAKE_BUCKET, STORAGE_OPTIONS, lake_path, list_lake
from spark.silver.rules import count_duplicates, load_rules, period_variables, quality_report

QUALITY_REPORTS_DIR = Path(__file__).resolve().parents[2] / "docs" / "quality-reports"
MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")


def available_periods() -> list[tuple[int, int]]:
    periods = []
    for key in list_lake("bronze", "yellow_taxi"):
        stem = Path(key).stem  # "2024-01"
        year_str, month_str = stem.split("-")
        periods.append((int(year_str), int(month_str)))
    return periods


def clear_quarantine(period: str) -> None:
    """Removes the period's quarantine files from earlier runs: only rules
    that remove rows this time write one, so an old file would otherwise
    outlive its rows (or, before rules became data, its file name)."""
    fs = fsspec.filesystem("s3", **STORAGE_OPTIONS)
    stale = fs.glob(f"{LAKE_BUCKET}/silver/quarantine/*_{period}.parquet")
    if stale:
        fs.rm(stale)


def process_period(year: int, month: int) -> dict:
    source = f"read_parquet('{lake_path('bronze', 'yellow_taxi', f'{year:04d}-{month:02d}.parquet')}')"
    period = f"{year:04d}_{month:02d}"
    clear_quarantine(period)
    con = connect(memory_limit=MEMORY_LIMIT)
    try:
        run = apply_rules(
            con,
            load_rules(),
            source,
            lake_path("silver", "trips", f"silver_trips_{period}.parquet"),
            lambda rule: lake_path("silver", "quarantine", f"{rule.id}_{period}.parquet"),
            variables=period_variables(year, month),
        )
        report = quality_report(run, year, month, count_duplicates(con, source))
    finally:
        con.close()

    QUALITY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = QUALITY_REPORTS_DIR / f"quality-report-{year:04d}-{month:02d}.json"
    report_path.write_text(json.dumps(report, indent=2))
    return report


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
