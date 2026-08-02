"""
Locates the raw Parquet file for a given NYC Yellow Taxi reporting period.

TLC publishes monthly files at a predictable URL pattern
(https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_{year}-{month}.parquet).
This module currently resolves against files already downloaded into
data/raw/yellow_taxi/; swap `locate` for an actual HTTP fetch once automated
downloads are needed.
"""

from pathlib import Path

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "yellow_taxi"


def locate(year: int, month: int) -> Path:
    path = RAW_DIR / f"{year:04d}-{month:02d}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"No raw file for {year:04d}-{month:02d} at {path}. "
            "Download it into data/raw/yellow_taxi/ first."
        )
    return path


def available_periods() -> list[tuple[int, int]]:
    periods = []
    for f in sorted(RAW_DIR.glob("*.parquet")):
        year_str, month_str = f.stem.split("-")
        periods.append((int(year_str), int(month_str)))
    return periods
