# OpenScale — Issues Encountered & How They Were Fixed

## Document Information

| Field | Value |
|---|---|
| Project | OpenScale |
| Status | Historical log — append new entries as new issues are hit; don't rewrite old ones |
| Last updated | 2026-08-09 (added #13, #14, #15) |

This is the "what actually went wrong and why" log for OpenScale, kept separate from [`docs/implementation-plan.md`](implementation-plan.md) (which tracks build status and decisions) so the plan doc doesn't get cluttered with environment-specific debugging detail. Read this before re-hitting the same wall — most of these are Windows-specific or dependency-drift issues that will recur if the environment is rebuilt from scratch.

---

## 1. Notebook 03 was corrupted / 0 bytes

**Symptom:** `notebooks/03_silver_layer_prototype.ipynb` failed to read — "not valid JSON (it may be truncated, corrupted, or still being written)".

**Root cause:** The file existed on disk but was empty (0 bytes), likely from an interrupted save.

**Fix:** Deleted the file and rebuilt it from scratch as a valid empty notebook JSON skeleton, then populated it cell by cell via `NotebookEdit`.

---

## 2. `docs/dataset-analysis.md` went missing mid-session

**Symptom:** `git status` showed `deleted: docs/dataset-analysis.md`, even though nothing in the visible session history deleted it. `HEAD` also had a commit ("feat: Implement Silver Layer validation...") that wasn't made through this session.

**Root cause:** Unclear — most likely an action taken outside this conversation (e.g. directly in the IDE/VS Code source control), since the commit history showed changes not authored here.

**Fix:** `git checkout HEAD -- docs/dataset-analysis.md` — safe because the file was tracked and unmodified in the working tree beyond being deleted, so restoring from `HEAD` couldn't lose anything.

**Lesson:** Always check `git status` for unexpected deletions before assuming a doc is missing because of something you did.

---

## 3. MinIO console port 9001 conflicts with Windows' Hyper-V reserved range

**Symptom:** `docker compose up` failed: `bind: An attempt was made to access a socket in a way forbidden by its access permissions` on port 9001.

**Root cause:** `netsh interface ipv4 show excludedportrange protocol=tcp` showed 9001 inside a Windows-reserved dynamic port range (common on machines with Hyper-V/WSL2 enabled).

**Fix:** Remapped the MinIO console to `9101:9001` in `docker-compose.yml`. Checked every subsequent port we planned to use (Kafka 9092, Postgres 5432, Redis 6379, Prometheus 9090, Grafana 3000, API 8000, MLflow 5000) against the excluded range *before* wiring it up, to avoid repeating this.

---

## 4. Installing `mlflow` silently downgraded pandas, breaking schema validation

**Symptom:** After `pip install mlflow`, `ingestion/validator/schema_validator.py` started rejecting every file with `Missing expected columns` / dtype mismatch on `store_and_fwd_flag`.

**Root cause:** `mlflow` pins an older pandas; installing it silently downgraded pandas `3.0.5 → 2.3.3`. Pandas 3.0's native string dtype reports as `"str"`; pandas 2.x reports the same column as `"object"`. The schema validator had `"store_and_fwd_flag": "str"` hardcoded.

**Fix:** Updated the expected dtype to `"object"`, then re-ran the entire Bronze→Silver→Gold pipeline to confirm identical output under the new pandas version (it was — pure dtype-label change, no behavioral difference).

**Lesson:** `requirements.txt` is unpinned. Any future `pip install` can silently shift dependency versions repo-wide. Worth pinning before this project is relied on elsewhere.

---

## 5. MLflow 3.x deprecated the plain file-based tracking store

**Symptom:** `mlflow.set_experiment(...)` raised `MlflowException: The filesystem tracking backend (e.g., './mlruns') is in maintenance mode and will not receive further updates`.

**Root cause:** MLflow 3.x pushes users toward a database-backed tracking store; the old `file:///...mlruns` backend now hard-errors unless explicitly opted back into.

**Fix:** Switched to a local SQLite backend: `sqlite:///ml/mlflow/mlflow.db`, with an explicit `artifact_location` (`ml/mlflow/artifacts/`) set on experiment creation. Still fully local, no server needed.

---

## 6. `mlflow ui` crashes on Windows with the default multi-worker mode

**Symptom:** `mlflow ui --port 5000` started, then crashed every worker with `OSError: [WinError 10022] An invalid argument was supplied` inside `asyncio`/uvicorn socket setup.

**Root cause:** MLflow's server runs multiple uvicorn worker processes sharing a listening socket — a trick that relies on `SO_REUSEPORT`-style socket sharing, which Windows doesn't support the way Unix does.

**Fix:** Added `--workers 1` to the `mlflow ui` command. Documented in the README as a required flag on Windows.

---

## 7. A fresh Python process appeared to show 11 months missing from MinIO

**Symptom:** After a large background Bronze-ingestion run (40 months), a separate `list_lake()` check in a new Python process showed only 29 of 40 months in both Bronze and Silver — specifically, all of 2023 (Feb–Dec) appeared to be missing.

**Root cause:** Inconclusive. Re-checking after the user independently re-ran the full pipeline showed all 40 months correctly present in both layers. Most likely a transient read — possibly a race between the background write completing and the listing call, or an `fsspec`/`s3fs` directory-cache artifact in that specific process. MinIO itself is strongly consistent, so this wasn't a real data-loss event.

**Fix:** None needed — re-verified with a fresh listing and it was correct. Flagged here rather than as a resolved root cause, since it wasn't reproduced.

**Lesson:** Don't trust a single listing check immediately after a large write completes; re-verify from a clean process before concluding data is missing.

---

## 8. The pandas memory wall — `load_silver_trips()` can't hold 40 months

**Symptom:** Before attempting it, we calculated that concatenating all 40 Silver months (~138M rows) into one pandas DataFrame would need **~26.4GB** (measured via `df.memory_usage(deep=True)` on one real month, extrapolated across all months' row counts from Parquet metadata) — against **18GB free** of **32GB total** RAM. `pd.concat()` would also transiently hold the individual month frames *and* build the combined one, pushing peak usage well past total RAM.

**Root cause:** `spark/common/loader.py`'s `load_silver_trips()` (used by every Gold job, the feature-store job, and ML training) did a full `pd.concat()` across every Silver month — fine at 6 months (~20M rows), not at 40 (~138M rows).

**Fix:** This is what actually triggered the Phase 5 PySpark migration (see below) — rather than attempt a run likely to crash or hang the machine, we measured the wall precisely first, then fixed the root cause instead of working around it.

### Why pandas specifically hits this wall

pandas is a **single-process, eager, in-memory** engine. `pd.read_parquet()` on each month materializes that month's rows as real Python/NumPy objects in RAM immediately, and `pd.concat()` then has to hold *every* month's DataFrame simultaneously *plus* allocate a new array big enough for the combined result — there's no way to ask pandas to "process this without fully loading it first." One process, one machine's RAM, no spilling to disk, no partitioning. At 6 months that ceiling never mattered; at 40 months (~138M rows, ~26GB deep) it exceeded the 18GB free on this machine, and `pd.concat()`'s transient peak (old frames + new frame both alive at once) would have pushed past the full 32GB before pandas could even finish raising `MemoryError` cleanly — more likely the OS pagefile would have started thrashing first, which looks like a hang, not a crash.

### Why Spark doesn't

Spark is a **distributed, lazy, partitioned** engine, and all three of those properties matter here even running in `local[*]` mode on one machine:

- **Partitioned:** `spark.read.parquet(prefix)` doesn't load one giant DataFrame — it registers the *plan* to read N partitions (roughly one per file/block), and only pulls a partition into memory when a task actually needs to operate on it.
- **Lazy:** `.groupBy(...).agg(...)` doesn't run when you call it — it builds a query plan. Nothing executes until an action (`.count()`, `.write.parquet(...)`, `.toPandas()`) triggers it. That gives Spark's optimizer the *whole* computation graph up front, so it can push filters down, combine operations, and — critically — spill intermediate shuffle data to local disk instead of requiring it all in RAM at once.
- **Bounded by design, not by luck:** an aggregation like Gold's `groupBy("pickup_date").agg(sum(...), avg(...))` only ever needs to hold *running totals per key* in memory at any moment, not the raw 138M rows — the same reason a `SELECT ... GROUP BY` in any real database doesn't need RAM proportional to table size.

The pattern used throughout this migration exploits exactly this: Spark does the part that scales with input size (load, filter, aggregate), and only the part that's small *by construction* — an aggregated table, a bounded sample — ever gets pulled into pandas via `.toPandas()`. That's not a workaround, it's the actual right shape for this kind of pipeline: distributed engine for anything proportional to data volume, single-process tools for anything that's already been reduced to a small result.

---

## 9. Standing up real PySpark on Windows (Phase 5)

Getting `pyspark` actually working against MinIO from Windows took several sequential fixes:

**9a. No Java installed.** PySpark needs a JVM. Installed OpenJDK 17 via `winget install Microsoft.OpenJDK.17`.

**9b. New environment variables didn't propagate to the already-running shell.** `JAVA_HOME` was set correctly at the Windows machine level after installing Java, but the persistent bash session had a stale environment snapshot from before the install and didn't pick it up automatically. Fix: explicitly `export JAVA_HOME=...` and prepend it to `PATH` in every subsequent command that needed Java (a new shell process would have inherited it automatically, but the long-lived session didn't restart).

**9c. `HADOOP_HOME and hadoop.home.dir are unset` on `SparkContext` init.** The classic Windows-Spark gotcha — Spark needs `winutils.exe` even for pure S3 access with no HDFS involved, because Hadoop's `Shell` class does OS-level file operations (chmod, temp dirs) that need a Windows-native shim. Fix: downloaded `winutils.exe` + `hadoop.dll` (hadoop-3.3.6 build from the community `cdarlint/winutils` GitHub repo — close enough to our bundled `hadoop-client-api-3.5.0.jar`) into `C:\hadoop\bin`, set `HADOOP_HOME=C:\hadoop`.

**9d. `hadoop-aws` version had to match the bundled Hadoop client.** Checked `venv/Lib/site-packages/pyspark/jars/hadoop-client-api-3.5.0.jar` to find the exact version, then used `spark.jars.packages = "org.apache.hadoop:hadoop-aws:3.5.0"` (Maven auto-resolves the matching `aws-java-sdk`/`awssdk` bundle transitively — no need to pin that separately).

**9e. Harmless shutdown warning on every run.** Every Spark session logs an `IOException: Failed to delete: ...analyticsaccelerator-s3...jar` when `spark.stop()` runs, because Windows holds a file lock on a JAR the JVM hasn't released yet. Cosmetic only — appears *after* the actual computation has already succeeded. Don't mistake it for a real failure when reading logs.

**Result:** Verified end-to-end against the full 40-month (~138M row) dataset — all 4 Gold jobs, the feature-store job, and ML training completed successfully, something that would not have been possible on pandas. See `docs/implementation-plan.md` Phase 5 for the numbers.

---

## 10. Spark's output shape differs from pandas' — broke the API

**Symptom:** After migrating Gold to Spark, `GET /gold/daily-revenue` returned `Internal Server Error`.

**Root cause:** Spark's `df.write.parquet(path)` always writes a *directory* of part-files plus a `_SUCCESS` marker — never a single file like pandas' `to_parquet()`. The API's `_read_gold()` was still pointed at `gold/{name}.parquet` (a single-file path that no longer existed; Spark had written a directory named `gold/{name}` instead).

**Fix:** Changed Gold's stored paths to `gold/{name}` (directory, no `.parquet` suffix) and updated `api/fastapi/main.py`'s `_read_gold()` to match. `pyarrow` reads a directory of part-files as a dataset transparently, so no other code needed to change.

---

## 11. A stale server process masked the real error, then blocked the fix

**Symptom:** After fixing issue #10, a *new* `uvicorn` start attempt failed with `WinError 10048: only one usage of each socket address...`, while a request to `/gold/daily-revenue` still returned `Internal Server Error` — from an old process that was still running with pre-fix code.

**Root cause:** An earlier `uvicorn` instance from prior testing was never actually stopped (a `kill %1` in an earlier turn had targeted the wrong shell job). It kept answering requests with the old single-file `_read_gold()` logic.

**Fix:** `netstat -ano | Select-String ":8000"` to find the real listening PID (PowerShell's `Get-NetTCPConnection` was returning misleading `TIME_WAIT`/PID-0 rows that didn't identify the actual listener), killed it, restarted `uvicorn` clean, re-verified all endpoints.

**Lesson:** When a "no code changed here" endpoint suddenly errors right after a fix, check for a stale process serving old code before debugging the new code.

---

## 12. TLC's schema changed multiple times across years — not a bug, but a hard constraint

**Not a bug — a discovered constraint**, while scoping a bulk historical pull (2009–2026):

- **2009 – mid-2016:** raw `pickup_latitude`/`pickup_longitude` instead of `PULocationID`/`DOLocationID` zone IDs (no location IDs existed yet)
- **~July 2016:** switched to zone-ID columns
- **January 2019:** `congestion_surcharge` added
- **Confirmed empirically: `Airport_fee` first appears between `2023-01` (missing) and `2023-02` (present)** — verified by actually downloading and validating both months against `ingestion/validator/schema_validator.py`'s fixed 19-column contract, via binary search across 2019–2023 candidate months, rather than guessing from memory.

**Handling:** Rather than extend the validator to support multiple schema eras (real but out-of-scope work), scoped the historical pull to `2023-02 → 2026-05` — the range that matches the current fixed schema contract exactly, with zero code changes needed.

---

## 13. Porting the streaming consumer to Spark Structured Streaming

Two separate problems surfaced while replacing the plain-`kafka-python` consumer (`streaming/spark-streaming/consumer.py`) with a real `spark.readStream.format("kafka")` job:

**13a. `replay.py` was already broken.** `load_silver_trips()` was changed to require a `SparkSession` argument during the Phase 5 migration (see issue #8/Phase 5), but `streaming/replay-service/replay.py`'s `load_day()` was never updated and still called it with no arguments — a `TypeError` waiting to happen on the next run, just not yet hit since nothing had re-run the streaming path since Phase 5 landed. **Fix:** `load_day()` now creates its own Spark session, filters to the requested date in Spark, and only then `.toPandas()`s the (small, single-day) result — the same big-in-Spark/small-in-pandas pattern used everywhere else since Phase 5.

**13b. `AnalysisException: Sorting is not supported on streaming DataFrames/Datasets, unless it is on aggregated DataFrame/Dataset in Complete output mode.`** The first working query attempt did `.groupBy(window(...)).agg(...).orderBy("pickup_hour")` before `writeStream`. Structured Streaming forbids `orderBy`/`sort` on a streaming (unbounded) DataFrame except when the output mode is `Complete` — because sorting the *entire* result set only makes sense when the entire result set is being re-emitted every batch, not in `update` mode where only changed rows are emitted. **Fix:** dropped the `.orderBy()` call; windows now print in whatever order they were updated in (no correctness impact, since each printed batch is timestamped/window-labeled anyway).

**Non-issue, for the record:** the very first attempt at running the query (before 13b was found) failed differently — a `NullPointerException` inside Spark's `BlockManagerMasterEndpoint.register`, surfacing as a `Py4JError` during `SparkContext` creation, after several minutes of first-time Kafka-connector JAR resolution over Maven. It did not reproduce on any subsequent run (JARs were cached, `SparkContext` created in under a second each time), so it's logged here as likely transient — a slow first-time dependency download outlasting some internal heartbeat/timeout — rather than a real code or environment bug, similar in spirit to issue #7.

---

## 14. Pinning an explicit Grafana datasource `uid` crashed an already-provisioned Grafana

**Symptom:** After adding `uid: prometheus` to `observability/grafana/provisioning/datasources/prometheus.yml` (needed so the new dashboard JSON could reference the datasource reliably) and running `docker compose restart grafana`, the container went into a crash loop: `Error: invalid service state: Failed, expected: Terminated, failure: starting module provisioning: ... Datasource provisioning error: data source not found`.

**Root cause:** This Grafana instance had been running since earlier in the project (2026-08-02) and had already auto-provisioned a "Prometheus" datasource with a random uid (`PBFA97CFB590B2093`), persisted in its SQLite state inside the `grafana-data` Docker volume. Re-provisioning the *same-named* datasource with a *different, explicit* uid isn't a clean in-place rename — Grafana's provisioner tried to reconcile the two and something internally still referenced the old uid, crashing startup entirely.

**Fix:** Removed the local `grafana-data` Docker volume (`docker volume rm openscale_grafana-data`) and let `docker compose up -d grafana` reprovision from scratch. Safe here because nothing had ever been manually configured in this Grafana instance (no dashboards existed before this session — see Phase 11 v1). Anyone cloning this repo fresh (empty volume) will never hit this; it's only a hazard when changing a datasource's `uid` in provisioning YAML on top of an already-running Grafana.

**Lesson:** Treat a datasource's provisioned `uid` as fixed once anything (a dashboard, a running instance) depends on it — pin it explicitly from the start rather than adding it later.

---

## 15. `subprocess.Popen(["python", ...])` silently ran the wrong interpreter

**Symptom:** `benchmarks/run_benchmarks.py`'s compute stage (spawning Gold/Feature-Store/ML as subprocesses to time them) failed instantly (~1.0s, ~8MB RSS) for all three jobs: `ModuleNotFoundError: No module named 'pyspark'` / `'pandas'` / `'mlflow'`.

**Root cause:** The subprocess command was the literal string `["python", "spark/gold/run_gold.py"]`. Even though the benchmark script itself was running inside the activated venv (where `python` on the shell's `PATH` correctly resolves to the venv interpreter), a *child* process spawned via `subprocess.Popen` does its own independent `PATH` search on Windows and picked up a different, non-venv `python` — one without any of this project's dependencies installed.

**Fix:** Use `sys.executable` instead of the literal string `"python"` for every subprocess command — it's the absolute path to the exact interpreter currently running, guaranteed to be the venv one, with no `PATH`-search ambiguity.

**Lesson:** Never spawn `"python"` as a subprocess from inside a Python script that itself cares which interpreter runs — always use `sys.executable`.

---

## Summary table

| # | Issue | Category | Fixed? |
|---|---|---|---|
| 1 | Corrupted notebook | Data/file corruption | Yes |
| 2 | Deleted doc | Unexplained external change | Yes (restored) |
| 3 | MinIO port 9001 conflict | Windows port reservation | Yes |
| 4 | mlflow downgraded pandas | Unpinned dependency drift | Yes |
| 5 | MLflow file-store deprecated | Library version change | Yes |
| 6 | MLflow UI crash on Windows | Windows/uvicorn multiprocessing | Yes |
| 7 | Transient stale MinIO listing | Unreproduced, not a real bug | N/A |
| 8 | Pandas memory wall at 40 months | Architecture limit | Yes (→ Phase 5) |
| 9 | PySpark on Windows setup | Environment/JVM setup | Yes |
| 10 | Spark output shape vs. pandas | API/format mismatch | Yes |
| 11 | Stale server process | Process management | Yes |
| 12 | TLC schema drift 2009–2026 | Data constraint, not a bug | Scoped around |
| 13 | Structured Streaming port: broken `replay.py` call + invalid `orderBy` on streaming aggregate | Leftover migration gap + Structured Streaming semantics | Yes |
| 14 | Grafana crash after pinning an explicit datasource `uid` on already-provisioned state | Provisioning/state reconciliation | Yes (volume reset) |
| 15 | Benchmark subprocess used wrong (non-venv) Python interpreter | subprocess PATH resolution | Yes |
