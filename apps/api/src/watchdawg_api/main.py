from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from watchdawg_api import __version__
from watchdawg_api.config import get_settings
from watchdawg_api.routes import events, health


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
        cache_logger_on_first_use=True,
    )


_configure_logging()
log = structlog.get_logger("watchdawg.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    log.info(
        "startup",
        env=settings.env,
        version=__version__,
        supabase_configured=settings.supabase_configured,
        allowed_origins=settings.origins_list,
    )
    yield
    log.info("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="WatchDawg API",
        version=__version__,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=3600,
    )

    app.include_router(health.router)
    app.include_router(events.router)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": "WatchDawg API",
            "version": __version__,
            "classification": "UNCLASSIFIED // OSINT",
        }

    return app


app = create_app()
