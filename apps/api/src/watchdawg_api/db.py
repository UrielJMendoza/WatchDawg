"""Supabase client factory.

The service-role key is read exactly here and nowhere else. get_db()
wraps the client so FastAPI Depends can inject a fresh reference,
letting tests swap in a mock via dependency_overrides.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from watchdawg_api.config import Settings, get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    settings: Settings = get_settings()
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )
