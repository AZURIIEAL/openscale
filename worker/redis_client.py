"""Tiny Redis helpers for the job-queue worker -- only this module touches
redis-py. Two separate concerns: the request Stream (dispatch, exactly-once
via consumer groups) and the events Pub/Sub channel (ephemeral live-tail
relay for the Go control-plane's WebSocket hub)."""

import json
import os

import redis

REDIS_ADDR = os.environ.get("REDIS_ADDR", "localhost:6379")
EVENTS_CHANNEL = "openscale:jobs:events"


def get_client() -> "redis.Redis":
    host, _, port = REDIS_ADDR.partition(":")
    return redis.Redis(host=host, port=int(port or 6379), decode_responses=True)


def ensure_consumer_group(client: "redis.Redis", stream: str, group: str) -> None:
    try:
        client.xgroup_create(stream, group, id="$", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def publish_event(client: "redis.Redis", event: dict) -> None:
    client.publish(EVENTS_CHANNEL, json.dumps(event))
