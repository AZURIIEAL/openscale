"""
Runs every Gold-layer job against the combined Silver dataset.

Usage:
    python spark/gold/run_gold.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from spark.gold import congestion_metrics, daily_revenue, hourly_demand, zone_stats

JOBS = [daily_revenue, hourly_demand, zone_stats, congestion_metrics]


def run() -> list[str]:
    return [job.run() for job in JOBS]


if __name__ == "__main__":
    for path in run():
        print(f"Wrote {path}")
