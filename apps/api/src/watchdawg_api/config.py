"""Application configuration via pydantic-settings."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings sourced from env vars.

    Missing required values raise a ValidationError naming the exact env var,
    so ops can diagnose a misconfigured Cloud Run revision from the error
    alone. Optional values default to None so the app still boots locally
    without a full secret bundle.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Environment ──────────────────────────────────────────────────────
    ENV: Literal["dev", "prod"] = "dev"

    # ── Supabase ─────────────────────────────────────────────────────────
    SUPABASE_URL: str = Field(..., min_length=1)
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., min_length=1)
    SUPABASE_ANON_KEY: str = Field(..., min_length=1)
    SUPABASE_JWT_SECRET: str = Field(..., min_length=1)

    # ── Phase 2+ optional integrations (wired when Phase 2 ingestors land) ─
    ANTHROPIC_API_KEY: str | None = None
    AISSTREAM_API_KEY: str | None = None
    NEWSDATA_API_KEY: str | None = None
    OPENSKY_CLIENT_ID: str | None = None
    OPENSKY_CLIENT_SECRET: str | None = None
    REDDIT_CLIENT_ID: str | None = None
    REDDIT_CLIENT_SECRET: str | None = None
    REDDIT_USER_AGENT: str | None = None
    REDDIT_USERNAME: str | None = None

    # ── Operational ──────────────────────────────────────────────────────
    CRON_SECRET: str = Field(..., min_length=16)
    SENTRY_DSN: str | None = None

    # Comma-separated list of origins (scheme + host, no trailing slash).
    # Preview URLs match against VERCEL_PREVIEW_ORIGIN_REGEX.
    ALLOWED_ORIGINS: str = ""
    VERCEL_PREVIEW_ORIGIN_REGEX: str = r"^https://watchdawg-[a-z0-9-]+\.vercel\.app$"

    @field_validator("SUPABASE_URL")
    @classmethod
    def _validate_supabase_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("SUPABASE_URL must include scheme (https://...)")
        return v.rstrip("/")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str:
        """A single regex OR'ing the explicit allowlist + preview pattern.

        FastAPI's CORSMiddleware cannot accept both `allow_origins` and
        `allow_origin_regex` cleanly, so we build one combined regex here
        so the policy is testable in isolation.
        """
        literals = [re.escape(o) for o in self.allowed_origins_list]
        patterns = [self.VERCEL_PREVIEW_ORIGIN_REGEX, *[f"^{lit}$" for lit in literals]]
        return "|".join(f"(?:{p})" for p in patterns)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached Settings factory. Injected via Depends in route handlers."""
    return Settings()
