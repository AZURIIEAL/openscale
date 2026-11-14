"""
Job-queue worker: reads job requests from the Redis Stream
openscale:jobs:requests (consumer group openscale-workers), runs each one in
its own child process (runner.py), writes status to Postgres (the system of
record), and publishes live status/log events to the openscale:jobs:events
Pub/Sub channel for the Go control-plane's WebSocket hub to relay to the
frontend.

Job types come from the registry (registry.py): every @job in worker/jobs/
is discovered at startup and published to control_plane.job_definitions,
which is the catalog the control-plane and frontend read.
"""

import json
import socket
import time
from datetime import datetime, timezone

import psycopg2

import db
import redis_client
import registry
import runner
from jobs.outcome import STATUS_FAILED, format_exception

STREAM = "openscale:jobs:requests"
GROUP = "openscale-workers"

# The control-plane creates job_definitions in its migrations; on a fresh
# stack the worker can start first, so publishing retries until it exists.
PUBLISH_RETRY_SECONDS = 2.0


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def publish_catalog() -> None:
    entries = registry.catalog()
    while True:
        conn = None
        try:
            conn = db.get_connection()
            db.publish_job_definitions(conn, entries)
            print(f"published {len(entries)} job types: {', '.join(e['type'] for e in entries)}", flush=True)
            return
        except psycopg2.errors.UndefinedTable:
            print("job_definitions does not exist yet (control-plane migrations pending); retrying", flush=True)
        except psycopg2.OperationalError as exc:
            print(f"postgres unavailable ({exc}); retrying", flush=True)
        finally:
            if conn is not None:
                conn.close()
        time.sleep(PUBLISH_RETRY_SECONDS)


def handle_message(r, fields: dict) -> None:
    payload = json.loads(fields["payload"])
    job_id = payload["job_id"]
    job_type = payload["job_type"]
    params = payload.get("params", {})

    conn = db.get_connection()
    try:
        definition = registry.REGISTRY.get(job_type)
        if definition is None:
            db.mark_terminal(conn, job_id, STATUS_FAILED, None, f"unknown job_type: {job_type}", "")
            return

        if not db.mark_running(conn, job_id):
            return  # already cancelled before we got to it -- skip silently

        redis_client.publish_event(r, {"job_id": job_id, "type": "status", "status": "running", "at": now_iso()})

        def on_log(line: str) -> None:
            redis_client.publish_event(r, {"job_id": job_id, "type": "log", "line": line, "at": now_iso()})

        request = {
            "type": job_type,
            "module": definition.module,
            "job_id": job_id,
            "project_id": params.get("project_id"),
            "params": params,
        }
        try:
            outcome = runner.run_in_child(request, on_log, lambda: redis_client.is_cancel_requested(r, job_id))
        except Exception as exc:  # the child could not even be started
            error = f"could not start the job process: {format_exception(exc)}"
            outcome = runner.ChildOutcome(status=STATUS_FAILED, error=error, log_lines=[error])

        stored = db.mark_terminal(
            conn,
            job_id,
            outcome.status,
            0 if outcome.status == "succeeded" else 1,
            outcome.error,
            "\n".join(outcome.log_lines),
            outcome.rows,
            outcome.metrics,
        )
        redis_client.publish_event(
            r, {"job_id": job_id, "type": "status", "status": stored or outcome.status, "at": now_iso()}
        )
        redis_client.clear_control(r, job_id)
    finally:
        conn.close()


def main() -> None:
    registry.load_all_jobs()
    publish_catalog()

    conn = db.get_connection()
    try:
        orphaned = db.fail_orphaned_runs(conn)
    finally:
        conn.close()
    if orphaned:
        print(f"marked {orphaned} interrupted run(s) failed", flush=True)

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
