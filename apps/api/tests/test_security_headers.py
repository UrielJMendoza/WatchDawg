"""Security headers + CORS policy."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_hsts_present(client: TestClient) -> None:
    resp = client.get("/health")
    hsts = resp.headers.get("strict-transport-security", "")
    assert "max-age=31536000" in hsts
    assert "includeSubDomains" in hsts


def test_xcto_nosniff_present(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.headers.get("x-content-type-options") == "nosniff"


def test_csp_present_and_restrictive(client: TestClient) -> None:
    resp = client.get("/health")
    csp = resp.headers.get("content-security-policy", "")
    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp


def test_referrer_policy_is_strict_origin(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"


def test_permissions_policy_forbids_sensors(client: TestClient) -> None:
    resp = client.get("/health")
    pp = resp.headers.get("permissions-policy", "")
    for feature in ("camera=()", "geolocation=()", "microphone=()"):
        assert feature in pp


def test_x_frame_options_deny(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.headers.get("x-frame-options") == "DENY"


def test_cors_blocks_unknown_origin(client: TestClient) -> None:
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Un-matched origins: either 400 or a response missing the allow-origin
    # header. Either way no ACAO is sent.
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}


def test_cors_allows_listed_origin(client: TestClient) -> None:
    resp = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_allows_vercel_preview_regex(client: TestClient) -> None:
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://watchdawg-abc123.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://watchdawg-abc123.vercel.app"
