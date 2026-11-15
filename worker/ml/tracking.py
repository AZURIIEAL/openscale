"""
Where MLflow runs go. Both the tracking store and the artifact root come from
the environment (MLFLOW_TRACKING_URI, MLFLOW_ARTIFACT_ROOT) so the worker and
the `mlflow` server share one store wherever the stack runs. The defaults are
the old repo-relative paths -- inside the containers /app/ml/mlflow, which
docker-compose.yml bind-mounts into both services.
"""

import os
from pathlib import Path

import mlflow

WORKER_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DIR = WORKER_ROOT / "ml" / "mlflow"

MLFLOW_TRACKING_URI = os.environ.get("MLFLOW_TRACKING_URI", f"sqlite:///{(_DEFAULT_DIR / 'mlflow.db').as_posix()}")
MLFLOW_ARTIFACT_ROOT = os.environ.get("MLFLOW_ARTIFACT_ROOT", (_DEFAULT_DIR / "artifacts").as_uri())


def use_experiment(name: str) -> None:
    """Points mlflow at the shared store and makes `name` the active
    experiment, creating it under the artifact root the first time."""
    if MLFLOW_TRACKING_URI.startswith("sqlite:///"):
        Path(MLFLOW_TRACKING_URI.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    client = mlflow.tracking.MlflowClient()
    if client.get_experiment_by_name(name) is None:
        client.create_experiment(name, artifact_location=MLFLOW_ARTIFACT_ROOT)
    mlflow.set_experiment(name)
