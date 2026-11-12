"""
The `ingest` job: runs worker.ingestion.run_ingestion (Bronze population).
In-process call, not a subprocess -- this is the worker's own owned copy
of the pipeline code, not a reference to etl-exposure.
"""

from typing import Callable

from ingestion.downloader.downloader import month_range
from ingestion.run_ingestion import run as run_ingestion
from jobs.outcome import IngestOutcome, format_exception


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the ingest job. Returns (status, error, log_lines, rows_processed, metrics).
    metrics is always None here -- only the train job reports metrics.

    run_ingestion never raises for an individual period's UNAVAILABLE/
    REJECTED outcome -- those are yielded as normal result dicts (matching
    the original script's "keep going, print per-period status" behavior).
    So the job's own status has to be derived from those per-period
    outcomes, not just "did an exception propagate":
      - every period OK             -> succeeded
      - every period failed         -> failed (nothing landed in Bronze)
      - a mix of OK and failed      -> partial
    An uncaught exception (a real crash, not an expected rejection) is
    still an unconditional 'failed'. The status rule itself lives in
    jobs.outcome.IngestOutcome so it can be unit-tested.
    """
    start = params.get("start")
    end = params.get("end")
    periods = month_range(start, end) if start and end else None

    log_lines: list[str] = []
    outcome = IngestOutcome()
    try:
        for result in run_ingestion(periods):
            line = str(result)
            log_lines.append(line)
            on_log_line(line)
            outcome.add(result)
    except Exception as exc:
        error = format_exception(exc)
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines, outcome.rows_processed or None, None

    status, error, rows_processed = outcome.finish()
    return status, error, log_lines, rows_processed, None
