"""
Real Spark Structured Streaming consumer for the `yellow-taxi-trips` Kafka
topic -- replaces the earlier plain-`kafka-python` version now that Phase 5
(PySpark migration) has landed. See docs/issues-and-fixes.md and
docs/implementation-plan.md Phase 7.

Reads the topic as a streaming DataFrame, parses each JSON event against the
Silver-trip schema, and maintains tumbling 1-hour windowed aggregates
(trip count + revenue) using Structured Streaming's built-in watermarking,
printing each micro-batch's updated windows to the console.

Usage:
    python "streaming/spark-streaming/consumer.py"
    python "streaming/spark-streaming/consumer.py" --starting-offsets earliest --timeout-seconds 60

Note: `--timeout-seconds` just bounds how long this demo script runs before
calling query.stop() -- Structured Streaming has no built-in "stop after N ms
idle" the way the old kafka-python consumer's consumer_timeout_ms did.  A
real deployment would run indefinitely (omit --timeout-seconds, Ctrl+C to
stop) rather than exit on its own.
"""

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "streaming" / "kafka-producer"))

from pyspark.sql import functions as F
from pyspark.sql.types import (
    BooleanType,
    DoubleType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

from spark.common.spark_session import get_spark
from producer import BOOTSTRAP_SERVERS, TRIPS_TOPIC

# Matches the Spark build (spark-core_2.13-4.2.0.jar) -- same version-matching
# concern as HADOOP_AWS_PACKAGE in spark_session.py.
SPARK_KAFKA_PACKAGE = "org.apache.spark:spark-sql-kafka-0-10_2.13:4.2.0"

# Checkpoint dir is local (not MinIO) -- gitignored, cleared on every run
# below since this is a rerunnable local demo, not a long-lived deployment
# that needs to resume from a prior offset on restart.
CHECKPOINT_DIR = Path(__file__).resolve().parent / ".checkpoints"

# Mirrors the Silver trip schema (19 Bronze columns + the 2 SLV-008/009 flag
# columns added by spark/silver/validator.py) -- this is what replay.py
# publishes to Kafka via row.to_json().
TRIP_SCHEMA = StructType(
    [
        StructField("VendorID", IntegerType()),
        StructField("tpep_pickup_datetime", TimestampType()),
        StructField("tpep_dropoff_datetime", TimestampType()),
        StructField("passenger_count", DoubleType()),
        StructField("trip_distance", DoubleType()),
        StructField("RatecodeID", DoubleType()),
        StructField("store_and_fwd_flag", StringType()),
        StructField("PULocationID", IntegerType()),
        StructField("DOLocationID", IntegerType()),
        StructField("payment_type", LongType()),
        StructField("fare_amount", DoubleType()),
        StructField("extra", DoubleType()),
        StructField("mta_tax", DoubleType()),
        StructField("tip_amount", DoubleType()),
        StructField("tolls_amount", DoubleType()),
        StructField("improvement_surcharge", DoubleType()),
        StructField("total_amount", DoubleType()),
        StructField("congestion_surcharge", DoubleType()),
        StructField("Airport_fee", DoubleType()),
        StructField("flag_pickup_year_mismatch", BooleanType()),
        StructField("flag_dropoff_year_mismatch", BooleanType()),
    ]
)


def build_query(spark, starting_offsets: str):
    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", BOOTSTRAP_SERVERS)
        .option("subscribe", TRIPS_TOPIC)
        .option("startingOffsets", starting_offsets)
        .load()
    )

    trips = raw.select(F.from_json(F.col("value").cast("string"), TRIP_SCHEMA).alias("trip")).select("trip.*")

    # No .orderBy() here -- Structured Streaming forbids sorting on a
    # streaming aggregate unless outputMode is "complete", and "update"
    # (only changed windows per micro-batch) is the right mode for an
    # unbounded stream. Windows print in whatever order they're updated in.
    hourly = (
        trips.withWatermark("tpep_pickup_datetime", "1 hour")
        .groupBy(F.window("tpep_pickup_datetime", "1 hour").alias("pickup_hour"))
        .agg(
            F.count("*").alias("trip_count"),
            F.sum("total_amount").alias("revenue"),
        )
    )

    return (
        hourly.writeStream.outputMode("update")
        .format("console")
        .option("truncate", False)
        .option("checkpointLocation", str(CHECKPOINT_DIR))
        .trigger(processingTime="10 seconds")
        .start()
    )


def consume(starting_offsets: str = "earliest", timeout_seconds: float | None = None) -> None:
    if CHECKPOINT_DIR.exists():
        shutil.rmtree(CHECKPOINT_DIR)

    spark = get_spark("streaming-consumer", extra_packages=SPARK_KAFKA_PACKAGE)
    spark.sparkContext.setLogLevel("WARN")
    try:
        query = build_query(spark, starting_offsets)
        if timeout_seconds is not None:
            query.awaitTermination(timeout_seconds)
            query.stop()
        else:
            query.awaitTermination()
    finally:
        spark.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--starting-offsets",
        default="earliest",
        choices=["earliest", "latest"],
        help="Where to start reading the topic from (default: earliest, so a fresh run sees everything replay.py already published)",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=60.0,
        help="Stop after this many seconds (pass a large value, or handle Ctrl+C, for a long-running consumer)",
    )
    args = parser.parse_args()

    consume(args.starting_offsets, args.timeout_seconds)
