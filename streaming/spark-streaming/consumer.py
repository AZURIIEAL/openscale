"""
Streaming consumer/aggregator for the `yellow-taxi-trips` Kafka topic.

NOTE: this is a plain Kafka consumer with in-memory pandas-free aggregation,
not a real Spark Structured Streaming job -- see docs/implementation-plan.md
Phase 5 (PySpark migration, deferred). Once that lands this becomes a
`spark.readStream.format("kafka")...` job instead; the aggregation logic
(hourly trip counts + revenue) carries over largely unchanged.

Consumes trip events and maintains rolling hourly demand + revenue
aggregates, printing a snapshot every `--print-every` messages and a final
summary when the topic goes idle for `--timeout-ms`.

Usage:
    python "streaming/spark-streaming/consumer.py"
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "streaming" / "kafka-producer"))

from kafka import KafkaConsumer

from producer import BOOTSTRAP_SERVERS, TRIPS_TOPIC


def consume(print_every: int = 500, timeout_ms: int = 30000) -> dict:
    consumer = KafkaConsumer(
        TRIPS_TOPIC,
        bootstrap_servers=BOOTSTRAP_SERVERS,
        auto_offset_reset="earliest",
        consumer_timeout_ms=timeout_ms,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    hourly_counts: dict[str, int] = defaultdict(int)
    hourly_revenue: dict[str, float] = defaultdict(float)
    total = 0

    for message in consumer:
        trip = message.value
        pickup_hour = trip["tpep_pickup_datetime"][:13]  # "2024-01-01T00"
        hourly_counts[pickup_hour] += 1
        hourly_revenue[pickup_hour] += trip.get("total_amount") or 0.0
        total += 1

        if total % print_every == 0:
            print(
                f"[{total} trips consumed] latest bucket {pickup_hour}: "
                f"{hourly_counts[pickup_hour]} trips, ${hourly_revenue[pickup_hour]:.2f} revenue"
            )

    consumer.close()
    print(f"Stream idle for {timeout_ms}ms, stopping. {total} trips across {len(hourly_counts)} hourly buckets.")
    return {"total_trips": total, "hourly_counts": dict(hourly_counts), "hourly_revenue": dict(hourly_revenue)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print-every", type=int, default=500)
    parser.add_argument(
        "--timeout-ms", type=int, default=30000, help="Stop after this many ms with no new messages"
    )
    args = parser.parse_args()

    consume(args.print_every, args.timeout_ms)
