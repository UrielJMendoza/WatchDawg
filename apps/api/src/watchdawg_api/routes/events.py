"""Events endpoint — Phase 1 stub.

The response model is the exact shape Phase 2/3 will populate, so the
frontend TypeScript types stabilize today. Phase 1 returns an empty
page to every authenticated caller and 401 to anyone else.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from watchdawg_api.deps import UserDep

router = APIRouter(tags=["events"])


class EventItem(BaseModel):
    """One normalized OSINT event. Populated in Phase 2."""

    id: str
    source: Literal["gdelt", "aisstream", "opensky", "newsdata", "reddit"]
    occurred_at: datetime
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    title: str
    url: str | None = None


class EventList(BaseModel):
    items: list[EventItem] = Field(default_factory=list)
    total: int = 0
    next_cursor: str | None = None


@router.get("/events", response_model=EventList)
async def list_events(_user: UserDep) -> EventList:
    """List maritime events in the focus region.

    Phase 1 returns an empty page. Authorization is enforced from day
    one so later phases cannot accidentally ship with it missing.
    """
    return EventList()
