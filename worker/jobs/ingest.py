"""
The `ingest` job: runs worker.ingestion.run_ingestion (Bronze population)
for a month range. This is the worker's own copy of the pipeline code, not a
reference to etl-exposure.
"""

from ingestion.downloader.downloader import month_range
from ingestion.run_ingestion import run as run_ingestion
from jobs.outcome import IngestOutcome
from registry import JobContext, JobFailed, Param, job


@job(
    "ingest",
    "Ingest (Bronze)",
    "Download/validate TLC parquet for a month range, write to Bronze in MinIO.",
    params_schema=[
        # NYC TLC trip records begin January 2009.
        Param("start", "month", "Start", required=True, min="2009-01"),
        Param("end", "month", "End", required=True, min="2009-01", gte="start"),
    ],
    stage="Bronze",
    order=10,
)
def ingest(ctx: JobContext) -> None:
    """run_ingestion never raises for an individual period's UNAVAILABLE/
    REJECTED outcome -- those are yielded as normal result dicts. So the
    run's status comes from the per-period outcomes (jobs.outcome.IngestOutcome):
    every period OK -> succeeded, every period failed -> failed, a mix ->
    partial. An uncaught exception is still an unconditional failure."""
    start = ctx.params.get("start")
    end = ctx.params.get("end")
    periods = month_range(start, end) if start and end else None

    outcome = IngestOutcome()
    for result in run_ingestion(periods):
        ctx.log(result)
        outcome.add(result)
        ctx.set_rows(outcome.rows_processed or None)
        ctx.check_cancelled()

    status, error, rows_processed = outcome.finish()
    ctx.set_rows(rows_processed)
    if status == "failed":
        raise JobFailed(error)
    if status == "partial":
        ctx.set_partial(error)
