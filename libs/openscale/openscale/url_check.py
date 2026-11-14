"""Guards the worker's URL fetch against private and local addresses.

The control-plane rejects obvious cases on the way in (loopback literals,
`localhost`), but a public hostname can still resolve to 10.0.0.5 or to
the cloud metadata address. The worker reaches Postgres, Redis and MinIO,
so a fetch aimed inward is a way into them. This resolves the host and
refuses when ANY answer is disallowed.
"""

import ipaddress
import socket
from urllib.parse import urlparse


class DisallowedURL(ValueError):
    pass


def is_disallowed_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
        or (addr.version == 6 and addr.ipv4_mapped is not None and is_disallowed_ip(str(addr.ipv4_mapped)))
    )


def _default_resolver(host: str) -> list[str]:
    return sorted({info[4][0] for info in socket.getaddrinfo(host, None)})


def check_url(url: str, resolver=_default_resolver) -> list[str]:
    """Returns the resolved addresses when the URL is acceptable, else raises
    DisallowedURL. `resolver` is injectable for tests."""
    u = urlparse(url)
    if u.scheme not in ("http", "https"):
        raise DisallowedURL(f"{url!r}: only http and https are allowed")
    host = u.hostname
    if not host:
        raise DisallowedURL(f"{url!r}: no host")
    if u.username or u.password:
        raise DisallowedURL(f"{url!r}: credentials in the URL are not allowed")
    if host == "localhost" or host.endswith((".localhost", ".internal", ".local")):
        raise DisallowedURL(f"{url!r}: {host} is a local name")
    try:
        addrs = resolver(host)
    except (socket.gaierror, OSError) as exc:
        raise DisallowedURL(f"{url!r}: cannot resolve {host}: {exc}") from exc
    if not addrs:
        raise DisallowedURL(f"{url!r}: {host} did not resolve")
    bad = [a for a in addrs if is_disallowed_ip(a)]
    if bad:
        raise DisallowedURL(f"{url!r}: {host} resolves to a private or local address ({', '.join(bad)})")
    return addrs
