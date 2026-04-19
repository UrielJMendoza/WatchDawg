"""WatchDawg API entry point.

Wire ordering matters: the RequestIDMiddleware must run BEFORE CORS
(and anything else) so every log line inside the request scope carries
the same request_id. Security headers run after business logic so they
layer onto the final response, including FastAPI's default error
responses.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

from watchdawg_api import __version__
from watchdawg_api.config import get_settings
from watchdawg_api.logging_config import configure_logging
from watchdawg_api.middleware.request_id import RequestIDMiddleware
from watchdawg_api.middleware.security_headers import SecurityHeadersMiddleware
from watchdawg_api.routes import events as events_routes
from watchdawg_api.routes import health as health_routes


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(env=settings.ENV)

    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENV,
            traces_sample_rate=0.1 if settings.ENV == "prod" else 1.0,
            send_default_pii=False,
        )

    log = structlog.get_logger()
    log.info(
        "api_ready",
        phase="startup",
        version=__version__,
        env=settings.ENV,
        sentry_enabled=bool(settings.SENTRY_DSN),
    )
    yield
    log.info("api_shutdown", phase="shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    # slowapi Limiter — no rules yet. Wires the harness so Phase 2+ can
    # add `@limiter.limit("30/minute")` to any mutating endpoint.
    limiter = Limiter(key_func=get_remote_address, default_limits=[])

    app = FastAPI(
        title="WatchDawg API",
        version=__version__,
        description="OSINT maritime security API for the Red Sea and Horn of Africa.",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(
        RateLimitExceeded,
        lambda _request, exc: JSONResponse(
            status_code=429,
            content={"detail": f"Rate limit exceeded: {exc.detail}"},
        ),
    )

    # ── Middleware (innermost first in FastAPI add_middleware order) ───────
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["authorization", "content-type", "x-request-id", "x-cron-secret"],
        expose_headers=["x-request-id"],
        max_age=600,
    )
    app.add_middleware(RequestIDMiddleware)
    if settings.SENTRY_DSN:
        app.add_middleware(SentryAsgiMiddleware)

    # ── Routes ─────────────────────────────────────────────────────────────
    app.include_router(health_routes.router)
    app.include_router(events_routes.router)

    return app


app = create_app()


def main() -> None:
    """Entry point for `python -m watchdawg_api.main` / Docker CMD fallback."""
    import uvicorn

    uvicorn.run(
        "watchdawg_api.main:app",
        host="0.0.0.0",  # noqa: S104 — container binds to all interfaces
        port=8000,
        log_config=None,
    )


def _request_id_of(request: Request) -> str | None:
    return request.headers.get("x-request-id")


if __name__ == "__main__":
    main()
