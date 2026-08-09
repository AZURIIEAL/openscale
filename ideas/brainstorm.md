# OpenScale as an open-source, friendlier Databricks — brainstorm

Not a roadmap yet, not committed to. A capture of a strategic brainstorm on
whether/how OpenScale grows from "a portfolio lakehouse project" into "an
open-source, more approachable alternative to Databricks."

---

## 1. Databricks capability → open-source path for OpenScale

| Databricks feature | Open-source equivalent | Feasibility |
|---|---|---|
| Delta Lake | **Delta Lake OSS** (Linux Foundation project — Python/Spark bindings exist) — swap raw Parquet writes for Delta format on MinIO | High — mostly a rewrite of existing `write.parquet()` calls |
| Unity Catalog | Databricks open-sourced **Unity Catalog Core** in 2024; alternative: **OpenMetadata**/**DataHub** for lineage+governance | Medium — real infra project, not a weekend add |
| Delta Live Tables | Build a thin declarative layer on top of Spark, or adopt **dbt** for the SQL/transform layer | Medium |
| Auto Loader | S3 event notifications from MinIO, or directory-diffing on a schedule | Low-medium |
| Workflows/Jobs | **Apache Airflow** or **Dagster** — directly closes the "no orchestrator" gap already flagged in the implementation plan | High — natural next phase |
| Autoscaling clusters | Spark-on-**Kubernetes** | Hard, arguably out of scope for a laptop-first project |
| Serverless SQL | **DuckDB** or **Trino** directly on the lake — fast, embeddable, zero cluster | High, and genuinely cool |
| Photon | No real OSS equivalent — DuckDB/Polars get ~80% of the "fast local query" feeling | N/A, reposition instead of clone |
| Databricks SQL / dashboards | **Metabase** or **Apache Superset** on top of Gold/Trino | High — excellent fit |
| Notebooks | **JupyterLab** (already in use) | Already have this |
| MLflow, Feature Store | Already real in OpenScale (Phase 8/9) | Done |
| AutoML | **FLAML**, **AutoGluon**, or **PyCaret** | Medium |
| Model Serving | Formalize what already exists: MLflow registry → auto-deployed FastAPI endpoint | High |
| Structured Streaming | Already real (Phase 7 v2) | Done |
| Vector Search / GenAI stack | **pgvector** (Postgres is already running!) or Qdrant, + **Ollama** for local embeddings/RAG | High, and topical |
| Delta Sharing | The protocol itself is open source (Linux Foundation) — could implement a real Delta Sharing server | Medium |
| Marketplace | Low value for a single-org OSS project | Probably skip |
| RBAC/secrets/audit | Keycloak (auth), Vault (secrets), structured logging (audit) | Lower priority |

Realistically, "include all of these" is a multi-year platform, not a repo —
this table is a menu to prioritize from, not a checklist to clear.

---

## 2. Where OpenScale can genuinely beat Databricks

- **Zero-cost, laptop-first.** Databricks requires cloud infra and DBU
  billing before you write a line of code. OpenScale runs entirely on
  `docker compose up` — no account, no cloud spend. Huge for students,
  interviews, small teams evaluating the pattern before paying for the real
  thing.
- **Total transparency, no black boxes.** Every job is a readable
  Python/Spark script, not a proprietary DLT compiler or Photon binary. You
  can read your way through the entire platform.
- **Radical honesty as a feature.** `docs/issues-and-fixes.md` and the
  "Known issues" sections are already unusual — most vendors (and most OSS
  projects) hide what's broken or stubbed. Leaning into that as a design
  principle builds real trust, especially for a portfolio/learning audience.
- **Multi-engine by design, not lock-in.** Databricks sells you Spark (and
  Photon). Nothing stops OpenScale from letting a job run on
  pandas/DuckDB/Polars/Spark and comparing — no incentive to lock people
  into one runtime, since nobody's selling compute.
- **Actually simple onboarding.** Databricks' pricing model and cluster
  policies are notoriously confusing. One `docker compose up` + one
  ingestion command getting you a working Bronze→Gold pipeline is a real,
  demonstrable UX win.

---

## 3. Cool, genuinely new features (not just cloning Databricks)

- **Pluggable-engine benchmarking mode.** Flip a config flag and run the
  *same* job on pandas/DuckDB/Polars/Spark, get a side-by-side report.
  Databricks can't offer this (only one engine to sell). Dovetails directly
  with the Phase 12 benchmarking work already underway.
- **Pipeline "flight recorder."** Since everything's local, log real
  CPU/memory/duration per run over time and chart trends — "did Silver
  validation get slower as the data grew?" No cloud vendor gives this level
  of raw visibility into their own managed compute.
- **Time-travel diff UI.** Delta Lake gives native table versioning for
  free — build a small UI that diffs two versions of a Gold table (row
  counts changed, values changed) instead of just "you can query old
  snapshots."
- **Automated schema-drift detector.** TLC's real schema drift was already
  hit and manually solved (issue #12) — generalize into a feature that
  flags a schema change on ingest automatically, rather than something a
  human has to discover by binary-searching months.
- **LLM-powered anomaly explainer.** When a Silver quality report shows a
  spike (like the real March–Nov 2025 anomaly found in this dataset), have
  a local LLM (via Ollama, no API cost) read the report + surrounding
  context and draft a plain-English hypothesis.
- **General-purpose "replay any period" time machine.** Single-day Kafka
  replay already exists — extend it to replay *any* historical range at
  *any* speed, framed as a demo/interview storytelling tool, not just a
  testing utility.

---

## 4. UI vision and tech stack

Alongside the capability/differentiation brainstorm above, a parallel
thread: giving OpenScale a real neomorphic/skeuomorphic control-panel UI —
one surface to trigger jobs, watch pipeline/streaming status live, browse
Gold analytics, and generally "control everything" the way Databricks'
workspace does, but with OpenScale's own honest, transparent, laptop-first
character.

Full stack decisions (frontend, the Go-vs-Python backend split, job queue
design, DB layout, and the "why not Next.js" call) are recorded separately
in [`tech-stack.md`](tech-stack.md) — summary:

- **Frontend:** React + TypeScript + Vite, shadcn/ui + Tailwind (custom
  neomorphic shadow tokens), ECharts, TanStack Query, WebSockets for live
  updates.
- **Backend split:** existing Python pipeline stays exactly as-is and runs
  as a worker process; a new **Go** control-plane API owns the UI-facing
  backend (job triggering, Docker/service orchestration, WebSocket push) —
  chosen for single-binary deploy (sidesteps the dependency-drift bugs
  already logged in `docs/issues-and-fixes.md`) and thematic fit with the
  infra tools (Docker/K8s/Prometheus) OpenScale orchestrates.
- **Go ↔ Python boundary:** Redis Streams as a language-agnostic job
  queue; Postgres as the durable system of record for job history.
- **Next.js** was considered and deliberately rejected for the
  control-plane app itself (no SSR/SEO need for a local tool, would add a
  third runtime) — kept in reserve only for a possible future public
  marketing/docs site, a separate project from the app.

## Open question

Given the scope above, the project probably shouldn't try to build all of
this at once. Next step: turn this into a prioritized roadmap (next 3
things / interesting but later / probably skip) rather than an open-ended
wishlist.
