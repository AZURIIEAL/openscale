"""
Entry point of a job's child process: `python -m job_child`, started by
runner.run_in_child with the request as JSON on stdin. Imports only the
module that defines the requested job, runs it through registry.run_job, and
reports back as JSON lines on the original stdout (see runner.py).
"""

import importlib
import json
import os
import signal
import sys
import time

from jobs.outcome import STATUS_FAILED, format_exception
from registry import REGISTRY, JobCancelled, JobContext, JobResult, run_job

# check_cancelled() may sit in a hot loop; read Redis at most this often.
CANCEL_CHECK_INTERVAL_SECONDS = 0.5


def _cancel_checker(job_id: str | None):
    """A cached Redis read of the run's cancel flag. Connects lazily, so a
    job that never checks never needs Redis (the runner's tests rely on it)."""
    if not job_id:
        return lambda: False

    state = {"client": None, "checked_at": 0.0, "cancelled": False}

    def is_cancelled() -> bool:
        if state["cancelled"]:
            return True
        now = time.monotonic()
        if now - state["checked_at"] < CANCEL_CHECK_INTERVAL_SECONDS:
            return False
        state["checked_at"] = now
        import redis_client

        if state["client"] is None:
            state["client"] = redis_client.get_client()
        state["cancelled"] = redis_client.is_cancel_requested(state["client"], job_id)
        return state["cancelled"]

    return is_cancelled


def main() -> int:
    # Keep a private handle on stdout for the protocol, then point fd 1 at
    # stderr: prints from the job, its libraries and any subprocess (Spark's
    # JVM inherits fd 1) can no longer interleave with protocol lines. os.dup
    # returns a non-inheritable fd, so grandchildren never hold the pipe open.
    proto = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    def emit(msg: dict) -> None:
        proto.write(json.dumps(msg, default=str) + "\n")
        proto.flush()

    request = json.load(sys.stdin)
    job_type = request["type"]
    params = request.get("params") or {}

    def log(line: str) -> None:
        emit({"kind": "log", "line": line})

    try:
        importlib.import_module(request["module"])
        definition = REGISTRY[job_type]
    except Exception as exc:
        error = f"could not load job {job_type!r}: {format_exception(exc)}"
        log(error)
        emit({"kind": "result", "status": STATUS_FAILED, "error": error})
        return 1

    # The runner sends SIGTERM when a cancelled job doesn't stop on its own.
    # Raising here unwinds the job like check_cancelled() would, so its
    # except/finally blocks run (a dataset leaves `pending`) and the run is
    # recorded as cancelled rather than killed.
    def on_sigterm(_signum, _frame):
        raise JobCancelled()

    signal.signal(signal.SIGTERM, on_sigterm)

    ctx = JobContext(
        job_id=request.get("job_id"),
        project_id=request.get("project_id"),
        params=params,
        log=log,
        is_cancelled=_cancel_checker(request.get("job_id")),
    )
    result: JobResult = run_job(definition, ctx)
    emit(
        {
            "kind": "result",
            "status": result.status,
            "error": result.error,
            "rows": result.rows,
            "metrics": result.metrics,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
