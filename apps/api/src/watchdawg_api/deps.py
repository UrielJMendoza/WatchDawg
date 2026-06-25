"""FastAPI dependencies. Phase 1 stub — real auth dependency lands in Phase 6."""

from fastapi import Header, HTTPException, status

from watchdawg_api.config import get_settings


async def require_cron_secret(x_cron_secret: str | None = Header(default=None)) -> None:
    """Header-based auth gate for cron endpoints. Used from Phase 2 onward."""
    expected = get_settings().cron_secret
    if not x_cron_secret or x_cron_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid cron secret",
        )
