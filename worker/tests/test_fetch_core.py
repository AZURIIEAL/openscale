import io

import pytest

openscale = pytest.importorskip("openscale")  # the shared lib must be on the path (pip install -e ../libs/openscale)

from datasets.fetch_core import fetch_to_raw, pick_filename  # noqa: E402
from openscale.url_check import DisallowedURL  # noqa: E402


class FakeResponse:
    def __init__(self, chunks, headers=None, status=200):
        self._chunks = chunks
        self.headers = headers or {}
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    def iter_content(self, chunk_size):
        yield from self._chunks

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, url, **kw):
        self.calls.append((url, kw))
        return self.response


class MemoryFS:
    def __init__(self):
        self.files = {}

    def open(self, key, mode):
        buf = io.BytesIO()
        self.files[key] = buf
        close = buf.close
        buf.close = lambda: None  # keep bytes readable after the with-block
        return buf


PUBLIC = lambda host: ["93.184.216.34"]  # noqa: E731


def test_pick_filename_prefers_the_url_extension():
    assert pick_filename("https://x.example/a/b/trips_2024-07.parquet", "application/octet-stream") == "trips_2024-07.parquet"
    assert pick_filename("https://x.example/data.csv?x=1", None) == "data.csv"


def test_pick_filename_falls_back_to_content_type():
    assert pick_filename("https://x.example/download", "text/csv; charset=utf-8") == "download.csv"
    assert pick_filename("https://x.example/", "application/json") == "download.json"
    assert pick_filename("https://x.example/export", "application/x-ndjson") == "export.jsonl"


def test_pick_filename_refuses_unknown_types():
    with pytest.raises(ValueError, match="cannot tell the file type"):
        pick_filename("https://x.example/blob", "text/html")


def test_fetch_streams_chunks_into_raw():
    fs = MemoryFS()
    session = FakeSession(FakeResponse([b"a,b\n", b"1,2\n", b""], {"Content-Type": "text/csv", "Content-Length": "8"}))
    logs = []
    res = fetch_to_raw(session, fs.open, "https://x.example/data.csv", "p1", "d1", 1024, logs.append, resolver=PUBLIC)
    assert res.key == "projects/p1/datasets/d1/raw/data.csv"
    assert res.bytes_written == 8
    assert fs.files[res.key].getvalue() == b"a,b\n1,2\n"
    assert session.calls[0][1]["stream"] is True
    assert any("downloading" in line for line in logs)


def test_fetch_refuses_declared_oversize_before_downloading():
    fs = MemoryFS()
    session = FakeSession(FakeResponse([b"x" * 10], {"Content-Length": "10", "Content-Type": "text/csv"}))
    with pytest.raises(ValueError, match="over the 5 byte limit"):
        fetch_to_raw(session, fs.open, "https://x.example/data.csv", "p", "d", 5, lambda _: None, resolver=PUBLIC)
    assert fs.files == {}


def test_fetch_stops_when_undeclared_size_exceeds_limit():
    fs = MemoryFS()
    session = FakeSession(FakeResponse([b"x" * 4, b"x" * 4], {"Content-Type": "text/csv"}))
    with pytest.raises(ValueError, match="exceeded"):
        fetch_to_raw(session, fs.open, "https://x.example/data.csv", "p", "d", 5, lambda _: None, resolver=PUBLIC)


def test_fetch_refuses_private_hosts_before_connecting():
    session = FakeSession(FakeResponse([b"x"]))
    with pytest.raises(DisallowedURL):
        fetch_to_raw(session, MemoryFS().open, "https://internal.example/x.csv", "p", "d", 100, lambda _: None, resolver=lambda h: ["10.0.0.3"])
    assert session.calls == []


def test_http_error_propagates():
    session = FakeSession(FakeResponse([], {"Content-Type": "text/csv"}, status=404))
    with pytest.raises(RuntimeError, match="HTTP 404"):
        fetch_to_raw(session, MemoryFS().open, "https://x.example/x.csv", "p", "d", 100, lambda _: None, resolver=PUBLIC)
