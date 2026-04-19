"""FastAPI dependency providers.

Route handlers declare what they need via `Depends(...)`; tests swap
values via `app.dependency_overrides`. Never import a module-level
singleton from a route.
"""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client

from watchdawg_api.config import Settings, get_settings
from watchdawg_api.db import get_supabase


def get_db() -> Client:
    """Supabase client. Uses the service-role key."""
    return get_supabase()


SettingsDep = Annotated[Settings, Depends(get_settings)]
SupabaseDep = Annotated[Client, Depends(get_db)]


class AuthenticatedUser(BaseModel):
    """Decoded Supabase JWT payload we care about in route handlers."""

    sub: str = Field(..., description="Supabase user UUID")
    email: str | None = None
    role: str = Field(default="authenticated")


def require_user(
    settings: SettingsDep,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> AuthenticatedUser:
    """Validate the Supabase access token on the Authorization header.

    401 if the header is missing/malformed; 401 if signature invalid or
    expired. Supabase signs JWTs with HS256 using the project JWT secret,
    so we verify locally without a JWKS round-trip.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired.",
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        ) from exc

    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim.",
        )
    email = payload.get("email")
    role = payload.get("role", "authenticated")
    return AuthenticatedUser(
        sub=sub, email=email if isinstance(email, str) else None, role=str(role)
    )


UserDep = Annotated[AuthenticatedUser, Depends(require_user)]


def require_cron_secret(
    settings: SettingsDep,
    x_cron_secret: Annotated[str | None, Header(alias="X-Cron-Secret")] = None,
) -> None:
    """Dependency for cron-triggered endpoints. Compares the header against
    the CRON_SECRET env var in constant time."""
    import hmac

    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, settings.CRON_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid cron secret.",
        )
