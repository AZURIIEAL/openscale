"""
The `ingest` job: runs worker.ingestion.run_ingestion (Bronze population).
In-process call, not a subprocess -- this is the worker's own owned copy
of the pipeline code, not a reference to etl-exposure.
"""

from typing import Callable

from ingestion.downloader.downloader import month_range
from ingestion.run_ingestion import run as run_ingestion


def run(params: dict, on_log_line: Callable[[str], None]) -> tuple[str, str | None, list[str]]:
    """Runs the ingest job. Returns (status, error, log_lines).

    run_ingestion never raises for an individual period's UNAVAILABLE/
    REJECTED outcome -- those are yielded as normal result dicts (matching
    the original script's "keep going, print per-period status" behavior).
    So the job's own status has to be derived from those per-period
    outcomes, not just "did an exception propagate":
      - every period OK             -> succeeded
      - every period failed         -> failed (nothing landed in Bronze)
      - a mix of OK and failed      -> partial
    An uncaught exception (a real crash, not an expected rejection) is
    still an unconditional 'failed'.
    """
    start = params.get("start")
    end = params.get("end")
    periods = month_range(start, end) if start and end else None

    log_lines: list[str] = []
    ok_count = 0
    failed_periods: list[str] = []
    try:
        for result in run_ingestion(periods):
            line = str(result)
            log_lines.append(line)
            on_log_line(line)
            if result.get("status") == "OK":
                ok_count += 1
            else:
                failed_periods.append(f"{result.get('period')}: {result.get('status')} ({result.get('reason')})")
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log_lines.append(error)
        on_log_line(error)
        return "failed", error, log_lines

    if not failed_periods:
        return "succeeded", None, log_lines
    error = "; ".join(failed_periods)
    if ok_count == 0:
        return "failed", error, log_lines
    return "partial", error, log_lines
