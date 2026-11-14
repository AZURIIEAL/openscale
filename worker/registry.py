"""
The job registry. A job type is one decorated function:

    @job("gold", "Aggregate (Gold)", "Silver -> Gold aggregates.", stage="Gold")
    def gold(ctx: JobContext) -> None:
        ...

At startup the worker publishes every registered job to
control_plane.job_definitions; the control-plane serves that table as the
job catalog and validates run params against each job's params_schema, and
the frontend renders its run forms from the same schema. Adding a job type
is therefore one Python function -- no Go or TypeScript change.

Pure: no Redis, Postgres or Spark imports, so the wrapper and the schema
rules are unit-testable with the standard library alone.
"""

import importlib
import pkgutil
import re
import sys
import traceback
from dataclasses import dataclass
from typing import Any, Callable

from jobs.outcome import STATUS_CANCELLED, STATUS_FAILED, STATUS_PARTIAL, STATUS_SUCCEEDED, format_exception

# Field kinds a params_schema may use -- mirrored by
# control-plane/internal/jobs (validation) and the frontend's RunJobForm
# (rendering). `text` is multi-line (SQL); `dataset` picks an existing
# dataset in the run's project and `dataset_name` names a new one;
# `column`/`columns` pick from the columns of the dataset field named by `of`.
PARAM_TYPES = (
    "string",
    "text",
    "number",
    "integer",
    "boolean",
    "enum",
    "date",
    "month",
    "dataset",
    "dataset_name",
    "column",
    "columns",
)
_COLUMN_TYPES = ("column", "columns")

_TYPE_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
_PARAM_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,62}$")
_ORDERED_TYPES = ("number", "integer", "date", "month")


@dataclass(frozen=True)
class Param:
    """One field of a job's params_schema.

    min/max bound number and integer fields numerically, and date ("YYYY-MM-DD")
    and month ("YYYY-MM") fields as strings. gte names an earlier field of the
    same type this one must be greater than or equal to (an end after a start).
    of names the earlier `dataset` field a column/columns field picks from.
    """

    name: str
    type: str
    label: str
    description: str = ""
    required: bool = False
    default: Any = None
    options: tuple[str, ...] = ()
    min: float | str | None = None
    max: float | str | None = None
    gte: str | None = None
    of: str | None = None

    def to_json(self) -> dict:
        out: dict[str, Any] = {"name": self.name, "type": self.type, "label": self.label}
        if self.description:
            out["description"] = self.description
        if self.required:
            out["required"] = True
        if self.default is not None:
            out["default"] = self.default
        if self.options:
            out["options"] = list(self.options)
        if self.min is not None:
            out["min"] = self.min
        if self.max is not None:
            out["max"] = self.max
        if self.gte:
            out["gte"] = self.gte
        if self.of:
            out["of"] = self.of
        return out


class JobCancelled(BaseException):
    """Raised by JobContext.check_cancelled() (and on SIGTERM in the child);
    the wrapper records the run as cancelled. A BaseException, like
    KeyboardInterrupt, so a library's `except Exception` can't swallow it."""


class JobFailed(Exception):
    """Raise for an expected failure: the message is stored as the run's error
    as-is, without the exception-type prefix an unexpected crash gets."""


class JobContext:
    """Everything a job handler gets. log() streams a line to the run's live
    log; set_rows()/set_metrics() fill the run row; set_partial() finishes the
    run as `partial` instead of `succeeded`; check_cancelled() raises
    JobCancelled once someone has cancelled the run."""

    def __init__(
        self,
        job_id: str | None,
        project_id: str | None,
        params: dict,
        log: Callable[[str], None],
        is_cancelled: Callable[[], bool] = lambda: False,
    ):
        self.job_id = job_id
        self.project_id = project_id
        self.params = params
        self._log = log
        self._is_cancelled = is_cancelled
        self.rows: int | None = None
        self.metrics: dict | None = None
        self.partial_error: str | None = None

    def log(self, line: object) -> None:
        self._log(str(line))

    def set_rows(self, rows: int | None) -> None:
        self.rows = None if rows is None else int(rows)

    def set_metrics(self, metrics: dict | None) -> None:
        self.metrics = None if metrics is None else dict(metrics)

    def set_partial(self, error: str) -> None:
        self.partial_error = error

    def is_cancelled(self) -> bool:
        return self._is_cancelled()

    def check_cancelled(self) -> None:
        if self._is_cancelled():
            raise JobCancelled()


@dataclass(frozen=True)
class JobResult:
    status: str
    error: str | None = None
    rows: int | None = None
    metrics: dict | None = None


@dataclass(frozen=True)
class JobDefinition:
    type: str
    label: str
    description: str
    handler: Callable[[JobContext], None]
    params_schema: tuple[Param, ...] = ()
    stage: str | None = None
    order: int = 100
    listed: bool = True
    requires_feature: str | None = None

    @property
    def module(self) -> str:
        """The module a child process imports to find this job again."""
        return self.handler.__module__

    def catalog_entry(self) -> dict:
        """The row published to control_plane.job_definitions."""
        return {
            "type": self.type,
            "label": self.label,
            "description": self.description,
            "stage": self.stage,
            "params_schema": [p.to_json() for p in self.params_schema],
            "listed": self.listed,
            "sort_order": self.order,
            "requires_feature": self.requires_feature,
        }


# Insertion-ordered; catalog() sorts by (order, type) for display.
REGISTRY: dict[str, JobDefinition] = {}


def validate_schema(params_schema: tuple[Param, ...]) -> None:
    """Raises ValueError for a schema the control-plane or the form couldn't use."""
    seen: dict[str, Param] = {}
    for p in params_schema:
        if not _PARAM_NAME.match(p.name):
            raise ValueError(f"param name {p.name!r} must be a plain identifier")
        if p.name in seen:
            raise ValueError(f"duplicate param {p.name!r}")
        if p.type not in PARAM_TYPES:
            raise ValueError(f"param {p.name!r}: type must be one of {', '.join(PARAM_TYPES)}")
        if p.type == "enum" and not p.options:
            raise ValueError(f"param {p.name!r}: an enum needs options")
        if p.type != "enum" and p.options:
            raise ValueError(f"param {p.name!r}: only enums take options")
        if (p.min is not None or p.max is not None) and p.type not in _ORDERED_TYPES:
            raise ValueError(f"param {p.name!r}: min/max only apply to {', '.join(_ORDERED_TYPES)}")
        if p.gte is not None:
            other = seen.get(p.gte)
            if other is None:
                raise ValueError(f"param {p.name!r}: gte must name an earlier param, not {p.gte!r}")
            if other.type != p.type or p.type not in _ORDERED_TYPES:
                raise ValueError(f"param {p.name!r}: gte needs an earlier param of the same ordered type")
        if p.type in _COLUMN_TYPES:
            source = seen.get(p.of or "")
            if source is None or source.type != "dataset":
                raise ValueError(f"param {p.name!r}: of must name an earlier dataset param")
        elif p.of is not None:
            raise ValueError(f"param {p.name!r}: only column and columns take of")
        seen[p.name] = p


def job(
    type: str,
    label: str,
    description: str,
    params_schema: list[Param] | tuple[Param, ...] = (),
    *,
    stage: str | None = None,
    order: int = 100,
    listed: bool = True,
    requires_feature: str | None = None,
) -> Callable[[Callable[[JobContext], None]], Callable[[JobContext], None]]:
    """Registers the decorated function as job type `type`.

    stage is an optional badge shown next to the label; order sorts the
    catalog; listed=False keeps a job out of the Pipelines run list (it can
    still be queued by another screen or the API, as replay and reset are);
    requires_feature limits the job to projects with that feature flag (the
    taxi stages need `legacy_taxi`), and the control-plane enforces it.
    """
    if not _TYPE_NAME.match(type):
        raise ValueError(f"job type {type!r} must be lowercase letters, digits and underscores")
    schema = tuple(params_schema)
    validate_schema(schema)

    def register(fn: Callable[[JobContext], None]) -> Callable[[JobContext], None]:
        if type in REGISTRY:
            raise ValueError(f"job type {type!r} is registered twice")
        REGISTRY[type] = JobDefinition(
            type=type,
            label=label,
            description=description,
            handler=fn,
            params_schema=schema,
            stage=stage,
            order=order,
            listed=listed,
            requires_feature=requires_feature,
        )
        return fn

    return register


def load_all_jobs(package: str = "jobs") -> None:
    """Imports every module in the jobs package so their @job decorators run.
    Discovery instead of a list: a new module is picked up without editing
    anything else."""
    pkg = importlib.import_module(package)
    for info in pkgutil.iter_modules(pkg.__path__):
        if not info.name.startswith("_"):
            importlib.import_module(f"{package}.{info.name}")


def catalog() -> list[dict]:
    return [d.catalog_entry() for d in sorted(REGISTRY.values(), key=lambda d: (d.order, d.type))]


def run_job(definition: JobDefinition, ctx: JobContext) -> JobResult:
    """The one place a handler's outcome becomes a run status:
    return -> succeeded (or partial after set_partial), JobCancelled ->
    cancelled, JobFailed -> failed with its message, anything else -> failed
    with "Type: message" in the run and the traceback on stderr."""
    try:
        definition.handler(ctx)
    except JobCancelled:
        ctx.log("cancelled")
        return JobResult(STATUS_CANCELLED, None, ctx.rows, ctx.metrics)
    except JobFailed as exc:
        error = str(exc) or "failed"
        ctx.log(error)
        return JobResult(STATUS_FAILED, error, ctx.rows, ctx.metrics)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        error = format_exception(exc)
        ctx.log(error)
        return JobResult(STATUS_FAILED, error, ctx.rows, ctx.metrics)

    if ctx.partial_error:
        return JobResult(STATUS_PARTIAL, ctx.partial_error, ctx.rows, ctx.metrics)
    return JobResult(STATUS_SUCCEEDED, None, ctx.rows, ctx.metrics)
