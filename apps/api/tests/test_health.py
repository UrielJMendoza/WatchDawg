from fastapi.testclient import TestClient

from watchdawg_api.main import app


def test_root() -> None:
    client = TestClient(app)
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "WatchDawg API"
    assert body["classification"] == "UNCLASSIFIED // OSINT"


def test_health_ok() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "time" in body


def test_health_db_returns_latency() -> None:
    """Without Supabase configured the route returns a degraded status with
    latency_ms = 0. We only check the shape — real connectivity is verified
    in the live environment."""
    client = TestClient(app)
    res = client.get("/health/db")
    assert res.status_code == 200
    body = res.json()
    assert "latency_ms" in body
    assert body["status"] in {"ok", "degraded", "down"}


def test_events_empty_stub() -> None:
    client = TestClient(app)
    res = client.get("/events")
    assert res.status_code == 200
    body = res.json()
    assert body == {"items": [], "total": 0, "next_cursor": None}
