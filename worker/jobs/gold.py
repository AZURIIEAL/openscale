"""
The `gold` job: runs worker.spark.gold.run_gold (Silver -> Gold, 4 datasets).
This is the worker's own copy of the pipeline code, not a reference to
etl-exposure.
"""

from registry import JobContext, job
from spark.gold.run_gold import run as run_gold


@job(
    "gold",
    "Aggregate (Gold)",
    "Silver -> Gold: daily revenue, hourly demand, zone stats, congestion metrics.",
    stage="Gold",
    order=30,
)
def gold(ctx: JobContext) -> None:
    """A failure in any one of the 4 Gold jobs stops the batch, so this is
    succeeded or failed, never partial. No row count: Gold's outputs are
    aggregate tables, and a df.count() per job just for this would mean 4
    extra full-dataset Spark scans."""
    for result in run_gold():
        ctx.log(result)
        ctx.check_cancelled()
