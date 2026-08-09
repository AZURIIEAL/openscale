"""
PostgreSQL + Redis connection config for the OpenScale feature store.

Local dev only: points at the containers in docker-compose.yml at the repo
root (default creds, localhost-only, `docker compose up -d`).
"""

import psycopg2
import redis

POSTGRES_DSN = "dbname=openscale user=openscale password=openscale host=localhost port=5432"
REDIS_HOST = "localhost"
REDIS_PORT = 6379


def get_postgres_connection():
    return psycopg2.connect(POSTGRES_DSN)


def get_redis_client() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
