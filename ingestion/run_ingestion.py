"""
Bronze ingestion pipeline: locate/download -> validate schema -> write to Bronze.

With no arguments, processes every raw period already present under
data/raw/yellow_taxi/. With --start/--end, downloads that range from TLC
first (skipping periods already downloaded), then ingests exactly those
periods.

Usage:
    python ingestion/run_ingestion.py
    python ingestion/run_ingestion.py --start 2024-07 --end 2024-12
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from ingestion.downloader.downloader import DownloadError, available_periods, download, locate, month_range
from ingestion.uploader.uploader import upload
from ingestion.validator.schema_validator import SchemaValidationError, validate


def run(periods: list[tuple[int, int]] | None = None) -> list[dict]:
    results = []
    fetch_from_tlc = periods is not None
    target_periods = periods if fetch_from_tlc else available_periods()

    for year, month in target_periods:
        period = f"{year:04d}-{month:02d}"

        try:
            raw_path = download(year, month) if fetch_from_tlc else locate(year, month)
        except (DownloadError, FileNotFoundError) as exc:
            results.append({"period": period, "status": "UNAVAILABLE", "reason": str(exc)})
            continue

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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", help="Download+ingest range start, YYYY-MM")
    parser.add_argument("--end", help="Download+ingest range end, YYYY-MM")
    args = parser.parse_args()

    if args.start and args.end:
        target = month_range(args.start, args.end)
    elif args.start or args.end:
        parser.error("--start and --end must be given together")
    else:
        target = None

    for result in run(target):
        print(result)
