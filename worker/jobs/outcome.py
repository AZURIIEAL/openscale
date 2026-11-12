"""
Pure helpers for turning per-unit job results into a run's final status.
Kept free of IO so the status rules are unit-testable (tests/test_outcome.py)
without MinIO, Postgres or Spark.
"""

from dataclasses import dataclass, field

# Terminal statuses the control-plane understands -- mirrors
# control-plane/internal/jobs.Status.
STATUS_SUCCEEDED = "succeeded"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"
STATUS_CANCELLED = "cancelled"


@dataclass
class IngestOutcome:
    """Aggregates run_ingestion's per-period result dicts."""

    ok_count: int = 0
    rows_processed: int = 0
    failed_periods: list[str] = field(default_factory=list)

    def add(self, result: dict) -> None:
        if result.get("status") == "OK":
            self.ok_count += 1
            self.rows_processed += int(result.get("rows", 0) or 0)
        else:
            self.failed_periods.append(f"{result.get('period')}: {result.get('status')} ({result.get('reason')})")

    def finish(self) -> tuple[str, str | None, int | None]:
        """Returns (status, error, rows_processed):
          - every period OK             -> succeeded
          - every period failed         -> failed (nothing landed in Bronze)
          - a mix of OK and failed      -> partial
          - no periods at all           -> succeeded with 0 rows (nothing to do
                                           is not a failure)
        """
        if not self.failed_periods:
            return STATUS_SUCCEEDED, None, self.rows_processed
        error = "; ".join(self.failed_periods)
        if self.ok_count == 0:
            return STATUS_FAILED, error, None
        return STATUS_PARTIAL, error, self.rows_processed


def format_exception(exc: BaseException) -> str:
    """The one-line error string every job stores on an uncaught crash."""
    return f"{type(exc).__name__}: {exc}"
