"""
The `features` job: runs worker.feature_store.feature_jobs.compute_features
(Silver -> Postgres offline store + Redis online store). This is the
worker's own copy of the pipeline code, not a reference to etl-exposure.
"""

from feature_store.feature_jobs.compute_features import run as run_compute_features
from registry import JobContext, job


@job(
    "features",
    "Compute Features",
    "Silver -> zone x hour features, written to Postgres and Redis.",
    stage="Features",
    order=40,
    requires_feature="legacy_taxi",
)
def features(ctx: JobContext) -> None:
    """One Spark aggregate-then-write. rows is compute_features' own
    feature_rows count (rows written, not rows scanned)."""
    result = run_compute_features()
    ctx.log(result)
    ctx.set_rows(result.get("feature_rows"))
