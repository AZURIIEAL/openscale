import pytest

from jobs.outcome import STATUS_FAILED, STATUS_PARTIAL, STATUS_SUCCEEDED, IngestOutcome, format_exception


def ok(period, rows):
    return {"period": period, "status": "OK", "rows": rows}


def bad(period, status="UNAVAILABLE", reason="HTTP 404"):
    return {"period": period, "status": status, "reason": reason}


def finish(*results):
    o = IngestOutcome()
    for r in results:
        o.add(r)
    return o.finish()


def test_all_ok_succeeds_with_row_total():
    assert finish(ok("2024-07", 10), ok("2024-08", 5)) == (STATUS_SUCCEEDED, None, 15)


def test_all_failed_is_failed_with_no_rows():
    status, error, rows = finish(bad("2024-07"), bad("2024-08", "REJECTED", "dtype"))
    assert status == STATUS_FAILED
    assert rows is None
    assert "2024-07: UNAVAILABLE (HTTP 404)" in error
    assert "2024-08: REJECTED (dtype)" in error


def test_mixed_is_partial_and_keeps_rows():
    status, error, rows = finish(ok("2024-07", 10), bad("2024-08"))
    assert status == STATUS_PARTIAL
    assert rows == 10
    assert error == "2024-08: UNAVAILABLE (HTTP 404)"


def test_no_periods_is_a_successful_no_op():
    assert finish() == (STATUS_SUCCEEDED, None, 0)


def test_missing_rows_key_counts_as_zero():
    assert finish({"period": "2024-07", "status": "OK"}) == (STATUS_SUCCEEDED, None, 0)


def test_error_order_follows_input_order():
    _, error, _ = finish(bad("2024-09"), ok("2024-07", 1), bad("2024-08"))
    assert error.index("2024-09") < error.index("2024-08")


@pytest.mark.parametrize("exc,expected", [
    (ValueError("boom"), "ValueError: boom"),
    (KeyError("k"), "KeyError: 'k'"),
    (RuntimeError(""), "RuntimeError: "),
])
def test_format_exception(exc, expected):
    assert format_exception(exc) == expected
