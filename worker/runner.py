"""
Runs one job in its own child process (`python -m job_child`) and supervises
it. A process per run means a cancel stops exactly that job -- the worker
itself, and the queue loop in main.py, keep running.

Protocol: the request goes to the child's stdin as one JSON object. The child
writes JSON lines back on stdout -- {"kind":"log","line":...} for each log
line and one {"kind":"result",...} at the end (see job_child.py). Everything
else the job prints, Spark's JVM included, goes to the child's stderr, which
is echoed to the worker's own stderr (the container log) and kept as a short
tail for the error message if the child dies without a result.

No Redis or Postgres here: main.py passes in the log sink and the cancel
check, so tests drive this with a real child process and plain callables.
"""

import collections
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from jobs.outcome import STATUS_CANCELLED, STATUS_FAILED

WORKER_DIR = Path(__file__).resolve().parent

# How often the cancel flag is checked while a job runs.
CANCEL_POLL_SECONDS = 0.5
# After a cancel, how long a job that checks the flag itself (replay) gets to
# stop cleanly before its process group is sent SIGTERM...
CANCEL_GRACE_SECONDS = 5.0
# ...and how long after SIGTERM before SIGKILL.
KILL_AFTER_SECONDS = 10.0
STDERR_TAIL_LINES = 20


@dataclass
class ChildOutcome:
    status: str
    error: str | None = None
    rows: int | None = None
    metrics: dict | None = None
    log_lines: list[str] = field(default_factory=list)
    exit_code: int | None = None


def _pump_stdout(stream, out: "queue.Queue[tuple[str, object]]") -> None:
    for raw in stream:
        line = raw.rstrip("\n")
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            # Not ours (the child routes stray prints to stderr, so this is
            # rare); still worth showing rather than dropping.
            out.put(("log", line))
            continue
        if isinstance(msg, dict) and msg.get("kind") == "result":
            out.put(("result", msg))
        elif isinstance(msg, dict) and msg.get("kind") == "log":
            out.put(("log", str(msg.get("line", ""))))
        else:
            out.put(("log", line))
    out.put(("eof", None))


def _pump_stderr(stream, tail: collections.deque) -> None:
    for raw in stream:
        tail.append(raw.rstrip("\n"))
        sys.stderr.write(raw)
    sys.stderr.flush()


def _signal_group(proc: subprocess.Popen, sig: int) -> None:
    """Signals the child's whole process group, so a JVM or any other
    grandchild the job started goes with it."""
    try:
        os.killpg(proc.pid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def _exit_error(code: int | None, tail: collections.deque) -> str:
    if code is not None and code < 0:
        sig = -code
        try:
            name = signal.Signals(sig).name
        except ValueError:
            name = f"signal {sig}"
        msg = f"job process was killed by {name}"
        if sig == signal.SIGKILL:
            msg += " (often the kernel's out-of-memory killer)"
    else:
        msg = f"job process exited with code {code} before reporting a result"
    last = next((line for line in reversed(tail) if line.strip()), None)
    return f"{msg}: {last}" if last else msg


def run_in_child(
    request: dict,
    on_log: Callable[[str], None],
    cancel_requested: Callable[[], bool],
    *,
    python: str = sys.executable,
    poll_seconds: float = CANCEL_POLL_SECONDS,
    grace_seconds: float = CANCEL_GRACE_SECONDS,
    kill_after_seconds: float = KILL_AFTER_SECONDS,
) -> ChildOutcome:
    """Runs request ({"type","module","job_id","project_id","params"}) to
    completion in a child process and returns how it ended."""
    proc = subprocess.Popen(
        [python, "-m", "job_child"],
        cwd=WORKER_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    assert proc.stdin and proc.stdout and proc.stderr
    proc.stdin.write(json.dumps(request))
    proc.stdin.close()

    messages: "queue.Queue[tuple[str, object]]" = queue.Queue()
    tail: collections.deque = collections.deque(maxlen=STDERR_TAIL_LINES)
    threading.Thread(target=_pump_stdout, args=(proc.stdout, messages), daemon=True).start()
    stderr_thread = threading.Thread(target=_pump_stderr, args=(proc.stderr, tail), daemon=True)
    stderr_thread.start()

    log_lines: list[str] = []
    result: dict | None = None
    cancel_at: float | None = None
    term_at: float | None = None
    killed = False
    next_check = 0.0

    def log(line: str) -> None:
        log_lines.append(line)
        on_log(line)

    while True:
        try:
            kind, payload = messages.get(timeout=poll_seconds)
        except queue.Empty:
            kind, payload = None, None

        if kind == "log":
            log(str(payload))
        elif kind == "result":
            result = payload  # type: ignore[assignment]
        elif kind == "eof":
            break

        now = time.monotonic()
        if cancel_at is None and now >= next_check:
            next_check = now + poll_seconds
            if cancel_requested():
                cancel_at = now
                log("cancel requested")
        if cancel_at is not None and term_at is None and now - cancel_at >= grace_seconds and proc.poll() is None:
            log("job did not stop on its own; terminating its process")
            _signal_group(proc, signal.SIGTERM)
            term_at = now
        if term_at is not None and not killed and now - term_at >= kill_after_seconds and proc.poll() is None:
            log("job ignored SIGTERM; killing its process")
            _signal_group(proc, signal.SIGKILL)
            killed = True

    code = proc.wait()
    # The stderr pipe closes when the child exits; give the pump a moment so
    # the tail is complete before it goes into an error message.
    stderr_thread.join(timeout=2)

    if result is not None:
        status = str(result.get("status") or STATUS_FAILED)
        if cancel_at is not None and status == STATUS_FAILED:
            # Stopping a job mid-flight usually breaks it on the way out
            # (Spark's JVM goes down with the process group and py4j raises
            # first); the run still ended because it was cancelled.
            return ChildOutcome(status=STATUS_CANCELLED, log_lines=log_lines, exit_code=code)
        return ChildOutcome(
            status=status,
            error=result.get("error"),
            rows=result.get("rows"),
            metrics=result.get("metrics"),
            log_lines=log_lines,
            exit_code=code,
        )
    if cancel_at is not None:
        return ChildOutcome(status=STATUS_CANCELLED, log_lines=log_lines, exit_code=code)

    error = _exit_error(code, tail)
    log(error)
    return ChildOutcome(status=STATUS_FAILED, error=error, log_lines=log_lines, exit_code=code)
