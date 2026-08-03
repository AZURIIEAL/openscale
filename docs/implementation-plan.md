# OpenScale Implementation Plan

## Document Information

| Field | Value |
|---|---|
| Project | OpenScale |
| Status | Living document — single source of truth for build order and current progress |
| Last updated | 2026-08-03 (all 12 phases now at v1 or done; Phase 5 PySpark landed) |

This document exists because `docs/plan.md` explains *why* OpenScale exists and `docs/structure.md` shows the *target* folder layout, but neither says what's actually built yet or in what order the rest gets built. This file is that missing piece. Update the **Current State** table whenever a phase moves forward — everything else here should stay stable.

For the detailed "what broke and how it was fixed" log (Windows-specific gotchas, dependency-drift incidents, the pandas memory wall), see [`docs/issues-and-fixes.md`](issues-and-fixes.md) — this file only summarizes decisions and status, that one has the debugging detail.

---

# Current State (as of 2026-08-03)

| Layer / Component | Status | Notes |
|---|---|---|
| Raw data ingestion | **Automated** | `ingestion/downloader/downloader.py` fetches directly from TLC's CloudFront URLs (streamed, atomic `.part`-then-rename, skips periods already downloaded, `--force` to re-fetch). `python ingestion/run_ingestion.py --start YYYY-MM --end YYYY-MM` downloads+ingests a range in one command. |
| `ingestion/` (downloader, validator, uploader) | **Done** | `ingestion/run_ingestion.py` runs download-or-locate → schema-validate → write-to-Bronze, either for every raw period already on disk (no args) or for an explicit `--start/--end` range (downloads first). Schema validation checks column presence + dtype against a fixed 19-column contract. |
| Bronze layer | **Done (MinIO), 40 months** | `s3://openscale-lake/bronze/yellow_taxi/{year}-{month}.parquet`, `2023-02` through `2026-05` (the range matching TLC's current schema — see the schema-drift note below). Untouched copies of raw, gated only by schema. |
| Silver layer | **Done (v1, 40 months, MinIO)** | `spark/silver/validator.py` implements the full `docs/silver-layer-specification.md` rule set — SLV-001–004 reject, SLV-005/006/007/010 quarantine (into 5 separate per-rule files), SLV-008/009 flag-in-place, plus missing-value monitor counts — reads from MinIO Bronze, writes Silver trips + quarantine back to MinIO. **~138M rows processed across all 40 months.** Quality reports stay local (human-readable) under `docs/quality-reports/`. A genuine data-quality anomaly was found this way: `invalid_timestamps` and `negative_fares` both spiked 10-40x during roughly March–November 2025 versus surrounding months — worth a follow-up note in `docs/dataset-analysis.md`. Notebook `03_silver_layer_prototype.ipynb` remains a scoped-down (4-rule, Jan-only, local-disk, pandas) prototype. |
| Gold layer | **Done (v1, MinIO, Spark)** | `spark/gold/{daily_revenue,hourly_demand,zone_stats,congestion_metrics}.py` + `run_gold.py`, now running on **PySpark** (see Phase 5), writing to `s3://openscale-lake/gold/{name}/` (Spark writes a directory of part-files, not a single `.parquet` file like the old pandas version — the API's `_read_gold()` was updated to match). Verified against the full 40-month/138M-row dataset: 1,218 daily-revenue rows, 24 hourly-demand rows, 263 zone-stats rows, 1,218 congestion-metrics rows. |
| Object storage (MinIO) | **Done** | `docker-compose.yml` at repo root brings up MinIO (S3 API on `:9000`, console on `:9101` — `:9001` is Hyper-V-reserved on this machine) plus a one-shot `minio-init` service that creates the `openscale-lake` bucket. `spark/common/storage.py` centralizes the endpoint/credentials/bucket and a pandas-facing `lake_path()` (`s3://`); `spark/common/spark_session.py` has the Spark-facing equivalent (`s3a://`) — two protocol prefixes, same physical bucket, because pandas uses `s3fs` and Spark uses Hadoop's S3A connector. |
| Engine | **pandas + PySpark, both real** | `pyspark` (4.2.0) is now in `requirements.txt` and actually used — Gold, the feature-store job, and ML training all load/aggregate via Spark. pandas is still used for Bronze/Silver (bounded per-month memory, no need for Spark there) and for the final small results handed to scikit-learn/psycopg2/redis. `spark/common/spark_session.py` is the shared Spark session config (S3A → MinIO). See Phase 5 below for the Windows setup detail (Java, winutils.exe, HADOOP_HOME) — also logged in `docs/issues-and-fixes.md`. |
| Kafka | **Done** | `docker-compose.yml` runs `apache/kafka:latest` single-node KRaft mode (no Zookeeper), broker on `localhost:9092`. Topic `yellow-taxi-trips` (auto-created on first produce). |
| Streaming | **Done (v1)** | `streaming/replay-service/replay.py` reads a day of Silver trips from MinIO and publishes them to Kafka as JSON, sorted by pickup time, with an optional `--speed` pacing multiplier (default fast-forward). `streaming/spark-streaming/consumer.py` consumes the topic and maintains rolling hourly trip-count/revenue aggregates in memory, printing snapshots. **Still not real Spark** — plain `kafka-python` consumer + Python dict aggregation. Phase 5 landed for batch (Gold/Feature-Store/ML) but the streaming consumer hasn't been ported to Spark Structured Streaming yet; that's now the main "not really Spark" gap left (tracked in Immediate Next Steps). |
| PostgreSQL | **Done** | `docker-compose.yml` runs `postgres:16-alpine`, db/user/password all `openscale`, port `5432`. Holds the offline feature store (`zone_hour_features` table). |
| Redis | **Done** | `docker-compose.yml` runs `redis:7-alpine`, port `6379`. Holds the online feature store as JSON strings under `features:zone:{PULocationID}:hour:{hour}`. |
| Feature Store | **Done (v1, Spark)** | `feature-store/feature-jobs/compute_features.py` now aggregates `(PULocationID, pickup_hour)` features in **Spark** across all 40 months (~138M rows), then converts only the small aggregated result (`.toPandas()`) for the existing Postgres/Redis write logic — a pattern reused in ML training too: Spark for the big load/aggregate/filter, pandas only for the small final result. Verified: **6,261 zone×hour rows** in both Postgres and Redis (up from 5,975 at 6 months of data). |
| ML | **Done (v1, Spark)** | `ml/training/train_fare_model.py` loads/filters/samples via Spark (down to a 300k-row sample of the full 40-month set, `.toPandas()` only on that bounded sample), then trains a `RandomForestRegressor` exactly as before, tracked via MLflow (local SQLite backend, `ml/mlflow/mlflow.db` + `ml/mlflow/artifacts/`). Current run (40-month sample): **MAE $2.92, RMSE $7.20, R² 0.85**. `ml/inference/predict.py` loads the latest run's model and exposes `predict_fare()` — unchanged, still pandas/sklearn at inference time. |
| API | **Done (v1)** | `api/fastapi/main.py`: `GET /health`, `GET /zones/{zone_id}/features?hour=N` (Redis lookup), `POST /predict/fare` (calls `ml.inference.predict`), `GET /gold/{daily-revenue,hourly-demand,zone-stats,congestion-metrics}` (reads the Spark-written Gold directories straight from MinIO via pandas/pyarrow). All re-verified working end-to-end against the 40-month dataset via `uvicorn api.fastapi.main:app --port 8000`. |
| Observability | **Done (v1, metrics only)** | `prometheus-fastapi-instrumentator` exposes `/metrics` on the API; `docker-compose.yml` runs Prometheus (`:9090`, scraping `host.docker.internal:8000`) and Grafana (`:3000`, admin/admin, Prometheus datasource auto-provisioned). Verified: Prometheus target reports `up`, Grafana datasource reachable via its API. **OpenTelemetry (tracing) is not implemented** — scope was kept to metrics/dashboards; see decision below. No dashboards are built yet, only the datasource. |
| Feature store, ML, API, observability consumers of ClickHouse | Not started | ClickHouse itself remains deferred — nothing queries it yet; Postgres covers the current feature-store need. |
| Benchmarks | Not started | Planned only, per `docs/structure.md` (Phase 12) — now meaningfully attemptable since Phase 5 (PySpark) is real, unlike before. |
| Notebooks | Done for their scope | `01_dataset_exploration`, `02_data_quality_analysis`, `03_silver_layer_prototype` are all annotated and runnable (still pandas/6-month scope — not updated for the 40-month Spark pipeline, intentionally, since they're meant as prototyping notebooks, not the production path). |
| Dataset profiling / analysis report | Done | `docs/dataset-analysis.md` (Jan 2024 only — not yet re-run for the full 40-month range, though the Silver quality reports across all 40 months are a reasonable substitute; see the anomaly note in the Silver row above). |

**Decision (2026-08-02): PySpark migration deferred; MinIO, Kafka/Streaming, Postgres/Redis/Feature-Store, ML, API, and Prometheus/Grafana all brought forward ahead of it.** Storage backend, messaging, databases, and API framework are independent of the batch compute engine (pandas vs. PySpark) — none of Phases 6–11 needed Spark to be real.

**Superseded (2026-08-03): Phase 5 has now landed.** The trigger was concrete, not scheduled: pulling 40 months of real TLC data (Feb 2023 – May 2026, ~138M rows) to test how far the pipeline actually scales, `load_silver_trips()`'s `pd.concat()` was measured (via `memory_usage(deep=True)` extrapolated across real Parquet row counts, *before* attempting it) at ~26.4GB against 18GB free RAM — a near-certain crash or multi-minute swap-thrash. Rather than work around it (e.g. process a smaller window, or hand-roll chunked aggregation), we did the migration this was always going to require: `spark/common/spark_session.py` (Spark session config, S3A → MinIO), then rewrote `spark/common/loader.py`, all 4 Gold jobs, the feature-store job, and ML training to load/aggregate/filter in Spark and only ever materialize small results as pandas. Verified against the full 138M-row set — see the Current State table above for real numbers. Getting Spark working on Windows took several real fixes (Java install, `winutils.exe`, `HADOOP_HOME`, matching `hadoop-aws` version) — logged in full in `docs/issues-and-fixes.md`. The streaming consumer (Phase 7) was *not* ported to Spark Structured Streaming in this pass — that's the remaining "not really Spark" gap.

**Decision (2026-08-02): Observability scoped to Prometheus + Grafana; OpenTelemetry (tracing) explicitly not attempted.** Metrics (request rate/latency/status via `/metrics`) give real, verifiable observability value with a small, well-understood stack. Distributed tracing's value shows up across multiple hops in a call chain; with a single FastAPI service and no downstream service-to-service calls yet, a tracing backend (collector + Jaeger/Tempo) would be infrastructure with nothing meaningful to show. Revisit once Streaming/API have more moving parts to trace across.

**Resolved:** the rule numbering inside `validator.py` now matches `docs/silver-layer-specification.md` (SLV-001/002 = null timestamps, SLV-003 = timestamp order, SLV-004 = distance non-negative, SLV-005 = passenger count, SLV-006/007 = fare/total, SLV-008/009 = reporting-period flags, SLV-010 = distance outlier). `docs/silver-layer-specification.md` remains canonical for any future rule changes.

**Incident (2026-08-02): installing `mlflow` silently downgraded pandas 3.0.5 → 2.3.3** (mlflow pins an older pandas). This changed `store_and_fwd_flag`'s reported dtype from `"str"` to `"object"`, which broke `ingestion/validator/schema_validator.py`'s hardcoded schema contract. Fixed by updating the expected dtype; the full Bronze→Silver→Gold pipeline was re-run afterward and produces identical output under pandas 2.3.3. Lesson: `requirements.txt` has no pinned versions, so any future `pip install` can silently shift dependency versions repo-wide — worth pinning before this project is shared or deployed anywhere else.

**Constraint discovered (2026-08-02): TLC's schema changed multiple times across years.** Verified empirically (not from memory) by downloading and validating real candidate months against the current schema contract: `PULocationID`/`DOLocationID` zone IDs didn't exist before ~July 2016 (raw lat/long instead), `congestion_surcharge` was added January 2019, and `Airport_fee` — the column that actually gates our current 19-column contract — first appears between `2023-01` (fails validation) and `2023-02` (passes). Rather than extend the validator for multiple schema eras, the historical pull was scoped to `2023-02 → 2026-05`, the range that matches today's schema exactly. Full detail in `docs/issues-and-fixes.md` §12.

---

# Build Order

Phases are sequential by dependency (each layer needs the one before it), not by calendar time. Do not start infrastructure/streaming/ML work before Bronze and Silver are solid — the whole point of this project is to demonstrate the data engineering fundamentals are real, not skipped.

## Phase 0 — Foundation *(done)*

- Repo scaffold matching `docs/structure.md`
- Python venv, `pandas` + `pyarrow`
- Raw NYC Yellow Taxi Parquet files for Jan–Jun 2024 in `data/raw/yellow_taxi/`

## Phase 1 — Exploration & Quality Baseline *(done)*

- `01_dataset_exploration.ipynb` — schema, scale, missing values
- `02_data_quality_analysis.ipynb` — duplicates, negative fares, invalid timestamps, distance-outlier percentiles
- `docs/dataset-analysis.md` — written findings, currently covers January 2024 only

**Follow-up:** re-run profiling across all 6 downloaded months to confirm the same quality issues (and rates) hold outside January.

## Phase 2 — Silver Layer, complete the spec *(done)*

All ten SLV rules implemented in `spark/silver/validator.py`, run across all 6 months:
- **Reject** (SLV-001–004): null/inverted timestamps, negative distance — dropped from Silver entirely.
- **Quarantine** (SLV-005/006/007/010): invalid passenger count, negative fare, negative total, distance > 100mi — written to 5 separate per-rule Parquet files under `data/silver/quarantine/`.
- **Flag** (SLV-008/009): pickup/dropoff year outside the reporting period — record stays in Silver with a boolean column (`flag_pickup_year_mismatch`, `flag_dropoff_year_mismatch`); this is what catches the 2002 timestamps found in Phase 1 without discarding otherwise-valid trips.
- **Monitor**: null counts for `passenger_count`, `RatecodeID`, `store_and_fwd_flag`, `congestion_surcharge`, `Airport_fee` reported but not acted on.

Quality reports land in `docs/quality-reports/quality-report-{year}-{month}.json`, one per month, matching the spec's naming.

**Follow-up (not blocking):** re-run `01`/`02` notebook-style profiling across Feb–Jun to confirm Jan's quality-issue rates generalize (spot-checked via the validator's per-month output already — rates are consistent, see quality reports).

## Phase 3 — Bronze Layer *(done, MinIO)*

- `ingestion/downloader/downloader.py` — `locate()` (must already exist), `download()` (streams from TLC's CloudFront URL, atomic write, skips existing unless `--force`), `ensure()` (locate-or-download), plus a `month_range()` helper and a CLI (`--year/--month` or `--start/--end`). Verified against the real TLC endpoint (`https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_{year}-{month}.parquet`): downloaded 2024-07 live, confirmed idempotent skip (0.3s re-run) and graceful handling of an unpublished period (HTTP 403 → clear error, not a crash).
- `ingestion/validator/schema_validator.py` — checks all 19 expected columns + dtypes are present before anything is trusted
- `ingestion/uploader/uploader.py` — writes to `s3://openscale-lake/bronze/yellow_taxi/{year}-{month}.parquet` via `spark/common/storage.py`, untouched
- `ingestion/run_ingestion.py` — no args: locate+ingest every raw period already on disk. `--start/--end YYYY-MM`: download+ingest exactly that range from TLC.
- `spark/silver/validator.py` reads Bronze from MinIO, not local disk or `data/raw/`

## Phase 4 — Gold Layer *(done, v1, MinIO, now Spark)*

- `spark/gold/daily_revenue.py` — trip count + revenue totals per pickup date
- `spark/gold/hourly_demand.py` — trip count + avg fare/distance/passengers by hour-of-day
- `spark/gold/zone_stats.py` — trip count + revenue/fare/distance/tip by pickup zone (`PULocationID`)
- `spark/gold/congestion_metrics.py` — congestion-surcharge totals + incidence rate per pickup date
- `spark/common/loader.py` — now `spark.read.parquet(...)` over the whole Silver trips prefix (Spark reads a directory of files as one distributed DataFrame natively — no explicit file listing/concat needed, unlike the old pandas version)
- `spark/gold/run_gold.py` — runs all four, writes to `s3a://openscale-lake/gold/{name}/` (each a directory of Spark part-files, coalesced to 1 file since the aggregated output is small)
- Date-keyed jobs (`daily_revenue`, `congestion_metrics`) exclude SLV-008-flagged rows so the handful of stray timestamps don't produce bogus low-count dates decades apart

**Not yet done:** dropoff-zone (`DOLocationID`) stats, and no dashboard/BI layer sits on top of Gold yet — these are just Parquet objects in MinIO today.

## Phase 5 — Migrate to PySpark *(done)*

Landed once pandas actually hit its wall (see the Superseded decision note above), not on a schedule. What was built:

- `pyspark` (4.2.0) added to `requirements.txt`
- `spark/common/spark_session.py` — shared `get_spark()` (local mode, S3A configured for MinIO, `hadoop-aws:3.5.0` matched to the bundled Hadoop client version) and an `s3a://` `lake_path()` helper
- `spark/common/loader.py`, all 4 `spark/gold/*.py` jobs, `feature-store/feature-jobs/compute_features.py`, and `ml/training/train_fare_model.py` rewritten to load/aggregate/filter via Spark
- Pattern used throughout: **Spark for the big load/aggregate/filter step, pandas only for the small final result** (Gold's aggregated tables, the feature-store's ~6K-row output, ML's 300k-row training sample) — no need to rewrite the psycopg2/redis/scikit-learn code downstream of that point
- Verified against the full 138M-row, 40-month dataset — all jobs completed successfully; see Current State table for exact numbers

**Windows-specific setup required** (all logged in `docs/issues-and-fixes.md` §9): installing OpenJDK 17 (PySpark needs a JVM), downloading `winutils.exe`/`hadoop.dll` and setting `HADOOP_HOME` (Spark's `Shell` class needs this even for pure S3 access, no HDFS involved), and matching the `hadoop-aws` Maven package version to the bundled Hadoop client jar.

**Not done in this pass:** `spark/silver/validator.py` is still pandas (fine — bounded per-month memory regardless of how many months exist, no wall to hit there). The Phase 7 streaming consumer also wasn't ported to Spark Structured Streaming.

## Phase 6 — Infrastructure (Docker Compose) *(MinIO + Postgres + Redis done; ClickHouse deferred)*

- ✅ MinIO — object storage, replacing local `data/` paths for Bronze/Silver/Gold with a real data lake (bucket `openscale-lake`)
- ✅ PostgreSQL — brought up for Phase 8's offline feature store once that need was real
- ✅ Redis — brought up alongside Postgres for Phase 8's online feature store
- ⏳ ClickHouse (Gold-layer analytical queries) — still deferred; the FastAPI `/gold/*` endpoints read Parquet straight from MinIO today and that's sufficient for current query volume

## Phase 7 — Streaming *(done, v1)*

- `streaming/kafka-producer/producer.py` — `get_producer()`/`send_trip()` helpers, JSON-serialized, topic `yellow-taxi-trips`
- `streaming/replay-service/replay.py` — loads one pickup-date's worth of Silver trips from MinIO, sorts by pickup time, publishes each as a JSON event (`--speed` controls real-time pacing; `--limit` caps volume for testing)
- `streaming/spark-streaming/consumer.py` — consumes the topic, maintains rolling hourly trip-count/revenue aggregates, prints snapshots and a final summary on idle timeout

**Known limitations, not yet done:**
- The "spark-streaming" consumer is plain `kafka-python` + in-memory dict aggregation, not actual Spark Structured Streaming — folder/module name is aspirational, same pattern as the pandas-based `spark/` batch jobs. Revisit once Phase 5 lands.
- `replay.py` operates on one `--date` at a time, not a continuous multi-day stream.
- No consumer-side persistence — aggregates live in memory for the life of the process and aren't written anywhere (no Gold-equivalent streaming output table yet).
- Kafka has no auth/ACLs and a single broker/single partition topic — fine for local dev, not representative of a production streaming setup.

## Phase 8 — Feature Store *(done, v1, now Spark)*

- `feature-store/feature-jobs/compute_features.py` — builds `(PULocationID, pickup_hour)` features from **all 40 months / ~138M Silver trips, aggregated in Spark**: `trip_count`, `avg_fare`, `avg_trip_distance`, `avg_tip`, `avg_passenger_count`. Only the aggregated result (`.toPandas()`, a few thousand rows) touches pandas.
- Offline store: PostgreSQL table `zone_hour_features` (truncate-and-reload on each run) — **6,261 rows** at 40 months (was 5,975 at 6 months)
- Online store: Redis, one JSON value per `features:zone:{PULocationID}:hour:{hour}` key — same 6,261 keys
- `common/db.py` — shared Postgres/Redis connection config, importable from any script via the repo-root-on-sys.path pattern established for `spark.common.storage`

**Not yet done:** no incremental/streaming feature updates (job is a full batch recompute each run); no feature versioning or point-in-time correctness guarantees — this is a v1 offline+online mirror, not a real feature-store product like Feast.

## Phase 9 — ML *(done, v1, now Spark for data loading)*

- `ml/training/train_fare_model.py` — loads/filters/samples via **Spark** across all 40 months (~138M rows), down to a bounded 300k-row sample (`.toPandas()` only on that sample), then trains a `RandomForestRegressor` fare-prediction model (features: `trip_distance`, `PULocationID`, `DOLocationID`, `passenger_count`, `pickup_hour`) exactly as before — the sklearn training code itself didn't need to change, only the data-loading path
- Current run (40-month sample): **MAE $2.92, RMSE $7.20, R² 0.85** (previous 6-month-only run: MAE $2.63, RMSE $6.58, R² 0.87 — comparable quality, slightly different due to a larger and more recent data mix)
- MLflow tracking: local SQLite backend (`ml/mlflow/mlflow.db`), artifacts under `ml/mlflow/artifacts/` (MLflow 3.x deprecated the plain file store — see incident note above for why this isn't just `./mlruns`)
- `ml/inference/predict.py` — loads the most recent MLflow run for the `fare-prediction` experiment and exposes `predict_fare(...)` — unchanged, still pandas/sklearn at inference time (a single prediction doesn't need Spark)

**Not yet done:** only one model (fare prediction) — demand forecasting and congestion prediction from `docs/plan.md`'s vision aren't built; no model registry/staging workflow, no retraining schedule, no `ml/experiments` beyond what MLflow tracks automatically. Full ~138M-row training (vs. the 300k sample) is a Phase 12 benchmarking question, not attempted here.

## Phase 10 — API *(done, v1)*

`api/fastapi/main.py`, run via `uvicorn api.fastapi.main:app --port 8000`:
- `GET /health`
- `GET /zones/{zone_id}/features?hour=N` — online feature lookup from Redis
- `POST /predict/fare` — calls `ml.inference.predict_fare`
- `GET /gold/{daily-revenue,hourly-demand,zone-stats,congestion-metrics}` — reads the Spark-written Gold directories straight from MinIO (via pandas/pyarrow, which reads a directory of part-files as a dataset transparently), returns JSON

**Not yet done:** no auth, no request validation beyond Pydantic's basic type checking, no pagination on the `/gold/*` endpoints (they return the whole table — fine at current row counts, won't be once more months are ingested).

## Phase 11 — Observability *(done, v1, metrics only)*

- FastAPI instrumented with `prometheus-fastapi-instrumentator` → `/metrics`
- Prometheus (`docker-compose.yml`, `:9090`) scrapes `host.docker.internal:8000` every 5s — `observability/prometheus/prometheus.yml`
- Grafana (`:3000`, admin/admin, anonymous viewer access enabled) with the Prometheus datasource auto-provisioned via `observability/grafana/provisioning/datasources/prometheus.yml`

**Not yet done (see decision above for why):** OpenTelemetry/distributed tracing; no Grafana dashboards built yet (datasource only — open Grafana and build one against `http_requests_total` etc.); no pipeline-level metrics (Kafka consumer lag, Silver/Gold job duration or data-quality scores aren't exported to Prometheus, only API request metrics are).

## Phase 12 — Benchmarking

- Run the full pipeline at 100M–1B record scale
- Measure throughput, storage efficiency, execution time, memory utilization

---

# Immediate Next Steps

1. **Pin `requirements.txt` versions.** Currently unpinned; the mlflow/pandas incident (and the pyspark install itself) both show how easily a fresh install can silently shift the whole stack.
2. Port the Phase 7 streaming consumer (`streaming/spark-streaming/consumer.py`) to real Spark Structured Streaming, now that Phase 5 has actually landed — it's the last "not really Spark despite the name" gap.
3. Add dropoff-zone (`DOLocationID`) stats to the Gold layer, alongside the existing pickup-zone stats.
4. Re-run Phase 1-style profiling across the full 40-month range to formally document quality-rate consistency and investigate the March–November 2025 data-quality anomaly found in the Silver quality reports (see Current State table).
5. Extend `replay.py` to loop across multiple/all days instead of one `--date` at a time, and give the streaming consumer somewhere to persist its aggregates (today they're print-only and vanish when the process exits).
6. Build actual Grafana dashboards against the Prometheus datasource (currently just wired up, nothing built).
7. Add demand-forecasting and congestion-prediction models alongside the current fare-prediction model, per `docs/plan.md`'s original ML scope.
8. Phase 12 (Benchmarking) is the only phase left entirely unstarted — now meaningfully attemptable since Phase 5 (PySpark) is real; the pandas-memory-wall measurement (Phase 5's trigger) is itself a first data point worth formalizing there.
9. Extend `ingestion/validator/schema_validator.py` to support multiple TLC schema eras (see the schema-drift constraint note above) if historical data before 2023-02 is ever needed — currently out of scope, worked around by date-range selection instead.

---

# Conclusion

OpenScale's value is in demonstrating a real, working data platform build order — not in having every folder in `docs/structure.md` populated at once. The plan above enforces that: Bronze and Silver must be trustworthy and Spark-scale before infrastructure, streaming, ML, or observability work starts. Treat this file as the checklist; treat `docs/silver-layer-specification.md` (and future per-layer specs) as the detailed rulebook for whichever phase is active.
