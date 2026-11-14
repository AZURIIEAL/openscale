"""Exactly-one-SELECT check using DuckDB's own parser, so a query cannot be
smuggled past a regex (`SELECT 1; COPY ...`, a CTE that wraps a write,
`FROM` as the first keyword, and so on). The control-plane runs its cheap
prefix check first; this is the one that counts.

Defence in depth, not the only wall: the session is also locked to the
project's S3 scope and built on a read-only MinIO user (see duck.lockdown).
"""

import duckdb


class RejectedSQL(ValueError):
    pass


_READ_ONLY_TYPES = {"SELECT_STATEMENT"}


def check_single_select(con: duckdb.DuckDBPyConnection, sql: str) -> None:
    """Raises RejectedSQL unless sql parses to exactly one SELECT (DuckDB's
    SELECT_STATEMENT covers WITH ... SELECT and FROM-first queries)."""
    if not sql or not sql.strip():
        raise RejectedSQL("SQL query cannot be empty.")
    try:
        statements = con.extract_statements(sql)
    except duckdb.Error as exc:  # parse error: surface it as the query's error
        raise RejectedSQL(str(exc)) from exc
    if len(statements) == 0:
        raise RejectedSQL("SQL query cannot be empty.")
    if len(statements) > 1:
        raise RejectedSQL("Only a single SQL statement is allowed.")
    kind = str(statements[0].type)
    # duckdb exposes the type as an enum; its str() is e.g. "StatementType.SELECT"
    if not kind.upper().endswith(("SELECT", "SELECT_STATEMENT")):
        raise RejectedSQL("Only SELECT queries are allowed.")
