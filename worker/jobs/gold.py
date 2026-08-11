"""
The `gold` job: runs worker.spark.gold.run_gold (Silver -> Gold, 4 datasets).
In-process call, not a subprocess -- this is the worker's own owned copy of
the pipeline code, not a reference to etl-exposure.
"""

from typing import Callable

from spark.gold.run_gold import run as run_gold


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the gold job. Returns (status, error, log_lines, rows_processed, metrics).
    metrics is always None here -- only the train job reports metrics.

    run_gold itself has no per-job exception handling -- a failure in any
    one of the 4 Gold jobs stops the batch, so this is a binary
    succeeded/failed, no 'partial' case (unlike ingestion/silver, which
    tolerate per-unit failures by design). rows_processed is always None
    here -- Gold's outputs are aggregate tables (daily/hourly/zone/
    congestion summaries), not a row-for-row count, and adding a separate
    df.count() per job just for this metric would mean 4 extra full-dataset
    Spark scans with no other purpose.
    """
    log_lines: list[str] = []
    try:
        for result in run_gold():
            line = str(result)
            log_lines.append(line)
            on_log_line(line)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines, None, None

    return "succeeded", None, log_lines, None, None
