"""
The `silver` job: runs worker.spark.silver.validator (Bronze -> Silver).
This is the worker's own copy of the pipeline code, not a reference to
etl-exposure.
"""

from registry import JobContext, job
from spark.silver.validator import run as run_validator


@job(
    "silver",
    "Validate (Silver)",
    "Bronze -> Silver: reject/quarantine/flag invalid rows, write clean trips.",
    stage="Silver",
    order=20,
)
def silver(ctx: JobContext) -> None:
    """A period's quarantined rows are not a job failure -- that's what
    quarantine is for -- so there is no partial case. rows is the sum of each
    period's records_processed (rows read from Bronze, before
    accept/quarantine/reject)."""
    rows = 0
    for report in run_validator():
        ctx.log(report)
        rows += report.get("records_processed", 0)
        ctx.set_rows(rows)
        ctx.check_cancelled()
