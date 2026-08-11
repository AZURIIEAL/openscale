"""
Schema validation gate between raw files and the Bronze layer.

Checks column presence and dtype compatibility only -- row-level data
quality (nulls, negative fares, outliers, etc.) is the Silver layer's job,
not Bronze's.
"""

import pandas as pd

EXPECTED_COLUMNS = {
    "VendorID": "int32",
    "tpep_pickup_datetime": "datetime64[us]",
    "tpep_dropoff_datetime": "datetime64[us]",
    "passenger_count": "float64",
    "trip_distance": "float64",
    "RatecodeID": "float64",
    "store_and_fwd_flag": "object",
    "PULocationID": "int32",
    "DOLocationID": "int32",
    "payment_type": "int64",
    "fare_amount": "float64",
    "extra": "float64",
    "mta_tax": "float64",
    "tip_amount": "float64",
    "tolls_amount": "float64",
    "improvement_surcharge": "float64",
    "total_amount": "float64",
    "congestion_surcharge": "float64",
    "Airport_fee": "float64",
}


class SchemaValidationError(Exception):
    pass


def validate(df: pd.DataFrame) -> None:
    missing = EXPECTED_COLUMNS.keys() - set(df.columns)
    if missing:
        raise SchemaValidationError(f"Missing expected columns: {sorted(missing)}")

    mismatched = [
        f"{column}: expected {expected_dtype}, got {df[column].dtype}"
        for column, expected_dtype in EXPECTED_COLUMNS.items()
        if str(df[column].dtype) != expected_dtype
    ]
    if mismatched:
        raise SchemaValidationError("Dtype mismatch: " + "; ".join(mismatched))
