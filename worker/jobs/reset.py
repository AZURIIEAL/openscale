"""
The `reset` job: wipes everything earlier pipeline stages produced --
Gold/feature tables in Postgres, the online feature snapshot in Redis, and
the Bronze/Silver/Gold objects in MinIO -- so the lake can be rebuilt from a
clean slate. Triggered only from the Pipelines screen's dedicated "Clear
Data" control, not listed as a normal pipeline stage.
"""

from common.db import get_postgres_connection, get_redis_client
from registry import JobContext, job
from spark.common.storage import delete_prefix

POSTGRES_TABLES = [
    "gold_daily_revenue",
    "gold_hourly_demand",
    "gold_zone_stats",
    "gold_congestion_metrics",
    "zone_hour_features",
]

LAKE_PREFIXES = ["bronze", "silver", "gold"]

ONLINE_FEATURE_PATTERN = "features:zone:*"


def truncate_postgres_tables() -> str:
    # Postgres' TRUNCATE has no IF EXISTS clause (unlike DROP TABLE), so
    # existence has to be checked first -- this runs safely even before any
    # Gold/Features job has ever created these tables.
    conn = get_postgres_connection()
    try:
        with conn.cursor() as cur:
            existing = []
            for table in POSTGRES_TABLES:
                cur.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
                if cur.fetchone()[0]:
                    existing.append(table)
            if existing:
                cur.execute(f"TRUNCATE TABLE {', '.join(existing)}")
        conn.commit()
    finally:
        conn.close()
    if not existing:
        return "postgres: no Gold/feature tables exist yet, nothing to truncate"
    return f"postgres: truncated {', '.join(existing)}"


def delete_online_features() -> str:
    client = get_redis_client()
    deleted = 0
    batch: list[str] = []
    for key in client.scan_iter(match=ONLINE_FEATURE_PATTERN, count=500):
        batch.append(key)
        if len(batch) >= 500:
            deleted += client.delete(*batch)
            batch.clear()
    if batch:
        deleted += client.delete(*batch)
    return f"redis: deleted {deleted} online feature keys"


@job(
    "reset",
    "Clear Data",
    "Wipe Bronze/Silver/Gold objects in MinIO and Gold/feature tables in Postgres.",
    listed=False,
)
def reset(ctx: JobContext) -> None:
    ctx.log(truncate_postgres_tables())

    for prefix in LAKE_PREFIXES:
        deleted = delete_prefix(prefix)
        ctx.log(f"minio: deleted {deleted} objects under {prefix}/")

    ctx.log(delete_online_features())
