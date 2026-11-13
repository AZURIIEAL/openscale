"""Tests that need the duckdb package. They run in CI and anywhere duckdb
is installed; elsewhere they skip rather than fail."""

import csv
import json

import pytest

duckdb = pytest.importorskip("duckdb")

from openscale.duck import DatasetView, attach_views, lockdown, quote_ident  # noqa: E402
from openscale.ingest import convert_to_parquet, list_raw_files, profile  # noqa: E402
from openscale.sqlguard import RejectedSQL, check_single_select  # noqa: E402


@pytest.fixture
def con():
    return duckdb.connect()


@pytest.fixture
def raw_dir(tmp_path):
    with open(tmp_path / "a.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "amount", "city"])
        w.writerows([[1, 10.5, "Kochi"], [2, 20.0, "Delhi"], [3, "", "Kochi"]])
    with open(tmp_path / "b.jsonl", "w") as f:
        for row in [{"id": 4, "amount": 5.0, "city": "Pune", "extra": "x"}]:
            f.write(json.dumps(row) + "\n")
    (tmp_path / "notes.txt").write_text("ignored")
    return tmp_path


def test_list_raw_files_skips_unsupported(con, raw_dir):
    files = list_raw_files(con, str(raw_dir / "*"))
    assert [f.rsplit("/", 1)[-1] for f in files] == ["a.csv", "b.jsonl"]


def test_convert_unions_by_name_and_reports_schema(con, raw_dir, tmp_path):
    files = list_raw_files(con, str(raw_dir / "*"))
    out = tmp_path / "part-00000.parquet"
    result = convert_to_parquet(con, files, str(out))
    assert result.row_count == 4
    names = [c["name"] for c in result.columns]
    assert set(names) == {"id", "amount", "city", "extra"}
    assert all(c["type"] for c in result.columns)
    # the csv rows have no "extra": it reads as NULL
    nulls = con.execute(f"SELECT COUNT(*) FROM read_parquet('{out}') WHERE extra IS NULL").fetchone()[0]
    assert nulls == 3


def test_profile_shape(con, raw_dir, tmp_path):
    files = list_raw_files(con, str(raw_dir / "*"))
    out = tmp_path / "part-00000.parquet"
    convert_to_parquet(con, files, str(out))
    prof = profile(con, f"read_parquet('{out}')")
    assert prof["rowCount"] == 4
    by_name = {c["name"]: c for c in prof["columns"]}
    assert by_name["amount"]["nullCount"] == 1
    assert 0.2 < by_name["amount"]["nullShare"] < 0.3
    assert by_name["amount"]["mean"] is not None
    assert by_name["city"]["mean"] is None
    assert by_name["city"]["distinct"] >= 3
    json.dumps(prof)  # everything must be JSON-serialisable


def test_attach_views_and_query(con, raw_dir, tmp_path):
    files = list_raw_files(con, str(raw_dir / "*"))
    out = tmp_path / "part-00000.parquet"
    convert_to_parquet(con, files, str(out))
    attach_views(con, [DatasetView(name="orders", path=str(tmp_path / "*.parquet"))])
    assert con.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 4


def test_quote_ident_escapes_quotes():
    assert quote_ident('a"b') == '"a""b"'


@pytest.mark.parametrize("sql", [
    "SELECT 1",
    "select 1;",
    "WITH t AS (SELECT 1 AS x) SELECT * FROM t",
    "FROM range(3)",
    "SELECT ';' AS s",
    "-- comment\nSELECT 1",
])
def test_single_select_is_accepted(con, sql):
    check_single_select(con, sql)


@pytest.mark.parametrize("sql,msg", [
    ("", "empty"),
    ("   ", "empty"),
    ("SELECT 1; SELECT 2", "single"),
    ("CREATE TABLE t (x INT)", "SELECT"),
    ("COPY (SELECT 1) TO '/tmp/x.csv'", "SELECT"),
    ("INSTALL spatial", "SELECT"),
    ("SET memory_limit = '1GB'", "SELECT"),
    ("CREATE SECRET s (TYPE s3)", "SELECT"),
    ("ATTACH 'x.db'", "SELECT"),
])
def test_non_select_is_rejected(con, sql, msg):
    with pytest.raises(RejectedSQL, match=msg):
        check_single_select(con, sql)


def test_lockdown_blocks_local_files_and_config_changes(con, raw_dir):
    lockdown(con)
    with pytest.raises(duckdb.Error):
        con.execute(f"SELECT * FROM read_csv('{raw_dir / 'a.csv'}')").fetchall()
    with pytest.raises(duckdb.Error):
        con.execute("SET disabled_filesystems = ''")
