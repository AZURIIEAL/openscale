"""
Shared helper for loading combined Silver-layer output via Spark.

Replaces the old pandas version, which did pd.concat() across every Silver
month -- fine at 6 months (~20M rows) but blew past available RAM at 40
months (~140M rows, ~26GB+). Spark reads the whole prefix as one
distributed DataFrame without materializing it all in driver memory. See
docs/implementation-plan.md's pandas memory-wall finding (Phase 5).
"""

from pyspark.sql import DataFrame, SparkSession

from spark.common.spark_session import lake_path


def load_silver_trips(spark: SparkSession) -> DataFrame:
    return spark.read.parquet(lake_path("silver", "trips"))
