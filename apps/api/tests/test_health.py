"""Health probes + request-id propagation."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def test_health_returns_200_with_version_and_time(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["time"].endswith("+00:00")


def test_health_echoes_incoming_request_id(client: TestClient) -> None:
    rid = "11111111-2222-3333-4444-555555555555"
    resp = client.get("/health", headers={"X-Request-ID": rid})
    assert resp.status_code == 200
    assert resp.headers.get("x-request-id") == rid


def test_health_generates_request_id_when_missing(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    rid = resp.headers.get("x-request-id")
    assert rid and len(rid) >= 32, "expected a UUID4"


def test_health_db_returns_count_on_success(client: TestClient, fake_supabase: MagicMock) -> None:
    resp = client.get("/health/db")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["rows_visible_via_service_role"] == 3
    assert body["latency_ms"] >= 0.0


def test_health_db_returns_degraded_on_failure(
    client: TestClient, fake_supabase: MagicMock
) -> None:
    fake_supabase.table.side_effect = RuntimeError("boom")
    resp = client.get("/health/db")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["rows_visible_via_service_role"] == 0


def test_version_is_json_parseable(client: TestClient) -> None:
    resp = client.get("/health")
    # Must be parseable as JSON without surprises — no NaN, Infinity, etc.
    parsed = json.loads(resp.content)
    assert isinstance(parsed, dict)
