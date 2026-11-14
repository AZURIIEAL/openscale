"""
The `train` job: runs worker.ml.training.train_fare_model (Silver -> a
fare-prediction model, logged to MLflow). This is the worker's own copy of
the pipeline code, not a reference to etl-exposure.
"""

from ml.training.train_fare_model import train as train_fare_model
from registry import JobContext, job


@job(
    "train",
    "Train Fare Model",
    "Samples Silver trips, trains a fare-prediction model, logs it to MLflow.",
    stage="Model",
    order=50,
)
def train(ctx: JobContext) -> None:
    """One Spark load-then-fit. rows is the sampled training-set size;
    metrics carries mae/rmse/r2 for Dashboards' model-quality chart."""
    result = train_fare_model()
    ctx.log(result)
    ctx.set_rows(result.get("rows"))
    ctx.set_metrics({"mae": result["mae"], "rmse": result["rmse"], "r2": result["r2"]})
