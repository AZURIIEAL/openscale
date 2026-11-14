"""Needs duckdb (runs in CI; skips elsewhere). Builds sessions over local
Parquet files via a connection without httpfs, exercising the same
run_select/preview/profile paths the service uses. The `session` fixture
skips lockdown() because its views read local files, which lockdown
rightly forbids; `locked_session` covers that behaviour on its own."""

import pytest

duckdb = pytest.importorskip("duckdb")

from openscale.duck import DatasetView, attach_views, lockdown  # noqa: E402
from query_engine.session import Session  # noqa: E402


def _orders_connection(tmp_path):
    con = duckdb.connect()
    con.execute(f"COPY (SELECT range AS id, range * 1.5 AS amount, 'c' || (range % 3) AS city FROM range(100)) TO '{tmp_path / 'part-00000.parquet'}' (FORMAT PARQUET)")
    attach_views(con, [DatasetView(name="orders", path=str(tmp_path / "*.parquet"))])
    return con


@pytest.fixture
def session(tmp_path):
    s = Session(_orders_connection(tmp_path))
    yield s
    s.close()


@pytest.fixture
def locked_session(tmp_path):
    con = _orders_connection(tmp_path)
    lockdown(con)
    s = Session(con)
    yield s
    s.close()


def test_select_returns_typed_columns_and_rows(session):
    out = session.run_select("SELECT id, amount FROM orders ORDER BY id LIMIT 3", 500, 10)
    assert "error" not in out
    assert [c["name"] for c in out["columns"]] == ["id", "amount"]
    assert out["rows"][0][0] == 0
    assert out["rowCount"] == 3
    assert out["truncated"] is False
    assert out["durationMs"] >= 0


def test_row_cap_sets_truncated(session):
    out = session.run_select("SELECT * FROM orders", 10, 10)
    assert out["rowCount"] == 10
    assert out["truncated"] is True


def test_sql_error_is_inline_not_raised(session):
    out = session.run_select("SELECT nope FROM orders", 10, 10)
    assert "error" in out
    assert "nope" in out["error"]


def test_non_select_is_rejected(session):
    assert "error" in session.run_select("DELETE FROM orders", 10, 10)
    assert "error" in session.run_select("SELECT 1; SELECT 2", 10, 10)
    assert "error" in session.run_select("COPY orders TO '/tmp/leak.csv'", 10, 10)


def test_local_file_access_is_blocked_after_lockdown(locked_session, tmp_path):
    out = locked_session.run_select(f"SELECT * FROM read_parquet('{tmp_path / 'part-00000.parquet'}')", 10, 10)
    assert "error" in out
    assert "LocalFileSystem" in out["error"]


def test_config_changes_are_rejected_after_lockdown(locked_session):
    assert "error" in locked_session.run_select("SET memory_limit = '10GB'", 10, 10)


def test_timeout_cancels_a_long_query(session):
    # A cross join big enough to take well over a second.
    out = session.run_select("SELECT COUNT(*) FROM range(50000000) a, range(50000000) b", 10, 1)
    assert "error" in out
    assert "time limit" in out["error"]
    # and the session is still usable afterwards
    assert "error" not in session.run_select("SELECT 1", 10, 10)


def test_preview_and_profile(session):
    prev = session.preview("orders", 5)
    assert prev["rowCount"] == 5
    prof = session.profile("orders")
    assert prof["rowCount"] == 100
    names = {c["name"] for c in prof["columns"]}
    assert names == {"id", "amount", "city"}


def test_profile_of_missing_view_is_inline_error(session):
    assert "error" in session.profile("nothing")
