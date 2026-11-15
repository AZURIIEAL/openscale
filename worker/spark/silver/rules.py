"""
The taxi Silver rules (docs/silver-layer-specification.md v1) are data now:
silver_rules.json, run by the same engine as the generic `validate` job
(libs/openscale/openscale/rules.py). This module only holds what is
specific to the taxi pipeline: the period variables the year flags read,
and the mapping from the engine's per-rule counts to the quality report the
original pipeline wrote (etl-exposure/docs/quality-reports/), which the
golden check (scripts/golden_check.py) compares field by field.

Rule order is the original priority: timestamps (SLV-001..003) > distance
(SLV-004 reject, SLV-010 quarantine) > passengers (SLV-005) > fare
(SLV-006) > total (SLV-007), so a row lands in exactly one quarantine file.
SLV-008/009 flag kept rows; the MON- rules only count missing values.

Phase 4e moves silver_rules.json onto the sample project's Bronze dataset
(datasets.rules) and deletes this module.
"""

import json
from pathlib import Path

import duckdb

from openscale.rules import Rule, RuleRun, parse_rules

RULES_FILE = Path(__file__).with_name("silver_rules.json")

# Report field -> the rules whose removed rows it counts.
QUARANTINE_CATEGORIES: dict[str, tuple[str, ...]] = {
    "invalid_timestamps": ("SLV-001", "SLV-002", "SLV-003"),
    "negative_fares": ("SLV-006",),
    "invalid_passenger_counts": ("SLV-005",),
    "distance_outliers": ("SLV-004", "SLV-010"),
    "negative_total_amounts": ("SLV-007",),
}
FLAG_FIELDS = {
    "SLV-008": "records_flagged_pickup_year_mismatch",
    "SLV-009": "records_flagged_dropoff_year_mismatch",
}
MONITOR_PREFIX = "MON-"


def load_rules(path: Path = RULES_FILE) -> list[Rule]:
    return parse_rules(json.loads(path.read_text()))


def period_variables(year: int, month: int) -> dict[str, int]:
    """What SLV-008/009 compare against: the month being cleaned."""
    return {"period_year": year, "period_month": month}


def count_duplicates(con: duckdb.DuckDBPyConnection, source: str) -> int:
    """Rows identical to an earlier row (pandas' DataFrame.duplicated()):
    reported, never removed. DISTINCT treats NULLs as equal, as pandas does."""
    return int(
        con.execute(
            f"SELECT (SELECT COUNT(*) FROM {source}) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM {source}))"
        ).fetchone()[0]
    )


def quality_report(run: RuleRun, year: int, month: int, duplicates: int) -> dict:
    """The original pipeline's quality report, from the engine's counts."""
    by_id = {r.id: r for r in run.rules}

    def removed(ids: tuple[str, ...]) -> int:
        return sum(by_id[i].assigned or 0 for i in ids)

    report = {
        "period": f"{year:04d}-{month:02d}",
        "records_processed": run.rows_in,
        "records_accepted": run.rows_out,
        "records_rejected": run.rejected,
        "records_quarantined": run.quarantined,
        "duplicate_records": duplicates,
    }
    for field, ids in QUARANTINE_CATEGORIES.items():
        report[field] = removed(ids)
    for rule_id, field in FLAG_FIELDS.items():
        report[field] = by_id[rule_id].flagged or 0
    report["missing_value_counts"] = {
        r.id.removeprefix(MONITOR_PREFIX): r.hits for r in run.rules if r.id.startswith(MONITOR_PREFIX)
    }
    return report
