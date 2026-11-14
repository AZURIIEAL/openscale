"""Pure helpers for turning DuckDB results into the JSON the control-plane
expects. No DuckDB import, so these are unit-tested without it."""

import base64
import datetime as dt
import decimal
import math
from typing import Any


def jsonable(v: Any) -> Any:
    """Converts one cell to something json.dumps accepts and the browser
    can show: Decimals to float, dates/times to ISO strings, bytes to
    base64, NaN/inf to None, nested lists/dicts recursively."""
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(v, decimal.Decimal):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, dt.timedelta):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(v)).decode("ascii")
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [jsonable(x) for x in v]
    return str(v)


def shape_result(description, rows: list[tuple], max_rows: int, duration_ms: int) -> dict[str, Any]:
    """Builds the /query response body. `rows` may hold up to max_rows + 1
    entries; the extra one only signals truncation and is dropped."""
    truncated = len(rows) > max_rows
    kept = rows[:max_rows]
    return {
        "columns": [{"name": d[0], "type": type_name(d)} for d in description],
        "rows": [[jsonable(c) for c in row] for row in kept],
        "rowCount": len(kept),
        "truncated": truncated,
        "durationMs": duration_ms,
    }


def type_name(desc_entry) -> str:
    """DuckDB's cursor.description carries the type in position 1 as a
    DuckDBPyType (or a string in older versions)."""
    t = desc_entry[1] if len(desc_entry) > 1 else None
    return str(t) if t is not None else "UNKNOWN"


def error_result(message: str) -> dict[str, Any]:
    return {"error": message}
