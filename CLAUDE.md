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
| 4 Jobs, rules and pipelines as data; taxi → sample project | **next** | — |
| 5 Saved queries + dashboards; streaming passthrough | pending | — |
| 6 MCP server with read-only tools | pending | — |
| 7 Suggestions (heuristics, agent proposals, inbox) | pending | — |
| 8 In-app assistant (Agent SDK, approvals) | pending | — |
| 9 Auth and hardening | pending | — |

Milestone 1 ("upload a CSV and query it") is complete on `main`.

### Known follow-ups
- `frontend/package-lock.json` predates vitest. Run `cd frontend && npm install`,
  commit the lockfile, then switch CI back to `npm ci` (`.github/workflows/ci.yml`).
- CSV type review (Phase 2's second slice) is not built: inferred types are used as-is.
- The query engine uses the shared MinIO root credentials; give it a read-only
  user (Phase 9).
- Image tags: only Kafka and Prometheus are pinned in `docker-compose.yml`.

## Layout

```
control-plane/   Go API. internal/{projects,datasets,jobs,sqlcheck,health} are pure + tested;
                 internal/db talks pgx; internal/api is chi handlers; db/migrations are numbered SQL.
worker/          Python job runner (Redis stream). jobs/*.py are thin wrappers; pure logic in
                 spark/silver/rules.py, datasets/, jobs/outcome.py. tests/ run with pandas only.
query-engine/    FastAPI + DuckDB. query_engine/session.py is the sandbox; tests need duckdb.
libs/openscale/  Shared Python: lake paths, DuckDB connect/lockdown, readers, url_check, ingest.
frontend/        React + Vite. domains/<name>/{domain,application,infrastructure,ui};
                 shared/project/ owns the current project; shared/layout/navigation.ts is the nav source of truth.
```

## Rules every change follows
- **Project first.** New tables carry `project_id`; new routes sit under `/api/projects/{projectId}`
  (`ProjectsHandler.Middleware` resolves id *or* slug); lake paths start with `projects/{id}/`.
- **Rows, not code.** Rules, transforms, charts and pipelines are data. A new Go struct or Python
  module per user artefact means it is not generic yet.
- **Browser → control-plane only.** `query-engine` and the future `assistant` have no host port.
- **Agent reads freely, proposes writes.** Anything destructive waits for a person.
- **Taxi keeps working until Phase 4 replaces it.** It is the `nyc-taxi` project with the
  `legacy_taxi` feature flag; `RequireFeature` gates its screens.
- **Tests with every phase.** Pure logic goes in dependency-free packages so it is testable.

## Commands
```bash
docker compose up -d --build                      # whole stack; migrations run on control-plane start
cd control-plane && go vet ./... && go test ./...
cd worker && pip install -e ../libs/openscale && python -m pytest
cd libs/openscale && python -m pytest ; cd ../../query-engine && python -m pytest
cd frontend && npm install && npm run lint && npx tsc -b && npm test
cd worker && python scripts/golden_check.py 2024-07   # Silver rules vs stored quality reports
```

## Phase 4 — where to start
Slices, in order (each a PR): **4a** job registry (`@job` decorator in the worker, `job_definitions`
table, generated `RunJobForm`, one subprocess per run so cancel kills the job) → **4b** generic
`validate` / `sql_transform` / `train` job types → **4c** rules as JSON on `datasets.rules` with
the golden check passing on the ten taxi rules → **4d** `pipelines` / `pipeline_runs` tables and a
server-side orchestrator that reconciles from Postgres → **4e** `samples/nyc_taxi/project.json`,
import/export, delete the taxi code and the `legacy_taxi` flag.

## Conventions
- Commit messages: imperative subject, body says *why*; one PR per slice; squash-merge.
- Go: `gofmt`; errors wrap sentinels (`db.ErrNotFound`, `projects.ErrInvalid`) and handlers map
  them to statuses in one `write*Err` helper per domain.
- Python: pure functions take a connection/session as a parameter; jobs return
  `(status, error, log_lines, rows_processed, metrics)`.
- TypeScript: gateways take `projectSlug` first; TanStack keys carry it second.
