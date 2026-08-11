"""
Gold: congestion_metrics -- congestion-surcharge totals and incidence rate
per pickup date, across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/congestion_metrics.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd
from pyspark.sql import DataFrame, functions as F

from common.db import get_postgres_connection
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path

GOLD_TABLE = "gold_congestion_metrics"


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


def write_postgres(pdf: pd.DataFrame) -> None:
    rows = [
        (
            r.pickup_date,
            int(r.trip_count),
            int(r.trips_with_congestion),
            float(r.total_congestion_surcharge) if pd.notna(r.total_congestion_surcharge) else None,
            float(r.congestion_trip_pct) if pd.notna(r.congestion_trip_pct) else None,
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
                    trips_with_congestion BIGINT,
                    total_congestion_surcharge DOUBLE PRECISION,
                    congestion_trip_pct DOUBLE PRECISION
                )
                """
            )
            cur.execute(f"TRUNCATE {GOLD_TABLE}")
            cur.executemany(
                f"""
                INSERT INTO {GOLD_TABLE}
                (pickup_date, trip_count, trips_with_congestion, total_congestion_surcharge, congestion_trip_pct)
                VALUES (%s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def run() -> str:
    spark = get_spark("gold-congestion-metrics")
    try:
        built = build(load_silver_trips(spark))
        pdf = built.toPandas()
        pdf["pickup_date"] = pdf["pickup_date"].apply(lambda d: d if d is None else pd.Timestamp(d).date())
        write_postgres(pdf)
        path = lake_path("gold", "congestion_metrics")
        built.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
