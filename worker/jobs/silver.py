"""
The `silver` job: runs worker.spark.silver.validator (Bronze -> Silver),
which applies the taxi rules in spark/silver/silver_rules.json through the
shared rule engine. Each month's quality report also goes to the run's
metrics.
"""

from registry import JobContext, job
from spark.silver.validator import run as run_validator


@job(
    "silver",
    "Validate (Silver)",
    "Bronze -> Silver: reject/quarantine/flag invalid rows, write clean trips.",
    stage="Silver",
    order=20,
    requires_feature="legacy_taxi",
)
def silver(ctx: JobContext) -> None:
    """A period's quarantined rows are not a job failure -- that's what
    quarantine is for -- so there is no partial case. rows is the sum of each
    period's records_processed (rows read from Bronze, before
    accept/quarantine/reject)."""
    rows = 0
    reports = []
    for report in run_validator():
        ctx.log(report)
        reports.append(report)
        rows += report.get("records_processed", 0)
        ctx.set_rows(rows)
        ctx.set_metrics({"periods": reports})
        ctx.check_cancelled()
