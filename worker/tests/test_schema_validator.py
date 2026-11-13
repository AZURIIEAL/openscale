import pandas as pd
import pytest

from ingestion.validator.schema_validator import EXPECTED_COLUMNS, SchemaValidationError, validate


def bronze_frame() -> pd.DataFrame:
    """One row with every expected column at its expected dtype."""
    data = {}
    for column, dtype in EXPECTED_COLUMNS.items():
        if dtype.startswith("datetime64"):
            data[column] = pd.Series([pd.Timestamp("2024-07-01")]).astype(dtype)
        elif dtype == "object":
            data[column] = pd.Series(["N"], dtype="object")
        else:
            data[column] = pd.Series([1], dtype=dtype)
    return pd.DataFrame(data)


def test_conforming_frame_passes():
    validate(bronze_frame())


def test_extra_columns_are_tolerated():
    df = bronze_frame()
    df["cbd_congestion_fee"] = 0.75
    validate(df)


def test_missing_column_is_named():
    df = bronze_frame().drop(columns=["fare_amount"])
    with pytest.raises(SchemaValidationError) as exc:
        validate(df)
    assert "fare_amount" in str(exc.value)
    assert "Missing" in str(exc.value)


def test_dtype_mismatch_is_named():
    df = bronze_frame()
    df["VendorID"] = df["VendorID"].astype("int64")
    with pytest.raises(SchemaValidationError) as exc:
        validate(df)
    assert "VendorID: expected int32, got int64" in str(exc.value)


def test_missing_wins_over_mismatch():
    df = bronze_frame().drop(columns=["extra"])
    df["VendorID"] = df["VendorID"].astype("int64")
    with pytest.raises(SchemaValidationError) as exc:
        validate(df)
    assert "Missing" in str(exc.value)
