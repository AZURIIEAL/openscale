"""
Gold: zone_stats -- pickup-zone level trip statistics (by PULocationID),
aggregated across all available Silver months. Spark version (Phase 5).

Usage:
    python spark/gold/zone_stats.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd
from pyspark.sql import DataFrame, functions as F

from common.db import get_postgres_connection
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark, lake_path

GOLD_TABLE = "gold_zone_stats"


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


def write_postgres(pdf: pd.DataFrame) -> None:
    rows = [
        (
            int(r.PULocationID),
            int(r.trip_count),
            float(r.total_revenue) if pd.notna(r.total_revenue) else None,
            float(r.avg_fare) if pd.notna(r.avg_fare) else None,
            float(r.avg_trip_distance) if pd.notna(r.avg_trip_distance) else None,
            float(r.avg_tip) if pd.notna(r.avg_tip) else None,
        )
        for r in pdf.itertuples(index=False)
    ]

    conn = get_postgres_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {GOLD_TABLE} (
                    pu_location_id INTEGER PRIMARY KEY,
                    trip_count BIGINT,
                    total_revenue DOUBLE PRECISION,
                    avg_fare DOUBLE PRECISION,
                    avg_trip_distance DOUBLE PRECISION,
                    avg_tip DOUBLE PRECISION
                )
                """
            )
            cur.execute(f"TRUNCATE {GOLD_TABLE}")
            cur.executemany(
                f"""
                INSERT INTO {GOLD_TABLE}
                (pu_location_id, trip_count, total_revenue, avg_fare, avg_trip_distance, avg_tip)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def run() -> str:
    spark = get_spark("gold-zone-stats")
    try:
        zones = build(load_silver_trips(spark))
        write_postgres(zones.toPandas())
        path = lake_path("gold", "zone_stats")
        zones.coalesce(1).write.mode("overwrite").parquet(path)
        return path
    finally:
        spark.stop()


if __name__ == "__main__":
    output_path = run()
    print(f"Wrote {output_path}")
