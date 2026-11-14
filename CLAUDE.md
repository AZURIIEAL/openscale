# OpenScale — working notes for Claude Code

OpenScale is a local, project-based data platform ("Databricks, but local")
that is growing an AI assistant on top. The full plan lives in the Claude
doc "OpenScale implementation plan"; this file is the short version a fresh
session needs.

## Status (keep this section current)

| Phase | Status | Landed in |
| --- | --- | --- |
| 0 Safety net (CI, tests, sqlcheck, rules split) | done | PR #1 |
| 1 Projects (`/p/{slug}`, `/api/projects/{p}`) | done | PR #1 |
| 2 Datasets (upload / URL, fetch + ingest jobs) | done | PR #2 |
| 3 Query engine (DuckDB service, project SQL) | done | PR #2 |
| 4 Jobs, rules and pipelines as data; taxi → sample project | **in progress**: 4a–4c done; 4d next | 4a: `phase-4a-job-registry`; 4b: `phase-4b-generic-jobs`; 4c: `phase-4c-rules-as-data` |
| 5 Saved queries + dashboards; streaming passthrough | pending | — |
| 6 MCP server with read-only tools | pending | — |
| 7 Suggestions (heuristics, agent proposals, inbox) | pending | — |
| 8 In-app assistant (Agent SDK, approvals) | pending | — |
| 9 Auth and hardening | pending | — |

Milestone 1 ("upload a CSV and query it") is complete on `main`.

### Known follow-ups
- CSV type review (Phase 2's second slice) is not built: inferred types are used as-is.
- The query engine uses the shared MinIO root credentials; give it a read-only
  user (Phase 9).
- Image tags: only Kafka and Prometheus are pinned in `docker-compose.yml`.
- The taxi Silver rules live in `worker/spark/silver/silver_rules.json` until 4e moves them onto
  the sample project's Bronze dataset (the taxi Bronze isn't a `datasets` row yet).
- Rules can read run variables via `getvariable('name')`; only the taxi Silver job sets any
  (`period_year`, `period_month`). The editor's Test runs without them, so such rules show 0 hits there.
- The taxi `train` job is now `fare_model` (migration 0008 renamed its run history);
  Dashboards' model-quality queries read `fare_model` until Phase 5 replaces them.
- `replay` spends about 85 s in Spark loading all of Silver before its first send. A
  cancel during that load waits out the runner's 5 s grace and is then terminated, which
  is fine, but it makes the Streaming screen slow to start. Phase 5 replaces it.

## Layout

```
control-plane/   Go API. internal/{projects,datasets,jobs,sqlcheck,health} are pure + tested;
                 internal/db talks pgx; internal/api is chi handlers; db/migrations are numbered SQL.
worker/          Python job runner (Redis stream). Each jobs/*.py registers @job functions
                 (registry.py: schema, JobContext, the one status wrapper); runner.py runs every
                 run in its own `python -m job_child` process so cancel stops just that job.
                 Pure logic in spark/silver/rules.py, datasets/, jobs/outcome.py. tests/ run
                 with pandas only (test_runner starts real child processes; Linux/macOS).
query-engine/    FastAPI + DuckDB. query_engine/session.py is the sandbox; tests need duckdb.
libs/openscale/  Shared Python: lake paths, DuckDB connect/lockdown, readers, url_check, ingest.
gateway/         Caddy for deployments (docker-compose.deploy.yml): built frontend + every UI on one origin.
frontend/        React + Vite. domains/<name>/{domain,application,infrastructure,ui};
                 shared/project/ owns the current project; shared/layout/navigation.ts is the nav source of truth.
```

## Rules every change follows
- **Project first.** New tables carry `project_id`; new routes sit under `/api/projects/{projectId}`
  (`ProjectsHandler.Middleware` resolves id *or* slug); lake paths start with `projects/{id}/`.
- **Rows, not code.** Rules, transforms, charts and pipelines are data. A new Go struct or Python
  module per user artefact means it is not generic yet.
- **Browser → control-plane only.** `query-engine` and the future `assistant` have no host port.
- **Same origin, no `localhost`.** The browser uses paths on the page's own origin (`/api`, `/mlflow/`,
  `/jupyter/`, `/grafana/`, `/prometheus/`); `frontend/vite.config.ts` and `gateway/Caddyfile` route them.
  A new UI-facing service gets a route in both.
- **Agent reads freely, proposes writes.** Anything destructive waits for a person.
- **Taxi keeps working until Phase 4 replaces it.** It is the `nyc-taxi` project with the
  `legacy_taxi` feature flag; `RequireFeature` gates its screens.
- **Tests with every phase.** Pure logic goes in dependency-free packages so it is testable.

## Commands
```bash
docker compose up -d --build                      # whole stack; migrations run on control-plane start
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build   # deployed: gateway on :80, needs .env
cd control-plane && go vet ./... && go test ./...
cd worker && pip install -e ../libs/openscale && python -m pytest
cd libs/openscale && python -m pytest ; cd ../../query-engine && python -m pytest
cd frontend && npm install && npm run lint && npx tsc -b && npm test
docker compose run --rm --no-deps --entrypoint python -v ./etl-exposure:/etl-exposure:ro worker scripts/golden_check.py --all   # taxi rules vs original reports
```

## Phase 4 — where to start
Slices, in order (each a PR): ~~**4a** job registry~~ (done: `@job` in `worker/registry.py`,
`job_definitions` + `GET /api/jobs/catalog`, params validated in `internal/jobs/definitions.go`,
`RunJobForm` generated from `paramsSchema`, one child process per run) → ~~**4b**~~ generic
`validate` / `sql_transform` / `train` job types (done: rule engine in `libs/openscale/rules.py`,
derived datasets with lineage in `source`, `requires_feature` on jobs) → ~~**4c**~~ rules as data (done:
`PUT`/`POST .../datasets/{name}/rules[/test]`, the dataset page's Rules tab, the taxi Silver job runs
`silver_rules.json` through the shared engine, golden check 13/13 months) → **4d** `pipelines` / `pipeline_runs` tables and a
server-side orchestrator that reconciles from Postgres → **4e** `samples/nyc_taxi/project.json`,
import/export, delete the taxi code and the `legacy_taxi` flag.

## Conventions
- Commit messages: imperative subject, body says *why*; one PR per slice; squash-merge.
- Go: `gofmt`; errors wrap sentinels (`db.ErrNotFound`, `projects.ErrInvalid`) and handlers map
  them to statuses in one `write*Err` helper per domain.
- Python: pure functions take a connection/session as a parameter; jobs return
  `(status, error, log_lines, rows_processed, metrics)`.
- TypeScript: gateways take `projectSlug` first; TanStack keys carry it second.
