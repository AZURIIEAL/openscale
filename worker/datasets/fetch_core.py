"""Streams a URL into a dataset's raw/ folder. Pure of job plumbing: takes
a requests session and an fsspec-style open function, so it is testable
with a fake HTTP response and a local directory."""

import time
from dataclasses import dataclass

from openscale import paths
from openscale.url_check import check_url

CHUNK = 8 * 1024 * 1024


@dataclass
class FetchResult:
    key: str
    bytes_written: int
    seconds: float


def pick_filename(url: str, content_type: str | None) -> str:
    """The last path segment when it has a supported extension, else a name
    derived from the Content-Type. Mirrors datasets.FilenameFromURL on the
    Go side, plus the content-type fallback only the fetcher can apply."""
    from urllib.parse import urlparse

    from openscale.readers import is_supported

    name = urlparse(url).path.rsplit("/", 1)[-1]
    if name and is_supported(name):
        return name
    ct = (content_type or "").split(";")[0].strip().lower()
    ext = {
        "text/csv": ".csv",
        "application/csv": ".csv",
        "text/tab-separated-values": ".tsv",
        "application/json": ".json",
        "application/x-ndjson": ".jsonl",
        "application/jsonl": ".jsonl",
        "application/vnd.apache.parquet": ".parquet",
        "application/octet-stream": ".parquet",
    }.get(ct)
    if ext is None:
        raise ValueError(f"cannot tell the file type of {url!r} (Content-Type {content_type!r}); give the URL a .csv/.parquet/.json extension")
    base = name or "download"
    return base + ext


def fetch_to_raw(session, open_fn, url: str, project_id: str, dataset_id: str, max_bytes: int, log, resolver=None) -> FetchResult:
    """Downloads url to raw/<filename> in CHUNK-sized pieces, refusing
    private addresses and anything over max_bytes. `open_fn(key, 'wb')`
    returns a writable file-like (fsspec's s3 open in production)."""
    check_url(url, resolver) if resolver else check_url(url)
    started = time.monotonic()
    with session.get(url, stream=True, timeout=(10, 60), allow_redirects=True) as resp:
        resp.raise_for_status()
        length = resp.headers.get("Content-Length")
        if length and int(length) > max_bytes:
            raise ValueError(f"file is {int(length)} bytes, over the {max_bytes} byte limit")
        filename = pick_filename(url, resp.headers.get("Content-Type"))
        key = paths.raw_prefix(project_id, dataset_id) + filename
        log(f"downloading {url} -> {key}")
        written = 0
        with open_fn(key, "wb") as out:
            for chunk in resp.iter_content(chunk_size=CHUNK):
                if not chunk:
                    continue
                written += len(chunk)
                if written > max_bytes:
                    raise ValueError(f"download exceeded the {max_bytes} byte limit")
                out.write(chunk)
                if written % (64 * 1024 * 1024) < CHUNK:
                    log(f"  {written // (1024 * 1024)} MiB")
    return FetchResult(key=key, bytes_written=written, seconds=time.monotonic() - started)
