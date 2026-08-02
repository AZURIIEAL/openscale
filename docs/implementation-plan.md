# OpenScale Implementation Plan

## Document Information

| Field | Value |
|---|---|
| Project | OpenScale |
| Status | Living document — single source of truth for build order and current progress |
| Last updated | 2026-08-02 |

This document exists because `docs/plan.md` explains *why* OpenScale exists and `docs/structure.md` shows the *target* folder layout, but neither says what's actually built yet or in what order the rest gets built. This file is that missing piece. Update the **Current State** table whenever a phase moves forward — everything else here should stay stable.

---

# Current State (as of 2026-08-02)

| Layer / Component | Status | Notes |
|---|---|---|
| Raw data ingestion | Manual | 6 months downloaded by hand into `data/raw/yellow_taxi/` (2024-01 … 2024-06). No automated downloader yet. |
| `ingestion/` (downloader, validator, uploader) | Empty scaffold | Directories exist, no code. |
| Bronze layer | Not started | `data/bronze/` exists and is empty. Silver currently reads directly from `data/raw/`, skipping Bronze entirely. |
| Silver layer | Partial | `spark/silver/validator.py` implements 4 critical rules (timestamp order, passenger count, fare, distance) against **pandas**, run against `2024-01` only. Notebook `03_silver_layer_prototype.ipynb` mirrors it. Rules SLV-005…SLV-010 from `docs/silver-layer-specification.md` (distance-outlier threshold, reporting-period checks, missing-value monitoring) are not implemented. |
| Gold layer | Not started | `data/gold/` exists and is empty. No aggregation jobs. |
| Engine | pandas + pyarrow only | `requirements.txt` has no `pyspark`. Everything under `spark/` currently runs on pandas despite the folder name. |
| `infrastructure/` (Docker, Kafka, MinIO, ClickHouse, Postgres, monitoring) | Empty scaffold | No `docker-compose.yml` yet. |
| Streaming, feature store, ML, API, observability, benchmarks | Not started | Planned only, per `docs/structure.md`. |
| Notebooks | Done for their scope | `01_dataset_exploration`, `02_data_quality_analysis`, `03_silver_layer_prototype` are all annotated and runnable. |
| Dataset profiling / analysis report | Done | `docs/dataset-analysis.md` (Jan 2024 only — not yet re-run for Feb–Jun). |

**Known inconsistency to resolve:** the rule numbering used inside `validator.py` (SLV-001 = timestamp, SLV-002 = passenger, SLV-003 = fare, SLV-004 = distance) does **not** match `docs/silver-layer-specification.md` (SLV-001/002 = null checks, SLV-003 = timestamp order, SLV-004 = distance, SLV-005 = passenger, SLV-006/007 = fare/total). Treat `silver-layer-specification.md` as canonical going forward; `validator.py`'s comments need renumbering to match it (tracked in Phase 2 below).

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

## Phase 2 — Silver Layer, complete the spec *(in progress)*

Done: SLV rules for timestamp order, passenger count, fare, and distance (non-negativity), against January 2024 only.

Remaining, in order:
1. Reconcile rule numbering between `validator.py` and `docs/silver-layer-specification.md` (adopt the spec's numbering).
2. Implement the remaining spec rules: SLV-008/009 (pickup/dropoff year must match reporting period — this is what catches the 2002 timestamps found in Phase 1), SLV-010 (distance > 100mi → quarantine).
3. Add missing-value monitoring counters (`passenger_count`, `RatecodeID`, `store_and_fwd_flag`, `congestion_surcharge`, `Airport_fee`) to the quality report without rejecting those rows, per the spec's "Monitor" strategy.
4. Parameterize `validator.py` to run across all 6 months, not just January, and confirm output schema/row counts are consistent month to month.

## Phase 3 — Bronze Layer (currently skipped)

Right now Silver reads raw Parquet directly, which skips the Medallion Architecture's whole point: an immutable, schema-enforced raw copy. Build:

- `ingestion/downloader` — script to pull TLC monthly files (parameterized by year/month) instead of manual download
- `ingestion/validator` — schema/type check on arrival (column presence, dtypes) before anything is trusted as Bronze
- `ingestion/uploader` — writes validated raw files into `data/bronze/` (partitioned by year/month), untouched/unfiltered
- Point `spark/silver/validator.py` at `data/bronze/` instead of `data/raw/`

## Phase 4 — Gold Layer

Business-ready aggregates, built from Silver output:
- Daily revenue
- Hourly demand
- Zone-level trip statistics (PULocationID/DOLocationID)
- Congestion-surcharge metrics

Output to `data/gold/`, one job per metric under `spark/gold/`.

## Phase 5 — Migrate to PySpark

pandas is fine for single-month prototyping but won't hold once multiple years are combined (per `docs/plan.md`'s stated goal of hundreds of millions to billions of records). Before Phase 3/4 scale up:
- Add `pyspark` to `requirements.txt`
- Port `validator.py` logic to Spark DataFrame API (masks translate directly to `.filter()`/`.withColumn()`)
- Re-validate Phase 2 rule outputs match between pandas and Spark before retiring the pandas version

This can happen in parallel with Phase 3/4 rather than blocking them, but must land before ingesting more than ~1 year of data.

## Phase 6 — Infrastructure (Docker Compose)

Stand up the platform's storage/compute backbone before streaming or serving anything:
- MinIO (object storage — replaces local `data/` paths with a real data lake)
- PostgreSQL (metadata, feature store)
- ClickHouse (Gold-layer analytical queries)
- `docker-compose.yml` wiring these together

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

1. Reconcile SLV rule numbering (`validator.py` vs. `silver-layer-specification.md`).
2. Implement SLV-008/009/010 in `validator.py` + `03_silver_layer_prototype.ipynb`.
3. Parameterize the Silver pipeline to loop over all 6 available months.
4. Start `ingestion/downloader` so future months don't require manual downloads.

---

# Conclusion

OpenScale's value is in demonstrating a real, working data platform build order — not in having every folder in `docs/structure.md` populated at once. The plan above enforces that: Bronze and Silver must be trustworthy and Spark-scale before infrastructure, streaming, ML, or observability work starts. Treat this file as the checklist; treat `docs/silver-layer-specification.md` (and future per-layer specs) as the detailed rulebook for whichever phase is active.
