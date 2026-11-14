# query-engine

DuckDB over the MinIO lake for the SQL editor, dataset previews and
profiles. Internal: no host port, only the control-plane calls it, and
every request carries the project's dataset list, so the service never
needs Postgres and project scoping stays in the control-plane.

```
POST /query    {project_id, sql, datasets:[{name, path}], max_rows, timeout_seconds}
POST /preview  {project_id, dataset:{name, path}, limit}
POST /profile  {project_id, dataset:{name, path}}
GET  /healthz
```

`/query` and `/preview` answer `{columns:[{name,type}], rows, rowCount,
truncated, durationMs}`; a query-level failure (bad SQL, timeout) comes
back as `{error}` with HTTP 200 so the editor can show it inline. Non-200
means the service itself is unwell.

## How a query runs (query_engine/session.py)

1. A fresh in-memory DuckDB connection, `httpfs` loaded, and an S3 secret
   **scoped to `s3://openscale-lake/projects/{project_id}/`** -- reads
   outside the project carry no credentials and fail.
2. One view per dataset over its `data/*.parquet`.
3. Lock-down: local filesystem disabled, configuration frozen.
4. The SQL must parse (DuckDB's own parser) to exactly one SELECT.
5. It runs on a worker thread; the request thread `interrupt()`s it at
   the timeout. Rows are fetched up to `max_rows + 1` to set `truncated`.

This is defence in depth, not a multi-tenant boundary: give the service a
read-only MinIO user and container limits (both in docker-compose.yml), and
keep auth in front of the control-plane (Phase 9).

## Run locally

```bash
pip install -r requirements.txt -e ../libs/openscale
MINIO_ENDPOINT=http://localhost:9000 uvicorn app:app --port 8090
pytest
```
