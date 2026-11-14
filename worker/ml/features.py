"""Picking a model's feature columns from a dataset's schema (DuckDB type
names, as stored on datasets.columns). Pure, so the rules are unit-tested
without DuckDB, MLflow or a database (tests/test_features.py)."""

NUMERIC_PREFIXES = (
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
    "FLOAT", "DOUBLE", "REAL", "DECIMAL", "BOOLEAN",
)
TEXT_TYPES = ("VARCHAR", "TEXT", "STRING")


def is_numeric(duck_type: str) -> bool:
    """Numbers and booleans (BOOLEAN trains as 0/1)."""
    return duck_type.upper().startswith(NUMERIC_PREFIXES)


def is_usable_feature(duck_type: str) -> bool:
    """Numbers, booleans and text (trained as categories). Dates, lists and
    structs would need feature engineering this job doesn't guess at."""
    return is_numeric(duck_type) or duck_type.upper() in TEXT_TYPES


def choose_features(columns: list[dict], target: str, requested: list[str] | None) -> list[str]:
    """What the user picked, checked; or every other numeric or boolean
    column. Raises ValueError with a message fit for the run's error."""
    types = {c["name"]: c["type"] for c in columns}
    if target not in types:
        raise ValueError(f"target column {target!r} is not in the dataset")
    if requested:
        missing = [c for c in requested if c not in types]
        if missing:
            raise ValueError(f"feature column(s) not in the dataset: {', '.join(missing)}")
        if target in requested:
            raise ValueError("the target column can't also be a feature")
        unusable = [c for c in requested if not is_usable_feature(types[c])]
        if unusable:
            raise ValueError(f"can't use {', '.join(unusable)} as features: only numbers, booleans and text work")
        return list(requested)
    chosen = [c["name"] for c in columns if c["name"] != target and is_numeric(c["type"])]
    if not chosen:
        raise ValueError("no numeric columns to use as features; pick feature columns explicitly")
    return chosen
