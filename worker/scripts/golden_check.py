"""
Golden check for the taxi Silver rules: runs the rules as data
(spark/silver/silver_rules.json) through the shared rule engine
(libs/openscale/openscale/rules.py) on real TLC months and compares every
count with the quality report the original pandas pipeline wrote for that
month (etl-exposure/docs/quality-reports/). Nothing is written: the engine
only counts.

A month is read from worker/data/raw/yellow_taxi/{YYYY-MM}.parquet when
that file exists, otherwise from Bronze in the lake
(s3://openscale-lake/bronze/yellow_taxi/), which needs MINIO_ENDPOINT etc.,
so for lake months run it from the worker image with the reports mounted
(from the repo root; --entrypoint because the image starts the worker):

    docker compose run --rm --no-deps --entrypoint python \
      -v ./etl-exposure:/etl-exposure:ro worker scripts/golden_check.py --all

Not part of CI: the monthly files are ~50-90 MB each and not in the repo.

Usage (from worker/):
    python scripts/golden_check.py 2025-03 2025-04
    python scripts/golden_check.py --all      # every month with a report and data (local or lake)
"""

import argparse
import json
import sys
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_ROOT))

from openscale.duck import connect  # noqa: E402
from openscale.rules import count_rules  # noqa: E402

from spark.silver.rules import count_duplicates, load_rules, period_variables, quality_report  # noqa: E402

RAW_DIR = WORKER_ROOT / "data" / "raw" / "yellow_taxi"
REPORTS_DIR = WORKER_ROOT.parent / "etl-exposure" / "docs" / "quality-reports"
LAKE_BRONZE = "s3://openscale-lake/bronze/yellow_taxi"


def source_for(period: str) -> str:
    local = RAW_DIR / f"{period}.parquet"
    return f"read_parquet('{local if local.exists() else f'{LAKE_BRONZE}/{period}.parquet'}')"


def lake_periods() -> set[str]:
    try:
        from spark.common.storage import list_lake

        return {Path(k).stem for k in list_lake("bronze", "yellow_taxi")}
    except Exception:  # noqa: BLE001 - no lake reachable: local files only
        return set()


def compare(period: str) -> list[str]:
    year, month = (int(p) for p in period.split("-"))
    expected_path = REPORTS_DIR / f"quality-report-{period}.json"
    if not expected_path.exists():
        return [f"{period}: no golden report at {expected_path}"]

    expected = json.loads(expected_path.read_text())
    source = source_for(period)
    con = connect(memory_limit="2GB")
    try:
        run = count_rules(con, load_rules(), source, variables=period_variables(year, month))
        actual = quality_report(run, year, month, count_duplicates(con, source))
    except Exception as exc:  # noqa: BLE001 - reported per month
        return [f"{period}: {exc}"]
    finally:
        con.close()

    diffs = []
    for key, want in expected.items():
        got = actual.get(key)
        if got != want:
            diffs.append(f"{period}: {key}: expected {want!r}, got {got!r}")
    return diffs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("periods", nargs="*", help="YYYY-MM months to check")
    parser.add_argument("--all", action="store_true", help="check every month with a report and data")
    args = parser.parse_args()

    periods = list(args.periods)
    if args.all:
        available = {p.stem for p in RAW_DIR.glob("*.parquet")} | lake_periods()
        periods = sorted(p for p in available if (REPORTS_DIR / f"quality-report-{p}.json").exists())
    if not periods:
        parser.error("pass one or more YYYY-MM periods, or --all (no month has both a report and data)")

    failures = 0
    for period in periods:
        diffs = compare(period)
        if diffs:
            failures += 1
            print(f"FAIL {period}")
            for d in diffs:
                print(f"  {d}")
        else:
            print(f"ok   {period}", flush=True)
    print(f"{len(periods) - failures}/{len(periods)} months match")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
