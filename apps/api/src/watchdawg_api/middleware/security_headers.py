"""HTTP security headers for every response.

The API is JSON-only, so CSP is tight: `default-src 'none'` keeps a
misconfigured `<script>` injection from mattering. HSTS runs a 1-year
max-age with preload; X-Content-Type-Options: nosniff closes the
MIME-sniffing CSRF vector; Referrer-Policy keeps URL query strings off
third-party servers.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# The API serves no HTML; lock everything down.
_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
_PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), "
    "gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault(
            "strict-transport-security", "max-age=31536000; includeSubDomains; preload"
        )
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("referrer-policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("content-security-policy", _CSP)
        response.headers.setdefault("permissions-policy", _PERMISSIONS_POLICY)
        response.headers.setdefault("x-frame-options", "DENY")
        return response
