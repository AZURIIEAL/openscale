"""The rule engine (openscale.rules) against local Parquet files."""

import pytest

duckdb = pytest.importorskip("duckdb")

from openscale.rules import InvalidRule, Rule, apply_rules, parse_rules  # noqa: E402

# id, pickup, dropoff, distance, fare, passengers
ROWS = [
    (1, "2024-07-01 08:00", "2024-07-01 08:15", 2.0, 12.0, 1),  # clean
    (2, "2024-07-01 09:00", "2024-07-01 08:59", 3.0, 10.0, 1),  # dropoff before pickup -> reject
    (3, "2024-07-01 10:00", "2024-07-01 10:20", -1.0, -5.0, 1),  # negative distance (reject) AND fare (quarantine)
    (4, "2024-07-01 11:00", "2024-07-01 11:30", 150.0, 40.0, 2),  # distance outlier -> quarantine
    (5, "2024-07-01 12:00", "2024-07-01 12:10", 1.0, -3.0, 1),  # negative fare -> quarantine
    (6, "2024-07-01 13:00", "2024-07-01 13:10", 1.5, 8.0, None),  # NULL passengers: monitor hit, not quarantined
    (7, "2023-12-31 23:50", "2024-01-01 00:05", 2.0, 11.0, 0),  # zero passengers -> quarantine; year flag
]

RULES = [
    {"id": "SLV-003", "tier": "reject", "when": "dropoff <= pickup", "note": "Dropoff is not after pickup"},
    {"id": "SLV-004", "tier": "reject", "when": "distance < 0"},
    {"id": "SLV-010", "tier": "quarantine", "when": "distance > 100"},
    {"id": "SLV-005", "tier": "quarantine", "when": "passengers <= 0"},
    {"id": "SLV-006", "tier": "quarantine", "when": "fare < 0"},
    {"id": "SLV-008", "tier": "flag", "when": "year(pickup) <> 2024", "column": "flag_pickup_year_mismatch"},
    {"id": "missing-passengers", "tier": "monitor", "when": "passengers IS NULL"},
]


@pytest.fixture
def con():
    return duckdb.connect()


@pytest.fixture
def source(con, tmp_path):
    con.execute(
        "CREATE TABLE trips(id INT, pickup TIMESTAMP, dropoff TIMESTAMP, distance DOUBLE, fare DOUBLE, passengers INT)"
    )
    con.executemany("INSERT INTO trips VALUES (?, ?, ?, ?, ?, ?)", ROWS)
    path = tmp_path / "trips.parquet"
    con.execute(f"COPY trips TO '{path}' (FORMAT PARQUET)")
    return f"read_parquet('{path}')"


def _run(con, source, tmp_path, raw_rules):
    rules = parse_rules(raw_rules)
    clean = tmp_path / "clean.parquet"
    run = apply_rules(con, rules, source, str(clean), lambda r: str(tmp_path / f"q_{r.id}.parquet"))
    return run, clean


def test_priority_assigns_each_row_to_one_rule(con, source, tmp_path):
    run, clean = _run(con, source, tmp_path, RULES)
    by_id = {r.id: r for r in run.rules}

    assert (run.rows_in, run.rows_out) == (7, 2)
    # row 3 hits SLV-004 and SLV-006; it is assigned to the earlier rule only
    assert (by_id["SLV-004"].hits, by_id["SLV-004"].assigned) == (1, 1)
    assert (by_id["SLV-006"].hits, by_id["SLV-006"].assigned) == (2, 1)
    assert run.rejected == 2  # rows 2, 3
    assert run.quarantined == 3  # rows 4, 5, 7
    assert run.rows_in == run.rows_out + run.rejected + run.quarantined

    kept = [r[0] for r in con.execute(f"SELECT id FROM read_parquet('{clean}') ORDER BY id").fetchall()]
    assert kept == [1, 6]


def test_quarantine_files_hold_exactly_their_assigned_rows(con, source, tmp_path):
    _run(con, source, tmp_path, RULES)
    ids = lambda rid: sorted(r[0] for r in con.execute(f"SELECT id FROM read_parquet('{tmp_path / f'q_{rid}.parquet'}')").fetchall())  # noqa: E731
    assert ids("SLV-003") == [2]
    assert ids("SLV-004") == [3]
    assert ids("SLV-010") == [4]
    assert ids("SLV-005") == [7]
    assert ids("SLV-006") == [5]
    # flag and monitor rules never write files
    assert not (tmp_path / "q_SLV-008.parquet").exists()
    assert not (tmp_path / "q_missing-passengers.parquet").exists()


def test_null_predicate_is_not_a_hit_and_monitor_only_counts(con, source, tmp_path):
    run, clean = _run(con, source, tmp_path, RULES)
    by_id = {r.id: r for r in run.rules}
    # passengers IS NULL on row 6: the quarantine rule `passengers <= 0` is NULL there, so not hit
    assert by_id["SLV-005"].hits == 1
    assert (by_id["missing-passengers"].hits, by_id["missing-passengers"].assigned) == (1, None)
    assert con.execute(f"SELECT COUNT(*) FROM read_parquet('{clean}') WHERE id = 6").fetchone()[0] == 1


def test_flag_rule_adds_a_boolean_column_to_kept_rows(con, source, tmp_path):
    run, clean = _run(con, source, tmp_path, RULES)
    cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{clean}')").fetchall()]
    assert cols == ["id", "pickup", "dropoff", "distance", "fare", "passengers", "flag_pickup_year_mismatch"]
    flags = dict(con.execute(f"SELECT id, flag_pickup_year_mismatch FROM read_parquet('{clean}')").fetchall())
    assert flags == {1: False, 6: False}  # row 7 was quarantined before its flag mattered
    assert {r.id: r.hits for r in run.rules}["SLV-008"] == 1


def test_no_rules_copies_the_data(con, source, tmp_path):
    run, clean = _run(con, source, tmp_path, [])
    assert (run.rows_in, run.rows_out, run.rejected, run.quarantined) == (7, 7, 0, 0)
    assert con.execute(f"SELECT COUNT(*) FROM read_parquet('{clean}')").fetchone()[0] == 7


def test_report_shape(con, source, tmp_path):
    report = _run(con, source, tmp_path, RULES[:1])[0].report()
    assert report["rules"] == [
        {"id": "SLV-003", "tier": "reject", "note": "Dropoff is not after pickup", "hits": 1, "assigned": 1}
    ]
    assert set(report) == {"rows_in", "rows_out", "rejected", "quarantined", "rules"}


@pytest.mark.parametrize(
    "raw, message",
    [
        ([{"id": "a", "tier": "drop", "when": "true"}], "tier must be one of"),
        ([{"id": "", "tier": "reject", "when": "true"}], "id must be"),
        ([{"id": "a", "tier": "reject", "when": "  "}], "SQL predicate"),
        ([{"id": "a", "tier": "reject", "when": "x"}, {"id": "a", "tier": "flag", "when": "y"}], "duplicate"),
        ([{"id": "a", "tier": "reject", "when": "x", "column": "c"}], "only flag rules"),
        ([{"id": "a", "tier": "flag", "when": "x", "column": "bad name"}], "plain identifier"),
        ("not a list", "must be a list"),
    ],
)
def test_parse_rules_rejects_bad_shapes(raw, message):
    with pytest.raises(InvalidRule, match=message):
        parse_rules(raw)


def test_flag_column_defaults_from_the_id():
    assert Rule("SLV-008", "flag", "true").flag_column == "flag_slv_008"


@pytest.mark.parametrize(
    "when, message",
    [
        ("no_such_column > 1", "no_such_column"),
        ("true); DROP TABLE x; SELECT (true", "syntax error"),
        # closes the wrapper cleanly, so it parses as three statements
        ("true), false) FROM range(1); DROP TABLE x; SELECT COALESCE((true", "single SQL statement"),
    ],
)
def test_bad_predicates_fail_before_writing_and_name_the_rule(con, source, tmp_path, when, message):
    with pytest.raises(InvalidRule, match=rf"rule bad: .*{message}"):
        _run(con, source, tmp_path, [{"id": "bad", "tier": "reject", "when": when}])
    assert not (tmp_path / "clean.parquet").exists()


def test_flag_column_cannot_shadow_a_dataset_column(con, source, tmp_path):
    with pytest.raises(InvalidRule, match="already exists"):
        _run(con, source, tmp_path, [{"id": "f", "tier": "flag", "when": "true", "column": "fare"}])
