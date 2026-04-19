"""Test harness.

Sets placeholder env vars before the app imports so Settings validates.
Provides a TestClient fixture with dependency overrides for Supabase
and the JWT-authenticated user dependency.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Must land in the env BEFORE any module imports Settings().
os.environ.setdefault("ENV", "dev")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-not-real")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key-not-real")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-with-enough-length-AAAA")
os.environ.setdefault("CRON_SECRET", "test-cron-secret-sixteen+ chars")
os.environ.setdefault(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://watchdawg-prod.vercel.app",
)

from watchdawg_api.config import get_settings  # noqa: E402
from watchdawg_api.deps import (  # noqa: E402
    AuthenticatedUser,
    get_db,
    require_user,
)
from watchdawg_api.main import create_app  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    """Drop any Settings() the previous test might have cached."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def fake_supabase() -> MagicMock:
    """A Supabase client whose `table(...).select(...).limit(...).execute()`
    returns a canned response with count=3."""
    client = MagicMock()
    chain = client.table.return_value.select.return_value.limit.return_value
    chain.execute.return_value = SimpleNamespace(count=3, data=[])
    return client


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        sub="00000000-0000-0000-0000-000000000001",
        email="analyst@example.org",
        role="authenticated",
    )


@pytest.fixture
def app(fake_supabase: MagicMock, fake_user: AuthenticatedUser) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_db] = lambda: fake_supabase
    application.dependency_overrides[require_user] = lambda: fake_user
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def unauth_client() -> Iterator[TestClient]:
    """A client that keeps the real JWT dependency — used for auth tests."""
    app = create_app()
    with TestClient(app) as c:
        yield c


def _make_token(secret: str, payload: dict[str, Any]) -> str:
    import jwt

    return jwt.encode(payload, secret, algorithm="HS256")
