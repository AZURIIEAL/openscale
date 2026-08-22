"""
Job-queue worker: reads job requests from the Redis Stream
openscale:jobs:requests (consumer group openscale-workers), dispatches to
the matching job module, writes status to Postgres (the system of record),
and publishes live status/log events to the openscale:jobs:events Pub/Sub
channel for the Go control-plane's WebSocket hub to relay to the frontend.
"""

import json
import socket
from datetime import datetime, timezone

import db
import redis_client
from jobs import features, gold, ingest, replay, reset, silver, train

JOB_TABLE = {
    "ingest": ingest.run,
    "silver": silver.run,
    "gold": gold.run,
    "features": features.run,
    "train": train.run,
    "reset": reset.run,
    "replay": replay.run,
}

STREAM = "openscale:jobs:requests"
GROUP = "openscale-workers"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def handle_message(r, fields: dict) -> None:
    payload = json.loads(fields["payload"])
    job_id = payload["job_id"]
    job_type = payload["job_type"]
    params = payload.get("params", {})

    conn = db.get_connection()
    try:
        handler = JOB_TABLE.get(job_type)
        if handler is None:
            db.mark_terminal(conn, job_id, "failed", None, f"unknown job_type: {job_type}", "")
            return

        if not db.mark_running(conn, job_id):
            return  # already cancelled before we got to it -- skip silently

        redis_client.publish_event(r, {"job_id": job_id, "type": "status", "status": "running", "at": now_iso()})

        def on_log_line(line: str) -> None:
            redis_client.publish_event(r, {"job_id": job_id, "type": "log", "line": line, "at": now_iso()})

        status, error, log_lines, rows_processed, metrics = handler(params, on_log_line)
        db.mark_terminal(
            conn,
            job_id,
            status,
            0 if status == "succeeded" else 1,
            error,
            "\n".join(log_lines),
            rows_processed,
            metrics,
        )
        redis_client.publish_event(r, {"job_id": job_id, "type": "status", "status": status, "at": now_iso()})
    finally:
        conn.close()


def main() -> None:
    r = redis_client.get_client()
    redis_client.ensure_consumer_group(r, STREAM, GROUP)
    consumer_name = socket.gethostname()

    print(f"worker started, consumer={consumer_name}", flush=True)

    while True:
        response = r.xreadgroup(GROUP, consumer_name, {STREAM: ">"}, count=1, block=5000)
        if not response:
            continue

        for _stream, messages in response:
            for message_id, fields in messages:
                try:
                    handle_message(r, fields)
                finally:
                    r.xack(STREAM, GROUP, message_id)


if __name__ == "__main__":
    main()
