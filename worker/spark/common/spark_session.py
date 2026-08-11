"""
Shared Spark session, configured to read/write the same MinIO lake as the
pandas jobs (spark/common/storage.py) via Hadoop's S3A connector.

This is the real Phase 5 entry point: jobs that need to scale past what
pandas can hold in memory (see docs/implementation-plan.md's pandas
memory-wall finding) import get_spark()/lake_path() from here instead of
spark.common.storage.
"""

import os

from pyspark.sql import SparkSession

from spark.common.storage import LAKE_BUCKET, MINIO_ACCESS_KEY, MINIO_ENDPOINT, MINIO_SECRET_KEY

# Matches the Hadoop client version bundled inside this pyspark install
# (venv/Lib/site-packages/pyspark/jars/hadoop-client-api-3.5.0.jar) --
# hadoop-aws must match or S3A silently fails to load.
HADOOP_AWS_PACKAGE = "org.apache.hadoop:hadoop-aws:3.5.0"


def get_spark(app_name: str = "openscale", extra_packages: str | None = None) -> SparkSession:
    packages = HADOOP_AWS_PACKAGE if extra_packages is None else f"{HADOOP_AWS_PACKAGE},{extra_packages}"
    return (
        SparkSession.builder.appName(app_name)
        .master("local[*]")
        .config("spark.jars.packages", packages)
        .config("spark.hadoop.fs.s3a.endpoint", MINIO_ENDPOINT)
        .config("spark.hadoop.fs.s3a.access.key", MINIO_ACCESS_KEY)
        .config("spark.hadoop.fs.s3a.secret.key", MINIO_SECRET_KEY)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.driver.memory", os.environ.get("SPARK_DRIVER_MEMORY", "6g"))
        .config("spark.sql.shuffle.partitions", "8")  # local dev, not a real cluster
        .getOrCreate()
    )


def lake_path(*parts: str) -> str:
    """Build an s3a:// path under the lake bucket -- Spark's S3A connector,
    not pandas' s3fs, so this is deliberately separate from
    spark.common.storage.lake_path (which returns s3://...)."""
    return "s3a://" + "/".join((LAKE_BUCKET, *parts))
