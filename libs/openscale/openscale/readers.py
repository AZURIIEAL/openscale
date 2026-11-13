"""Maps a raw file to the DuckDB table function that reads it. Mirrors
control-plane/internal/datasets.SupportedExtensions."""

SUPPORTED_SUFFIXES = (
    ".csv", ".tsv", ".parquet", ".json", ".jsonl", ".ndjson",
    ".csv.gz", ".tsv.gz", ".json.gz",
)


class UnsupportedFile(ValueError):
    pass


def is_supported(path: str) -> bool:
    return path.lower().endswith(SUPPORTED_SUFFIXES)


def _sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def reader_sql(path: str) -> str:
    """A DuckDB expression that reads one raw file with the right function
    and options. gzip is handled by DuckDB from the .gz suffix."""
    lower = path.lower()
    p = _sql_str(path)
    if lower.endswith((".parquet",)):
        return f"read_parquet({p})"
    if lower.endswith((".tsv", ".tsv.gz")):
        return f"read_csv({p}, delim='\\t', header=true, auto_detect=true, sample_size=-1)"
    if lower.endswith((".csv", ".csv.gz")):
        return f"read_csv({p}, header=true, auto_detect=true, sample_size=-1)"
    if lower.endswith((".json", ".jsonl", ".ndjson", ".json.gz")):
        return f"read_json_auto({p})"
    raise UnsupportedFile(f"cannot read {path!r}: supported types are {', '.join(SUPPORTED_SUFFIXES)}")


def union_sql(paths: list[str]) -> str:
    """One SELECT over every raw file. UNION ALL BY NAME lines columns up by
    name, so a later file with an extra column widens the dataset instead
    of failing; a missing column reads as NULL."""
    if not paths:
        raise ValueError("no raw files to read")
    parts = [f"SELECT * FROM {reader_sql(p)}" for p in sorted(paths)]
    return "\nUNION ALL BY NAME\n".join(parts)
