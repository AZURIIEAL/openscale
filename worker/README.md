# worker

The Python job worker. It takes job requests off a Redis Stream, runs them
in-process (PySpark ETL, feature computation, model training, Kafka
replay), records the outcome in Postgres, and publishes live status and
log events for the [control-plane](../control-plane/README.md) to relay to
the browser.

It's OpenScale's own copy of the taxi pipeline code. Logic originally
came from `etl-exposure/`, but nothing here imports from there.

Stack: Python 3.13 · PySpark 4.2 (local mode, OpenJDK 21) · pandas ·
pyarrow/s3fs · redis-py · psycopg2 · kafka-python · MLflow ·
scikit-learn.

## Jobs

| Type | Module | Reads → writes | Params |
|---|---|---|---|
| `ingest` | `jobs/ingest.py` → `ingestion/run_ingestion.py` | NYC TLC download → schema check → **Bronze** (MinIO) | `start`, `end` as `YYYY-MM` |
| `silver` | `jobs/silver.py` → `spark/silver/validator.py` | Bronze → **Silver** + quarantine (MinIO), JSON quality report per month in `docs/quality-reports/` | none |
| `gold` | `jobs/gold.py` → `spark/gold/run_gold.py` | Silver → **Gold**: daily revenue, hourly demand, zone stats, congestion (MinIO + Postgres) | none |
| `features` | `jobs/features.py` → `feature_store/feature_jobs/compute_features.py` | Silver → zone × hour features → Postgres (offline) + Redis (online) | none |
| `train` | `jobs/train.py` → `ml/training/train_fare_model.py` | Silver sample → fare model, logged to MLflow (`ml/mlflow/`) | none |
| `replay` | `jobs/replay.py` | Silver trips → Kafka `yellow-taxi-trips` at a fixed rate | `limit` (default 500, max 5000), `messagesPerSecond` (default 10, max 100), `date` (optional) |
| `reset` | `jobs/reset.py` | Deletes Bronze/Silver/Gold in MinIO, Gold/feature tables in Postgres, online features in Redis | none |

Final statuses are `succeeded`, `partial` (only `ingest` produces this,
when some months landed in Bronze and others were rejected), and
`failed`.

## How it runs

[`main.py`](main.py) is the whole loop:

1. `XREADGROUP` one message from `openscale:jobs:requests` (consumer group
   `openscale-workers`, consumer name = hostname). The payload is
   `{job_id, job_type, params, submitted_at}`.
2. `mark_running` in `control_plane.job_runs`. If the run was already
   cancelled, it's skipped without any output.
3. Look up the handler in `JOB_TABLE` and call it, publishing every log
   line as it happens to the `openscale:jobs:events` pub/sub channel.
4. `mark_terminal` with status, exit code, error, full log,
   `rows_processed` and `metrics`, publish the final status event, then
   `XACK`.

The worker handles one job at a time. Postgres is the system of record;
Redis is only used for dispatch and live events.

**Live control (replay only):** before each message, `replay` reads the
Redis hash `openscale:jobs:{job_id}:control` (`paused`, `speed`,
`cancelled`), which the control-plane writes from the Streaming screen's
buttons. Spark jobs don't check for cancellation, so the control-plane's
cancel-all restarts this container to stop one.

## Configuration

| Var | Default | In compose |
|---|---|---|
| `REDIS_ADDR` | `localhost:6379` | `redis:6379` |
| `POSTGRES_DSN` | local `openscale` DB | `postgresql://openscale:openscale@postgres:5432/openscale` |
| `MINIO_ENDPOINT` | `http://localhost:9000` | `http://minio:9000` |
| `KAFKA_BROKER` | `kafka:9092` | `kafka:9092` |
| `SPARK_DRIVER_MEMORY` | `6g` | `6g`; lower it on small machines |

Bind-mounted from the host so they survive rebuilds (all gitignored):

| Path | Contents |
|---|---|
| `data/` | Downloaded raw TLC Parquet |
| `docs/` | Silver quality reports |
| `ml/` | MLflow tracking DB and model artifacts; the `mlflow` service mounts the same folder |
| `.ivy2/` | Cached Spark/Hadoop jars |

The `mlflow` compose service reuses this image with `mlflow server` as
its entrypoint.

## Develop

Code changes need an image rebuild:

```bash
docker compose up -d --build worker      # (mlflow uses the same image; rebuild it too if requirements change)
docker compose logs -f worker
```

If builds can't reach PyPI on your network, use
`../scripts/build-images.sh worker` and then `docker compose up -d worker`.

Queue a job without the UI:

```bash
curl -X POST localhost:8080/api/jobs/silver/run -d '{}'
```

## Adding a job

1. Create `jobs/<name>.py` with
   `run(params: dict, on_log_line: Callable[[str], None]) -> (status, error, log_lines, rows_processed, metrics)`.
   Call `on_log_line` for every line you want streamed live, and return
   them all in `log_lines` too.
2. Register it in `JOB_TABLE` in `main.py`.
3. Add it to `jobs.Catalog` in `control-plane/internal/jobs/jobs.go`. The
   control-plane rejects unknown types before queueing.
4. To show it on the Pipelines screen, add it to `JOB_CATALOG` in
   `frontend/src/domains/pipelines/domain/entities.ts`.

## Known limitations

- `Dockerfile` hardcodes `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`,
  so the image only runs Spark jobs on x86-64. On ARM64 (e.g. Apple
  Silicon, Ampere) the path is `java-21-openjdk-arm64`.
- Only one worker container runs. The consumer group would let you scale
  out, but cancel-all assumes a single container.
