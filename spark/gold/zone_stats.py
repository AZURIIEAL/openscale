"""
Gold: zone_stats -- pickup-zone level trip statistics (by PULocationID),
aggregated across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/zone_stats.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import DataFrame, functions as F

from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path


def build(df: DataFrame) -> DataFrame:
    return (
        df.groupBy("PULocationID")
        .agg(
            F.count(F.lit(1)).alias("trip_count"),
            F.sum("total_amount").alias("total_revenue"),
            F.avg("fare_amount").alias("avg_fare"),
            F.avg("trip_distance").alias("avg_trip_distance"),
            F.avg("tip_amount").alias("avg_tip"),
        )
        .orderBy(F.desc("trip_count"))
    )


def run() -> str:
    spark = get_spark("gold-zone-stats")
    try:
        zones = build(load_silver_trips(spark))
        path = lake_path("gold", "zone_stats")
        zones.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
