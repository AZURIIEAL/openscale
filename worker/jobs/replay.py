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

Live control: this job polls its run's Redis control hash
(redis_client.control_key: fields `paused`, `speed`, `cancelled`) once per
row, before each send, and between sends while it sleeps -- letting the
Streaming screen's Pause/Resume, Cancel, and x1/x2/x3/x5/x10 speed controls
act on the *currently in-flight* send loop live. It stops itself on cancel
well inside the runner's grace period, so its log ends with the trip count
rather than a kill. See POST /api/jobs/{id}/control on the Go side.
"""

import json
import os
import time
from typing import Callable

import pandas as pd
from kafka import KafkaProducer
from pyspark.sql import functions as F

from common.db import get_redis_client
from redis_client import control_key as run_control_key
from registry import JobCancelled, JobContext, Param, job
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


def _sleep_unless_cancelled(r, control_key: str | None, seconds: float) -> None:
    """Sleeps between sends in short slices, returning early once the run is
    cancelled -- the next _poll_control then sees it. At the slowest rate a
    send gap is 10s, longer than the runner's cancel grace period."""
    end = time.monotonic() + seconds
    while True:
        remaining = end - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(remaining, PAUSE_POLL_SECONDS))
        if r is not None and r.hget(control_key, "cancelled") == "true":
            return


@job(
    "replay",
    "Replay Trips",
    "Replays real Silver trips onto Kafka's yellow-taxi-trips topic at a configurable rate.",
    params_schema=[
        Param("limit", "integer", "Trips to send", default=DEFAULT_LIMIT, min=1, max=MAX_LIMIT),
        Param(
            "messagesPerSecond",
            "number",
            "Messages per second",
            default=DEFAULT_MESSAGES_PER_SECOND,
            min=0.1,
            max=MAX_MESSAGES_PER_SECOND,
        ),
        Param("date", "date", "Pickup date", description="Defaults to the latest day in Silver."),
    ],
    # Started from the Streaming screen's replay controls, not the run list.
    listed=False,
    requires_feature="legacy_taxi",
)
def replay(ctx: JobContext) -> None:
    """rows is the count of trips actually sent to Kafka. Fails if there is
    no Silver data or the broker is unreachable; cancelled from the
    Streaming screen or cancel-all."""
    date_param, limit, messages_per_second = _resolve_params(ctx.params)

    r = get_redis_client() if ctx.job_id else None
    control_key = run_control_key(ctx.job_id) if ctx.job_id else None
    paused_flag = [False]
    if r is not None:
        # HSETNX per field, not a blanket HSET -- a pause/cancel/speed
        # command can reach the control-plane (and get written here) while
        # this run is still "queued" in the UI, before the worker has even
        # picked it up. A blanket HSET at init would silently clobber that
        # command back to the default the instant this job starts; HSETNX
        # only fills in fields nobody's touched yet. The worker deletes the
        # key when the run ends; the TTL is the safety net.
        r.hsetnx(control_key, "paused", "false")
        r.hsetnx(control_key, "speed", "1")
        r.hsetnx(control_key, "cancelled", "false")
        r.expire(control_key, CONTROL_KEY_TTL_SECONDS)

    pickup_date, day_df = _load_day(date_param)
    if len(day_df) > limit:
        day_df = day_df.head(limit)
    total = len(day_df)

    ctx.log(f"replaying {total} trips from {pickup_date} to '{TRIPS_TOPIC}' at {messages_per_second}/s")

    if total == 0:
        ctx.log(f"no Silver trips found for {pickup_date}")
        ctx.set_rows(0)
        return

    producer = KafkaProducer(
        bootstrap_servers=os.environ.get("KAFKA_BROKER", "kafka:9092"),
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    delay_seconds = 1.0 / messages_per_second

    sent = 0
    for _, row in day_df.iterrows():
        speed = 1.0
        if r is not None:
            cancelled, state = _poll_control(r, control_key, ctx.log, paused_flag)
            if cancelled:
                producer.flush()
                ctx.log(f"cancelled after {sent}/{total} trips")
                raise JobCancelled()
            speed = float(state.get("speed") or "1")

        # pandas' own JSON encoder handles Timestamps/NaN/numpy dtypes
        # correctly, unlike a bare json.dumps(row.to_dict()).
        record = json.loads(row.to_json(date_format="iso"))
        producer.send(TRIPS_TOPIC, record)
        sent += 1
        ctx.set_rows(sent)
        if sent % LOG_EVERY == 0:
            ctx.log(f"sent {sent}/{total} trips")
        # speed is read fresh every iteration, so a live change from the
        # Streaming screen takes effect on the very next send.
        _sleep_unless_cancelled(r, control_key, delay_seconds / speed)

    producer.flush()
    ctx.log(f"sent {sent}/{sent} trips to topic '{TRIPS_TOPIC}'")
