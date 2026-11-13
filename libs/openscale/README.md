# openscale (Python library)

The one copy of the lake layout, the DuckDB-over-MinIO connection and the
ingest/profile SQL, shared by the worker, the query engine and (later) the
Jupyter image. Mirrors `control-plane/internal/datasets` for paths.

```
openscale/paths.py       lake bucket + projects/{p}/datasets/{d}/{raw,data}/ builders
openscale/readers.py     file extension -> DuckDB read_* expression
openscale/duck.py        connect(): httpfs + MinIO secret from env; attach_views(); lockdown()
openscale/url_check.py   refuse fetches to private/loopback/link-local addresses
openscale/ingest.py      raw files -> Parquet, schema, row count, profile
openscale/sqlguard.py    "exactly one SELECT" check using DuckDB's own parser
```

Install in a service image with `pip install /app/libs/openscale`. Tests
that need DuckDB skip when it is not installed (`pytest`).
