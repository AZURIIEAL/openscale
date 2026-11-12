import pytest

from ingestion.downloader.downloader import month_range


def test_single_month():
    assert month_range("2024-07", "2024-07") == [(2024, 7)]


def test_within_year():
    assert month_range("2024-07", "2024-09") == [(2024, 7), (2024, 8), (2024, 9)]


def test_across_year_boundary():
    assert month_range("2024-11", "2025-02") == [(2024, 11), (2024, 12), (2025, 1), (2025, 2)]


def test_end_before_start_is_empty():
    assert month_range("2024-09", "2024-07") == []


def test_forty_month_history():
    assert len(month_range("2023-02", "2026-05")) == 40


@pytest.mark.parametrize("bad", ["2024", "2024-7-1", "July 2024", ""])
def test_malformed_input_raises(bad):
    with pytest.raises(ValueError):
        month_range(bad, "2024-09")
