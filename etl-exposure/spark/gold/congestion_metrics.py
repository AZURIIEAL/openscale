"""
Gold: congestion_metrics -- congestion-surcharge totals and incidence rate
per pickup date, across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/congestion_metrics.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import DataFrame, functions as F

from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path


def build(df: DataFrame) -> DataFrame:
    # See daily_revenue.py: exclude SLV-008 year-mismatched pickups so they
    # don't create bogus dates decades away from the actual dataset period.
    df = df.filter(~F.col("flag_pickup_year_mismatch"))
    df = df.withColumn(
        "has_congestion", F.coalesce(F.col("congestion_surcharge"), F.lit(0.0)) > 0
    )
    congestion = (
        df.withColumn("pickup_date", F.to_date("tpep_pickup_datetime"))
        .groupBy("pickup_date")
        .agg(
            F.count(F.lit(1)).alias("trip_count"),
            F.sum(F.col("has_congestion").cast("int")).alias("trips_with_congestion"),
            F.sum("congestion_surcharge").alias("total_congestion_surcharge"),
        )
        .withColumn(
            "congestion_trip_pct", F.col("trips_with_congestion") / F.col("trip_count") * 100
        )
        .orderBy("pickup_date")
    )
    return congestion


def run() -> str:
    spark = get_spark("gold-congestion-metrics")
    try:
        congestion = build(load_silver_trips(spark))
        path = lake_path("gold", "congestion_metrics")
        congestion.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
