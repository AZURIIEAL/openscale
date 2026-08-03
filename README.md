# OpenScale

A miniature urban-mobility data platform built on the [NYC TLC Yellow Taxi Trip Record dataset](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page). OpenScale isn't a taxi analytics dashboard — it's a working, end-to-end demonstration of the systems a real data platform team builds: a Medallion lakehouse, streaming replay, a feature store, an ML model with experiment tracking, an API serving both, and metrics/dashboards watching all of it.

See [`docs/plan.md`](docs/plan.md) for the full motivation and vision. **For exactly what's built vs. still planned, [`docs/implementation-plan.md`](docs/implementation-plan.md) is the single source of truth** — this README is the "how do I run it" companion to that document. For a log of everything that broke along the way and how it was fixed (mostly Windows/Spark-specific), see [`docs/issues-and-fixes.md`](docs/issues-and-fixes.md).

## Architecture

```
data/raw/ (downloaded from TLC, 2023-02 → 2026-05, 40 months)
        │
        ▼
  ingestion/  ──schema-validate──▶  Bronze (MinIO)
        │
        ▼
  spark/silver/  ──10 quality rules (pandas)──▶  Silver (MinIO) + quality reports (docs/)
        │                     │
        ▼                     ▼
  spark/gold/ (Spark)   streaming/replay-service ──▶ Kafka ──▶ streaming/spark-streaming
  4 aggregates                 │                                (rolling hourly aggregates,
        │                      │                                 plain Python, not Spark yet)
        ▼                      │
  feature-store/feature-jobs ──┴──▶ Postgres (offline) + Redis (online)
  (Spark aggregate → pandas)
        │
        ▼
  ml/training (Spark load/sample → pandas/sklearn, MLflow) ──▶ ml/inference ──▶ api/fastapi ──▶ Prometheus ──▶ Grafana
                                                                     │
                                                        (also serves Gold analytics
                                                         straight from MinIO)
```

Everything runs as plain Python (or PySpark) scripts against Dockerized infrastructure (MinIO, Kafka, Postgres, Redis, Prometheus, Grafana) — there's no orchestrator (Airflow etc.) yet; each stage is invoked manually or chained by hand.

**Two compute engines, deliberately:** Bronze/Silver process one month at a time (bounded memory regardless of scale, no need for Spark). Gold, the feature-store job, and ML training all load/aggregate/filter across *every* month at once — at 40 months (~138M rows) that's too much for pandas to hold in memory, so those three use **Spark** to do the heavy lifting, then convert only the small final result (an aggregated table, a 300k-row training sample) to pandas for the existing scikit-learn/psycopg2/redis code. See `docs/implementation-plan.md` Phase 5 for why and how.

## Status

| Phase | Status |
|---|---|
| 0 – Foundation | ✅ Done |
| 1 – Exploration & Quality Baseline | ✅ Done |
| 2 – Silver Layer (full spec) | ✅ Done |
| 3 – Bronze Layer | ✅ Done (MinIO) |
| 4 – Gold Layer | ✅ Done (v1, Spark) |
| 5 – Migrate to PySpark | ✅ Done — Gold, Feature Store, ML training all run on real PySpark |
| 6 – Infrastructure (Docker) | ✅ MinIO/Postgres/Redis done; ClickHouse deferred |
| 7 – Streaming (Kafka) | ✅ Done (v1) — consumer still plain Python, not yet ported to Spark Structured Streaming |
| 8 – Feature Store | ✅ Done (v1) |
| 9 – ML | ✅ Done (v1, fare prediction only) |
| 10 – API | ✅ Done (v1) |
| 11 – Observability | ✅ Done (v1, metrics only — no OpenTelemetry tracing) |
| 12 – Benchmarking | Not started |

Details, known limitations, and the reasoning behind every "done (v1)" live in [`docs/implementation-plan.md`](docs/implementation-plan.md) — read that before assuming any component is more complete than it is.

## Repo layout

```
docs/                   Vision, target structure, specs, quality reports, THE implementation plan
notebooks/              Exploration, quality analysis, Silver prototype (annotated, runnable)
ingestion/               downloader → schema validator → uploader → Bronze (MinIO)
spark/
  silver/validator.py    Full 10-rule Silver validation (pandas, reads/writes MinIO)
  gold/                  4 Gold aggregation jobs (PySpark) + run_gold.py orchestrator
  common/                storage.py (pandas/s3fs MinIO config) + spark_session.py (Spark/S3A
                          MinIO config) + loader.py (Spark: reads all Silver trips as one
                          distributed DataFrame)
streaming/
  kafka-producer/        Kafka producer helpers
  replay-service/        Replays a day of Silver trips onto Kafka
  spark-streaming/        Kafka consumer with rolling hourly aggregates (NOT real Spark yet)
feature-store/
  feature-jobs/           Zone x hour features → Postgres (offline) + Redis (online)
ml/
  training/               Fare-prediction model training + MLflow tracking
  inference/              Loads latest MLflow run, exposes predict_fare()
  mlflow/                 Local SQLite tracking DB + model artifacts (gitignored-worthy, large)
api/
  fastapi/main.py         Health, feature lookup, fare prediction, Gold analytics endpoints
observability/
  prometheus/             Scrape config
  grafana/                Datasource provisioning
common/db.py             Shared Postgres + Redis connection config
docker-compose.yml       MinIO, Kafka, Postgres, Redis, Prometheus, Grafana
requirements.txt         Python dependencies (unpinned -- see Known Issues below)
```

## Setup

**Prerequisites:** Python 3.13, Docker Desktop, **Java 17+ (for PySpark)**.

```bash
python -m venv venv
source venv/Scripts/activate   # Windows Git Bash; use venv\Scripts\activate.bat for cmd
pip install -r requirements.txt

docker compose up -d
```

That brings up all 6 containers. Give MinIO/Postgres a few seconds to pass their healthchecks (`docker compose ps`) before running anything against them.

### PySpark setup (required for Gold / Feature Store / ML training)

Bronze and Silver are plain pandas and need nothing extra. Gold, the feature-store job, and ML training run on PySpark and need a JVM:

```bash
winget install --id Microsoft.OpenJDK.17 -e   # any Java 17+ works
```

**On Windows specifically**, Spark also needs `winutils.exe` even though we're only talking to MinIO over S3 (no HDFS) — Hadoop's `Shell` class does OS-level file ops that need a Windows-native shim, and it'll fail with `HADOOP_HOME and hadoop.home.dir are unset` without it:

```bash
mkdir -p /c/hadoop/bin
curl -sL -o /c/hadoop/bin/winutils.exe "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.6/bin/winutils.exe"
curl -sL -o /c/hadoop/bin/hadoop.dll   "https://github.com/cdarlint/winutils/raw/master/hadoop-3.3.6/bin/hadoop.dll"
```

Then set `JAVA_HOME` and `HADOOP_HOME` and put both on `PATH` before running any Spark job (adjust the JDK path/version to whatever `winget` installed):

```bash
export JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
export HADOOP_HOME="C:\hadoop"
export PATH="$JAVA_HOME/bin:$HADOOP_HOME/bin:$PATH"
```

Full detail on why each of these is needed: [`docs/issues-and-fixes.md`](docs/issues-and-fixes.md) §9. On first run, Spark downloads a matching `hadoop-aws` jar from Maven Central (~5-10s, cached after that) to enable S3A access to MinIO.

### Ports

| Service | Port | Notes |
|---|---|---|
| MinIO S3 API | `9000` | `spark.common.storage` points here |
| MinIO Console | `9101` | http://localhost:9101, `minioadmin` / `minioadmin` — **not** the default 9001, which is Hyper-V-reserved on this machine |
| Kafka broker | `9092` | Single-node KRaft, no Zookeeper |
| PostgreSQL | `5432` | db/user/password all `openscale` |
| Redis | `6379` | No auth |
| Prometheus | `9090` | http://localhost:9090 |
| Grafana | `3000` | http://localhost:3000, `admin` / `admin` |
| FastAPI (not in Docker) | `8000` | Run manually, see below |
| MLflow UI (not in Docker) | `5000` | Run manually, see below |

## Running the pipeline end to end

Run these in order from the repo root, venv active, Docker stack up. Each stage reads from where the previous one wrote (MinIO), so order matters the first time; after that, individual stages can be re-run independently.

Bronze/Silver (steps 1-2) only need the venv. Gold/Feature-Store/ML (steps 3-5) also need the `JAVA_HOME`/`HADOOP_HOME` exports from the PySpark setup section above, in the same shell.

```bash
# 0. (optional) Pull more raw months directly from TLC before ingesting.
#    Downloads to data/raw/yellow_taxi/, skips periods already present.
#    Current dataset covers 2023-02 -> 2026-05 (the range matching TLC's
#    current schema -- see docs/issues-and-fixes.md #12 for why not further back).
python ingestion/run_ingestion.py --start 2023-02 --end 2026-05

# 1. Bronze: download-or-locate raw files, validate schema, write to MinIO.
#    No args = process everything already in data/raw/; --start/--end also
#    works here directly (downloads first, then ingests that range).
python ingestion/run_ingestion.py

# 2. Silver: 10-rule validation, every month in Bronze, MinIO in -> MinIO out
python spark/silver/validator.py

# --- from here on, Spark: make sure JAVA_HOME/HADOOP_HOME are exported ---

# 3. Gold: 4 aggregation jobs (PySpark), MinIO in -> MinIO out
python spark/gold/run_gold.py

# 4. Feature store: zone x hour features, aggregated in Spark -> Postgres + Redis
python "feature-store/feature-jobs/compute_features.py"

# 5. Train the fare-prediction model: Spark loads/samples, sklearn trains, MLflow tracks it
python "ml/training/train_fare_model.py"

# 6. Start the API (pandas/sklearn only, no Spark/Java needed here)
uvicorn api.fastapi.main:app --port 8000

# 7. (optional) Start the MLflow UI to browse training runs
#    --workers 1 is required on Windows -- the default multi-worker mode
#    crashes with WinError 10022 (Windows doesn't support the socket-sharing
#    trick uvicorn uses across worker processes on Unix).
mlflow ui --backend-store-uri "sqlite:///ml/mlflow/mlflow.db" --port 5000 --workers 1
```

With the API running, open **http://localhost:8000/docs** for interactive Swagger UI, or try:

```bash
curl http://localhost:8000/health
curl "http://localhost:8000/zones/161/features?hour=8"
curl -X POST http://localhost:8000/predict/fare \
  -H "Content-Type: application/json" \
  -d '{"trip_distance":3.2,"pu_location_id":161,"do_location_id":237,"passenger_count":1,"pickup_hour":18}'
curl http://localhost:8000/gold/daily-revenue
curl http://localhost:8000/metrics   # Prometheus scrapes this automatically
```

Open Grafana at http://localhost:3000 — the Prometheus datasource is pre-provisioned; no dashboards are built yet, so you'd query `http_requests_total` etc. directly under Explore.

Open MLflow at http://localhost:5000 to see the `fare-prediction` experiment, its metrics (MAE/RMSE/R²), params, and the logged model artifact.

### Streaming (separate from the batch pipeline)

```bash
# Replay a day of Silver trips onto Kafka (fast-forward by default)
python "streaming/replay-service/replay.py" --date 2024-01-01 --limit 5000

# In another terminal: consume and print rolling hourly aggregates
python "streaming/spark-streaming/consumer.py" --print-every 500
```

## Known issues / honesty notes

- **`streaming/spark-streaming/` doesn't use Apache Spark.** It's a plain `kafka-python` consumer with in-memory dict aggregation. Gold/Feature-Store/ML *do* run on real PySpark now (Phase 5) — the streaming consumer is the one piece that still needs porting to Spark Structured Streaming.
- **`requirements.txt` is unpinned.** Installing `mlflow` mid-project silently downgraded pandas 3.0.5 → 2.3.3, which broke a hardcoded dtype check in the schema validator (fixed — see `docs/issues-and-fixes.md` #4). Pin versions before relying on a fresh install matching this one.
- **No OpenTelemetry / distributed tracing.** Observability is Prometheus + Grafana metrics only.
- **Single model, single day of streaming, no orchestrator.** ML covers fare prediction only (not demand/congestion prediction from the original vision); the replay service handles one `--date` at a time; nothing schedules or chains these stages automatically.
- **Raw ingestion downloads real TLC data over the internet.** `ingestion/downloader/downloader.py` hits TLC's CloudFront endpoint directly — no API key needed, but it does mean `ingestion/run_ingestion.py --start/--end` makes real outbound HTTP requests and pulls real files (each month is 50-90MB).
- **Only 2023-02 → 2026-05 is loaded, not TLC's full history back to 2009.** TLC's schema changed multiple times (no zone IDs before mid-2016, `congestion_surcharge` added 2019, `Airport_fee` added between 2023-01 and 2023-02) and `ingestion/validator/schema_validator.py` only supports the current schema. Full detail: `docs/issues-and-fixes.md` #12.
- **PySpark on Windows needs extra setup** (Java, `winutils.exe`, `HADOOP_HOME`) that a Linux/Mac dev environment wouldn't — see the PySpark setup section above and `docs/issues-and-fixes.md` #9.

For the full, itemized status of every phase — including exact "not yet done" lists — read [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Docs index

- [`docs/plan.md`](docs/plan.md) — why this project exists, full vision
- [`docs/structure.md`](docs/structure.md) — target repo layout
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — **current status, build order, decisions, known limitations** (read this first)
- [`docs/issues-and-fixes.md`](docs/issues-and-fixes.md) — **every problem hit and how it was fixed** (Windows/Spark setup, dependency drift, etc.)
- [`docs/dataset-analysis.md`](docs/dataset-analysis.md) — initial data profiling findings (Jan 2024)
- [`docs/silver-layer-specification.md`](docs/silver-layer-specification.md) — canonical Silver validation rules (SLV-001…010)
- [`docs/quality-reports/`](docs/quality-reports/) — per-month Silver quality-report JSON output
