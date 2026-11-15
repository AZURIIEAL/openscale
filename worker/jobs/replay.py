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

import pandas as pd
from kafka import KafkaProducer
from pyspark.sql import functions as F

import live_control
from registry import JobCancelled, JobContext, Param, job
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark

TRIPS_TOPIC = "yellow-taxi-trips"

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

    r, control_key = live_control.start(ctx.job_id)
    paused_flag = [False]

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
            cancelled, state = live_control.poll(r, control_key, ctx.log, paused_flag)
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
        live_control.sleep_unless_cancelled(r, control_key, delay_seconds / speed)

    producer.flush()
    ctx.log(f"sent {sent}/{sent} trips to topic '{TRIPS_TOPIC}'")
