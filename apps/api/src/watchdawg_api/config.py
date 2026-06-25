from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven config. Loaded from process env (Cloud Run secrets)
    or .env in local dev."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: Literal["dev", "prod", "test"] = Field(default="dev")

    # Supabase
    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    supabase_anon_key: str = Field(default="")

    # Anthropic
    anthropic_api_key: str = Field(default="")

    # Source API keys (Phase 2 onward — accept blank in Phase 1)
    aisstream_api_key: str = Field(default="")
    newsdata_api_key: str = Field(default="")
    opensky_client_id: str = Field(default="")
    opensky_client_secret: str = Field(default="")
    reddit_client_id: str = Field(default="")
    reddit_client_secret: str = Field(default="")
    reddit_user_agent: str = Field(
        default="python:io.watchdawg.osint:v0.1 (set REDDIT_USER_AGENT)"
    )

    # Cron auth
    cron_secret: str = Field(default="dev-cron-secret-change-me")

    # CORS — comma-separated list of allowed origins
    allowed_origins: str = Field(default="http://localhost:3000")

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
