"""One request = one sandboxed DuckDB session over a project's datasets."""

import os
import threading
import time
from dataclasses import dataclass

import duckdb

from openscale.duck import DatasetView, attach_views, connect, lockdown, quote_ident
from openscale.ingest import profile as profile_source
from openscale.rules import InvalidRule, check_rules, count_rules, parse_rules
from openscale.sqlguard import RejectedSQL, check_single_select

from .results import error_result, shape_result

MEMORY_LIMIT = os.environ.get("DUCKDB_MEMORY_LIMIT", "1GB")
THREADS = int(os.environ.get("DUCKDB_THREADS", "2"))
DEFAULT_TIMEOUT = int(os.environ.get("QUERY_TIMEOUT_SECONDS", "60"))
MAX_TIMEOUT = 300
MAX_ROWS_CAP = 10_000


class QueryTimeout(Exception):
    pass


@dataclass
class Session:
    con: duckdb.DuckDBPyConnection

    @classmethod
    def open(cls, project_id: str, views: list[DatasetView]) -> "Session":
        con = connect(project_id=project_id, memory_limit=MEMORY_LIMIT, threads=THREADS)
        attach_views(con, views)
        lockdown(con)
        return cls(con)

    def close(self) -> None:
        try:
            self.con.close()
        except duckdb.Error:
            pass

    def run_select(self, sql: str, max_rows: int, timeout_seconds: int) -> dict:
        """Validates and runs one SELECT with a wall-clock timeout. DuckDB
        runs on a helper thread so the request thread can interrupt() it;
        a timed-out query comes back as {error}, never as a hung request."""
        max_rows = max(1, min(int(max_rows or 500), MAX_ROWS_CAP))
        timeout_seconds = max(1, min(int(timeout_seconds or DEFAULT_TIMEOUT), MAX_TIMEOUT))
        try:
            check_single_select(self.con, sql)
        except RejectedSQL as exc:
            return error_result(str(exc))

        started = time.monotonic()
        result: dict = {}
        failure: list[BaseException] = []

        # Runs on self.con itself (not a cursor(), which is a separate
        # connection that interrupt() on self.con would not reach).
        def work() -> None:
            try:
                self.con.execute(sql)
                result["rows"] = self.con.fetchmany(max_rows + 1)
                result["description"] = self.con.description or []
            except BaseException as exc:  # noqa: BLE001 - reported to the caller
                failure.append(exc)

        t = threading.Thread(target=work, name="duckdb-query", daemon=True)
        t.start()
        t.join(timeout_seconds)
        if t.is_alive():
            self.con.interrupt()
            t.join(5)
            return error_result(f"Query exceeded the {timeout_seconds}s time limit and was cancelled.")

        duration_ms = int((time.monotonic() - started) * 1000)
        if failure:
            return error_result(str(failure[0]))
        return shape_result(result["description"], result["rows"], max_rows, duration_ms)

    def preview(self, view_name: str, limit: int) -> dict:
        limit = max(1, min(int(limit or 20), 500))
        return self.run_select(f"SELECT * FROM {quote_ident(view_name)} LIMIT {limit}", limit, DEFAULT_TIMEOUT)

    def test_rules(self, view_name: str, raw_rules: list, check_only: bool, timeout_seconds: int) -> dict:
        """The rule editor's Save (check_only: every predicate binds against
        the dataset) and Test (what a validate run would keep, remove and
        flag, per rule -- one full scan, nothing written). Bad rules come
        back as {error} naming the rule."""
        timeout_seconds = max(1, min(int(timeout_seconds or DEFAULT_TIMEOUT), MAX_TIMEOUT))
        source = quote_ident(view_name)
        started = time.monotonic()
        try:
            rules = parse_rules(raw_rules)
        except InvalidRule as exc:
            return error_result(str(exc))

        result: dict = {}
        failure: list[BaseException] = []

        def work() -> None:
            try:
                if check_only:
                    check_rules(self.con, rules, source)
                else:
                    result["run"] = count_rules(self.con, rules, source)
            except BaseException as exc:  # noqa: BLE001 - reported to the caller
                failure.append(exc)

        t = threading.Thread(target=work, name="duckdb-rules", daemon=True)
        t.start()
        t.join(timeout_seconds)
        if t.is_alive():
            self.con.interrupt()
            t.join(5)
            return error_result(f"Testing the rules exceeded the {timeout_seconds}s time limit and was cancelled.")
        if failure:
            return error_result(str(failure[0]))

        out: dict = {"ok": True, "durationMs": int((time.monotonic() - started) * 1000)}
        if "run" in result:
            report = result["run"].report()
            out.update(
                rowsIn=report["rows_in"],
                rowsOut=report["rows_out"],
                rejected=report["rejected"],
                quarantined=report["quarantined"],
                rules=report["rules"],
            )
        return out

    def profile(self, view_name: str) -> dict:
        try:
            return profile_source(self.con, quote_ident(view_name))
        except duckdb.Error as exc:
            return error_result(str(exc))
