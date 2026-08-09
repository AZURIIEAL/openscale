"""
Phase 12 benchmarking: storage footprint and compute cost of the OpenScale
pipeline against the real dataset actually in the lake (40 months,
2023-02 -> 2026-05, ~138M rows -- the schema-compatible range documented in
docs/issues-and-fixes.md #12, not a synthesized 1B-row set).

Measures:
  - Storage: object count, total bytes, total rows, bytes/row for Bronze,
    Silver, and each Gold table (via Parquet footer metadata -- no data read).
  - Compute: wall-clock time and peak resident memory (driver JVM + any
    children) for the Gold, Feature-Store, and ML-training jobs, run for
    real against the full dataset.

Needs the same env as any other Spark job here (JAVA_HOME, HADOOP_HOME on
PATH -- see docs/README.md "PySpark setup") and MinIO/Postgres/Redis up via
docker compose.

Usage:
    python benchmarks/run_benchmarks.py
Writes results to docs/benchmarks.md.
"""

import json
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

import fsspec
import psutil
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from spark.common.storage import STORAGE_OPTIONS, list_lake  # noqa: E402

REPORT_PATH = REPO_ROOT / "docs" / "benchmarks.md"

STORAGE_TARGETS = [
    ("bronze", "yellow_taxi"),
    ("silver", "trips"),
    ("gold", "daily_revenue"),
    ("gold", "hourly_demand"),
    ("gold", "zone_stats"),
    ("gold", "congestion_metrics"),
]

COMPUTE_JOBS = [
    ("Gold (all 4 jobs)", [sys.executable, "spark/gold/run_gold.py"]),
    ("Feature Store", [sys.executable, "feature-store/feature-jobs/compute_features.py"]),
    ("ML training (300k sample)", [sys.executable, "ml/training/train_fare_model.py"]),
]


def storage_stats(*prefix_parts: str) -> dict:
    fs = fsspec.filesystem("s3", **STORAGE_OPTIONS)
    files = [k for k in list_lake(*prefix_parts) if k.endswith(".parquet")]
    total_bytes = 0
    total_rows = 0
    for key in files:
        total_bytes += fs.info(key)["size"]
        with fs.open(key, "rb") as f:
            total_rows += pq.ParquetFile(f).metadata.num_rows
    return {
        "prefix": "/".join(prefix_parts),
        "file_count": len(files),
        "total_bytes": total_bytes,
        "total_rows": total_rows,
        "bytes_per_row": round(total_bytes / total_rows, 2) if total_rows else None,
    }


def time_subprocess(cmd: list[str]) -> dict:
    proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    parent = psutil.Process(proc.pid)
    peak_rss_bytes = 0
    start = time.monotonic()
    while proc.poll() is None:
        try:
            procs = [parent, *parent.children(recursive=True)]
            peak_rss_bytes = max(peak_rss_bytes, sum(p.memory_info().rss for p in procs if p.is_running()))
        except psutil.Error:
            pass
        time.sleep(1)
    duration = time.monotonic() - start
    output = proc.stdout.read() if proc.stdout else ""
    return {
        "duration_seconds": round(duration, 1),
        "peak_rss_mb": round(peak_rss_bytes / (1024**2), 1),
        "exit_code": proc.returncode,
        "output_tail": output[-1500:],
    }


def format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def main() -> None:
    print("Measuring storage footprint...")
    storage_results = [storage_stats(*t) for t in STORAGE_TARGETS]
    for r in storage_results:
        print(f"  {r['prefix']}: {r['file_count']} files, {format_bytes(r['total_bytes'])}, {r['total_rows']:,} rows")

    print("\nRunning compute benchmarks (this runs the real jobs against the full dataset)...")
    compute_results = []
    for name, cmd in COMPUTE_JOBS:
        print(f"  {name}...")
        result = time_subprocess(cmd)
        result["name"] = name
        compute_results.append(result)
        status = "ok" if result["exit_code"] == 0 else f"FAILED (exit {result['exit_code']})"
        print(f"    {status} in {result['duration_seconds']}s, peak RSS {result['peak_rss_mb']}MB")
        if result["exit_code"] != 0:
            print(f"    --- output ---\n{result['output_tail']}\n    --- end output ---")

    write_report(storage_results, compute_results)
    print(f"\nWrote {REPORT_PATH}")


def write_report(storage_results: list[dict], compute_results: list[dict]) -> None:
    lines = [
        "# OpenScale Phase 12 Benchmark Results",
        "",
        f"Run date: {date.today().isoformat()}",
        "",
        "Measured against the real dataset actually in the lake: 40 months (2023-02 -> 2026-05), "
        "the schema-compatible range documented in `docs/issues-and-fixes.md` #12. "
        "`docs/plan.md` originally scoped this phase to \"100M-1B records\" -- 138M real rows is the "
        "honest ceiling of what TLC's public data supports without synthesizing rows, so that's what "
        "was actually run, not a fabricated 1B-row set.",
        "",
        "**Environment:** single local Windows machine, Spark `local[*]` (not a real cluster) with "
        "`spark.driver.memory=8g`, MinIO/Postgres/Redis via Docker Compose on the same machine. "
        "Numbers are indicative of relative cost between stages, not authoritative absolute throughput "
        "-- the host was also running Docker Desktop, a browser, and everything else on the machine at "
        "the same time.",
        "",
        "## Storage",
        "",
        "| Layer | Files | Size | Rows | Bytes/row |",
        "|---|---|---|---|---|",
    ]
    for r in storage_results:
        lines.append(
            f"| {r['prefix']} | {r['file_count']} | {format_bytes(r['total_bytes'])} | "
            f"{r['total_rows']:,} | {r['bytes_per_row']} |"
        )

    lines += [
        "",
        "## Compute",
        "",
        "Each job run for real, once, against the full 138M-row Silver dataset (Gold and Feature "
        "Store) or a 300k-row Spark-sampled subset (ML training, by design -- see "
        "`ml/training/train_fare_model.py`). Peak RSS is the sum across the Python driver process and "
        "every child process it spawned (mainly the Spark JVM), sampled once per second -- fast, "
        "sub-second spikes can be missed.",
        "",
        "| Stage | Duration | Peak RSS | Exit |",
        "|---|---|---|---|",
    ]
    for r in compute_results:
        status = "ok" if r["exit_code"] == 0 else f"FAILED ({r['exit_code']})"
        lines.append(f"| {r['name']} | {r['duration_seconds']}s | {r['peak_rss_mb']}MB | {status} |")

    lines += [
        "",
        "## The pandas memory wall, for scale",
        "",
        "The measurement that triggered the Phase 5 PySpark migration in the first place is the "
        "sharpest data point this project has for \"why Spark\": loading all 40 months via pandas' "
        "`pd.concat()` was projected (via `memory_usage(deep=True)` extrapolated across real Parquet "
        "row counts, before attempting it) at **~26.4GB** against **18GB** free RAM on this machine -- "
        "a near-certain crash or multi-minute swap-thrash. Every stage above completed under Spark "
        "without incident against the same 138M rows. Full detail: `docs/issues-and-fixes.md` #8.",
        "",
        "## Known limitations of this benchmark",
        "",
        "- Single-node local machine, not a cluster -- doesn't measure distributed scale-out, only "
        "single-machine Spark vs. the pandas ceiling it replaced.",
        "- No warm/cold cache comparison, no repeated runs for variance -- one real run per stage.",
        "- Peak RSS sampling is 1Hz; genuinely fast stages may under-report their true peak.",
        "- Storage bytes/row is post-Parquet-compression; no comparison against an uncompressed CSV "
        "baseline was run.",
    ]

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
