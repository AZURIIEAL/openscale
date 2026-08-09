"""
Gold: daily_revenue -- trip counts and revenue totals per pickup date,
across all available Silver months. Spark version (Phase 5) -- see
docs/implementation-plan.md for why the pandas version couldn't hold this
at 40 months of data.

Usage:
    python spark/gold/daily_revenue.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import DataFrame, functions as F

from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path


def build(df: DataFrame) -> DataFrame:
    # SLV-008 flags pickups outside the reporting period but keeps them in
    # Silver -- exclude them here so they don't create bogus revenue days
    # decades away from the actual dataset period.
    df = df.filter(~F.col("flag_pickup_year_mismatch"))
    return (
        df.withColumn("pickup_date", F.to_date("tpep_pickup_datetime"))
        .groupBy("pickup_date")
        .agg(
            F.count(F.lit(1)).alias("trip_count"),
            F.sum("total_amount").alias("total_revenue"),
            F.sum("fare_amount").alias("total_fare"),
            F.sum("tip_amount").alias("total_tips"),
            F.avg("fare_amount").alias("avg_fare"),
        )
        .orderBy("pickup_date")
    )


def run() -> str:
    spark = get_spark("gold-daily-revenue")
    try:
        daily = build(load_silver_trips(spark))
        path = lake_path("gold", "daily_revenue")
        daily.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
