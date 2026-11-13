"""
Golden check for the Silver rules: runs spark/silver/rules.apply_rules on
real TLC months already downloaded under worker/data/raw/yellow_taxi/ and
compares every count with the quality report the original pipeline wrote
for that month (etl-exposure/docs/quality-reports/). Any refactor of the
rule engine -- including the planned move to rules-as-data -- must keep
this green for the months you pick.

Not part of CI: the monthly files are ~50 MB each and not in the repo.

Usage (from worker/):
    python scripts/golden_check.py 2024-07 2024-08
    python scripts/golden_check.py --all      # every month with both a raw file and a report
"""

import argparse
import json
import sys
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_ROOT))

import pandas as pd

from spark.silver.rules import apply_rules

RAW_DIR = WORKER_ROOT / "data" / "raw" / "yellow_taxi"
REPORTS_DIR = WORKER_ROOT.parent / "etl-exposure" / "docs" / "quality-reports"


def compare(period: str) -> list[str]:
    year, month = (int(p) for p in period.split("-"))
    raw = RAW_DIR / f"{period}.parquet"
    expected_path = REPORTS_DIR / f"quality-report-{period}.json"
    if not raw.exists():
        return [f"{period}: no raw file at {raw}"]
    if not expected_path.exists():
        return [f"{period}: no golden report at {expected_path}"]

    expected = json.loads(expected_path.read_text())
    actual = apply_rules(pd.read_parquet(raw, engine="pyarrow"), year, month).report

    diffs = []
    for key, want in expected.items():
        got = actual.get(key)
        if got != want:
            diffs.append(f"{period}: {key}: expected {want!r}, got {got!r}")
    return diffs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("periods", nargs="*", help="YYYY-MM months to check")
    parser.add_argument("--all", action="store_true", help="check every month with both inputs present")
    args = parser.parse_args()

    periods = list(args.periods)
    if args.all:
        periods = sorted(
            p.stem for p in RAW_DIR.glob("*.parquet") if (REPORTS_DIR / f"quality-report-{p.stem}.json").exists()
        )
    if not periods:
        parser.error("pass one or more YYYY-MM periods, or --all")

    failures = 0
    for period in periods:
        diffs = compare(period)
        if diffs:
            failures += 1
            print(f"FAIL {period}")
            for d in diffs:
                print(f"  {d}")
        else:
            print(f"ok   {period}")
    print(f"{len(periods) - failures}/{len(periods)} months match")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
