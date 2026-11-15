"""
The `stream_dataset` job: sends a dataset's rows, one JSON message each, to
the project's Kafka topic `{project_slug}.{dataset}` at a set rate. The
Streaming screen tails that topic live. Pause, resume, speed and cancel work
as for replay (see live_control).
"""

import json
import os

from openscale import paths
from openscale.duck import connect
from registry import JobCancelled, JobContext, JobFailed, Param, job

DEFAULT_LIMIT = 500
MAX_LIMIT = 5000
DEFAULT_MESSAGES_PER_SECOND = 10.0
MAX_MESSAGES_PER_SECOND = 100.0
LOG_EVERY = 50


def topic_name(project_slug: str, dataset: str) -> str:
    """Kafka topic a project's dataset streams to. The control-plane only
    lets a project tail topics with its own `{slug}.` prefix
    (streaming.ProjectTopicPrefix), so keep the two in step."""
    return f"{project_slug}.{dataset}"


def rows_as_messages(df) -> list[dict]:
    """pandas' JSON encoder handles timestamps, NaN and numpy types, unlike
    json.dumps(row.to_dict())."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


@job(
    "stream_dataset",
    "Stream dataset",
    "Send a dataset's rows, one JSON message each, to the Kafka topic {project}.{dataset} at a set rate.",
    params_schema=[
        Param("dataset", "dataset", "Dataset", required=True),
        Param("limit", "integer", "Rows to send", default=DEFAULT_LIMIT, min=1, max=MAX_LIMIT),
        Param(
            "messagesPerSecond",
            "number",
            "Messages per second",
            default=DEFAULT_MESSAGES_PER_SECOND,
            min=0.1,
            max=MAX_MESSAGES_PER_SECOND,
        ),
    ],
    stage="Streaming",
    order=130,
)
def stream_dataset(ctx: JobContext) -> None:
    """rows is the number of messages sent."""
    # Imported here so the module's pure helpers test without Kafka,
    # Postgres or Redis installed (see tests/test_stream_dataset.py).
    from kafka import KafkaProducer

    import db
    import live_control

    project_id = ctx.project_id
    name = ctx.params["dataset"]
    limit = int(ctx.params.get("limit") or DEFAULT_LIMIT)
    rate = float(ctx.params.get("messagesPerSecond") or DEFAULT_MESSAGES_PER_SECOND)

    conn = db.get_connection()
    try:
        dataset = db.get_dataset(conn, project_id, name)
        slug = db.get_project_slug(conn, project_id)
    finally:
        conn.close()
    if dataset is None:
        raise JobFailed(f"no dataset named {name!r} in this project")
    if dataset["status"] != "ready":
        raise JobFailed(f"dataset {name!r} is {dataset['status']}, not ready")

    con = connect(project_id=project_id)
    try:
        df = con.execute(f"SELECT * FROM read_parquet('{paths.data_glob(project_id, dataset['id'])}') LIMIT {limit}").df()
    finally:
        con.close()
    messages = rows_as_messages(df)
    topic = topic_name(slug, name)
    ctx.log(f"streaming {len(messages)} rows of {name} to '{topic}' at {rate}/s")

    r, control_key = live_control.start(ctx.job_id)
    paused = [False]
    producer = KafkaProducer(
        bootstrap_servers=os.environ.get("KAFKA_BROKER", "kafka:9092"),
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    sent = 0
    try:
        for message in messages:
            speed = 1.0
            if r is not None:
                cancelled, state = live_control.poll(r, control_key, ctx.log, paused)
                if cancelled:
                    ctx.log(f"cancelled after {sent}/{len(messages)} rows")
                    raise JobCancelled()
                speed = float(state.get("speed") or "1")
            producer.send(topic, message)
            sent += 1
            ctx.set_rows(sent)
            if sent % LOG_EVERY == 0:
                ctx.log(f"sent {sent}/{len(messages)} rows")
            live_control.sleep_unless_cancelled(r, control_key, 1.0 / rate / speed)
    finally:
        producer.flush()
        producer.close()
    ctx.log(f"sent {sent} rows to '{topic}'")
