"""
The `features` job: runs worker.feature_store.feature_jobs.compute_features
(Silver -> Postgres offline store + Redis online store). In-process call,
not a subprocess -- this is the worker's own owned copy of the pipeline
code, not a reference to etl-exposure.
"""

from typing import Callable

from feature_store.feature_jobs.compute_features import run as run_compute_features


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the features job. Returns (status, error, log_lines, rows_processed, metrics).
    metrics is always None here -- only the train job reports metrics.

    A single Spark-aggregate-then-write operation, not a per-unit loop --
    succeeded/failed only. rows_processed is compute_features.run()'s own
    feature_rows count (rows written to Postgres/Redis, not rows scanned).
    """
    log_lines: list[str] = []
    try:
        result = run_compute_features()
        line = str(result)
        log_lines.append(line)
        on_log_line(line)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines, None, None

    return "succeeded", None, log_lines, result.get("feature_rows"), None
