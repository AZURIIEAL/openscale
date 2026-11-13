"""FastAPI front for query_engine.session. See README.md for the contract."""

from fastapi import FastAPI
from pydantic import BaseModel, Field

from openscale.duck import DatasetView
from query_engine.results import error_result
from query_engine.session import Session

app = FastAPI(title="OpenScale query engine", docs_url=None, redoc_url=None)


class DatasetRef(BaseModel):
    name: str
    path: str


class QueryBody(BaseModel):
    project_id: str
    sql: str
    datasets: list[DatasetRef] = Field(default_factory=list)
    max_rows: int = 500
    timeout_seconds: int = 60


class PreviewBody(BaseModel):
    project_id: str
    dataset: DatasetRef
    limit: int = 20


class ProfileBody(BaseModel):
    project_id: str
    dataset: DatasetRef


def _views(refs: list[DatasetRef]) -> list[DatasetView]:
    return [DatasetView(name=r.name, path=r.path) for r in refs]


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/query")
def query(body: QueryBody) -> dict:
    try:
        session = Session.open(body.project_id, _views(body.datasets))
    except Exception as exc:  # noqa: BLE001 - the editor shows it inline
        return error_result(f"could not open a query session: {exc}")
    try:
        return session.run_select(body.sql, body.max_rows, body.timeout_seconds)
    finally:
        session.close()


@app.post("/preview")
def preview(body: PreviewBody) -> dict:
    try:
        session = Session.open(body.project_id, _views([body.dataset]))
    except Exception as exc:  # noqa: BLE001
        return error_result(f"could not open a query session: {exc}")
    try:
        return session.preview(body.dataset.name, body.limit)
    finally:
        session.close()


@app.post("/profile")
def profile(body: ProfileBody) -> dict:
    try:
        session = Session.open(body.project_id, _views([body.dataset]))
    except Exception as exc:  # noqa: BLE001
        return error_result(f"could not open a query session: {exc}")
    try:
        return session.profile(body.dataset.name)
    finally:
        session.close()
