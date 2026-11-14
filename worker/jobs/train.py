"""
The generic `train` job: fits a model on any dataset in the project and logs
it to the project's MLflow experiment (`openscale/<project slug>`).

Histogram gradient boosting, because it takes missing values and text
categories as they come: no imputation or encoding step for a user to get
wrong. Large datasets are sampled to SAMPLE_ROWS inside DuckDB, so only the
sample is ever pulled into pandas.
"""

import os

import db
from ml.features import choose_features
from openscale import paths
from openscale.duck import connect, quote_ident
from registry import JobContext, JobFailed, Param, job

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "2GB")
SAMPLE_ROWS = 300_000
TEST_SHARE = 0.2
SEED = 42

@job(
    "train",
    "Train model",
    "Train a model on a dataset and log it to the project's MLflow experiment.",
    params_schema=[
        Param("dataset", "dataset", "Dataset", required=True),
        Param("target", "column", "Target column", required=True, of="dataset"),
        Param(
            "features",
            "columns",
            "Feature columns",
            of="dataset",
            description="Defaults to every other numeric or boolean column.",
        ),
        Param("task", "enum", "Task", options=("regression", "classification"), default="regression"),
    ],
    stage="Model",
    order=120,
)
def train(ctx: JobContext) -> None:
    import mlflow
    import mlflow.sklearn
    import pandas as pd
    from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
    from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, mean_squared_error, r2_score
    from sklearn.model_selection import train_test_split

    from ml.tracking import use_experiment

    project_id = ctx.project_id
    name, target = ctx.params["dataset"], ctx.params["target"]
    task = ctx.params.get("task") or "regression"

    conn = db.get_connection()
    try:
        dataset = db.get_dataset(conn, project_id, name)
        slug = db.get_project_slug(conn, project_id)
    finally:
        conn.close()
    if dataset is None:
        raise JobFailed(f"no dataset named {name!r} in this project")
    if dataset["status"] != "ready":
        raise JobFailed(f"dataset {name!r} is {dataset['status']}, not ready")
    try:
        features = choose_features(dataset["columns"] or [], target, ctx.params.get("features"))
    except ValueError as exc:
        raise JobFailed(str(exc)) from exc

    con = connect(project_id=project_id, memory_limit=MEMORY_LIMIT)
    source = f"read_parquet('{paths.data_glob(project_id, dataset['id'])}')"
    cols = ", ".join(quote_ident(c) for c in [*features, target])
    total = con.execute(f"SELECT COUNT(*) FROM {source} WHERE {quote_ident(target)} IS NOT NULL").fetchone()[0]
    sample = f" USING SAMPLE reservoir({SAMPLE_ROWS} ROWS) REPEATABLE ({SEED})" if total > SAMPLE_ROWS else ""
    data = con.execute(f"SELECT {cols} FROM {source} WHERE {quote_ident(target)} IS NOT NULL{sample}").df()
    ctx.log(f"training a {task} model on {len(data)} of {total} rows; target {target}; features {', '.join(features)}")
    if len(data) < 10:
        raise JobFailed(f"only {len(data)} rows with a target value; need at least 10")
    ctx.check_cancelled()

    X = data[features].copy()
    for c in X.columns:
        if X[c].dtype == object or str(X[c].dtype).startswith("string"):
            X[c] = X[c].astype("category")
        elif X[c].dtype == bool:
            X[c] = X[c].astype(int)
    y = data[target]

    if task == "classification":
        y = y.astype(str)
        counts = y.value_counts()
        stratify = y if counts.min() >= 2 and len(counts) > 1 else None
        model = HistGradientBoostingClassifier(categorical_features="from_dtype", random_state=SEED)
    else:
        if not pd.api.types.is_numeric_dtype(y):
            raise JobFailed(f"target {target!r} isn't numeric; use the classification task")
        stratify = None
        model = HistGradientBoostingRegressor(categorical_features="from_dtype", random_state=SEED)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=TEST_SHARE, random_state=SEED, stratify=stratify)

    experiment = f"openscale/{slug}"
    use_experiment(experiment)
    with mlflow.start_run(run_name=f"{task}-{name}-{target}") as run:
        model.fit(X_train, y_train)
        ctx.check_cancelled()
        predicted = model.predict(X_test)
        if task == "classification":
            metrics = {
                "accuracy": float(accuracy_score(y_test, predicted)),
                "f1_macro": float(f1_score(y_test, predicted, average="macro")),
            }
        else:
            metrics = {
                "mae": float(mean_absolute_error(y_test, predicted)),
                "rmse": float(mean_squared_error(y_test, predicted) ** 0.5),
                "r2": float(r2_score(y_test, predicted)),
            }
        mlflow.log_params(
            {"dataset": name, "target": target, "features": ",".join(features), "task": task, "rows": len(data)}
        )
        mlflow.log_metrics(metrics)
        mlflow.sklearn.log_model(model, name="model", input_example=X_train.head(3))
        run_id = run.info.run_id

    ctx.log(" ".join(f"{k}={v:.4g}" for k, v in metrics.items()))
    ctx.log(f"logged run {run_id} to MLflow experiment {experiment}")
    ctx.set_rows(len(data))
    ctx.set_metrics({**metrics, "task": task, "dataset": name, "target": target, "features": features,
                     "experiment": experiment, "mlflow_run_id": run_id})
