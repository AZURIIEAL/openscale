"""Feature selection for the generic train job (ml/features.py)."""

import pytest

from ml.features import choose_features, is_numeric, is_usable_feature

COLUMNS = [
    {"name": "fare", "type": "DOUBLE"},
    {"name": "distance", "type": "DECIMAL(10,2)"},
    {"name": "passengers", "type": "BIGINT"},
    {"name": "is_airport", "type": "BOOLEAN"},
    {"name": "zone", "type": "VARCHAR"},
    {"name": "pickup_at", "type": "TIMESTAMP"},
]


def test_type_rules():
    assert all(is_numeric(t) for t in ["DOUBLE", "DECIMAL(10,2)", "BIGINT", "UTINYINT", "BOOLEAN"])
    assert not any(is_numeric(t) for t in ["VARCHAR", "TIMESTAMP", "DATE", "BLOB"])
    assert is_usable_feature("VARCHAR") and not is_usable_feature("TIMESTAMP")


def test_default_is_every_other_numeric_or_boolean_column():
    assert choose_features(COLUMNS, "fare", None) == ["distance", "passengers", "is_airport"]
    assert choose_features(COLUMNS, "fare", []) == ["distance", "passengers", "is_airport"]


def test_explicit_features_may_include_text():
    assert choose_features(COLUMNS, "fare", ["zone", "distance"]) == ["zone", "distance"]


@pytest.mark.parametrize(
    "target, requested, message",
    [
        ("tip", None, "target column 'tip' is not in the dataset"),
        ("fare", ["distance", "nope"], "not in the dataset: nope"),
        ("fare", ["fare", "distance"], "can't also be a feature"),
        ("fare", ["pickup_at"], "can't use pickup_at"),
        ("zone", None, None),  # numeric columns exist, so this works
    ],
)
def test_bad_choices_explain_themselves(target, requested, message):
    if message is None:
        assert choose_features(COLUMNS, target, requested)
        return
    with pytest.raises(ValueError, match=message):
        choose_features(COLUMNS, target, requested)


def test_no_numeric_columns_needs_an_explicit_pick():
    with pytest.raises(ValueError, match="pick feature columns explicitly"):
        choose_features([{"name": "a", "type": "VARCHAR"}, {"name": "b", "type": "VARCHAR"}], "a", None)
