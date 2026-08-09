"""
Locates -- and now actually fetches -- the raw Parquet file for a given
NYC Yellow Taxi reporting period.

TLC publishes monthly files at a predictable CloudFront URL pattern. This
module downloads directly from there into data/raw/yellow_taxi/, streaming
to a .part temp file and renaming on success so a failed/interrupted
download never leaves a corrupt file at the final path.

Usage:
    python "ingestion/downloader/downloader.py" --year 2024 --month 7
    python "ingestion/downloader/downloader.py" --start 2024-07 --end 2024-12
    python "ingestion/downloader/downloader.py" --start 2024-07 --end 2024-12 --force
"""

import argparse
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "yellow_taxi"
TLC_URL_TEMPLATE = "https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_{year:04d}-{month:02d}.parquet"


class DownloadError(Exception):
    pass


def locate(year: int, month: int) -> Path:
    path = RAW_DIR / f"{year:04d}-{month:02d}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"No raw file for {year:04d}-{month:02d} at {path}. "
            "Run download(year, month) or the CLI in this module first."
        )
    return path


def download(year: int, month: int, force: bool = False) -> Path:
    """Fetch one month's Parquet file from TLC into data/raw/yellow_taxi/.

    Skips the request entirely if the file already exists, unless
    force=True. Streams to a .part file and renames on success so a
    failed download never leaves a corrupt file at the final path.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dest = RAW_DIR / f"{year:04d}-{month:02d}.parquet"
    if dest.exists() and not force:
        return dest

    url = TLC_URL_TEMPLATE.format(year=year, month=month)
    tmp_path = dest.with_suffix(".part")

    with requests.get(url, stream=True, timeout=30) as response:
        if response.status_code in (403, 404):
            raise DownloadError(
                f"No TLC data published for {year:04d}-{month:02d} "
                f"(HTTP {response.status_code} from {url}). "
                "TLC typically publishes each month's data ~2 months later."
            )
        response.raise_for_status()

        with open(tmp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)

    tmp_path.replace(dest)
    return dest


def ensure(year: int, month: int) -> Path:
    """Return the local path for a period, downloading it if missing."""
    try:
        return locate(year, month)
    except FileNotFoundError:
        return download(year, month)


def available_periods() -> list[tuple[int, int]]:
    periods = []
    for f in sorted(RAW_DIR.glob("*.parquet")):
        year_str, month_str = f.stem.split("-")
        periods.append((int(year_str), int(month_str)))
    return periods


def month_range(start: str, end: str) -> list[tuple[int, int]]:
    start_year, start_month = (int(p) for p in start.split("-"))
    end_year, end_month = (int(p) for p in end.split("-"))
    periods = []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        periods.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return periods


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="Single period: year (use with --month)")
    parser.add_argument("--month", type=int, help="Single period: month (use with --year)")
    parser.add_argument("--start", help="Range start, YYYY-MM (use with --end)")
    parser.add_argument("--end", help="Range end, YYYY-MM (use with --start)")
    parser.add_argument("--force", action="store_true", help="Re-download even if the file already exists")
    args = parser.parse_args()

    if args.year and args.month:
        periods = [(args.year, args.month)]
    elif args.start and args.end:
        periods = month_range(args.start, args.end)
    else:
        parser.error("Pass either --year/--month or --start/--end")

    for year, month in periods:
        try:
            path = download(year, month, force=args.force)
            print(f"{year:04d}-{month:02d}: OK -> {path}")
        except DownloadError as exc:
            print(f"{year:04d}-{month:02d}: SKIPPED ({exc})")
