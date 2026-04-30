"""Events endpoint — Phase 1 stub.

Returns the empty shape that Phase 3 will consume. Real fetch logic lands
in Phase 2 once the events table exists.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/events", tags=["events"])


class WatchdawgEvent(BaseModel):
    id: str
    source_id: str
    source_key: str
    event_time: str
    title: str
    summary: str | None = None
    event_type: str
    severity: int
    fatalities: int | None = None
    lon: float
    lat: float
    location_name: str | None = None
    country_iso: str | None = None
    source_url: str | None = None
    confidence: int
    classification: str = "UNCLASSIFIED // OSINT"


class EventListResponse(BaseModel):
    items: list[WatchdawgEvent] = []
    total: int = 0
    next_cursor: str | None = None


@router.get("", response_model=EventListResponse)
async def list_events() -> EventListResponse:
    return EventListResponse(items=[], total=0, next_cursor=None)
