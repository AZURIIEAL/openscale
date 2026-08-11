"""
Trains a fare-prediction model on Silver trip data and logs it to MLflow.

Features: trip_distance, PULocationID, DOLocationID, passenger_count, pickup_hour
Target:   fare_amount

Training on the full ~20M-row Silver dataset isn't the point of this phase
(see docs/implementation-plan.md Phase 12 for scale benchmarking) -- this
samples a fixed number of rows for a fast, reasonably-fit demo model.

Usage:
    python "ml/training/train_fare_model.py"
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import mlflow
import mlflow.sklearn
import pandas as pd
from pyspark.sql import DataFrame as SparkDataFrame, functions as F
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from spark.common.loader import load_silver_trips
from spark.common.spark_session import get_spark

MLFLOW_DIR = REPO_ROOT / "ml" / "mlflow"
MLFLOW_TRACKING_URI = f"sqlite:///{(MLFLOW_DIR / 'mlflow.db').as_posix()}"
MLFLOW_ARTIFACT_LOCATION = (MLFLOW_DIR / "artifacts").as_uri()
EXPERIMENT_NAME = "fare-prediction"
FEATURE_COLUMNS = ["trip_distance", "PULocationID", "DOLocationID", "passenger_count", "pickup_hour"]
TARGET_COLUMN = "fare_amount"
SAMPLE_SIZE = 300_000


def ensure_experiment() -> None:
    MLFLOW_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    client = mlflow.tracking.MlflowClient()
    if client.get_experiment_by_name(EXPERIMENT_NAME) is None:
        client.create_experiment(EXPERIMENT_NAME, artifact_location=MLFLOW_ARTIFACT_LOCATION)
    mlflow.set_experiment(EXPERIMENT_NAME)


def prepare_dataset(df: SparkDataFrame) -> pd.DataFrame:
    # Filtering/selecting happens in Spark across all months (140M+ rows);
    # only a bounded sample ever gets pulled to the driver as pandas.
    df = (
        df.withColumn("pickup_hour", F.hour("tpep_pickup_datetime"))
        .select(*FEATURE_COLUMNS, TARGET_COLUMN)
        .dropna()
    )
    total = df.count()
    if total > SAMPLE_SIZE:
        fraction = min(1.0, SAMPLE_SIZE / total * 1.1)  # slight buffer, trimmed below
        df = df.sample(fraction=fraction, seed=42)

    pdf = df.toPandas()
    if len(pdf) > SAMPLE_SIZE:
        pdf = pdf.sample(SAMPLE_SIZE, random_state=42)
    return pdf


def train() -> dict:
    ensure_experiment()

    spark = get_spark("ml-train-fare-model")
    try:
        data = prepare_dataset(load_silver_trips(spark))
    finally:
        spark.stop()
    X = data[FEATURE_COLUMNS]
    y = data[TARGET_COLUMN]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {"n_estimators": 50, "max_depth": 12, "random_state": 42, "n_jobs": -1}

    with mlflow.start_run(run_name="random-forest-fare") as run:
        model = RandomForestRegressor(**params)
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)

        metrics = {
            "mae": mean_absolute_error(y_test, predictions),
            "rmse": mean_squared_error(y_test, predictions) ** 0.5,
            "r2": r2_score(y_test, predictions),
        }

        mlflow.log_params({**params, "sample_size": len(data), "features": ",".join(FEATURE_COLUMNS)})
        mlflow.log_metrics(metrics)
        mlflow.sklearn.log_model(model, artifact_path="model", input_example=X_train.head(3))

        return {"run_id": run.info.run_id, "rows": len(data), **metrics}


if __name__ == "__main__":
    print(train())
