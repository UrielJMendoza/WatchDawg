"""/events — Phase 1 auth + response shape."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient


def test_events_unauthenticated_returns_401(unauth_client: TestClient) -> None:
    resp = unauth_client.get("/events")
    assert resp.status_code == 401
    assert "Bearer" in resp.headers.get("www-authenticate", "")


def test_events_rejects_expired_token(unauth_client: TestClient) -> None:
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000001",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int((datetime.now(UTC) - timedelta(minutes=5)).timestamp()),
        },
        "test-jwt-secret-with-enough-length-AAAA",
        algorithm="HS256",
    )
    resp = unauth_client.get("/events", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_events_rejects_wrong_signature(unauth_client: TestClient) -> None:
    token = jwt.encode(
        {"sub": "x", "aud": "authenticated"},
        "wrong-secret",
        algorithm="HS256",
    )
    resp = unauth_client.get("/events", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_events_accepts_valid_token(unauth_client: TestClient) -> None:
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000001",
            "aud": "authenticated",
            "role": "authenticated",
            "email": "analyst@example.org",
            "exp": int((datetime.now(UTC) + timedelta(minutes=15)).timestamp()),
        },
        "test-jwt-secret-with-enough-length-AAAA",
        algorithm="HS256",
    )
    resp = unauth_client.get("/events", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"items": [], "total": 0, "next_cursor": None}


def test_events_response_shape_matches_contract(client: TestClient) -> None:
    """Frontend TS types key off this exact shape; locking it in Phase 1."""
    resp = client.get("/events")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total", "next_cursor"}
    assert body["items"] == []
    assert body["total"] == 0
    assert body["next_cursor"] is None
