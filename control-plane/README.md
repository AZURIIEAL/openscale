# control-plane

The Go service behind the OpenScale console. It's the only thing the
browser talks to. It fronts Postgres, Redis, Kafka, MinIO and the Docker
daemon over a JSON/WebSocket API on `:8080`. It never runs Spark itself:
it queues work for the Python [worker](../worker/README.md) and relays
the worker's live events back to the browser.

Stack: Go 1.26 · [chi](https://github.com/go-chi/chi) · pgx/v5 · go-redis/v9 ·
kafka-go · minio-go/v7 · Docker Engine SDK · nhooyr.io/websocket ·
Prometheus client_golang · zerolog · caarlos0/env.

## Run it

In the full stack it runs as the `control-plane` compose service. To run
it on the host instead, e.g. for quicker iteration:

```bash
docker compose up -d                  # backends
docker compose stop control-plane     # free :8080
cd control-plane
go run ./cmd/server
```

```bash
go build ./...
go vet ./...
gofmt -l .
```

Database migrations in [`db/migrations/`](db/migrations/) are embedded into
the binary and applied automatically on startup.

## Package map

```
cmd/server/          main: wires config, clients, hubs and the router; graceful shutdown
internal/
  api/               HTTP handlers + router.go (every route lives here). Thin: decode, call, encode
  config/            Env-var config (caarlos0/env)
  db/                The only pgx user: job_runs, Gold reads, read-only query engine, appearance settings, migrations
  docker/            The only Docker SDK user: container inspect/stats/start/stop/restart
  health/            Pure domain types for service health (no I/O)
  jobs/              Pure domain types + rules for job runs and the job catalog (no I/O)
  lake/              The only minio-go user: lists lake objects for the Data Catalog
  metrics/           The only Prometheus client user: /metrics, HTTP middleware, job-run collector
  redis/             The only go-redis user: job request stream, live event pub/sub, control hashes
  streaming/         The only kafka-go user: topic listing, trip consumer, windowed aggregates, WS hub
  datasets/          Dataset domain: name/URL rules, lake layout (pure, tested)
  projects/          Project domain: type, slug rules, create/update validation (pure, tested)
  queryengine/       HTTP client for the DuckDB query service (query-engine/)
  sqlcheck/          Single-SELECT check for the SQL editor (pure, tested)
  ws/                WebSocket hub relaying job events to /api/ws/jobs/{id} subscribers
```

**The rule:** each external system has exactly one package that imports
its SDK. Handlers and domain packages work with plain structs from
`internal/jobs` and `internal/health`.

## API

Every route is registered in
[`internal/api/router.go`](internal/api/router.go).

| Method | Path | What it does |
|---|---|---|
| GET | `/healthz` | Liveness, returns `ok` |
| GET | `/metrics` | Prometheus metrics (see below) |
| GET | `/api/system-health` | Status of the nine watched containers |
| POST | `/api/services/{id}/start` · `/stop` · `/restart` | Container control (IDs: `minio`, `kafka`, `postgres`, `redis`, `prometheus`, `grafana`, `worker`, `jupyter`, `mlflow`) |
| GET | `/api/container-stats` | Per-container CPU/memory plus host totals |
| GET / POST | `/api/projects` | List projects · create one (`{"name", "slug"?, "description"?}`, slug derived from the name when omitted) |
| GET / PATCH / DELETE | `/api/projects/{p}` | One project · rename/describe/`aiSettings` · archive (runs are kept). `{p}` is the id **or the slug** everywhere below |
| POST | `/api/projects/{p}/jobs/{type}/run` | Queue a job. Body = JSON params. Returns the run (`202`) |
| GET | `/api/projects/{p}/jobs/runs?limit=&offset=` | Page of the project's runs, newest first, plus `hasMore` |
| DELETE | `/api/projects/{p}/jobs/runs` | Delete the project's finished runs (queued/running are kept) |
| POST | `/api/projects/{p}/jobs/cancel-all` | Cancel the project's queued and running runs; restarts the worker only if one of *this* project's runs was running |
| POST | `/api/projects/{p}/jobs/{id}/control` | Live control for a running replay: `{"action": "pause" \| "resume" \| "cancel" \| "setSpeed", "speedMultiplier": 1\|2\|3\|5\|10}` |
| GET | `/api/ws/jobs/{id}` | WebSocket: live `status`/`log` events for one run (run ids are global, so this stays unscoped) |
| GET | `/api/projects/{p}/dashboards/overview` | All Dashboards-screen chart data |
| GET | `/api/projects/{p}/home/stats` | Home stat cards |
| GET / POST | `/api/projects/{p}/datasets` | List datasets · create one: `multipart/form-data` (`name`?, `layer`?, `file`) streams the file to the lake and queues `dataset_ingest`; JSON `{"name"?, "layer"?, "url"}` queues `dataset_fetch` (download + ingest). Returns `202 {dataset, run}` |
| GET / DELETE | `/api/projects/{p}/datasets/{name}` | One dataset (schema, counts, status, error) · delete it and its lake files |
| POST | `/api/projects/{p}/datasets/{name}/files` | Add another raw file (multipart); the dataset is re-ingested |
| GET | `/api/projects/{p}/datasets/{name}/preview?limit=20` | First rows, via the query engine |
| GET | `/api/projects/{p}/datasets/{name}/profile` | Per-column stats (stored at ingest; `?refresh=1` recomputes) |
| POST | `/api/projects/{p}/query` | Read-only SQL over the project's datasets (DuckDB query engine; each dataset is a view named after it). Same body/response contract as `/api/query` |
| GET | `/api/projects/{p}/query/catalog` | The project's ready datasets as `{schema:"main", table, columns}` |
| POST | `/api/query` | Run a read-only `SELECT`/`WITH` (read-only transaction, row-capped). Not yet project-scoped |
| GET | `/api/query/catalog` | Queryable schemas, tables and columns |
| GET | `/api/catalog/lake` | MinIO lake contents by layer |
| GET | `/api/streaming/topics` | Kafka topics |
| GET | `/api/streaming/ws` | WebSocket: live trips and windowed aggregates |
| GET / PUT | `/api/appearance-settings` | Persisted theme and UI settings |

Every route under `/api/projects/{p}` goes through
`ProjectsHandler.Middleware` (`internal/api/projects_handler.go`), which
resolves the id or slug once, answers `404` for an unknown project, and puts
it in the request context -- the one place project scoping is enforced.

Job types for `/api/projects/{p}/jobs/{type}/run` come from `jobs.Catalog`
([`internal/jobs/jobs.go`](internal/jobs/jobs.go)): `ingest`
(`{"start":"2024-07","end":"2024-12"}`), `silver`, `gold`, `features`,
`train`, `replay` (`{"limit":500,"messagesPerSecond":10}`), `reset`.

```bash
curl localhost:8080/api/projects
curl -X POST localhost:8080/api/projects/nyc-taxi/jobs/ingest/run -d '{"start":"2024-07","end":"2024-07"}'
curl 'localhost:8080/api/projects/nyc-taxi/jobs/runs?limit=5'
```

## Job lifecycle

1. `Run` inserts a `control_plane.job_runs` row (`queued`), then `XADD`s
   `{job_id, job_type, params, submitted_at}` onto the Redis Stream
   `openscale:jobs:requests`. If the enqueue fails, the row is marked
   `failed` right away.
2. The worker takes the job, marks it `running`, and publishes
   `{"job_id","type":"status"|"log",...}` events on the
   `openscale:jobs:events` channel.
3. `internal/ws`'s hub fans those events out to every
   `/api/ws/jobs/{id}` subscriber. Each new WebSocket is first sent the
   run's current row from Postgres, and closed right away if the run has
   already finished.
4. The worker writes the final status (`succeeded`, `partial`, `failed`),
   the full log, `rows_processed` and metrics to Postgres, which is the
   system of record.

Live control (`/control`) writes fields into the Redis hash
`openscale:jobs:{id}:control`, which `replay` checks before every message.
Spark stages don't check it, so `cancel-all` restarts the worker container
to stop one mid-run.

## Configuration

| Var | Default (host run) | In compose |
|---|---|---|
| `PORT` | `8080` | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin and WebSocket origin check |
| `DOCKER_HOST` | SDK default (local socket) | socket mounted read-only |
| `POSTGRES_DSN` | `postgres://openscale:openscale@localhost:5432/openscale?sslmode=disable` | `@postgres:5432` |
| `REDIS_ADDR` | `localhost:6379` | `redis:6379` |
| `KAFKA_BROKER` | `localhost:29092` | `kafka:9092` |
| `MINIO_ENDPOINT` | `http://localhost:9000` | `http://minio:9000` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` / `minioadmin` | |

## Metrics

`GET /metrics` serves a dedicated registry
([`internal/metrics`](internal/metrics/metrics.go)):

| Metric | Labels | Notes |
|---|---|---|
| `openscale_http_requests_total` | `method`, `route`, `status` | `route` is the chi pattern (`/api/jobs/{id}/control`), so label count stays bounded |
| `openscale_http_request_duration_seconds` | `method`, `route` | Histogram; WebSocket upgrades excluded |
| `openscale_job_runs` | `job_type`, `status` | Gauge, read from Postgres on each scrape |
| `go_*`, `process_*` | | Go runtime and process stats |

## Adding things

**A new endpoint:**
1. Add or extend a handler in `internal/api/`, keeping it to decoding the
   request, calling a method, and encoding the result.
2. Put any SQL in `internal/db` (or Redis, Kafka or MinIO calls in their
   own package).
3. Register the route in `router.go`.
4. Add the matching gateway method in the frontend domain that uses it.

**A new job type:**
1. Add it to `jobs.Catalog`.
2. Add a module to `worker/jobs/` and register it in `JOB_TABLE` in
   `worker/main.py` (see the [worker README](../worker/README.md#adding-a-job)).
3. If it should appear on the Pipelines screen, add it to `JOB_CATALOG` in
   `frontend/src/domains/pipelines/domain/entities.ts`.

**A new migration:** add `db/migrations/000N_description.sql`. It's applied
in filename order on the next startup. `db/queries/*.sql` + `sqlc.yaml`
describe the queries in sqlc format, but `internal/db` is currently
hand-written against pgx (see the note at the top of `internal/db/db.go`).

## Tests

```bash
go test ./...
```

The dependency-free packages (`internal/datasets`, `internal/health`,
`internal/jobs`, `internal/projects`, `internal/sqlcheck`) carry table-driven unit tests and
run in CI on every push (`.github/workflows/ci.yml`). Handlers and `internal/db`
are exercised against the running stack; a Postgres-backed test harness is
on the list for Phase 2 of the implementation plan.
