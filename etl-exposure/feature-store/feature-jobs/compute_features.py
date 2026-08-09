"""
Computes zone x hour features from Silver trips and publishes them to both
the offline store (PostgreSQL, full historical table) and the online store
(Redis, latest snapshot for low-latency lookup by the API / inference code).

Features per (PULocationID, pickup_hour):
  trip_count, avg_fare, avg_trip_distance, avg_tip, avg_passenger_count

These feed the fare-prediction model in ml/training and the
/zones/{zone_id}/features lookup in api/fastapi.

Usage:
    python "feature-store/feature-jobs/compute_features.py"
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import pandas as pd
from pyspark.sql import DataFrame as SparkDataFrame, functions as F

from common.db import get_postgres_connection, get_redis_client
from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark

FEATURE_TABLE = "zone_hour_features"


def build_features(df: SparkDataFrame) -> pd.DataFrame:
    # Aggregation happens in Spark (140M+ rows); the result is only a few
    # thousand rows, small enough to bring to the driver as pandas for the
    # existing psycopg2/redis write logic below.
    aggregated = (
        df.withColumn("pickup_hour", F.hour("tpep_pickup_datetime"))
        .groupBy("PULocationID", "pickup_hour")
        .agg(
            F.count(F.lit(1)).alias("trip_count"),
            F.avg("fare_amount").alias("avg_fare"),
            F.avg("trip_distance").alias("avg_trip_distance"),
            F.avg("tip_amount").alias("avg_tip"),
            F.avg("passenger_count").alias("avg_passenger_count"),
        )
    )
    return aggregated.toPandas()


def write_postgres(features: pd.DataFrame) -> None:
    rows = [
        (
            int(r.PULocationID),
            int(r.pickup_hour),
            int(r.trip_count),
            float(r.avg_fare) if pd.notna(r.avg_fare) else None,
            float(r.avg_trip_distance) if pd.notna(r.avg_trip_distance) else None,
            float(r.avg_tip) if pd.notna(r.avg_tip) else None,
            float(r.avg_passenger_count) if pd.notna(r.avg_passenger_count) else None,
        )
        for r in features.itertuples(index=False)
    ]

    conn = get_postgres_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {FEATURE_TABLE} (
                    "PULocationID" INTEGER NOT NULL,
                    pickup_hour INTEGER NOT NULL,
                    trip_count BIGINT,
                    avg_fare DOUBLE PRECISION,
                    avg_trip_distance DOUBLE PRECISION,
                    avg_tip DOUBLE PRECISION,
                    avg_passenger_count DOUBLE PRECISION,
                    PRIMARY KEY ("PULocationID", pickup_hour)
                )
                """
            )
            cur.execute(f"TRUNCATE {FEATURE_TABLE}")
            cur.executemany(
                f"""
                INSERT INTO {FEATURE_TABLE}
                ("PULocationID", pickup_hour, trip_count, avg_fare, avg_trip_distance, avg_tip, avg_passenger_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def write_redis(features: pd.DataFrame) -> int:
    client = get_redis_client()
    count = 0
    for r in features.itertuples(index=False):
        key = f"features:zone:{int(r.PULocationID)}:hour:{int(r.pickup_hour)}"
        value = {
            "trip_count": int(r.trip_count),
            "avg_fare": round(float(r.avg_fare), 4) if pd.notna(r.avg_fare) else None,
            "avg_trip_distance": round(float(r.avg_trip_distance), 4) if pd.notna(r.avg_trip_distance) else None,
            "avg_tip": round(float(r.avg_tip), 4) if pd.notna(r.avg_tip) else None,
            "avg_passenger_count": round(float(r.avg_passenger_count), 4)
            if pd.notna(r.avg_passenger_count)
            else None,
        }
        client.set(key, json.dumps(value))
        count += 1
    return count


def run() -> dict:
    spark = get_spark("feature-store-compute-features")
    try:
        features = build_features(load_silver_trips(spark))
    finally:
        spark.stop()

    write_postgres(features)
    redis_count = write_redis(features)
    return {
        "feature_rows": int(len(features)),
        "postgres_table": FEATURE_TABLE,
        "redis_keys_written": redis_count,
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
