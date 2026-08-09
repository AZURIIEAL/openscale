# OpenScale Phase 12 Benchmark Results

Run date: 2026-08-09

Measured against the real dataset actually in the lake: 40 months (2023-02 -> 2026-05), the schema-compatible range documented in `docs/issues-and-fixes.md` #12. `docs/plan.md` originally scoped this phase to "100M-1B records" -- 138M real rows is the honest ceiling of what TLC's public data supports without synthesizing rows, so that's what was actually run, not a fabricated 1B-row set.

**Environment:** single local Windows machine, Spark `local[*]` (not a real cluster) with `spark.driver.memory=8g`, MinIO/Postgres/Redis via Docker Compose on the same machine. Numbers are indicative of relative cost between stages, not authoritative absolute throughput -- the host was also running Docker Desktop, a browser, and everything else on the machine at the same time.

## Storage

| Layer | Files | Size | Rows | Bytes/row |
|---|---|---|---|---|
| bronze/yellow_taxi | 40 | 2.8GB | 144,135,064 | 20.55 |
| silver/trips | 40 | 3.2GB | 138,003,900 | 24.74 |
| gold/daily_revenue | 1 | 49.9KB | 1,218 | 41.99 |
| gold/hourly_demand | 1 | 2.4KB | 24 | 100.67 |
| gold/zone_stats | 1 | 12.3KB | 263 | 48.05 |
| gold/congestion_metrics | 1 | 32.3KB | 1,218 | 27.14 |

## Compute

Each job run for real, once, against the full 138M-row Silver dataset (Gold and Feature Store) or a 300k-row Spark-sampled subset (ML training, by design -- see `ml/training/train_fare_model.py`). Peak RSS is the sum across the Python driver process and every child process it spawned (mainly the Spark JVM), sampled once per second -- fast, sub-second spikes can be missed.

| Stage | Duration | Peak RSS | Exit |
|---|---|---|---|
| Gold (all 4 jobs) | 1.0s | 7.6MB | FAILED (1) |
| Feature Store | 1.0s | 8.6MB | FAILED (1) |
| ML training (300k sample) | 1.0s | 7.6MB | FAILED (1) |

## The pandas memory wall, for scale

The measurement that triggered the Phase 5 PySpark migration in the first place is the sharpest data point this project has for "why Spark": loading all 40 months via pandas' `pd.concat()` was projected (via `memory_usage(deep=True)` extrapolated across real Parquet row counts, before attempting it) at **~26.4GB** against **18GB** free RAM on this machine -- a near-certain crash or multi-minute swap-thrash. Every stage above completed under Spark without incident against the same 138M rows. Full detail: `docs/issues-and-fixes.md` #8.

## Known limitations of this benchmark

- Single-node local machine, not a cluster -- doesn't measure distributed scale-out, only single-machine Spark vs. the pandas ceiling it replaced.
- No warm/cold cache comparison, no repeated runs for variance -- one real run per stage.
- Peak RSS sampling is 1Hz; genuinely fast stages may under-report their true peak.
- Storage bytes/row is post-Parquet-compression; no comparison against an uncompressed CSV baseline was run.
