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


def run():
    """Yields one {"job": name, "path": path} dict per Gold job as it
    completes -- a generator (not a plain function returning a list) so a
    caller streaming this over a job queue/WebSocket sees real per-job
    progress across what can be a multi-minute batch, matching
    ingestion/run_ingestion.py's same generator conversion."""
    for job in JOBS:
        path = job.run()
        yield {"job": job.__name__.rsplit(".", 1)[-1], "path": path}


if __name__ == "__main__":
    for result in run():
        print(f"Wrote {result['job']} -> {result['path']}")
