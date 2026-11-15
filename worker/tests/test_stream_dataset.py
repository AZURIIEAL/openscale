import pandas as pd

from jobs.stream_dataset import rows_as_messages, topic_name


def test_topic_name_is_project_prefixed():
    assert topic_name("nyc-taxi-sample", "trips") == "nyc-taxi-sample.trips"


def test_rows_as_messages_encodes_timestamps_and_nulls():
    df = pd.DataFrame({"t": pd.to_datetime(["2025-01-01 10:00"]), "x": [float("nan")], "n": [3]})
    assert rows_as_messages(df) == [{"t": "2025-01-01T10:00:00.000", "x": None, "n": 3}]
