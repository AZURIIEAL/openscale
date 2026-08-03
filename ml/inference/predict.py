"""
Loads the latest trained fare-prediction run from MLflow and exposes a
predict_fare() function for the API (and batch scoring) to call.

Usage:
    python "ml/inference/predict.py" --distance 3.2 --pu 161 --do 237 --passengers 1 --hour 18
"""

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import mlflow
import mlflow.sklearn
import pandas as pd

from ml.training.train_fare_model import EXPERIMENT_NAME, MLFLOW_TRACKING_URI, FEATURE_COLUMNS

_model = None  # cached after first load


def _latest_run_id() -> str:
    client = mlflow.tracking.MlflowClient()
    experiment = client.get_experiment_by_name(EXPERIMENT_NAME)
    if experiment is None:
        raise RuntimeError(
            f"No MLflow experiment '{EXPERIMENT_NAME}' found -- run ml/training/train_fare_model.py first"
        )
    runs = client.search_runs([experiment.experiment_id], order_by=["start_time DESC"], max_results=1)
    if not runs:
        raise RuntimeError(f"No runs found for experiment '{EXPERIMENT_NAME}'")
    return runs[0].info.run_id


def get_model():
    global _model
    if _model is None:
        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        run_id = _latest_run_id()
        _model = mlflow.sklearn.load_model(f"runs:/{run_id}/model")
    return _model


def predict_fare(
    trip_distance: float,
    pu_location_id: int,
    do_location_id: int,
    passenger_count: float,
    pickup_hour: int,
) -> float:
    model = get_model()
    row = pd.DataFrame(
        [
            {
                "trip_distance": trip_distance,
                "PULocationID": pu_location_id,
                "DOLocationID": do_location_id,
                "passenger_count": passenger_count,
                "pickup_hour": pickup_hour,
            }
        ]
    )[FEATURE_COLUMNS]
    return float(model.predict(row)[0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--distance", type=float, required=True)
    parser.add_argument("--pu", type=int, required=True)
    parser.add_argument("--do", type=int, required=True)
    parser.add_argument("--passengers", type=float, default=1)
    parser.add_argument("--hour", type=int, required=True)
    args = parser.parse_args()

    fare = predict_fare(args.distance, args.pu, args.do, args.passengers, args.hour)
    print(f"Predicted fare: ${fare:.2f}")
