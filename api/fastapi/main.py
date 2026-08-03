"""
OpenScale API -- exposes Gold-layer analytics, online features (from the
Redis feature store), and the fare-prediction model over HTTP.

Usage:
    uvicorn api.fastapi.main:app --port 8000
    (run from the repo root, venv active, with MinIO/Redis/Postgres up and
    a trained model available via ml/training/train_fare_model.py)
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import pandas as pd
from fastapi import FastAPI, HTTPException
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from common.db import get_redis_client
from ml.inference.predict import predict_fare
from spark.common.storage import STORAGE_OPTIONS, lake_path

app = FastAPI(title="OpenScale API", version="0.1.0")

# Exposes /metrics (request counts, latencies, status codes) for Prometheus
# to scrape -- see docker-compose.yml (prometheus service) and
# observability/prometheus/prometheus.yml.
Instrumentator().instrument(app).expose(app)


class FarePredictionRequest(BaseModel):
    trip_distance: float
    pu_location_id: int
    do_location_id: int
    passenger_count: float = 1.0
    pickup_hour: int


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/zones/{zone_id}/features")
def zone_features(zone_id: int, hour: int) -> dict:
    client = get_redis_client()
    value = client.get(f"features:zone:{zone_id}:hour:{hour}")
    if value is None:
        raise HTTPException(status_code=404, detail=f"No features for zone {zone_id} at hour {hour}")
    return json.loads(value)


@app.post("/predict/fare")
def predict_fare_endpoint(request: FarePredictionRequest) -> dict:
    fare = predict_fare(
        request.trip_distance,
        request.pu_location_id,
        request.do_location_id,
        request.passenger_count,
        request.pickup_hour,
    )
    return {"predicted_fare": round(fare, 2)}


def _read_gold(name: str) -> pd.DataFrame:
    # Gold is written by Spark now (Phase 5) -- each table is a directory of
    # part-files, not a single .parquet file; pyarrow reads it as a dataset.
    path = lake_path("gold", name)
    return pd.read_parquet(path, engine="pyarrow", storage_options=STORAGE_OPTIONS)


@app.get("/gold/daily-revenue")
def daily_revenue() -> list[dict]:
    return _read_gold("daily_revenue").to_dict(orient="records")


@app.get("/gold/hourly-demand")
def hourly_demand() -> list[dict]:
    return _read_gold("hourly_demand").to_dict(orient="records")


@app.get("/gold/zone-stats")
def zone_stats() -> list[dict]:
    return _read_gold("zone_stats").to_dict(orient="records")


@app.get("/gold/congestion-metrics")
def congestion_metrics() -> list[dict]:
    return _read_gold("congestion_metrics").to_dict(orient="records")
