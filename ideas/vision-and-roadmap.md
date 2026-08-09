# OpenScale — vision, UI, features, stack, and phased roadmap

The pivot: OpenScale stops being "a UI for the NYC taxi pipeline" and
becomes a **generic, self-hosted data platform** — the thing you'd reach
for instead of Databricks, usable on *any* dataset, with a UI good enough
that "great UI" is a real selling point, not an afterthought.

`etl-exposure/` (the taxi pipeline) becomes the **first proof case**
running on top of the platform, not the platform itself.

---

## 1. What it looks like

**Navigation** — a left sidebar, skeuomorphic control-console styling,
one primary screen per concern:

1. **Home** — cluster/pipeline health at a glance: running jobs, recent
   run history, storage used, active alerts. The "walk up and see if
   everything's OK" screen.
2. **Data (Catalog)** — browse every registered table across every
   layer/dataset, schema viewer, sample-data preview, lineage graph.
3. **Pipelines** — DAG view of defined pipelines, run/trigger, history,
   live logs per run.
4. **SQL Editor** — DuckDB-backed query editor against any table, saved
   queries, results grid with "chart this" one click.
5. **Notebooks** — embedded/linked notebook environment for exploration.
6. **ML** — experiment tracking (MLflow-backed), model registry, feature
   store browser, one-click serving.
7. **Streaming** — live Kafka topic view, consumer lag, Structured
   Streaming query status, replay tool.
8. **Dashboards** — build custom charts/dashboards from any table or
   query, alerting rules.
9. **Infrastructure** — Docker service health, start/stop/restart,
   resource usage history (CPU/mem per job over time — the "flight
   recorder" idea from the brainstorm).
10. **Connections & Settings** — register data sources, manage
    credentials, theme.

**Visual language:**
- **Neomorphic** primary surfaces — soft dual-shadow cards/panels, low
  contrast, background-matched, monochrome base + one accent color.
- **Skeuomorphic** control elements specifically for *actions* — job
  triggers look like physical toggle switches, resource meters are real
  gauges/dials (not flat progress bars), service health is literal
  LED-style status lights (green/amber/red).
- **Command palette** (`Cmd+K`) for fast navigation/actions — expected in
  any tool that wants to feel "great," not just functional.
- Real-time panels everywhere feasible — job progress, live log tails,
  streaming counters — driven by WebSocket, not polling-and-hope.
- High-contrast override on anything destructive (stop pipeline, delete
  table) — neomorphism's low contrast is a real accessibility risk, noted
  in `tech-stack.md`, and this is where that risk actually bites.

The design system gets established in Phase 0 and extended every phase
after — it can't be bolted on at the end.

---

## 2. Features (as a generic platform, not taxi-specific)

- **Bring-your-own-data connectors** — file upload, S3/MinIO bucket,
  database connection, generic HTTP puller (generalizes the TLC
  downloader's pattern into a configurable "source").
- **Generic data-quality rule engine** — a UI rule builder (column,
  condition, action: reject/quarantine/flag) that replaces today's
  hardcoded pandas boolean masks in `spark/silver/validator.py` — same
  reject/quarantine/flag tiers, but user-defined per dataset.
- **Multi-engine compute, chosen per job** — pandas/DuckDB/Polars/Spark,
  selectable in the UI. Directly productizes the "pluggable-engine
  benchmarking" idea from the brainstorm — genuinely hard for Databricks
  to offer, since they sell you one engine.
- **Generic pipeline builder** — DAG-based, config/metadata-driven
  (pipeline definitions live in Postgres as data, not as hardcoded
  scripts like `run_gold.py` today).
- **Data catalog & lineage** — auto-discovered tables, column-level
  lineage across pipeline stages.
- **Scheduling** — cron-like and event-driven triggers, dependency graphs
  between jobs.
- **Generic streaming** — any Kafka topic to any table, not just taxi
  replay; Structured Streaming job builder in the UI.
- **Feature store** — generic key/tabular feature registration (not
  hardcoded to zone×hour), synced to Postgres (offline) + Redis (online).
- **ML workbench** — generic training-job templates, MLflow experiment
  tracking, one-click model → serving endpoint.
- **Dashboards & alerting** — native charting from any table/query,
  custom dashboard builder, threshold alerting — reduces reliance on
  hand-built Grafana JSON per use case.
- **Time-travel UI** — if/when Delta Lake lands, a real version-diff view
  per table (from the brainstorm's "cool features" list).
- **Multi-user workspaces + auth** — deliberately *late*, once there's
  more than one person's data to isolate — consistent with the
  "don't build what isn't needed yet" instinct already established in
  this project.

---

## 3. Tech stack (refined for "generic," not new)

The stack decided in `tech-stack.md` was already generic — nothing in it
was taxi-specific — so it carries forward. What genericism actually
demands, concretely:

- **Pipeline definitions as data, not scripts.** A `pipelines` /
  `pipeline_steps` schema in Postgres (DAG of steps, each step referencing
  a registered transform + engine choice), so the control-plane can run
  *any* pipeline, not just the four hardcoded Gold jobs.
- **Rules as data, not code.** A `quality_rules` table (dataset, column,
  condition, action) that a generic rule-engine executes — replaces the
  hardcoded SLV-001..010 boolean masks with the *same tiered model*,
  user-configurable.
- **A connector abstraction** — a `sources` table + a small plugin
  interface (file / S3 / DB / HTTP), so `ingestion/downloader/downloader.py`
  becomes one implementation of a `Source` interface, not the only one.

Everything else — React/TS/Vite, shadcn/Tailwind neomorphic tokens,
ECharts, TanStack Query, Go control-plane (chi/pgx+sqlc/go-redis/Docker
SDK), Python workers behind Redis Streams, Postgres for control-plane
state, DuckDB for ad-hoc queries — stands as already decided.

---

## 4. Phased implementation plan

**Phase 0 — Foundation**
Go control-plane skeleton (chi, health endpoint), React+Vite+shadcn
scaffold with the neomorphic design tokens established, Postgres
control-plane schema, docker-compose entries for the new services.
Goal: full stack runs end to end, no real features yet — navigation shell
with placeholder screens.

**Phase 1 — Observe the existing pipeline (read-only)**
Control-plane reads what already exists in `etl-exposure/`: lists
Bronze/Silver/Gold tables from MinIO, embeds/proxies Grafana panels, SQL
Editor via DuckDB against existing tables.
Goal: the UI can *see* the real, already-working pipeline.

**Phase 2 — Control the existing pipeline (write path)**
Redis Streams job queue + Python worker wrapping the existing scripts
unchanged (`run_ingestion.py`, `run_gold.py`, etc.). UI triggers jobs,
watches live status/logs over WebSocket, job history in Postgres.
Goal: the UI can *control*, not just observe.

**Phase 3 — Generalize: bring your own data**
Connector abstraction (file/S3/DB/HTTP), generic rule-builder UI backed
by the `quality_rules` table. A user can register a dataset that isn't
NYC taxi data and run it through Bronze→Silver→Gold.
Goal: stops being "a UI for the taxi project."

**Phase 4 — Generic pipeline builder**
DAG-based pipeline definitions, multi-engine choice per job, scheduling.
Goal: arbitrary pipelines, not just the fixed four-stage shape.

**Phase 5 — ML workbench**
Generic training templates, embedded MLflow, feature-store browser,
one-click model serving.
Goal: ML workflow usable for arbitrary tabular problems.

**Phase 6 — Streaming generalization**
Generic topic→table streaming config, Structured Streaming job builder.
Goal: streaming becomes a first-class generic capability.

**Phase 7 — Dashboards & alerting**
Native charting from any table/query, custom dashboard builder,
threshold-based alerting.
Goal: less dependence on hand-written Grafana JSON.

**Phase 8 — Catalog & lineage**
Auto-discovered catalog, column-level lineage, time-travel UI (pending
Delta Lake adoption).
Goal: real governance/discoverability layer.

**Phase 9 — Multi-user & auth**
Real auth, workspaces/projects, basic RBAC — deliberately this late.
Goal: safe for more than one person.

**Phase 10 — The differentiators**
Command palette, LLM-powered anomaly explainer, automated schema-drift
detection, full pipeline flight-recorder history — the "cool, genuinely
new" features from `brainstorm.md` that no Databricks-clone effort would
bother with, because they're not about parity, they're about being
better in ways a vendor selling compute has no incentive to build.

---

## Honest note on scope

This is a multi-year plan compressed into ten phases, not a sprint list.
`etl-exposure/` is real, proven, and worth building on top of — but
everything in this document is design, not code, as of today. Treat each
phase as a checkpoint to re-scope from, not a commitment made in advance.
