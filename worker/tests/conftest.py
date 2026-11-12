"""Shared fixtures. Tests here import only pure modules (spark/silver/rules.py,
jobs/outcome.py, ingestion/downloader's month_range, the schema validator),
so they run with pandas alone -- no MinIO, Postgres, Spark or network."""

import pandas as pd
import pytest


def make_trips(n: int = 10, year: int = 2024, month: int = 7) -> pd.DataFrame:
    """A clean frame of n valid trips in the given period, with the Bronze
    columns the rules read. Tests then corrupt specific rows."""
    pickup = pd.date_range(f"{year:04d}-{month:02d}-01 08:00", periods=n, freq="h")
    return pd.DataFrame(
        {
            "tpep_pickup_datetime": pickup,
            "tpep_dropoff_datetime": pickup + pd.Timedelta(minutes=15),
            "passenger_count": [1.0] * n,
            "trip_distance": [2.5] * n,
            "RatecodeID": [1.0] * n,
            "store_and_fwd_flag": ["N"] * n,
            "fare_amount": [12.0] * n,
            "total_amount": [15.0] * n,
            "congestion_surcharge": [2.5] * n,
            "Airport_fee": [0.0] * n,
        }
    )


@pytest.fixture
def trips() -> pd.DataFrame:
    return make_trips()
