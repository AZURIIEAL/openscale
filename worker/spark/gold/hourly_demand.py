"""
Gold: hourly_demand -- trip counts and average fare by hour-of-day (0-23),
aggregated across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/hourly_demand.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd
from pyspark.sql import DataFrame, functions as F

from common.db import get_postgres_connection
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path

GOLD_TABLE = "gold_hourly_demand"


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


def write_postgres(pdf: pd.DataFrame) -> None:
    rows = [
        (
            int(r.pickup_hour),
            int(r.trip_count),
            float(r.avg_fare) if pd.notna(r.avg_fare) else None,
            float(r.avg_trip_distance) if pd.notna(r.avg_trip_distance) else None,
            float(r.avg_passenger_count) if pd.notna(r.avg_passenger_count) else None,
        )
        for r in pdf.itertuples(index=False)
    ]

    conn = get_postgres_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {GOLD_TABLE} (
                    pickup_hour INTEGER PRIMARY KEY,
                    trip_count BIGINT,
                    avg_fare DOUBLE PRECISION,
                    avg_trip_distance DOUBLE PRECISION,
                    avg_passenger_count DOUBLE PRECISION
                )
                """
            )
            cur.execute(f"TRUNCATE {GOLD_TABLE}")
            cur.executemany(
                f"""
                INSERT INTO {GOLD_TABLE}
                (pickup_hour, trip_count, avg_fare, avg_trip_distance, avg_passenger_count)
                VALUES (%s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def run() -> str:
    spark = get_spark("gold-hourly-demand")
    try:
        built = build(load_silver_trips(spark))
        write_postgres(built.toPandas())
        path = lake_path("gold", "hourly_demand")
        built.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
