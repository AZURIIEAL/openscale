# OpenScale

![OpenScale Home screen](docs/screenshot-home.png)

A self-hosted, generic data-platform control console — the thing you'd reach
for instead of Databricks. One UI for pipelines, a SQL editor, a data
catalog, an ML workbench, streaming, dashboards, and the infrastructure
underneath all of it.

The repo currently holds two things:

- **The platform** (`frontend/` + `control-plane/`) — the generic console
  itself, in active development.
- **[`etl-exposure/`](etl-exposure/)** — a complete, working NYC Yellow
  Taxi lakehouse pipeline (Bronze/Silver/Gold, streaming, feature store, ML,
  API, Grafana dashboards), built first as a proof of what a real data
  platform needs. It's the platform's first target workload, not the
  platform — **treated as reference/legacy code**: nothing in `frontend/`
  or `control-plane/` imports from it.

See [`ideas/vision-and-roadmap.md`](ideas/vision-and-roadmap.md) for the
full product vision and phased roadmap, and
[`ideas/tech-stack.md`](ideas/tech-stack.md) for the reasoning behind every
technology choice below.

## Quickstart

**Prerequisites:** Docker Desktop, Node.js 20+, Go 1.26+ (only needed if
you want to run the control-plane outside Docker for hot-reload).

```bash
# Everything -- MinIO, Kafka, Postgres, Redis, Prometheus, Grafana, the
# Go control-plane, the Python worker, Jupyter, MLflow, and the frontend
# itself -- as one Docker Compose project.
docker compose up -d --build
```

Open **http://localhost:5173**. The console talks to the control-plane at
`http://localhost:8080` (override with `VITE_API_BASE_URL` if needed).

Prefer running the frontend on the host instead (native file-watching,
no polling)?

```bash
docker compose up -d --build
docker compose stop frontend   # stop just the containerized frontend
cd frontend && npm install && npm run dev
```

## Architecture

```
┌─────────────┐   HTTP (JSON) +  ┌──────────────────┐   Docker Engine API   ┌──────────────────────────┐
│  frontend   │   WebSocket      │   control-plane   │──────────────────────▶│  Docker daemon           │
│  React/Vite │ ───────────────▶ │   Go / chi        │                        │  (inspects every         │
│  :5173      │ ◀─────────────── │   :8080           │◀───────────────────────│   sibling container)     │
└─────────────┘                  └──────────────────┘   container state       └──────────────────────────┘
```

The frontend never talks to Postgres, Redis, Kafka, MinIO, or Docker
directly — every data source is fronted by the Go control-plane over a
versioned HTTP/WebSocket API. Each frontend domain reads through a
**gateway interface it owns** (mock or HTTP implementation swapped behind
one line, per domain).

The control-plane itself fronts four more backends, each isolated to its
own package (`internal/db`, `internal/redis`, `internal/streaming`,
`internal/lake`) so nothing outside that package touches the underlying
SDK directly:

```
control-plane ──dispatch──▶ Redis Stream ──consume──▶ worker (Python/PySpark)
                                                             │
                                    ┌────────────────────────┼────────────────────────┐
                                    ▼                         ▼                        ▼
                                Postgres                   MinIO                    Kafka
                             (writes Gold +          (Bronze/Silver/Gold        (replay job
                              feature tables)          Parquet, via Spark)     produces trips)

worker ──live status/log──▶ Redis pub/sub ──relay──▶ control-plane's WebSocket hub ──▶ browser
control-plane ──tails──▶ Kafka topic ──▶ control-plane's WebSocket hub ──▶ browser (Streaming screen)
```

Long-running work (the five pipeline stages, plus a Kafka replay) is
dispatched onto a Redis Stream and executed by the Python worker — the
control-plane itself never runs a Spark job or blocks on one; it only
enqueues the request and relays whatever status/log/trip events come back.

## Repo layout

```
control-plane/     Go backend — cmd/server + internal/{api,db,docker,health,jobs,lake,redis,streaming,ws,config}
frontend/           React 19 + TypeScript + Vite console, one domain per screen (DDD-structured), Dockerized
worker/              Python job-queue worker — Spark ETL (Bronze/Silver/Gold/Features/Train) + Kafka replay producer
jupyter/              JupyterLab image (the Notebooks screen embeds this via iframe)
notebooks/            The 3 example notebooks JupyterLab opens (copied from etl-exposure/, not mounted from it)
etl-exposure/        The NYC taxi lakehouse pipeline -- reference/legacy, not a dependency
ideas/                 Vision, roadmap, and tech-stack decision docs
observability/          Prometheus scrape config + Grafana provisioning, owned by the root compose stack
docs/                    README assets (screenshots)
docker-compose.yml       The full stack, one "openscale" compose project -- frontend included
```

## What's actually built

Honesty over hype — every screen below is real (backed by an actual
control-plane endpoint or an embedded real service), not a mock or a
placeholder. Depth varies by screen; the caveats are the actual limits,
not modesty:

| Screen | What's real |
|---|---|
| Home | Live container memory/CPU gauges, real job history, real Gold-backed revenue trend and stat cards |
| Pipelines | Triggers the real job queue end to end (control-plane → Redis → worker → Postgres), live status/logs over WebSocket, run-all chaining, cancel |
| SQL Editor | Read-only `SELECT`/`WITH` against real Postgres tables (Gold + feature table + job history) inside an actual read-only transaction. **Postgres only** — Bronze/Silver Parquet on the lake isn't queryable here yet |
| Data Catalog | Real Postgres schema browser (row counts + sample rows via the SQL Editor's own query engine) *and* a live MinIO lake browser (real object counts/sizes across Bronze/Silver/quarantine/Gold). No column-level lineage, no Parquet content preview — a static diagram of the five real pipeline stages, not a computed graph |
| Streaming | A `replay` job streams real Silver-layer trips onto a real Kafka topic; the control-plane tails it and pushes live trip events + windowed aggregates over WebSocket. Pause/resume/cancel/×1–×10 speed control the in-flight replay live |
| Dashboards | Real Gold-layer charts — daily revenue, hourly demand, top zones, congestion, ETL health — chart style/theme fully re-skinnable |
| ML Workbench | An iframe embedding a real MLflow server, tracking the same store the worker's `train` job actually logs to |
| Notebooks | An iframe embedding a real JupyterLab, opened on 3 real example notebooks |
| Infrastructure | Real Docker container inspection + start/stop/restart |
| Settings | Real appearance/interface preferences (theme, accent, chart style, 12 interface skins), persisted to Postgres |
| Global search (⌘K) | Real, live-filtered search across screens, job types, Postgres tables, and recent runs — selecting a result navigates there with the specific thing (a table, a run) already loaded |
| System health (`GET /api/system-health`) | Real Docker container inspection across 9 watched services |

Generic connectors, a config-driven pipeline builder, and multi-user auth
are still just roadmap (`ideas/vision-and-roadmap.md`'s Phases 3+) — this
is a real console for *this* pipeline, not yet the generic platform the
roadmap describes.

## Tech stack

| Layer | Pick |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, TanStack Query, React Router v7, Zustand — Dockerized (polling file-watch for HMR through the bind mount) |
| Backend | Go, [chi](https://github.com/go-chi/chi) router, [pgx/v5](https://github.com/jackc/pgx) (Postgres), [go-redis/v9](https://github.com/redis/go-redis) (job dispatch + live event pub/sub), [segmentio/kafka-go](https://github.com/segmentio/kafka-go), [minio-go/v7](https://github.com/minio/minio-go) (lake browsing), [nhooyr.io/websocket](https://github.com/nhooyr/websocket), [docker/docker](https://pkg.go.dev/github.com/docker/docker/client) Engine API SDK, zerolog, caarlos0/env |
| Worker | Python, PySpark (Bronze→Silver→Gold→Features→Train), kafka-python (the Streaming replay producer), psycopg2, redis-py, MLflow client, scikit-learn |
| Infra (this stack) | MinIO, Kafka (KRaft, no Zookeeper), Postgres, Redis, Prometheus, Grafana, JupyterLab, MLflow — all Dockerized |
| Design system | Custom neomorphic/skeuomorphic component set (not a UI kit) — 12 selectable interface-style skins, dual soft-shadow tokens, light/dark themes, self-hosted fonts |

Full rationale for each pick, including what was considered and rejected
(Next.js, shadcn, Python for the control-plane), is in
[`ideas/tech-stack.md`](ideas/tech-stack.md).

## Development

### Control-plane (Go)

```bash
cd control-plane
go run ./cmd/server        # :8080, reads Docker via the platform default socket/pipe
go build ./...
go vet ./...
```

Config is env-driven (see `internal/config/config.go`) — defaults below
are the host-run values; `docker-compose.yml` overrides the connection
strings to in-network container names for the control-plane's own service:

| Var | Default (host-run) | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS-allowed origin + WebSocket upgrade origin check |
| `DOCKER_HOST` | *(SDK default)* | Override the Docker Engine API endpoint |
| `POSTGRES_DSN` | `postgres://openscale:openscale@localhost:5432/openscale?sslmode=disable` | Postgres connection string |
| `REDIS_ADDR` | `localhost:6379` | Job dispatch stream + live event pub/sub |
| `KAFKA_BROKER` | `localhost:29092` | Kafka's external listener (compose overrides to the in-network `kafka:9092`) |
| `MINIO_ENDPOINT` | `http://localhost:9000` | MinIO/S3 endpoint the Data Catalog's lake browser reads |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` / `minioadmin` | Local dev credentials only |

### Frontend (React)

```bash
cd frontend
npm run dev      # Vite dev server, :5173
npm run build    # tsc -b && vite build
npm run lint      # oxlint
```

`VITE_API_BASE_URL` (default `http://localhost:8080`) points the frontend
at the control-plane — read by the *browser* (Vite inlines `VITE_`-prefixed
vars into the served bundle), so this stays `localhost` even when the
frontend itself runs in its own container.

### Full stack via Docker

```bash
docker compose up -d --build   # everything, including the frontend
docker compose ps
docker compose logs -f control-plane
```

The compose project is named `openscale`; MinIO, Kafka, Postgres, Redis,
Prometheus, Grafana, Jupyter, MLflow, the Go control-plane, the Python
worker, and the frontend all run under it as one stack.
`etl-exposure/docker-compose.yml` still exists but is superseded — don't
run both at once, they define containers with the same names.

## Design principles this codebase follows

- **Domain-Driven Design** — each frontend screen is a self-contained
  domain (`domain/`, `application/`, `infrastructure/`, `ui/`); the Go
  backend separates transport (`internal/api`) from the Docker adapter
  (`internal/docker`) from pure domain types (`internal/health`).
- **Dependency inversion** — frontend hooks depend on gateway *interfaces*
  they own, never on a concrete HTTP client; swapping mock → real is a
  one-line change per domain.
- **One package per external system, on the backend** — `internal/redis`,
  `internal/docker`, `internal/streaming` (Kafka), and `internal/lake`
  (MinIO) are each the *only* file importing that system's SDK; nothing
  outside them touches go-redis, the Docker client, kafka-go, or minio-go
  directly.
- **No fake data in real screens, no fake controls on real data** — a
  screen either has a real backend behind it, or it says so.
- **`etl-exposure/` is read-only history** — copy logic out of it if a
  platform feature needs it; never import from it.
