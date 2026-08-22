"""
The `replay` job: replays real Silver trips onto Kafka's yellow-taxi-trips
topic at a flat, configurable send rate -- feeds the Streaming screen's
live WebSocket view with real trip data instead of a mock feed.

Adapted from the never-ported etl-exposure/streaming/replay-service/
replay.py prototype: same Silver-load-and-sort logic, and the same
row.to_json(date_format="iso") JSON encoding (pandas' own encoder handles
Timestamps/NaN/numpy dtypes correctly, unlike a bare
json.dumps(row.to_dict())) -- but a flat messages-per-second send rate
instead of that script's real-inter-arrival-gap --speed multiplier.
Deliberate: a flat rate is simpler for a UI control to expose than a
day-simulation speed multiplier, and this is a live-demo/dashboard feature,
not a scientific replay.

Live control: when the control-plane enqueues this job it merges a
`job_id` into the params (see jobs_handler.go's Run), which this job uses
to poll a per-run Redis HASH at openscale:jobs:{job_id}:control (fields
`paused`, `speed`, `cancelled`) once per row, before each send -- letting
the Streaming screen's Pause/Resume, Cancel, and x1/x2/x3/x5/x10 speed
controls act on the *currently in-flight* send loop live, not just at job
start. See POST /api/jobs/{id}/control on the Go side.
"""

import json
import os
import time
from typing import Callable

import pandas as pd
from kafka import KafkaProducer
from pyspark.sql import functions as F

from common.db import get_redis_client
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark

TRIPS_TOPIC = "yellow-taxi-trips"

# Matches the TTL the Go side sets on the same key (see
# control-plane/internal/redis.controlKeyTTL) -- a second safety net in
# case this job crashes before its own cleanup runs.
CONTROL_KEY_TTL_SECONDS = 60 * 60

# How long to sleep between re-checks of the control hash while paused --
# short enough that resume/cancel feel responsive, long enough not to hammer
# Redis.
PAUSE_POLL_SECONDS = 0.5

# Caps so a UI user can't accidentally request something absurd (a
# multi-hour send, or a flood that starves the broker).
DEFAULT_LIMIT = 500
MAX_LIMIT = 5000
DEFAULT_MESSAGES_PER_SECOND = 10.0
MAX_MESSAGES_PER_SECOND = 100.0

LOG_EVERY = 50


def _resolve_params(params: dict) -> tuple[str | None, int, float]:
    limit = int(params.get("limit") or DEFAULT_LIMIT)
    limit = max(1, min(limit, MAX_LIMIT))

    messages_per_second = float(params.get("messagesPerSecond") or DEFAULT_MESSAGES_PER_SECOND)
    messages_per_second = max(0.1, min(messages_per_second, MAX_MESSAGES_PER_SECOND))

    date = params.get("date") or None
    return date, limit, messages_per_second


def _load_day(pickup_date: str | None) -> tuple[str, pd.DataFrame]:
    """Loads one day's Silver trips, sorted by pickup time. Mirrors the
    legacy replay.py's load_day, plus resolving pickup_date to the latest
    available Silver date when none is supplied -- a UI user shouldn't have
    to already know what dates are loaded before picking one."""
    spark = get_spark("streaming-replay")
    try:
        df = load_silver_trips(spark)
        if pickup_date is None:
            max_row = df.select(F.max(F.to_date("tpep_pickup_datetime"))).first()
            if max_row is None or max_row[0] is None:
                raise RuntimeError("no Silver trips available to replay -- run the silver job first")
            pickup_date = str(max_row[0])
        day_df = df.filter(F.to_date("tpep_pickup_datetime") == pickup_date)
        pandas_df = day_df.toPandas().sort_values("tpep_pickup_datetime")
        return pickup_date, pandas_df
    finally:
        # Only pandas + kafka-python are needed for the send loop below --
        # stop the Spark session first, same as the legacy replay.py.
        spark.stop()


def _control_key(job_id: str) -> str:
    return f"openscale:jobs:{job_id}:control"


def _poll_control(r, control_key: str, log: Callable[[str], None], paused_flag: list[bool]) -> tuple[bool, dict]:
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


def run(
    params: dict, on_log_line: Callable[[str], None]
) -> tuple[str, str | None, list[str], int | None, dict | None]:
    """Runs the replay job. Returns (status, error, log_lines, rows_processed, metrics).
    metrics is always None -- only the train job reports metrics.
    rows_processed is the count of trips actually sent to Kafka.

    status is 'succeeded' unless an uncaught exception propagates (e.g. no
    Silver data at all, or the broker is unreachable), then 'failed' with
    whatever was sent so far as a partial rows_processed count. 'cancelled'
    is also possible now -- see the control-hash polling below -- and is
    already a valid terminal Status on the Go side, so no enum change was
    needed there. No 'partial' case here -- unlike ingest's per-period
    outcomes, a replay either completes its send loop or it doesn't."""
    log_lines: list[str] = []
    sent = 0

    date_param, limit, messages_per_second = _resolve_params(params)

    def log(line: str) -> None:
        log_lines.append(line)
        on_log_line(line)

    # job_id is merged into params by the control-plane's Run handler when
    # it enqueues this job (see jobs_handler.go) -- absent only if replay.py
    # is invoked some other way (e.g. a direct test call), in which case
    # live control is simply unavailable and the loop runs at a flat,
    # unchangeable speed like before.
    job_id = params.get("job_id")
    r = get_redis_client() if job_id else None
    control_key = _control_key(job_id) if job_id else None
    paused_flag = [False]
    if r is not None:
        # HSETNX per field, not a blanket HSET -- a pause/cancel/speed
        # command can reach the control-plane (and get written here) while
        # this run is still "queued" in the UI, before the worker has even
        # picked it up. A blanket HSET at init would silently clobber that
        # command back to the default the instant this job starts; HSETNX
        # only fills in fields nobody's touched yet.
        r.hsetnx(control_key, "paused", "false")
        r.hsetnx(control_key, "speed", "1")
        r.hsetnx(control_key, "cancelled", "false")
        r.expire(control_key, CONTROL_KEY_TTL_SECONDS)

    try:
        pickup_date, day_df = _load_day(date_param)
        if len(day_df) > limit:
            day_df = day_df.head(limit)
        total = len(day_df)

        log(f"replaying {total} trips from {pickup_date} to '{TRIPS_TOPIC}' at {messages_per_second}/s")

        if total == 0:
            log(f"no Silver trips found for {pickup_date}")
            return "succeeded", None, log_lines, 0, None

        producer = KafkaProducer(
            bootstrap_servers=os.environ.get("KAFKA_BROKER", "kafka:9092"),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        delay_seconds = 1.0 / messages_per_second

        for _, row in day_df.iterrows():
            speed = 1.0
            if r is not None:
                cancelled, state = _poll_control(r, control_key, log, paused_flag)
                if cancelled:
                    log(f"cancelled after {sent}/{total} trips")
                    r.delete(control_key)
                    return "cancelled", None, log_lines, sent or None, None
                speed = float(state.get("speed") or "1")

            # pandas' own JSON encoder handles Timestamps/NaN/numpy dtypes
            # correctly, unlike a bare json.dumps(row.to_dict()).
            record = json.loads(row.to_json(date_format="iso"))
            producer.send(TRIPS_TOPIC, record)
            sent += 1
            if sent % LOG_EVERY == 0:
                log(f"sent {sent}/{total} trips")
            # Read fresh every iteration (not just once before the loop) so
            # a live speed change from the Streaming screen takes effect on
            # the very next send, not just at job start.
            time.sleep(delay_seconds / speed)

        producer.flush()
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log(error)
        return "failed", error, log_lines, sent or None, None

    if r is not None:
        # The TTL is a safety net, not the primary cleanup path -- delete
        # explicitly now that the send loop is done with it.
        r.delete(control_key)

    log(f"sent {sent}/{sent} trips to topic '{TRIPS_TOPIC}'")
    return "succeeded", None, log_lines, sent, None
