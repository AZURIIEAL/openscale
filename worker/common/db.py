"""
Postgres + Redis connection config for the feature-store job
(feature_store/feature_jobs/compute_features.py).

Not a copy of etl-exposure/common/db.py -- that file hardcodes both the
Postgres DSN and Redis host/port as plain string literals with no env
override, the same class of hardcoding worker/spark/common/storage.py's
MINIO_ENDPOINT had before its own approved env-var edit. This reuses the
env var names worker/db.py and worker/redis_client.py already established
(POSTGRES_DSN, REDIS_ADDR) so the whole worker shares one consistent set of
connection env vars.
"""

import os

import psycopg2
import redis

POSTGRES_DSN = os.environ.get(
    "POSTGRES_DSN",
    "postgresql://openscale:openscale@localhost:5432/openscale",
)
REDIS_ADDR = os.environ.get("REDIS_ADDR", "localhost:6379")


def get_postgres_connection():
    return psycopg2.connect(POSTGRES_DSN)


def get_redis_client() -> "redis.Redis":
    host, _, port = REDIS_ADDR.partition(":")
    return redis.Redis(host=host, port=int(port or 6379), decode_responses=True)
