"""The taxi Silver rules as data (spark/silver/silver_rules.json) run
through the shared rule engine, with the original pipeline's scenarios.
Each case writes a small frame to Parquet and reads the outputs back."""

from dataclasses import dataclass

import pandas as pd
import pytest

duckdb = pytest.importorskip("duckdb")

from openscale.rules import apply_rules  # noqa: E402

from spark.silver.rules import (  # noqa: E402
    QUARANTINE_CATEGORIES,
    count_duplicates,
    load_rules,
    period_variables,
    quality_report,
)
from tests.conftest import make_trips  # noqa: E402

YEAR, MONTH = 2024, 7
MAX_TRIP_DISTANCE_MILES = 100


@dataclass
class Outcome:
    report: dict
    accepted: pd.DataFrame  # indexed by the input row
    by_rule: dict[str, list[int]]  # rule id -> input rows it removed

    def category(self, name: str) -> list[int]:
        return sorted(i for rid in QUARANTINE_CATEGORIES[name] for i in self.by_rule.get(rid, []))


@pytest.fixture
def run(tmp_path):
    def _run(df: pd.DataFrame, year: int = YEAR, month: int = MONTH) -> Outcome:
        src = tmp_path / "bronze.parquet"
        df.assign(rid=range(len(df))).to_parquet(src, index=False)
        source = f"read_parquet('{src}')"
        con = duckdb.connect()
        result = apply_rules(
            con,
            load_rules(),
            source,
            str(tmp_path / "clean.parquet"),
            lambda r: str(tmp_path / f"q_{r.id}.parquet"),
            variables=period_variables(year, month),
        )
        # rid is a test-only column, so duplicates are counted without it.
        dupes = count_duplicates(con, f"(SELECT * EXCLUDE (rid) FROM {source})")
        report = quality_report(result, year, month, dupes)
        accepted = con.execute(f"SELECT * FROM read_parquet('{tmp_path / 'clean.parquet'}')").df().set_index("rid")
        by_rule = {
            r.id: sorted(
                int(x[0]) for x in con.execute(f"SELECT rid FROM read_parquet('{tmp_path / f'q_{r.id}.parquet'}')").fetchall()
            )
            for r in result.rules
            if r.assigned
        }
        con.close()
        return Outcome(report, accepted, by_rule)

    return _run


def counts(outcome):
    r = outcome.report
    return r["records_accepted"], r["records_rejected"], r["records_quarantined"]


def test_the_ten_silver_rules_are_all_there():
    rules = load_rules()
    assert [r.id for r in rules if r.id.startswith("SLV-")] == [
        "SLV-001", "SLV-002", "SLV-003", "SLV-004", "SLV-010",
        "SLV-005", "SLV-006", "SLV-007", "SLV-008", "SLV-009",
    ]  # fmt: skip
    assert {r.flag_column for r in rules if r.tier == "flag"} == {
        "flag_pickup_year_mismatch",
        "flag_dropoff_year_mismatch",
    }


def test_clean_frame_is_fully_accepted(run, trips):
    outcome = run(trips)
    assert counts(outcome) == (len(trips), 0, 0)
    assert outcome.by_rule == {}
    assert outcome.report["period"] == "2024-07"
    assert outcome.report["records_processed"] == len(trips)
    assert outcome.report["duplicate_records"] == 0


def test_report_counts_add_up(run, trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]  # reject
    df.loc[1, "trip_distance"] = -1  # reject
    df.loc[2, "trip_distance"] = MAX_TRIP_DISTANCE_MILES + 1  # quarantine
    df.loc[3, "passenger_count"] = 0  # quarantine
    df.loc[4, "fare_amount"] = -5  # quarantine
    df.loc[5, "total_amount"] = -5  # quarantine
    r = run(df).report
    assert r["records_accepted"] + r["records_rejected"] + r["records_quarantined"] == r["records_processed"]
    assert (r["records_rejected"], r["records_quarantined"], r["records_accepted"]) == (2, 4, len(df) - 6)


def test_removed_rows_land_in_exactly_one_file(run, trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]
    df.loc[1, "trip_distance"] = 500
    df.loc[2, "passenger_count"] = 0
    outcome = run(df)
    removed = [i for rows in outcome.by_rule.values() for i in rows]
    assert len(removed) == len(set(removed)) == 3
    assert set(removed) | set(outcome.accepted.index) == set(range(len(df)))


@pytest.mark.parametrize(
    "column,value,category",
    [
        ("tpep_pickup_datetime", pd.NaT, "invalid_timestamps"),
        ("tpep_dropoff_datetime", pd.NaT, "invalid_timestamps"),
        ("trip_distance", -0.5, "distance_outliers"),
        ("trip_distance", MAX_TRIP_DISTANCE_MILES + 0.1, "distance_outliers"),
        ("passenger_count", 0, "invalid_passenger_counts"),
        ("passenger_count", -1, "invalid_passenger_counts"),
        ("fare_amount", -0.01, "negative_fares"),
        ("total_amount", -0.01, "negative_total_amounts"),
    ],
)
def test_single_violation_lands_in_its_category(run, trips, column, value, category):
    df = trips.copy()
    df.loc[3, column] = value
    outcome = run(df)
    assert outcome.category(category) == [3]
    assert 3 not in outcome.accepted.index
    assert outcome.report[category] == 1
    assert sum(len(rows) for rows in outcome.by_rule.values()) == 1


def test_boundary_values_are_accepted(run, trips):
    df = trips.copy()
    df.loc[0, "trip_distance"] = 0  # zero distance is not negative
    df.loc[1, "trip_distance"] = MAX_TRIP_DISTANCE_MILES  # exactly the cap
    df.loc[2, "fare_amount"] = 0
    df.loc[3, "total_amount"] = 0
    df.loc[4, "passenger_count"] = 1
    assert counts(run(df)) == (len(df), 0, 0)


def test_dropoff_equal_to_pickup_is_rejected(run, trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]
    r = run(df).report
    assert (r["records_rejected"], r["invalid_timestamps"]) == (1, 1)


def test_negative_distance_is_rejected_but_outlier_is_quarantined(run, trips):
    df = trips.copy()
    df.loc[0, "trip_distance"] = -1
    df.loc[1, "trip_distance"] = 1000
    r = run(df).report
    assert (r["records_rejected"], r["records_quarantined"]) == (1, 1)
    assert r["distance_outliers"] == 2  # the category counts both


def test_priority_assigns_a_multi_violation_row_once(run, trips):
    df = trips.copy()
    # Trips every rule at once: it must land only in the highest-priority bucket.
    df.loc[0, "tpep_dropoff_datetime"] = pd.NaT
    df.loc[0, "trip_distance"] = -1
    df.loc[0, "passenger_count"] = 0
    df.loc[0, "fare_amount"] = -1
    df.loc[0, "total_amount"] = -1
    outcome = run(df)
    assert outcome.by_rule == {"SLV-002": [0]}
    # Distance beats passenger, passenger beats fare, fare beats total.
    df = trips.copy()
    df.loc[1, "trip_distance"] = 1000
    df.loc[1, "passenger_count"] = 0
    df.loc[2, "passenger_count"] = 0
    df.loc[2, "fare_amount"] = -1
    df.loc[3, "fare_amount"] = -1
    df.loc[3, "total_amount"] = -1
    outcome = run(df)
    assert outcome.category("distance_outliers") == [1]
    assert outcome.category("invalid_passenger_counts") == [2]
    assert outcome.category("negative_fares") == [3]
    assert outcome.category("negative_total_amounts") == []


def test_flags_annotate_but_keep_rows(run, trips):
    df = trips.copy()
    df.loc[0, "tpep_pickup_datetime"] = pd.Timestamp("2009-01-01 08:00")
    df.loc[0, "tpep_dropoff_datetime"] = pd.Timestamp("2009-01-01 08:15")
    df.loc[1, "tpep_dropoff_datetime"] = pd.Timestamp("2025-01-01 08:15")  # later year: not flagged
    outcome = run(df)
    assert outcome.report["records_accepted"] == len(df)
    assert outcome.report["records_flagged_pickup_year_mismatch"] == 1
    assert outcome.report["records_flagged_dropoff_year_mismatch"] == 1  # row 0's dropoff is < year
    assert bool(outcome.accepted.loc[0, "flag_pickup_year_mismatch"]) is True
    assert bool(outcome.accepted.loc[1, "flag_pickup_year_mismatch"]) is False
    assert bool(outcome.accepted.loc[1, "flag_dropoff_year_mismatch"]) is False


def test_flags_follow_the_period_variable(run, trips):
    # The same rows cleaned as a 2025 month: every pickup is now off-year.
    assert run(trips, 2025, 1).report["records_flagged_pickup_year_mismatch"] == len(trips)


def test_flags_count_only_kept_rows(run, trips):
    df = trips.copy()
    df.loc[0, "tpep_pickup_datetime"] = pd.Timestamp("2009-01-01 08:00")
    df.loc[0, "fare_amount"] = -1  # quarantined, so its flag isn't reported
    assert run(df).report["records_flagged_pickup_year_mismatch"] == 0


def test_null_monitor_columns_are_counted_not_dropped(run, trips):
    df = trips.copy()
    df.loc[0:2, "RatecodeID"] = None
    df.loc[5, "Airport_fee"] = None
    outcome = run(df)
    assert outcome.report["records_accepted"] == len(df)
    assert outcome.report["missing_value_counts"] == {
        "passenger_count": 0,
        "RatecodeID": 3,
        "store_and_fwd_flag": 0,
        "congestion_surcharge": 0,
        "Airport_fee": 1,
    }


def test_null_numeric_values_are_not_treated_as_violations(run, trips):
    # NULL compares as not-a-hit, so a null fare/passenger count is
    # monitored, not quarantined -- matches the original pandas masks.
    df = trips.copy()
    df.loc[0, "passenger_count"] = None
    df.loc[1, "fare_amount"] = None
    assert counts(run(df)) == (len(df), 0, 0)


def test_duplicates_are_counted_but_kept(run, trips):
    df = pd.concat([trips, trips.iloc[[0]]], ignore_index=True)
    outcome = run(df)
    assert outcome.report["duplicate_records"] == 1
    assert outcome.report["records_accepted"] == len(df)


def test_empty_frame(run, trips):
    outcome = run(trips.iloc[0:0])
    assert counts(outcome) == (0, 0, 0)
    assert outcome.report["records_processed"] == 0


def test_report_values_are_plain_ints(run, trips):
    r = run(trips).report
    for key, value in r.items():
        if key in ("period", "missing_value_counts"):
            continue
        assert type(value) is int, key  # json.dump chokes on numpy ints


def test_make_trips_helper_spans_one_month():
    df = make_trips(5, 2023, 2)
    assert (df["tpep_pickup_datetime"].dt.month == 2).all()
