import pytest

from openscale.readers import UnsupportedFile, is_supported, reader_sql, union_sql


@pytest.mark.parametrize("path,fn", [
    ("s3://b/x/a.parquet", "read_parquet("),
    ("a.PARQUET", "read_parquet("),
    ("a.csv", "read_csv("),
    ("a.csv.gz", "read_csv("),
    ("a.tsv", "read_csv("),
    ("a.json", "read_json_auto("),
    ("a.jsonl", "read_json_auto("),
    ("a.ndjson", "read_json_auto("),
    ("a.json.gz", "read_json_auto("),
])
def test_reader_picks_the_right_function(path, fn):
    assert reader_sql(path).startswith(fn)


def test_tsv_sets_tab_delimiter_and_csv_does_not():
    assert "delim='\\t'" in reader_sql("a.tsv")
    assert "delim" not in reader_sql("a.csv")


def test_reader_quotes_the_path():
    sql = reader_sql("s3://b/it's.csv")
    assert "'s3://b/it''s.csv'" in sql


@pytest.mark.parametrize("bad", ["a.xlsx", "a.txt", "a", "a.gz", "a.zip"])
def test_unsupported_raises_and_is_not_supported(bad):
    assert not is_supported(bad)
    with pytest.raises(UnsupportedFile):
        reader_sql(bad)


def test_union_sql_orders_files_and_unions_by_name():
    sql = union_sql(["b.csv", "a.parquet"])
    assert sql.index("a.parquet") < sql.index("b.csv")
    assert sql.count("UNION ALL BY NAME") == 1


def test_union_sql_single_file_has_no_union():
    assert "UNION" not in union_sql(["a.csv"])


def test_union_sql_rejects_empty():
    with pytest.raises(ValueError):
        union_sql([])
