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

**Generic jobs**, available in every project:

| Type | Module | Reads → writes | Params |
|---|---|---|---|
| `validate` | `jobs/validate.py` → `libs/openscale/openscale/rules.py` | A dataset + its `rules` → a new dataset of the kept rows (with flag columns), one quarantine file per rule that removed rows, and a per-rule report in the run's metrics | `dataset`, `output` |
| `sql_transform` | `jobs/sql_transform.py` | One SELECT over the project's ready datasets (each a view named after it) → a new dataset. DuckDB, or Spark for large inputs | `output`, `sql`, `layer`, `engine` |
| `train` | `jobs/train.py` | A dataset → a gradient-boosting model in the MLflow experiment `openscale/<project slug>`; metrics in the run | `dataset`, `target`, `features` (default: every other numeric/boolean column), `task` (`regression`/`classification`) |
| `dataset_fetch`, `dataset_ingest` | `jobs/dataset_*.py` | See [Dataset jobs](#dataset-jobs); queued by the datasets API | |

`validate` and `sql_transform` write a **derived** dataset: its `source` is
`{"kind": "derived", "job", "runId", "inputs"}`, which is the dataset's
table-level lineage. Re-running one replaces its output; a job never
overwrites an uploaded or fetched dataset. Both run their SQL in a DuckDB
session scoped to the project's lake prefix with local files disabled.

**Taxi sample jobs** (`requires_feature="legacy_taxi"`, so only the
`nyc-taxi` project can run them; Phase 4e rebuilds the sample on the
generic jobs and deletes these):

| Type | Module | Reads → writes | Params |
|---|---|---|---|
| `ingest` | `jobs/ingest.py` → `ingestion/run_ingestion.py` | NYC TLC download → schema check → **Bronze** (MinIO) | `start`, `end` as `YYYY-MM` |
| `silver` | `jobs/silver.py` → `spark/silver/validator.py` | Bronze → **Silver** + one quarantine file per rule (MinIO), applying the ten rules in `spark/silver/silver_rules.json` with the same engine as `validate` (DuckDB). JSON quality report per month in `docs/quality-reports/` and in the run's metrics | none |
| `gold` | `jobs/gold.py` → `spark/gold/run_gold.py` | Silver → **Gold**: daily revenue, hourly demand, zone stats, congestion (MinIO + Postgres) | none |
| `features` | `jobs/features.py` → `feature_store/feature_jobs/compute_features.py` | Silver → zone × hour features → Postgres (offline) + Redis (online) | none |
| `fare_model` | `jobs/fare_model.py` → `ml/training/train_fare_model.py` | Silver sample → fare model, logged to MLflow. Called `train` before Phase 4b | none |
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
3. Run the job in its own child process ([`runner.py`](runner.py) starts
   `python -m job_child`), publishing every log line as it happens to the
   `openscale:jobs:events` pub/sub channel.
4. `mark_terminal` with status, exit code, error, full log,
   `rows_processed` and `metrics`, publish the final status event, then
   `XACK`.

At startup, before step 1, the worker discovers every `@job` in `jobs/`,
publishes them to `control_plane.job_definitions` (the catalog the
control-plane serves), and marks any run still `running` as failed: with
one worker container, such a run was cut off by a crash or restart.

The worker handles one job at a time. Postgres is the system of record;
Redis is only used for dispatch, live events and run control.

**Child process per run.** The child writes JSON lines on stdout (log
lines, then one result); everything else it prints, Spark's JVM included,
goes to stderr, which ends up in the container log. If a child dies
without a result, the run fails with its exit code and last stderr line.

**Cancelling.** The control-plane sets `cancelled` in the run's Redis hash
`openscale:jobs:{job_id}:control` (from Stop all or the Streaming screen).
The runner sees it within half a second and gives the job 5 s to stop on
its own; jobs that call `ctx.check_cancelled()` (and `replay`, which also
reads `paused` and `speed` from the same hash) stop cleanly. Otherwise the
runner sends SIGTERM to the job's process group, which also takes down
Spark's JVM, and SIGKILL 10 s later. The worker keeps running and takes
the next job.

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
curl localhost:8080/api/jobs/catalog
curl -X POST localhost:8080/api/projects/nyc-taxi/jobs/silver/run -d '{}'
```

## Adding a job

Write one decorated function in a new module under `jobs/`. Nothing else
changes: the worker publishes it at startup, the control-plane validates
run params against its schema, and the Pipelines screen renders its run
form from the same schema.

```python
from registry import JobContext, JobFailed, Param, job


@job(
    "row_count",                       # type: lowercase, digits, underscores
    "Count rows",                      # label
    "Counts a dataset's rows.",        # description
    params_schema=[
        Param("dataset", "dataset", "Dataset", required=True),
        Param("min_rows", "integer", "Fail below", default=1, min=0),
    ],
    stage="Gold",                      # optional badge
    order=60,                          # position in the catalog
)
def row_count(ctx: JobContext) -> None:
    ctx.log(f"counting {ctx.params['dataset']} in {ctx.project_id}")
    ...
    ctx.check_cancelled()              # call in loops so cancel is quick
    ctx.set_rows(n)
    if n < ctx.params.get("min_rows", 1):
        raise JobFailed(f"only {n} rows")
```

- **Outcome:** returning means `succeeded`; `ctx.set_partial(msg)` makes
  it `partial`. `raise JobFailed(msg)` stores `msg` as the error. Any other
  exception fails the run with `Type: message`, and the traceback goes to
  the container log.
- **Param types:** `string`, `text` (multi-line, e.g. SQL), `number`,
  `integer`, `boolean`, `enum` (with `options`), `date`, `month`, `dataset`
  (an existing dataset in the run's project), `dataset_name` (a new one),
  and `column`/`columns` with `of="<dataset param>"` (picked from that
  dataset's columns). `min`/`max` bound numbers, and also dates/months as
  ISO strings. `gte="start"` requires a field to be on or after an earlier
  one. A bad schema raises at import, so the worker won't start with it.
- **`listed=False`** keeps a job off the Pipelines run list when another
  screen or API queues it (as with `replay`, `reset` and the dataset jobs).
- **`requires_feature="legacy_taxi"`** limits a job to projects with that
  feature flag; the control-plane refuses it elsewhere and the Pipelines
  screen doesn't list it.
- **Writing a dataset:** claim the output with `db.claim_output_dataset`
  (source from `datasets.outputs.derived_source`), clear old files with
  `clear_output_files`, write Parquet under `paths.data_part(...)`, then
  `finish_output` records schema, size and profile (see `jobs/validate.py`).

## Known limitations

- `Dockerfile` hardcodes `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`,
  so the image only runs Spark jobs on x86-64. On ARM64 (e.g. Apple
  Silicon, Ampere) the path is `java-21-openjdk-arm64`.
- Only one worker container runs. The consumer group would let you scale
  out, but marking `running` runs as failed at startup and retiring
  unpublished job types both assume a single worker.

## Dataset jobs

`dataset_fetch` and `dataset_ingest` are queued by the control-plane's
datasets API, not from the Pipelines form. Fetch streams a URL into the
dataset's `raw/` folder (refusing private addresses, see
`libs/openscale/openscale/url_check.py`) and then runs ingest; ingest reads
every raw file with DuckDB (`UNION ALL BY NAME` across files), writes one
Parquet part under `data/`, and stores the schema, row count, size and
column profile on the `control_plane.datasets` row. The pure parts live in
`datasets/` and `libs/openscale`; `jobs/dataset_*.py` are the status
wrappers.
