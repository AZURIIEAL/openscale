"""The @job decorator, schema validation, the catalog and the one wrapper
that turns a handler's outcome into a run status."""

import pytest

import registry
from registry import JobCancelled, JobContext, JobFailed, Param, job, run_job


@pytest.fixture(autouse=True)
def empty_registry(monkeypatch):
    monkeypatch.setattr(registry, "REGISTRY", {})


def _ctx(params=None, cancelled=False):
    lines: list[str] = []
    ctx = JobContext("run-1", "proj-1", params or {}, lines.append, lambda: cancelled)
    return ctx, lines


def test_job_registers_a_catalog_entry():
    @job(
        "ingest",
        "Ingest",
        "Bring months in.",
        params_schema=[
            Param("start", "month", "Start", required=True, min="2009-01"),
            Param("end", "month", "End", required=True, gte="start"),
            Param("mode", "enum", "Mode", options=("fast", "full"), default="fast"),
        ],
        stage="Bronze",
        order=10,
    )
    def ingest(ctx):
        pass

    assert registry.REGISTRY["ingest"].module == __name__
    assert registry.catalog() == [
        {
            "type": "ingest",
            "label": "Ingest",
            "description": "Bring months in.",
            "stage": "Bronze",
            "params_schema": [
                {"name": "start", "type": "month", "label": "Start", "required": True, "min": "2009-01"},
                {"name": "end", "type": "month", "label": "End", "required": True, "gte": "start"},
                {"name": "mode", "type": "enum", "label": "Mode", "default": "fast", "options": ["fast", "full"]},
            ],
            "listed": True,
            "sort_order": 10,
        }
    ]


def test_catalog_sorts_by_order_then_type():
    for name, order in [("train", 50), ("gold", 30), ("reset", 100), ("audit", 100)]:
        job(name, name, "", order=order)(lambda ctx: None)
    assert [e["type"] for e in registry.catalog()] == ["gold", "train", "audit", "reset"]


def test_duplicate_type_is_rejected():
    job("gold", "Gold", "")(lambda ctx: None)
    with pytest.raises(ValueError, match="twice"):
        job("gold", "Gold again", "")(lambda ctx: None)


@pytest.mark.parametrize("bad_type", ["", "Gold", "gold-job", "9gold", "x" * 64])
def test_job_type_must_be_an_identifier(bad_type):
    with pytest.raises(ValueError):
        job(bad_type, "x", "")


@pytest.mark.parametrize(
    "schema, message",
    [
        ([Param("a", "colour", "A")], "type must be one of"),
        ([Param("a", "enum", "A")], "needs options"),
        ([Param("a", "string", "A", options=("x",))], "only enums"),
        ([Param("a", "string", "A", min=1)], "min/max"),
        ([Param("a", "month", "A", gte="b"), Param("b", "month", "B")], "earlier param"),
        ([Param("a", "month", "A"), Param("b", "date", "B", gte="a")], "same ordered type"),
        ([Param("a", "string", "A"), Param("a", "string", "A again")], "duplicate"),
        ([Param("has space", "string", "A")], "identifier"),
    ],
)
def test_invalid_schemas_fail_at_registration(schema, message):
    with pytest.raises(ValueError, match=message):
        job("x", "X", "", params_schema=schema)


def test_run_job_success_carries_rows_and_metrics():
    def handler(ctx):
        ctx.log("working")
        ctx.set_rows(42)
        ctx.set_metrics({"mae": 1.5})

    ctx, lines = _ctx()
    result = run_job(registry.JobDefinition("t", "T", "", handler), ctx)
    assert (result.status, result.error, result.rows, result.metrics) == ("succeeded", None, 42, {"mae": 1.5})
    assert lines == ["working"]


def test_run_job_partial():
    def handler(ctx):
        ctx.set_rows(7)
        ctx.set_partial("2024-08: REJECTED (schema)")

    result = run_job(registry.JobDefinition("t", "T", "", handler), _ctx()[0])
    assert (result.status, result.error, result.rows) == ("partial", "2024-08: REJECTED (schema)", 7)


def test_run_job_expected_failure_has_no_type_prefix():
    def handler(ctx):
        raise JobFailed("every month was rejected")

    ctx, lines = _ctx()
    result = run_job(registry.JobDefinition("t", "T", "", handler), ctx)
    assert (result.status, result.error) == ("failed", "every month was rejected")
    assert lines == ["every month was rejected"]


def test_run_job_crash_keeps_rows_so_far():
    def handler(ctx):
        ctx.set_rows(10)
        raise ValueError("bad row")

    result = run_job(registry.JobDefinition("t", "T", "", handler), _ctx()[0])
    assert (result.status, result.error, result.rows) == ("failed", "ValueError: bad row", 10)


def test_check_cancelled_stops_the_job():
    def handler(ctx):
        ctx.set_rows(5)
        ctx.check_cancelled()
        raise AssertionError("should not get here")

    ctx, lines = _ctx(cancelled=True)
    result = run_job(registry.JobDefinition("t", "T", "", handler), ctx)
    assert (result.status, result.rows) == ("cancelled", 5)
    assert lines == ["cancelled"]


def test_job_cancelled_is_not_swallowed_by_except_exception():
    def handler(ctx):
        try:
            raise JobCancelled()
        except Exception:  # what a library's broad handler looks like
            pass

    with pytest.raises(JobCancelled):
        handler(None)
