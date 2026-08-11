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

import pandas as pd
from pyspark.sql import DataFrame, functions as F

from common.db import get_postgres_connection
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path

GOLD_TABLE = "gold_daily_revenue"


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


def write_postgres(pdf: pd.DataFrame) -> None:
    rows = [
        (
            r.pickup_date,
            int(r.trip_count),
            float(r.total_revenue) if pd.notna(r.total_revenue) else None,
            float(r.total_fare) if pd.notna(r.total_fare) else None,
            float(r.total_tips) if pd.notna(r.total_tips) else None,
            float(r.avg_fare) if pd.notna(r.avg_fare) else None,
        )
        for r in pdf.itertuples(index=False)
    ]

    conn = get_postgres_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {GOLD_TABLE} (
                    pickup_date DATE PRIMARY KEY,
                    trip_count BIGINT,
                    total_revenue DOUBLE PRECISION,
                    total_fare DOUBLE PRECISION,
                    total_tips DOUBLE PRECISION,
                    avg_fare DOUBLE PRECISION
                )
                """
            )
            cur.execute(f"TRUNCATE {GOLD_TABLE}")
            cur.executemany(
                f"""
                INSERT INTO {GOLD_TABLE}
                (pickup_date, trip_count, total_revenue, total_fare, total_tips, avg_fare)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def run() -> str:
    spark = get_spark("gold-daily-revenue")
    try:
        built = build(load_silver_trips(spark))
        pdf = built.toPandas()
        pdf["pickup_date"] = pdf["pickup_date"].apply(lambda d: d if d is None else pd.Timestamp(d).date())
        write_postgres(pdf)
        path = lake_path("gold", "daily_revenue")
        built.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
