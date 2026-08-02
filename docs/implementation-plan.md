# OpenScale Implementation Plan

## Document Information

| Field | Value |
|---|---|
| Project | OpenScale |
| Status | Living document — single source of truth for build order and current progress |
| Last updated | 2026-08-02 (Bronze/Silver/Gold v1 complete, MinIO live) |

This document exists because `docs/plan.md` explains *why* OpenScale exists and `docs/structure.md` shows the *target* folder layout, but neither says what's actually built yet or in what order the rest gets built. This file is that missing piece. Update the **Current State** table whenever a phase moves forward — everything else here should stay stable.

---

# Current State (as of 2026-08-02)

| Layer / Component | Status | Notes |
|---|---|---|
| Raw data ingestion | Manual | 6 months downloaded by hand into `data/raw/yellow_taxi/` (2024-01 … 2024-06). `ingestion/downloader` locates these; it does not fetch from TLC over HTTP yet. |
| `ingestion/` (downloader, validator, uploader) | **Done** | `ingestion/run_ingestion.py` runs locate → schema-validate → write-to-Bronze for every raw period found. Schema validation checks column presence + dtype against a fixed 19-column contract. |
| Bronze layer | **Done (MinIO)** | `s3://openscale-lake/bronze/yellow_taxi/{year}-{month}.parquet`, all 6 months. Untouched copies of raw, gated only by schema. |
| Silver layer | **Done (v1, all 6 months, MinIO)** | `spark/silver/validator.py` implements the full `docs/silver-layer-specification.md` rule set — SLV-001–004 reject, SLV-005/006/007/010 quarantine (into 5 separate per-rule files), SLV-008/009 flag-in-place, plus missing-value monitor counts — reads from MinIO Bronze, writes Silver trips + quarantine back to MinIO, runs across all 6 months. Quality reports stay local (human-readable) under `docs/quality-reports/`. Notebook `03_silver_layer_prototype.ipynb` is explicitly a scoped-down (4-rule, Jan-only, local-disk) prototype; the notebook itself says so and points to the script. |
| Gold layer | **Done (v1, MinIO)** | `spark/gold/{daily_revenue,hourly_demand,zone_stats,congestion_metrics}.py` + `run_gold.py` orchestrator, reading combined Silver output via `spark/common/loader.py`, writing to `s3://openscale-lake/gold/`. Date-keyed jobs exclude SLV-008-flagged (year-mismatched) rows so stray timestamps don't create bogus decades-old dates. |
| Object storage (MinIO) | **Done** | `docker-compose.yml` at repo root brings up MinIO (S3 API on `:9000`, console on `:9101` — `:9001` is Hyper-V-reserved on this machine) plus a one-shot `minio-init` service that creates the `openscale-lake` bucket. `spark/common/storage.py` centralizes the endpoint/credentials/bucket and a `lake_path()` helper; all Bronze/Silver/Gold I/O goes through it via `s3fs`. Local `data/bronze/`, `data/silver/*`, `data/gold/` are no longer used — data lives in the MinIO container volume now, not on local disk or in git. |
| Engine | pandas + pyarrow only | `requirements.txt` has no `pyspark`. Everything under `spark/` currently runs on pandas despite the folder name (Phase 5, deferred — see decision below). |
| PostgreSQL, ClickHouse, Kafka, monitoring | Not started | Deliberately deferred until Phase 8/streaming/analytics actually need them — see decision below. |
| Streaming, feature store, ML, API, observability, benchmarks | Not started | Planned only, per `docs/structure.md`. |
| Notebooks | Done for their scope | `01_dataset_exploration`, `02_data_quality_analysis`, `03_silver_layer_prototype` are all annotated and runnable. |
| Dataset profiling / analysis report | Done | `docs/dataset-analysis.md` (Jan 2024 only — not yet re-run for Feb–Jun). |

**Decision (2026-08-02): PySpark migration deferred; MinIO brought forward.** Storage backend (MinIO) and compute engine (pandas vs. PySpark) are independent axes — pandas can read/write S3-compatible storage via `s3fs` exactly as it does local disk, so MinIO didn't need to wait for Phase 5. Postgres and ClickHouse, by contrast, still wait: nothing consumes them yet (no feature store, no analytics API/dashboard), so standing them up now would just be idle containers — the same anti-pattern this plan exists to avoid.

**Resolved:** the rule numbering inside `validator.py` now matches `docs/silver-layer-specification.md` (SLV-001/002 = null timestamps, SLV-003 = timestamp order, SLV-004 = distance non-negative, SLV-005 = passenger count, SLV-006/007 = fare/total, SLV-008/009 = reporting-period flags, SLV-010 = distance outlier). `docs/silver-layer-specification.md` remains canonical for any future rule changes.

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

- `ingestion/downloader/downloader.py` — locates the raw file for a given year/month under `data/raw/`; swap-point for a real TLC HTTP fetch later
- `ingestion/validator/schema_validator.py` — checks all 19 expected columns + dtypes are present before anything is trusted
- `ingestion/uploader/uploader.py` — writes to `s3://openscale-lake/bronze/yellow_taxi/{year}-{month}.parquet` via `spark/common/storage.py`, untouched
- `ingestion/run_ingestion.py` — orchestrates all three across every available raw period
- `spark/silver/validator.py` reads Bronze from MinIO, not local disk or `data/raw/`

## Phase 4 — Gold Layer *(done, v1, MinIO)*

- `spark/gold/daily_revenue.py` — trip count + revenue totals per pickup date
- `spark/gold/hourly_demand.py` — trip count + avg fare/distance/passengers by hour-of-day
- `spark/gold/zone_stats.py` — trip count + revenue/fare/distance/tip by pickup zone (`PULocationID`)
- `spark/gold/congestion_metrics.py` — congestion-surcharge totals + incidence rate per pickup date
- `spark/common/loader.py` — shared helper that concatenates every Silver trips object under `s3://openscale-lake/silver/trips/` into one DataFrame for every Gold job
- `spark/gold/run_gold.py` — runs all four, writes to `s3://openscale-lake/gold/*.parquet`
- Date-keyed jobs (`daily_revenue`, `congestion_metrics`) exclude SLV-008-flagged rows so the handful of stray pre-2024 timestamps don't produce bogus low-count dates decades apart

**Not yet done:** dropoff-zone (`DOLocationID`) stats, and no dashboard/BI layer sits on top of Gold yet — these are just Parquet objects in MinIO today.

## Phase 5 — Migrate to PySpark

pandas is fine for single-month prototyping but won't hold once multiple years are combined (per `docs/plan.md`'s stated goal of hundreds of millions to billions of records). Before Phase 3/4 scale up:
- Add `pyspark` to `requirements.txt`
- Port `validator.py` logic to Spark DataFrame API (masks translate directly to `.filter()`/`.withColumn()`)
- Re-validate Phase 2 rule outputs match between pandas and Spark before retiring the pandas version

Phase 3/4 (Bronze/Gold) are done on pandas already — this migration ports that working logic to Spark rather than blocking it, but must land before ingesting more than ~1 year of data.

## Phase 6 — Infrastructure (Docker Compose) *(MinIO done; Postgres/ClickHouse deferred)*

- ✅ MinIO — object storage, replacing local `data/` paths for Bronze/Silver/Gold with a real data lake (`docker-compose.yml` at repo root; bucket `openscale-lake`)
- ⏳ PostgreSQL (metadata, feature store) — bring up when Phase 8 (Feature Store) actually needs it
- ⏳ ClickHouse (Gold-layer analytical queries) — bring up when there's a real analytics/dashboard consumer for Gold data

## Phase 7 — Streaming

- `streaming/replay-service` — replays historical Silver trips as if arriving live
- `streaming/kafka-producer` — publishes replayed events to Kafka
- `streaming/spark-streaming` — consumes and computes real-time analytics equivalent to a subset of Gold-layer metrics

## Phase 8 — Feature Store

- `feature-store/feature-jobs` — derive ML features (demand, fare, congestion) from Gold/streaming data
- Redis (online/low-latency features) + PostgreSQL (offline/historical features)

## Phase 9 — ML

- `ml/training`, `ml/experiments` — demand forecasting, fare prediction, congestion prediction
- MLflow for experiment tracking and model versioning
- `ml/inference` — batch/online scoring

## Phase 10 — API

- FastAPI service exposing predictions and Gold-layer analytics

## Phase 11 — Observability

- Prometheus + Grafana + OpenTelemetry across pipeline latency, Kafka lag, Spark throughput, data-quality scores, model performance, API metrics

## Phase 12 — Benchmarking

- Run the full pipeline at 100M–1B record scale
- Measure throughput, storage efficiency, execution time, memory utilization

---

# Immediate Next Steps

1. Add dropoff-zone (`DOLocationID`) stats to the Gold layer, alongside the existing pickup-zone stats.
2. Re-run Phase 1-style profiling across Feb–Jun to formally document quality-rate consistency (currently only spot-checked via quality reports).
3. Start Phase 5 (PySpark migration) before ingesting data beyond the current 6 months — pandas will not hold at the multi-year scale `docs/plan.md` targets.
4. Make `ingestion/downloader` actually fetch from TLC over HTTP instead of only locating pre-downloaded files.
5. Pick the next real consumer to justify Postgres or ClickHouse (Phase 8 feature store, or a Gold-layer dashboard) rather than standing either up speculatively.

---

# Conclusion

OpenScale's value is in demonstrating a real, working data platform build order — not in having every folder in `docs/structure.md` populated at once. The plan above enforces that: Bronze and Silver must be trustworthy and Spark-scale before infrastructure, streaming, ML, or observability work starts. Treat this file as the checklist; treat `docs/silver-layer-specification.md` (and future per-layer specs) as the detailed rulebook for whichever phase is active.
