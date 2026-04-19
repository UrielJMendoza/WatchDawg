"""Health endpoints.

Two probes:
  GET /health     liveness — no external dependencies touched.
  GET /health/db  readiness — round-trips a trivial Supabase query.

Both emit a structured log line with duration_ms so the backend status
pill on the frontend can see actual latency in Cloud Logging.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Literal

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from watchdawg_api import __version__
from watchdawg_api.deps import SupabaseDep

router = APIRouter(tags=["health"])
_log = structlog.get_logger()


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = Field(..., description="Deployed API semver")
    time: str = Field(..., description="ISO-8601 UTC timestamp")


class DbHealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    latency_ms: float = Field(..., ge=0.0)
    rows_visible_via_service_role: int = Field(..., ge=0)


@router.get("/health", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    """Liveness. Always returns 200 if the process is up."""
    now = datetime.now(UTC)
    _log.info("health_check", kind="liveness")
    return HealthResponse(version=__version__, time=now.isoformat())


@router.get("/health/db", response_model=DbHealthResponse)
async def db_readiness(supabase: SupabaseDep) -> DbHealthResponse:
    """Readiness. Counts rows of `profiles` with a zero-limit query.

    A count-only query is cheapest; we never fetch rows. A degraded return
    (still 200) means the app is up but the DB is not currently reachable
    — caller decides what to do (the frontend status pill treats this as
    amber, not red).
    """
    start = time.perf_counter()
    try:
        resp = (
            supabase.table("profiles")
            .select("id", count="exact")  # type: ignore[arg-type]
            .limit(0)
            .execute()
        )
        latency_ms = (time.perf_counter() - start) * 1000
        count = int(resp.count or 0)
        _log.info(
            "health_check",
            kind="readiness",
            duration_ms=round(latency_ms, 2),
            rows=count,
        )
        return DbHealthResponse(
            status="ok",
            latency_ms=round(latency_ms, 2),
            rows_visible_via_service_role=count,
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        _log.warning(
            "health_check_failed",
            kind="readiness",
            duration_ms=round(latency_ms, 2),
            error=str(exc),
        )
        return DbHealthResponse(
            status="degraded",
            latency_ms=round(latency_ms, 2),
            rows_visible_via_service_role=0,
        )
