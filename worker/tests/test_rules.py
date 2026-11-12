import pandas as pd
import pytest

from spark.silver.rules import MAX_TRIP_DISTANCE_MILES, QUARANTINE_CATEGORIES, apply_rules
from tests.conftest import make_trips

YEAR, MONTH = 2024, 7


def counts(outcome):
    r = outcome.report
    return r["records_accepted"], r["records_rejected"], r["records_quarantined"]


def test_clean_frame_is_fully_accepted(trips):
    outcome = apply_rules(trips, YEAR, MONTH)
    assert counts(outcome) == (len(trips), 0, 0)
    assert all(len(q) == 0 for q in outcome.quarantine.values())
    assert outcome.report["period"] == "2024-07"
    assert outcome.report["records_processed"] == len(trips)
    assert outcome.report["duplicate_records"] == 0


def test_report_counts_add_up(trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]  # reject
    df.loc[1, "trip_distance"] = -1  # reject
    df.loc[2, "trip_distance"] = MAX_TRIP_DISTANCE_MILES + 1  # quarantine
    df.loc[3, "passenger_count"] = 0  # quarantine
    df.loc[4, "fare_amount"] = -5  # quarantine
    df.loc[5, "total_amount"] = -5  # quarantine
    r = apply_rules(df, YEAR, MONTH).report
    assert r["records_accepted"] + r["records_rejected"] + r["records_quarantined"] == r["records_processed"]
    assert r["records_rejected"] == 2
    assert r["records_quarantined"] == 4
    assert r["records_accepted"] == len(df) - 6


def test_quarantine_frames_cover_every_excluded_row_exactly_once(trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]
    df.loc[1, "trip_distance"] = 500
    df.loc[2, "passenger_count"] = 0
    outcome = apply_rules(df, YEAR, MONTH)
    quarantined_index = pd.concat(outcome.quarantine.values()).index
    assert quarantined_index.is_unique
    assert set(quarantined_index) | set(outcome.accepted.index) == set(df.index)
    assert set(outcome.quarantine) == set(QUARANTINE_CATEGORIES)


@pytest.mark.parametrize(
    "column,value,category",
    [
        ("tpep_pickup_datetime", pd.NaT, "invalid_timestamps"),
        ("tpep_dropoff_datetime", pd.NaT, "invalid_timestamps"),
        ("trip_distance", -0.5, "distance_outliers"),
        ("trip_distance", MAX_TRIP_DISTANCE_MILES + 0.1, "distance_outliers"),
        ("passenger_count", 0, "invalid_passenger_count"),
        ("passenger_count", -1, "invalid_passenger_count"),
        ("fare_amount", -0.01, "negative_fares"),
        ("total_amount", -0.01, "negative_total_amounts"),
    ],
)
def test_single_violation_lands_in_its_category(trips, column, value, category):
    df = trips.copy()
    df.loc[3, column] = value
    outcome = apply_rules(df, YEAR, MONTH)
    assert list(outcome.quarantine[category].index) == [3]
    assert 3 not in outcome.accepted.index
    for other, frame in outcome.quarantine.items():
        if other != category:
            assert len(frame) == 0


def test_boundary_values_are_accepted(trips):
    df = trips.copy()
    df.loc[0, "trip_distance"] = 0  # zero distance is not negative
    df.loc[1, "trip_distance"] = MAX_TRIP_DISTANCE_MILES  # exactly the cap
    df.loc[2, "fare_amount"] = 0
    df.loc[3, "total_amount"] = 0
    df.loc[4, "passenger_count"] = 1
    outcome = apply_rules(df, YEAR, MONTH)
    assert counts(outcome) == (len(df), 0, 0)


def test_dropoff_equal_to_pickup_is_rejected(trips):
    df = trips.copy()
    df.loc[0, "tpep_dropoff_datetime"] = df.loc[0, "tpep_pickup_datetime"]
    outcome = apply_rules(df, YEAR, MONTH)
    assert outcome.report["records_rejected"] == 1
    assert outcome.report["invalid_timestamps"] == 1


def test_negative_distance_is_rejected_but_outlier_is_quarantined(trips):
    df = trips.copy()
    df.loc[0, "trip_distance"] = -1
    df.loc[1, "trip_distance"] = 1000
    r = apply_rules(df, YEAR, MONTH).report
    assert r["records_rejected"] == 1
    assert r["records_quarantined"] == 1
    assert r["distance_outliers"] == 2  # the category counts both


def test_priority_assigns_a_multi_violation_row_once(trips):
    df = trips.copy()
    # Trips every rule at once: it must land only in the highest-priority bucket.
    df.loc[0, "tpep_dropoff_datetime"] = pd.NaT
    df.loc[0, "trip_distance"] = -1
    df.loc[0, "passenger_count"] = 0
    df.loc[0, "fare_amount"] = -1
    df.loc[0, "total_amount"] = -1
    outcome = apply_rules(df, YEAR, MONTH)
    assert list(outcome.quarantine["invalid_timestamps"].index) == [0]
    assert sum(len(q) for q in outcome.quarantine.values()) == 1
    # Distance beats passenger, passenger beats fare, fare beats total.
    df = trips.copy()
    df.loc[1, "trip_distance"] = 1000
    df.loc[1, "passenger_count"] = 0
    df.loc[2, "passenger_count"] = 0
    df.loc[2, "fare_amount"] = -1
    df.loc[3, "fare_amount"] = -1
    df.loc[3, "total_amount"] = -1
    outcome = apply_rules(df, YEAR, MONTH)
    assert list(outcome.quarantine["distance_outliers"].index) == [1]
    assert list(outcome.quarantine["invalid_passenger_count"].index) == [2]
    assert list(outcome.quarantine["negative_fares"].index) == [3]
    assert len(outcome.quarantine["negative_total_amounts"]) == 0


def test_flags_annotate_but_keep_rows(trips):
    df = trips.copy()
    df.loc[0, "tpep_pickup_datetime"] = pd.Timestamp("2009-01-01 08:00")
    df.loc[0, "tpep_dropoff_datetime"] = pd.Timestamp("2009-01-01 08:15")
    df.loc[1, "tpep_dropoff_datetime"] = pd.Timestamp("2025-01-01 08:15")  # later year: not flagged
    outcome = apply_rules(df, YEAR, MONTH)
    assert outcome.report["records_accepted"] == len(df)
    assert outcome.report["records_flagged_pickup_year_mismatch"] == 1
    assert outcome.report["records_flagged_dropoff_year_mismatch"] == 1  # row 0's dropoff is < year
    assert bool(outcome.accepted.loc[0, "flag_pickup_year_mismatch"]) is True
    assert bool(outcome.accepted.loc[1, "flag_pickup_year_mismatch"]) is False
    assert bool(outcome.accepted.loc[1, "flag_dropoff_year_mismatch"]) is False
    assert "flag_pickup_year_mismatch" in outcome.accepted.columns
    assert "flag_pickup_year_mismatch" not in df.columns  # input untouched


def test_null_monitor_columns_are_counted_not_dropped(trips):
    df = trips.copy()
    df.loc[0:2, "RatecodeID"] = None
    df.loc[5, "Airport_fee"] = None
    outcome = apply_rules(df, YEAR, MONTH)
    assert outcome.report["records_accepted"] == len(df)
    assert outcome.report["missing_value_counts"]["RatecodeID"] == 3
    assert outcome.report["missing_value_counts"]["Airport_fee"] == 1
    assert outcome.report["missing_value_counts"]["passenger_count"] == 0


def test_null_numeric_values_are_not_treated_as_violations(trips):
    # NaN compares False against every threshold, so a null fare/passenger
    # count is monitored, not quarantined -- matches the original masks.
    df = trips.copy()
    df.loc[0, "passenger_count"] = None
    df.loc[1, "fare_amount"] = None
    outcome = apply_rules(df, YEAR, MONTH)
    assert counts(outcome) == (len(df), 0, 0)


def test_duplicates_are_counted_but_kept(trips):
    df = pd.concat([trips, trips.iloc[[0]]], ignore_index=True)
    outcome = apply_rules(df, YEAR, MONTH)
    assert outcome.report["duplicate_records"] == 1
    assert outcome.report["records_accepted"] == len(df)


def test_empty_frame(trips):
    outcome = apply_rules(trips.iloc[0:0], YEAR, MONTH)
    assert counts(outcome) == (0, 0, 0)
    assert outcome.report["records_processed"] == 0


def test_input_frame_is_not_mutated(trips):
    before = trips.copy()
    apply_rules(trips, YEAR, MONTH)
    pd.testing.assert_frame_equal(trips, before)


def test_report_values_are_plain_ints(trips):
    r = apply_rules(trips, YEAR, MONTH).report
    for key, value in r.items():
        if key in ("period", "missing_value_counts"):
            continue
        assert type(value) is int, key  # json.dump chokes on numpy ints


def test_make_trips_helper_spans_one_month():
    df = make_trips(5, 2023, 2)
    assert (df["tpep_pickup_datetime"].dt.month == 2).all()
