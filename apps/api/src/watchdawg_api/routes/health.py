from datetime import datetime, timezone
from time import perf_counter
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from watchdawg_api import __version__
from watchdawg_api.db import get_supabase

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"] = "ok"
    version: str = __version__
    time: str


class HealthDbResponse(HealthResponse):
    latency_ms: float
    detail: str | None = None


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", time=_now())


@router.get("/health/db", response_model=HealthDbResponse)
async def health_db() -> HealthDbResponse:
    """Probe Supabase connectivity. Returns latency_ms even on failure."""
    client = get_supabase()
    if client is None:
        return HealthDbResponse(
            status="degraded",
            time=_now(),
            latency_ms=0.0,
            detail="supabase not configured",
        )

    t0 = perf_counter()
    try:
        # Cheapest possible round-trip: ask the auth health endpoint.
        # We deliberately avoid touching application tables in case they
        # don't exist yet (Phase 1 has only the profiles table).
        client.table("profiles").select("id").limit(1).execute()
        latency = (perf_counter() - t0) * 1000.0
        return HealthDbResponse(status="ok", time=_now(), latency_ms=round(latency, 2))
    except Exception as exc:  # noqa: BLE001 — we want to surface any DB error
        latency = (perf_counter() - t0) * 1000.0
        return HealthDbResponse(
            status="down",
            time=_now(),
            latency_ms=round(latency, 2),
            detail=str(exc),
        )
