"""Raw files -> Parquet, schema, row count and profile. Used by the worker's
dataset_ingest job; profile() is also what the query engine serves live."""

from dataclasses import dataclass, field
from typing import Any

import duckdb

from .readers import is_supported, union_sql


@dataclass
class IngestResult:
    columns: list[dict[str, str]]
    row_count: int
    files: list[str] = field(default_factory=list)


def list_raw_files(con: duckdb.DuckDBPyConnection, raw_glob: str) -> list[str]:
    rows = con.execute("SELECT file FROM glob(?) ORDER BY file", [raw_glob]).fetchall()
    return [r[0] for r in rows if is_supported(r[0])]


def convert_to_parquet(con: duckdb.DuckDBPyConnection, raw_files: list[str], data_part: str) -> IngestResult:
    """Reads every raw file (schemas unioned by name), writes one Parquet
    file, and returns the inferred columns and row count. DuckDB streams
    the conversion, so a file larger than memory still converts."""
    select = union_sql(raw_files)
    con.execute(f"COPY ({select}) TO '{data_part}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    columns = [
        {"name": name, "type": typ}
        for name, typ, *_ in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{data_part}')").fetchall()
    ]
    row_count = con.execute(f"SELECT COUNT(*) FROM read_parquet('{data_part}')").fetchone()[0]
    return IngestResult(columns=columns, row_count=int(row_count), files=list(raw_files))


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)


def profile(con: duckdb.DuckDBPyConnection, source_sql: str) -> dict[str, Any]:
    """Per-column stats from SUMMARIZE, in the shape the control-plane's
    queryengine.Profile expects. source_sql is a table/view name or a
    read_parquet(...) expression."""
    rows = con.execute(f"SUMMARIZE SELECT * FROM {source_sql}").fetchall()
    names = [d[0] for d in con.description]
    out = []
    total = 0
    for row in rows:
        r = dict(zip(names, row))
        count = int(r.get("count") or 0)
        total = max(total, count)
        null_pct = r.get("null_percentage")
        null_share = float(null_pct) / 100.0 if null_pct is not None else 0.0
        approx = r.get("approx_unique")
        mean = r.get("avg")
        out.append(
            {
                "name": r["column_name"],
                "type": r["column_type"],
                "nullCount": int(round(count * null_share)),
                "nullShare": round(null_share, 6),
                "distinct": int(approx) if approx is not None else None,
                "min": _jsonable(r.get("min")),
                "max": _jsonable(r.get("max")),
                "mean": float(mean) if mean not in (None, "") and _is_number(mean) else None,
            }
        )
    return {"rowCount": total, "columns": out}


def _is_number(v: Any) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False
