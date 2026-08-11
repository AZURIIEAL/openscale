"""
The `silver` job: runs worker.spark.silver.validator (Bronze -> Silver).
In-process call, not a subprocess -- this is the worker's own owned copy of
the pipeline code, not a reference to etl-exposure.
"""

from typing import Callable

from spark.silver.validator import run as run_validator


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the silver job. Returns (status, error, log_lines, rows_processed, metrics).
    metrics is always None here -- only the train job reports metrics.

    Unlike ingestion, a period's quarantined rows are NOT a job failure --
    that's what quarantine is for. status is 'succeeded' unless an
    uncaught exception propagates (e.g. a Bronze read error), then 'failed'.
    No 'partial' case here. rows_processed sums each period's
    records_processed (rows read from Bronze, before accept/quarantine/reject).
    """
    log_lines: list[str] = []
    rows_processed = 0
    try:
        for report in run_validator():
            line = str(report)
            log_lines.append(line)
            on_log_line(line)
            rows_processed += report.get("records_processed", 0)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines, rows_processed or None, None

    return "succeeded", None, log_lines, rows_processed, None
