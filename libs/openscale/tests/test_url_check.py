import pytest

from openscale.url_check import DisallowedURL, check_url, is_disallowed_ip


@pytest.mark.parametrize("ip", [
    "127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:10.0.0.1", "not-an-ip", "224.0.0.1",
])
def test_private_and_local_addresses_are_disallowed(ip):
    assert is_disallowed_ip(ip)


@pytest.mark.parametrize("ip", ["8.8.8.8", "93.184.216.34", "2606:4700::1111"])
def test_public_addresses_are_allowed(ip):
    assert not is_disallowed_ip(ip)


def resolver_returning(*addrs):
    return lambda host: list(addrs)


def test_public_host_passes_and_returns_addresses():
    assert check_url("https://example.com/data.csv", resolver_returning("93.184.216.34")) == ["93.184.216.34"]


def test_host_resolving_to_private_address_is_refused():
    with pytest.raises(DisallowedURL, match="private or local"):
        check_url("https://evil.example/x", resolver_returning("93.184.216.34", "10.0.0.5"))


def test_metadata_endpoint_is_refused():
    with pytest.raises(DisallowedURL):
        check_url("http://169.254.169.254/latest/meta-data", resolver_returning("169.254.169.254"))


@pytest.mark.parametrize("url", [
    "ftp://example.com/x", "file:///etc/passwd", "http://localhost/x", "http://svc.internal/x",
    "http://printer.local/x", "http://user:pw@example.com/x", "http:///nohost",
])
def test_bad_schemes_and_local_names_are_refused_without_resolving(url):
    def never(_host):
        raise AssertionError("resolver must not be called")
    with pytest.raises(DisallowedURL):
        check_url(url, never)


def test_unresolvable_host_is_refused():
    def fail(host):
        raise OSError("no such host")
    with pytest.raises(DisallowedURL, match="cannot resolve"):
        check_url("https://nope.example/x", fail)
