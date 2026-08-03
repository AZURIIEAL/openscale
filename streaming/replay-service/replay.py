"""
Replays historical Silver trips onto Kafka as if they were arriving live.

Reads Silver trip data from MinIO, orders it by pickup time within the
chosen day, and publishes each trip as a JSON event to the
`yellow-taxi-trips` Kafka topic.

Replaying a full day at real 1x speed takes 24 real hours, so this defaults
to `--speed 0` (fast-forward, no delay between sends). Pass e.g.
`--speed 3600` to replay at 3600x real-time (1 simulated hour ~= 1 real
second).

Usage:
    python "streaming/replay-service/replay.py" --date 2024-01-01
    python "streaming/replay-service/replay.py" --date 2024-01-01 --speed 3600 --limit 5000
"""

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "streaming" / "kafka-producer"))

import pandas as pd

from spark.common.loader import load_silver_trips
from producer import TRIPS_TOPIC, get_producer, send_trip


def load_day(pickup_date: str) -> pd.DataFrame:
    df = load_silver_trips()
    day = pd.Timestamp(pickup_date).date()
    return df[df["tpep_pickup_datetime"].dt.date == day].sort_values("tpep_pickup_datetime")


def replay(pickup_date: str, speed: float, limit: int | None = None) -> int:
    day_df = load_day(pickup_date)
    if limit:
        day_df = day_df.head(limit)

    producer = get_producer()
    sent = 0
    prev_pickup = None

    for _, row in day_df.iterrows():
        pickup_time = row["tpep_pickup_datetime"]
        if speed > 0 and prev_pickup is not None:
            gap_seconds = (pickup_time - prev_pickup).total_seconds()
            time.sleep(max(0.0, gap_seconds / speed))
        prev_pickup = pickup_time

        # pandas' own JSON encoder handles Timestamps/NaN/numpy dtypes
        # correctly, unlike a bare json.dumps(row.to_dict()).
        record = json.loads(row.to_json(date_format="iso"))
        send_trip(producer, record)
        sent += 1

    producer.flush()
    return sent


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default="2024-01-01", help="Pickup date (YYYY-MM-DD) to replay")
    parser.add_argument(
        "--speed", type=float, default=0, help="Replay speed multiplier; 0 = no delay (fast-forward)"
    )
    parser.add_argument("--limit", type=int, default=None, help="Max number of trips to replay")
    args = parser.parse_args()

    count = replay(args.date, args.speed, args.limit)
    print(f"Replayed {count} trips from {args.date} to topic '{TRIPS_TOPIC}'")
