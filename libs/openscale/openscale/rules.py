"""
Quality rules as data, run as DuckDB SQL.

A rule is one JSON object in a dataset's `rules` column:

    {"id": "SLV-003", "tier": "reject",
     "when": "tpep_dropoff_datetime <= tpep_pickup_datetime",
     "note": "Dropoff is not after pickup"}

`when` is a SQL predicate over the dataset's columns. Tiers, as in the
original taxi Silver rules (worker/spark/silver/rules.py):

    reject      the row is dropped and counted as rejected
    quarantine  the row is dropped and kept in that rule's quarantine file
    flag        the row stays; a boolean column (`column`, default
                flag_<id>) records whether the rule hit
    monitor     nothing changes; hits are only counted

List order is priority: a row hitting several reject/quarantine rules is
assigned to the first one only, so it lands in exactly one quarantine file
(rejected rows get a file too, as the taxi job wrote them). A predicate that
evaluates to NULL counts as not hit -- each one runs as
COALESCE((<when>), false), matching how the pandas masks treated missing
values.

Pure apart from the DuckDB connection it is handed, so the engine is tested
against local Parquet files (tests/test_rules.py).
"""

import re
from dataclasses import dataclass, field
from typing import Callable

import duckdb

from .duck import quote_ident
from .sqlguard import RejectedSQL, check_single_select

TIERS = ("reject", "quarantine", "flag", "monitor")
EXCLUDING_TIERS = ("reject", "quarantine")

_RULE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
_HIT = "__os_hit_{}"
_ASSIGNED = "__os_assigned"


class InvalidRule(ValueError):
    """A rule that can't run: bad shape, or a predicate DuckDB rejects."""


@dataclass(frozen=True)
class Rule:
    id: str
    tier: str
    when: str
    note: str = ""
    column: str | None = None  # flag column name; flag rules only

    @property
    def flag_column(self) -> str:
        return self.column or "flag_" + re.sub(r"[^A-Za-z0-9_]", "_", self.id).lower()


@dataclass
class RuleStats:
    id: str
    tier: str
    note: str
    hits: int  # rows the predicate matched
    assigned: int | None  # rows this rule removed (reject/quarantine only)


@dataclass
class RuleRun:
    rows_in: int
    rows_out: int
    rejected: int
    quarantined: int
    rules: list[RuleStats] = field(default_factory=list)

    def report(self) -> dict:
        return {
            "rows_in": self.rows_in,
            "rows_out": self.rows_out,
            "rejected": self.rejected,
            "quarantined": self.quarantined,
            "rules": [
                {"id": r.id, "tier": r.tier, "note": r.note, "hits": r.hits, "assigned": r.assigned} for r in self.rules
            ],
        }


def parse_rules(raw: list[dict] | None) -> list[Rule]:
    """Validates the shape of a dataset's rules JSON; predicates are checked
    against the data by check_rules."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise InvalidRule("rules must be a list")
    rules: list[Rule] = []
    seen: set[str] = set()
    flag_columns: set[str] = set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise InvalidRule(f"rule {i + 1} must be an object")
        rid = str(item.get("id") or "")
        tier = item.get("tier")
        when = item.get("when")
        if not _RULE_ID.match(rid):
            raise InvalidRule(f"rule {i + 1}: id must be 1-64 letters, digits, '.', '_' or '-'")
        if rid in seen:
            raise InvalidRule(f"rule {rid}: duplicate id")
        if tier not in TIERS:
            raise InvalidRule(f"rule {rid}: tier must be one of {', '.join(TIERS)}")
        if not isinstance(when, str) or not when.strip():
            raise InvalidRule(f"rule {rid}: `when` must be a SQL predicate")
        column = item.get("column")
        if column is not None and tier != "flag":
            raise InvalidRule(f"rule {rid}: only flag rules take a column")
        rule = Rule(id=rid, tier=tier, when=when.strip(), note=str(item.get("note") or ""), column=column)
        if tier == "flag":
            if not _IDENT.match(rule.flag_column):
                raise InvalidRule(f"rule {rid}: flag column {rule.flag_column!r} is not a plain identifier")
            if rule.flag_column in flag_columns:
                raise InvalidRule(f"rule {rid}: flag column {rule.flag_column!r} is used twice")
            flag_columns.add(rule.flag_column)
        seen.add(rid)
        rules.append(rule)
    return rules


def check_rules(con: duckdb.DuckDBPyConnection, rules: list[Rule], source: str, columns: list[str]) -> None:
    """Binds every predicate against the source without reading data, so a
    typo fails the run before anything is written, naming the rule."""
    for rule in rules:
        if rule.tier == "flag" and rule.flag_column in columns:
            raise InvalidRule(f"rule {rule.id}: flag column {rule.flag_column!r} already exists in the dataset")
        sql = f"SELECT COALESCE(({rule.when}), false) FROM {source}"
        try:
            check_single_select(con, sql)
            con.execute(f"SELECT * FROM ({sql}) LIMIT 0").fetchall()
        except (RejectedSQL, duckdb.Error) as exc:
            raise InvalidRule(f"rule {rule.id}: {exc}") from exc


def tagged_sql(rules: list[Rule], source: str) -> str:
    """The source plus one boolean hit column per rule and the index of the
    reject/quarantine rule each row is assigned to (NULL = kept)."""
    hits = "".join(f", COALESCE(({r.when}), false) AS {_HIT.format(i)}" for i, r in enumerate(rules))
    cases = " ".join(f"WHEN {_HIT.format(i)} THEN {i}" for i, r in enumerate(rules) if r.tier in EXCLUDING_TIERS)
    assigned = f"CASE {cases} END" if cases else "CAST(NULL AS INTEGER)"
    return f"SELECT *, {assigned} AS {_ASSIGNED} FROM (SELECT *{hits} FROM {source})"


def apply_rules(
    con: duckdb.DuckDBPyConnection,
    rules: list[Rule],
    source: str,
    clean_path: str,
    quarantine_path: Callable[[Rule], str],
) -> RuleRun:
    """Runs the rules over `source` (a table, view or read_parquet(...)) and
    writes the kept rows, with flag columns, to clean_path and each
    reject/quarantine rule's rows to quarantine_path(rule). Only rules that
    removed rows get a file. The source is scanned once to count and once
    per file written; nothing is held in memory."""
    columns = [row[0] for row in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()]
    check_rules(con, rules, source, columns)

    con.execute(f"CREATE OR REPLACE TEMP VIEW __os_tagged AS {tagged_sql(rules, source)}")
    original = ", ".join(quote_ident(c) for c in columns)

    count_cols = ["COUNT(*)", f"COUNT(*) FILTER (WHERE {_ASSIGNED} IS NULL)"]
    for i, r in enumerate(rules):
        count_cols.append(f"COUNT(*) FILTER (WHERE {_HIT.format(i)})")
        count_cols.append(f"COUNT(*) FILTER (WHERE {_ASSIGNED} = {i})")
    counts = con.execute(f"SELECT {', '.join(count_cols)} FROM __os_tagged").fetchone()
    rows_in, rows_out = int(counts[0]), int(counts[1])

    stats: list[RuleStats] = []
    for i, r in enumerate(rules):
        hits, assigned = int(counts[2 + 2 * i]), int(counts[3 + 2 * i])
        stats.append(RuleStats(r.id, r.tier, r.note, hits, assigned if r.tier in EXCLUDING_TIERS else None))

    flags = "".join(
        f", {_HIT.format(i)} AS {quote_ident(r.flag_column)}" for i, r in enumerate(rules) if r.tier == "flag"
    )
    con.execute(
        f"COPY (SELECT {original}{flags} FROM __os_tagged WHERE {_ASSIGNED} IS NULL) "
        f"TO '{clean_path}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    for i, (r, s) in enumerate(zip(rules, stats)):
        if s.assigned:
            con.execute(
                f"COPY (SELECT {original} FROM __os_tagged WHERE {_ASSIGNED} = {i}) "
                f"TO '{quarantine_path(r)}' (FORMAT PARQUET, COMPRESSION ZSTD)"
            )

    rejected = sum(s.assigned or 0 for s in stats if s.tier == "reject")
    quarantined = sum(s.assigned or 0 for s in stats if s.tier == "quarantine")
    return RuleRun(rows_in=rows_in, rows_out=rows_out, rejected=rejected, quarantined=quarantined, rules=stats)
