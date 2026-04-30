from functools import lru_cache

from supabase import Client, create_client

from watchdawg_api.config import get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client | None:
    """Return a cached Supabase service-role client, or None if not configured.

    Uses the service-role key — server-side only. RLS is bypassed; the API
    layer is responsible for authorizing requests.
    """
    settings = get_settings()
    if not settings.supabase_configured:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
