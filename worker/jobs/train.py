"""
The `train` job: runs worker.ml.training.train_fare_model (Silver -> a
fare-prediction model, logged to MLflow). In-process call, not a
subprocess -- this is the worker's own owned copy of the pipeline code,
not a reference to etl-exposure.
"""

from typing import Callable

from ml.training.train_fare_model import train as train_fare_model


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the train job. Returns (status, error, log_lines, rows_processed, metrics).

    A single Spark-load-then-fit operation, not a per-unit loop --
    succeeded/failed only. rows_processed is the sampled training-set size
    train_fare_model.train() reports as "rows". metrics carries mae/rmse/r2
    for Dashboards' "model quality over retrains" chart.
    """
    log_lines: list[str] = []
    try:
        result = train_fare_model()
        line = str(result)
        log_lines.append(line)
        on_log_line(line)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines, None, None

    metrics = {"mae": result["mae"], "rmse": result["rmse"], "r2": result["r2"]}
    return "succeeded", None, log_lines, result.get("rows"), metrics
