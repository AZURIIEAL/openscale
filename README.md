# OpenScale

![OpenScale Home screen](docs/screenshot-home.png)

A self-hosted data-platform console, the thing you'd reach for instead of
Databricks. One UI covers pipelines, a SQL editor, a data catalog,
streaming, dashboards, an ML workbench, notebooks, and the infrastructure
underneath them. All of it runs from one `docker compose up`.

Today it runs one real workload end to end: an NYC Yellow Taxi lakehouse
(Bronze → Silver → Gold → Features → Model) on Spark, MinIO, Postgres,
Redis and Kafka. The generic platform, meaning bring-your-own data,
connectors and a pipeline builder, is on the
[roadmap](ideas/vision-and-roadmap.md).

---

## Contents

- [Quickstart](#quickstart)
- [First run: load some data](#first-run-load-some-data)
- [Services, ports and logins](#services-ports-and-logins)
- [What's built](#whats-built)
- [Architecture](#architecture)
- [Observability](#observability)
- [Repo layout](#repo-layout)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Deploying](#deploying)
- [Security](#security)
- [Design principles](#design-principles)

---

## Quickstart

**Prerequisites:** Docker with Compose v2+ and about **8 GB of free RAM**.
The stack idles at about 4 GB, and Spark jobs need more. Node.js 20+ and
Go 1.26+ are only needed if you want to run the frontend or control-plane
outside Docker.

```bash
git clone https://github.com/AZURIIEAL/openscale.git
cd openscale
docker compose up -d --build
```

The first build takes a few minutes, mostly the Spark worker image. Then:

```bash
docker compose ps                     # every service should be running
docker compose logs -f control-plane  # wait for "control-plane listening"
```

Open **http://localhost:5173**. You land in the **NYC Taxi** sample
project; the project switcher in the top bar creates and switches
projects (every project screen is `/p/{slug}/...`).

> If the build fails with `pip`/`npm`/`go` timeouts or DNS errors, your
> network doesn't get along with Docker's build network. Run
> `scripts/build-images.sh` then `docker compose up -d` instead. See
> [Troubleshooting](#troubleshooting).

To stop it:

```bash
docker compose down      # stop, keep all data
docker compose down -v   # stop and delete every volume (Postgres, MinIO, Redis, Grafana, Prometheus)
```

## First run: load some data

A fresh stack starts with an empty lake, so Home, Dashboards and the SQL
Editor have nothing to show yet. Open **Pipelines** and run the stages in
order, or use **Run All**, which chains them:

| # | Stage | What it does | Needs |
|---|---|---|---|
| 1 | **Ingest (Bronze)** | Downloads NYC TLC Parquet for a month range, validates the schema, writes to MinIO | A month range, e.g. `2024-07` → `2024-12`; internet access |
| 2 | **Validate (Silver)** | Rejects, quarantines or flags bad rows, writes clean trips | Bronze |
| 3 | **Aggregate (Gold)** | Daily revenue, hourly demand, zone stats and congestion, in MinIO and Postgres | Silver |
| 4 | **Compute Features** | Zone × hour features, to Postgres (offline) and Redis (online) | Silver |
| 5 | **Train Fare Model** | Trains a fare-prediction model and logs it to MLflow | Silver |

Each run streams its status and logs live. After Gold, the Home and
Dashboards screens fill in. After Silver, **Streaming → Replay** can push
real trips through Kafka.

To start over, **Pipelines → Clear data (Postgres + MinIO)** wipes Bronze, Silver and Gold
and the Gold/feature tables, but keeps job history.

## Services, ports and logins

The credentials are **local development defaults**. To let other people
use OpenScale, see [Deploying](#deploying), not these ports.

| Service | URL / address | Login |
|---|---|---|
| **OpenScale console** | http://localhost:5173 | none |
| Control-plane API | http://localhost:8080 (`/healthz`, `/metrics`, `/api/*`) | none |
| Grafana | http://localhost:3000/grafana/ | `admin` / `admin`; anonymous users can view |
| Prometheus | http://localhost:9090/prometheus/ | none |
| MinIO console | http://localhost:9101 | `minioadmin` / `minioadmin` |
| MinIO S3 API | http://localhost:9000 | same |
| JupyterLab | http://localhost:8888/jupyter/lab?token=openscale-dev | token `openscale-dev` |
| MLflow | http://localhost:5000 | none |
| Postgres | `localhost:5432`, db `openscale` | `openscale` / `openscale` |
| Redis | `localhost:6379` | none |
| Kafka | `localhost:29092` (in-network: `kafka:9092`) | none |

The Postgres, Redis and Kafka exporters have no host ports. Only
Prometheus reads them.

The console's dev server also proxies `/api`, `/mlflow/`, `/jupyter/`,
`/grafana/` and `/prometheus/` to those services, so the browser only ever
needs port 5173. That's what lets another machine on your network use
OpenScale at `http://<this machine's IP>:5173`, embedded tools and console
links included.

## What's built

Every screen below is backed by a real control-plane endpoint or an
embedded real service, not mock data. The caveats are the real limits.

| Screen | What's real | Limits |
|---|---|---|
| **Home** | Live container CPU/memory gauges, job history, Gold-backed revenue trend and stat cards | |
| **Pipelines** | Triggers the real job queue end to end (control-plane → Redis → worker → Postgres), live status and logs over WebSocket, run forms generated from the job catalog, run-all chaining, Stop all (stops just the jobs' processes, not the worker), clear data | Run All is the fixed taxi chain; pipelines as data come in Phase 4d. No rules editor yet (Phase 4c) |
| **SQL Editor** | Read-only `SELECT`/`WITH` against Postgres (Gold tables, feature table, job history) inside a read-only transaction, schema browser, query history | Postgres only; Bronze/Silver Parquet in the lake isn't queryable yet |
| **Data Catalog** | Postgres schema browser (row counts and sample rows) and a live MinIO lake browser (object counts and sizes per layer) | Lineage is a static diagram of the five stages, not computed; no Parquet preview |
| **Streaming** | `replay` streams real Silver trips onto Kafka; the control-plane tails the topic and pushes live trips and windowed aggregates over WebSocket. Pause, resume, cancel and ×1–×10 speed act on the running replay | One topic, `yellow-taxi-trips` |
| **Dashboards** | Gold-layer charts: daily revenue, hourly demand, top zones, congestion, ETL health. Chart style and theme can be re-skinned | Fixed set of charts, no custom builder |
| **ML Workbench** | Embedded MLflow, tracking the same store the `train` and `fare_model` jobs log to | |
| **Notebooks** | Embedded JupyterLab, opened on three example notebooks | |
| **Infrastructure** | Docker inspection of nine services, with start/stop/restart | |
| **Settings** | Theme, accent, chart style and 12 interface skins, saved to Postgres | |
| **Search (⌘K / Ctrl+K)** | Live search across screens, job types, Postgres tables and recent runs; picking a result opens that item directly | |

| **Projects** | Create, switch and archive projects; job history is per project; `/` remembers the last one | Pipelines, Dashboards and Streaming are still the taxi stages, so they only light up in the `nyc-taxi` sample |
| **Datasets** | Upload a CSV/TSV/Parquet/JSON file (streamed to the lake) or give a URL; the worker converts it to Parquet, infers the schema and profiles every column | One Parquet part per dataset; CSV types are inferred, not reviewable yet |
| **SQL over the lake** | The SQL Editor runs DuckDB over a project's datasets (each a view named after it) through the internal `query-engine` service, with the S3 secret scoped to the project, local files disabled and a per-query timeout | The taxi sample still queries Postgres |

**Not built yet:** generic job registry and rules-as-data (the taxi stages
are still code), saved queries and dashboards for any project, scheduling,
the assistant, and auth. See [`ideas/vision-and-roadmap.md`](ideas/vision-and-roadmap.md).

## Architecture

```
┌──────────────┐  HTTP + WebSocket  ┌────────────────────┐  Docker Engine API  ┌──────────────────┐
│   frontend   │ ─────────────────▶ │   control-plane    │ ──────────────────▶ │  Docker daemon   │
│ React · Vite │ ◀───────────────── │   Go · chi · :8080 │                     │ (sibling         │
│    :5173     │                    │                    │                     │  containers)     │
└──────────────┘                    └─────────┬──────────┘                     └──────────────────┘
                                              │ Postgres · Redis · Kafka · MinIO
                                              ▼
```

**The browser only talks to the control-plane.** The frontend never
reaches Postgres, Redis, Kafka, MinIO or Docker directly. Every data source
sits behind the Go control-plane's HTTP/WebSocket API. Inside the
control-plane, each backend has its own package (`internal/db`,
`internal/redis`, `internal/streaming`, `internal/lake`, `internal/docker`),
and no other package imports that backend's SDK.

**Long-running work goes through a queue.** The control-plane never runs
Spark itself. It records the run and enqueues it:

```
POST /api/projects/{p}/jobs/{type}/run
  └─▶ control-plane: INSERT job_runs (queued, project_id) ─▶ XADD openscale:jobs:requests
                                                        │
                          worker (Python/PySpark) ◀─────┘ XREADGROUP
                            ├─ writes Bronze/Silver/Gold Parquet ─▶ MinIO
                            ├─ writes Gold + feature tables ─────▶ Postgres
                            ├─ replay job produces trips ────────▶ Kafka
                            ├─ final status + full log ──────────▶ Postgres job_runs (system of record)
                            └─ live status/log events ───────────▶ Redis pub/sub openscale:jobs:events
                                                                        │
            browser ◀── WebSocket /api/ws/jobs/{id} ◀── control-plane hub ◀┘

Kafka yellow-taxi-trips ─▶ control-plane consumer ─▶ windowed aggregates ─▶ WebSocket /api/streaming/ws
```

The details live in the component READMEs:
[control-plane](control-plane/README.md) · [worker](worker/README.md) ·
[frontend](frontend/README.md).

## Observability

Prometheus scrapes every part of the stack every 15s, and Grafana comes
provisioned with the datasource and two dashboards in an **OpenScale**
folder.

| Prometheus job | Source | Main metrics |
|---|---|---|
| `control-plane` | `control-plane:8080/metrics` | `openscale_http_requests_total`, `openscale_http_request_duration_seconds` (per chi route pattern), `openscale_job_runs{job_type,status}` (read from Postgres at scrape time), Go runtime |
| `postgres` | `postgres-exporter` | `pg_up`, database size, connections, commits/rollbacks, tuple reads/writes |
| `redis` | `redis-exporter` | memory, clients, commands by type, keys |
| `kafka` | `kafka-exporter` | brokers, per-topic offsets (messages/s) |
| `minio`, `minio-bucket` | MinIO's built-in `/minio/v2/metrics/*` | lake size and objects, S3 requests/errors/traffic, health |
| `prometheus` | itself | |

Dashboards:

- **OpenScale · Control plane & pipelines**
  (http://localhost:3000/grafana/d/openscale-control-plane): API request rate,
  5xx %, p95 latency per route, runtime stats, and job runs by type and
  status.
- **OpenScale · Infrastructure**
  (http://localhost:3000/grafana/d/openscale-infrastructure): up/down per backend,
  then MinIO, Postgres, Redis and Kafka sections.

The config lives in [`observability/`](observability/): the scrape config
is in `prometheus/prometheus.yml`, and the datasource and dashboard JSON
are in `grafana/provisioning/`. Dashboards are loaded from files, so to
change one permanently, edit the JSON (or export it from Grafana into
that folder) and run `docker compose restart grafana`.

## Repo layout

```
control-plane/   Go API: cmd/server + internal/{api,config,db,docker,health,jobs,lake,metrics,redis,streaming,ws}
frontend/        React 19 + TypeScript + Vite console, one DDD-style domain per screen
worker/          Python job worker: generic jobs (validate, sql_transform, train), the taxi sample's Spark ETL, Kafka replay
jupyter/         JupyterLab image (embedded by the Notebooks screen)
notebooks/       The example notebooks JupyterLab opens
observability/   Prometheus scrape config + Grafana datasource/dashboards
scripts/         Helper scripts (build-images.sh)
ideas/           Vision, roadmap, and tech-stack decision records
etl-exposure/    The original standalone taxi pipeline: reference/legacy, nothing imports it
docs/            README assets
gateway/         Caddy config + image for deployments: the built console, every UI under one origin, one password
docker-compose.yml          The whole stack as one "openscale" compose project
docker-compose.deploy.yml   Layered on top to deploy: adds the gateway, keeps every other port on 127.0.0.1
```

## Development

| Component | Run it | Docs |
|---|---|---|
| Frontend | Runs in Docker with hot reload already; or `cd frontend && npm install && npm run dev` after `docker compose stop frontend` | [frontend/README.md](frontend/README.md) |
| Control-plane | `cd control-plane && go run ./cmd/server` after `docker compose stop control-plane` | [control-plane/README.md](control-plane/README.md) |
| Worker | Rebuild after changes: `docker compose up -d --build worker` | [worker/README.md](worker/README.md) |

The frontend container bind-mounts `./frontend`, so UI edits hot-reload
with no rebuild. Go and Python changes need their image rebuilt.

**Job types are defined once**, as `@job` functions in
[`worker/jobs/`](worker/jobs/). The worker publishes them at startup; the
control-plane serves the catalog (`GET /api/jobs/catalog`) and validates
run params against each job's schema, and the Pipelines screen renders its
run forms from it. See [worker/README.md](worker/README.md#adding-a-job).

Routes are the one list still kept in sync by hand:
[frontend/src/app/router.tsx](frontend/src/app/router.tsx) and
[frontend/src/shared/layout/navigation.ts](frontend/src/shared/layout/navigation.ts).

Tests run in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
`go test ./...` in `control-plane`, `python -m pytest` in `worker`,
`libs/openscale` and `query-engine`, and `npm test` (vitest) plus `tsc -b`
in `frontend`. The Silver rule set also
has a golden check against the original pipeline's quality reports:
`cd worker && python scripts/golden_check.py 2024-07` (needs that month's
raw Parquet under `worker/data/raw/yellow_taxi/`).

## Troubleshooting

**`pull access denied for minio/minio`.** MinIO stopped publishing public
images. The compose file already uses the community builds `pgsty/minio`
and `pgsty/mc`. Pull the latest repo.

**Build fails with `Read timed out` (pip), `ETIMEDOUT` (npm) or
`dial udp ... network is unreachable` (go).** Containers can't reach the
internet reliably during the build, usually because of an MTU or IPv6
mismatch between Docker's bridge network and your connection. Build
on the host's network instead:

```bash
scripts/build-images.sh            # all images; or name some: scripts/build-images.sh worker
docker compose up -d               # no --build, so compose uses those images
```

(Adding `network: host` to the compose file doesn't help: Compose builds
through Buildx Bake, which refuses host networking without an `--allow`
flag that `docker compose` can't pass.)

**A port is already in use.** Change the left side of that service's
`ports:` mapping in `docker-compose.yml`. If you move the control-plane or
frontend ports, only the host side changes: the frontend reaches the
other services over the compose network.

**Another machine on the network can't open it.** Use
`http://<this machine's IP>:5173`, and allow port 5173 through this
machine's firewall.

**A Spark job dies or the worker restarts mid-job.** Spark's driver gets
`SPARK_DRIVER_MEMORY=6g` by default (set on the `worker` service). Lower it
on a smaller machine, or ingest fewer months at once.

**Home and Dashboards are empty.** You haven't run Gold yet. See
[First run](#first-run-load-some-data).

**A Grafana dashboard says "No data" everywhere.** Check that its targets
are up at http://localhost:9090/prometheus/targets. A tab opened before a dashboard
was renamed or removed keeps showing the old layout; reload it.

**Don't run `etl-exposure/docker-compose.yml` at the same time.** It uses
the same container names.

## Deploying

`docker-compose.deploy.yml` turns the stack into something other people can
use from anywhere. It adds a **gateway** (Caddy) that is the only thing
listening on the network:

- it serves a production build of the console;
- it puts the API, MLflow, Jupyter, Grafana and Prometheus under the same
  address (`/api`, `/mlflow/`, `/jupyter/`, `/grafana/`, `/prometheus/`), so
  every screen and link works on any domain or IP;
- it asks for one shared user name and password before anything loads.

Every other service's port is bound to `127.0.0.1`, so Postgres, Redis,
MinIO and the rest are reachable only from the server itself.

**On the server** (any Linux machine with Docker; ARM and x86 both work,
and the stack wants about 8 GB of RAM, or more for big Spark jobs):

```bash
git clone https://github.com/AZURIIEAL/openscale.git && cd openscale
cp .env.example .env        # set OPENSCALE_PASSWORD (and OPENSCALE_SITE, below)
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
```

Then open `http://<server IP>/` and sign in as `openscale` with your
password. Anyone you give the password to can use it.

**A domain.** Two ways, set by `OPENSCALE_SITE` in `.env`:

- `OPENSCALE_SITE=:80` (the default) serves plain HTTP. Put HTTPS in
  front with Cloudflare: a proxied (orange-cloud) `A` record pointing at the
  server with SSL mode **Flexible**, or a Cloudflare Tunnel to
  `http://localhost:80`. A tunnel needs no open ports at all.
- `OPENSCALE_SITE=openscale.example.com` makes the gateway get its own
  Let's Encrypt certificate. Point the domain at the server (on Cloudflare,
  DNS only / grey cloud, or orange cloud with SSL mode **Full (strict)**)
  and open ports 80 and 443.

**Opening ports on a cloud VM.** Allow TCP 80 (and 443) both in the
provider's firewall (on Oracle Cloud, the subnet's security list) and on
the VM itself. Oracle's Ubuntu images also block them in iptables:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo netfilter-persistent save
```

**Updating:** `git pull`, then run the same `up -d --build` command.

**Reaching the internals.** Use an SSH tunnel, e.g.
`ssh -L 9101:localhost:9101 server` for the MinIO console.

## Security

OpenScale has **no accounts** yet (Phase 9). Locally, it assumes the only
person who can reach it is the one running it. The console can start and
stop containers (it mounts the Docker socket), wipe the lake, and run code
through Jupyter, and every bundled service uses a default password.

So everyone who can get past the deploy gateway's password can do all of
that. Share the password only with people you'd trust with a shell on the
server. Also:

1. Pick a long `OPENSCALE_PASSWORD`. It also becomes Grafana's admin
   password on a fresh install.
2. Use HTTPS (Cloudflare or `OPENSCALE_SITE`); Basic auth over plain HTTP
   sends the password readable to anyone on the path.
3. Don't publish the infrastructure ports (5432, 6379, 9000, 29092, …) to
   the internet. The deploy file keeps them on `127.0.0.1`.
4. Change the default Postgres, MinIO and Jupyter credentials if anything
   other than this stack can reach those services.

## Design principles

- **Domain-driven structure.** Each frontend screen is a self-contained
  domain (`domain/`, `application/`, `infrastructure/`, `ui/`). The Go
  backend separates transport (`internal/api`) from adapters
  (`internal/docker`, `internal/db`, …) from pure domain types
  (`internal/health`, `internal/jobs`).
- **Dependency inversion.** Frontend hooks depend on gateway interfaces
  they own, never on a concrete HTTP client. Switching a domain from mock
  to real is a one-line change.
- **One package per external system.** Only `internal/redis` imports
  go-redis, only `internal/docker` imports the Docker SDK,
  `internal/streaming` kafka-go, `internal/lake` minio-go, and
  `internal/metrics` the Prometheus client.
- **No fake data in real screens, and no fake controls on real data.** A
  screen either has a real backend behind it, or it says it doesn't.
- **`etl-exposure/` is read-only history.** Copy logic out of it when a
  platform feature needs it; never import from it.

## Further reading

- [`ideas/vision-and-roadmap.md`](ideas/vision-and-roadmap.md): product vision and phased roadmap, with current status
- [`ideas/tech-stack.md`](ideas/tech-stack.md): why each technology was picked, and where the build ended up differing
- [`ideas/brainstorm.md`](ideas/brainstorm.md): the original idea list
- [`etl-exposure/README.md`](etl-exposure/README.md): the standalone pipeline OpenScale grew out of
