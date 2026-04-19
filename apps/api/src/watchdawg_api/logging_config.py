"""structlog configuration emitting one JSON object per log line.

Context vars (request_id etc.) are bound by middleware and automatically
included in every line within that request's scope. A redaction processor
scrubs any bound field whose name matches a secret-like pattern.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor

_SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|secret|password|token|authorization|anon[_-]?key|service[_-]?role)",
    re.IGNORECASE,
)


def _redact(_logger: Any, _method: str, event_dict: EventDict) -> EventDict:
    """Replace the value of any secret-like key with ``"[redacted]"``."""
    for key in list(event_dict.keys()):
        if _SECRET_KEY_RE.search(key):
            event_dict[key] = "[redacted]"
    return event_dict


def configure_logging(*, env: str) -> None:
    """Wire structlog + stdlib logging. Idempotent; safe to call at startup."""
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        _redact,
    ]

    if env == "prod":
        renderer: Processor = structlog.processors.JSONRenderer()
    else:
        # Human-readable colors in dev — one-line JSON on Cloud Run.
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logs (uvicorn/fastapi/supabase) through structlog too so
    # everything is JSON in prod.
    logging.basicConfig(
        format="%(message)s",
        level=logging.INFO,
        stream=sys.stdout,
        force=True,
    )
