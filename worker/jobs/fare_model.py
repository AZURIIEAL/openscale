"""
The `fare_model` job: runs worker.ml.training.train_fare_model (taxi Silver
-> a fare-prediction model, logged to MLflow). The taxi sample's own trainer,
kept until Phase 4e rebuilds the sample on the generic `train` job. It was
called `train` until the generic job took that name (migration 0008 renamed
its run history).
"""

from ml.training.train_fare_model import train as train_fare_model
from registry import JobContext, job


@job(
    "fare_model",
    "Train Fare Model",
    "Samples Silver trips, trains a fare-prediction model, logs it to MLflow.",
    stage="Model",
    order=50,
    requires_feature="legacy_taxi",
)
def fare_model(ctx: JobContext) -> None:
    """One Spark load-then-fit. rows is the sampled training-set size;
    metrics carries mae/rmse/r2 for Dashboards' model-quality chart."""
    result = train_fare_model()
    ctx.log(result)
    ctx.set_rows(result.get("rows"))
    ctx.set_metrics({"mae": result["mae"], "rmse": result["rmse"], "r2": result["r2"]})
