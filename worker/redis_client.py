"""Tiny Redis helpers for the job-queue worker -- only this module touches
redis-py. Three concerns: the request Stream (dispatch, exactly-once via
consumer groups), the events Pub/Sub channel (ephemeral live-tail relay for
the Go control-plane's WebSocket hub), and each run's control hash
(cancel/pause/speed, written by the control-plane)."""

import json
import os

import redis

REDIS_ADDR = os.environ.get("REDIS_ADDR", "localhost:6379")
EVENTS_CHANNEL = "openscale:jobs:events"

# Must stay well above main.py's XREADGROUP block time (5 s). redis-py 8
# defaults socket_timeout to 5 s, so an idle queue read timed out at the same
# moment the block ended and crashed the worker.
SOCKET_TIMEOUT_SECONDS = 30


def get_client() -> "redis.Redis":
    host, _, port = REDIS_ADDR.partition(":")
    return redis.Redis(
        host=host,
        port=int(port or 6379),
        decode_responses=True,
        socket_timeout=SOCKET_TIMEOUT_SECONDS,
    )


def ensure_consumer_group(client: "redis.Redis", stream: str, group: str) -> None:
    try:
        client.xgroup_create(stream, group, id="$", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def publish_event(client: "redis.Redis", event: dict) -> None:
    client.publish(EVENTS_CHANNEL, json.dumps(event))


def control_key(job_id: str) -> str:
    """The per-run HASH the control-plane writes live commands into (fields
    `cancelled`, `paused`, `speed`) -- mirrors controlKey in
    control-plane/internal/redis."""
    return f"openscale:jobs:{job_id}:control"


def is_cancel_requested(client: "redis.Redis", job_id: str) -> bool:
    return client.hget(control_key(job_id), "cancelled") == "true"


def clear_control(client: "redis.Redis", job_id: str) -> None:
    client.delete(control_key(job_id))
