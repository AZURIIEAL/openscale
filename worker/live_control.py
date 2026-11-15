"""Live control for jobs that send at a rate (replay, stream_dataset): the
run's Redis control hash (redis_client.control_key, fields `paused`,
`speed`, `cancelled`) is polled before each send, so the Streaming screen's
Pause/Resume, speed and Cancel act on the running send loop. See POST
/api/projects/{p}/jobs/{id}/control on the Go side.
"""

import time
from typing import Callable

from common.db import get_redis_client
from redis_client import control_key as run_control_key

# Matches the TTL the Go side sets on the same key (see
# control-plane/internal/redis.controlKeyTTL) -- a second safety net in
# case this job crashes before its own cleanup runs.
CONTROL_KEY_TTL_SECONDS = 60 * 60

# How long to sleep between re-checks of the control hash while paused --
# short enough that resume/cancel feel responsive, long enough not to hammer
# Redis.
PAUSE_POLL_SECONDS = 0.5


def start(job_id: str | None):
    """Returns (redis, control_key), both None outside a queued run.

    HSETNX per field, not a blanket HSET -- a pause/cancel/speed command can
    reach the control-plane (and get written here) while this run is still
    "queued" in the UI, before the worker has even picked it up. A blanket
    HSET at init would silently clobber that command back to the default the
    instant this job starts; HSETNX only fills in fields nobody's touched
    yet. The worker deletes the key when the run ends; the TTL is the safety
    net."""
    if not job_id:
        return None, None
    r = get_redis_client()
    key = run_control_key(job_id)
    r.hsetnx(key, "paused", "false")
    r.hsetnx(key, "speed", "1")
    r.hsetnx(key, "cancelled", "false")
    r.expire(key, CONTROL_KEY_TTL_SECONDS)
    return r, key


def poll(r, control_key: str, log: Callable[[str], None], paused_flag: list[bool]) -> tuple[bool, dict]:
    """Checks the control hash once, blocking (in short polls) while
    paused==\"true\". Returns (cancelled, state) -- state is whatever the
    hash held the moment polling stopped, so the caller can read a fresh
    `speed` without a second round-trip. cancelled is checked both here and,
    while paused, on every re-poll -- so a user can cancel out of a pause."""
    state = r.hgetall(control_key)
    if state.get("cancelled") == "true":
        return True, state

    if state.get("paused") == "true":
        if not paused_flag[0]:
            log("paused")
            paused_flag[0] = True
        while True:
            time.sleep(PAUSE_POLL_SECONDS)
            state = r.hgetall(control_key)
            if state.get("cancelled") == "true":
                return True, state
            if state.get("paused") != "true":
                break
        log("resumed")
        paused_flag[0] = False

    return False, state


def sleep_unless_cancelled(r, control_key: str | None, seconds: float) -> None:
    """Sleeps between sends in short slices, returning early once the run is
    cancelled -- the next poll then sees it. At the slowest rate a
    send gap is 10s, longer than the runner's cancel grace period."""
    end = time.monotonic() + seconds
    while True:
        remaining = end - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(remaining, PAUSE_POLL_SECONDS))
        if r is not None and r.hget(control_key, "cancelled") == "true":
            return
