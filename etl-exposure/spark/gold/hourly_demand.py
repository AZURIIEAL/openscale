"""
Gold: hourly_demand -- trip counts and average fare by hour-of-day (0-23),
aggregated across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/hourly_demand.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import DataFrame, functions as F

from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path


def build(df: DataFrame) -> DataFrame:
    return (
        df.withColumn("pickup_hour", F.hour("tpep_pickup_datetime"))
        .groupBy("pickup_hour")
        .agg(
            F.count(F.lit(1)).alias("trip_count"),
            F.avg("fare_amount").alias("avg_fare"),
            F.avg("trip_distance").alias("avg_trip_distance"),
            F.avg("passenger_count").alias("avg_passenger_count"),
        )
        .orderBy("pickup_hour")
    )


def run() -> str:
    spark = get_spark("gold-hourly-demand")
    try:
        hourly = build(load_silver_trips(spark))
        path = lake_path("gold", "hourly_demand")
        hourly.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
