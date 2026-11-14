import datetime as dt
import decimal
import json
import math

from query_engine.results import error_result, jsonable, shape_result, type_name


def test_scalars_pass_through():
    for v in [None, True, 3, "x", 1.5]:
        assert jsonable(v) == v


def test_non_finite_floats_become_null():
    assert jsonable(math.nan) is None
    assert jsonable(math.inf) is None
    assert jsonable(decimal.Decimal("NaN")) is None


def test_decimal_dates_bytes():
    assert jsonable(decimal.Decimal("12.50")) == 12.5
    assert jsonable(dt.date(2026, 11, 13)) == "2026-11-13"
    assert jsonable(dt.datetime(2026, 11, 13, 10, 5)) == "2026-11-13T10:05:00"
    assert jsonable(dt.timedelta(minutes=90)) == "1:30:00"
    assert jsonable(b"\x00\xff") == "AP8="


def test_nested_structures_are_converted_recursively():
    out = jsonable({"a": [decimal.Decimal("1"), {"b": dt.date(2026, 1, 1)}], 2: (1, 2)})
    assert out == {"a": [1.0, {"b": "2026-01-01"}], "2": [1, 2]}
    json.dumps(out)


def test_unknown_objects_become_strings():
    class Weird:
        def __str__(self):
            return "weird"

    assert jsonable(Weird()) == "weird"


def test_shape_result_truncates_and_flags():
    desc = [("id", "INTEGER"), ("name", "VARCHAR")]
    rows = [(1, "a"), (2, "b"), (3, "c")]
    out = shape_result(desc, rows, max_rows=2, duration_ms=7)
    assert out["rowCount"] == 2
    assert out["truncated"] is True
    assert out["rows"] == [[1, "a"], [2, "b"]]
    assert out["columns"] == [{"name": "id", "type": "INTEGER"}, {"name": "name", "type": "VARCHAR"}]
    assert out["durationMs"] == 7


def test_shape_result_not_truncated_when_within_cap():
    out = shape_result([("x", "INTEGER")], [(1,), (2,)], max_rows=2, duration_ms=0)
    assert out["truncated"] is False
    assert out["rowCount"] == 2


def test_shape_result_empty():
    out = shape_result([("x", "INTEGER")], [], max_rows=5, duration_ms=1)
    assert out == {"columns": [{"name": "x", "type": "INTEGER"}], "rows": [], "rowCount": 0, "truncated": False, "durationMs": 1}


def test_type_name_tolerates_short_description_entries():
    assert type_name(("x",)) == "UNKNOWN"
    assert type_name(("x", None)) == "UNKNOWN"
    assert type_name(("x", "BIGINT", None, None, None, None, None)) == "BIGINT"


def test_error_result():
    assert error_result("boom") == {"error": "boom"}
