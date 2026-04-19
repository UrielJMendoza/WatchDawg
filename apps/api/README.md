# WatchDawg API

FastAPI backend for the WatchDawg OSINT dashboard.

## Run locally

```bash
# One-time: fetch Python 3.12 + install deps into .venv/
uv sync

# Copy env and fill in (see infra/supabase for keys)
cp .env.example .env
$EDITOR .env

# Serve
uv run uvicorn watchdawg_api.main:app --reload --port 8000
curl -i http://localhost:8000/health
```

## Test

```bash
uv run pytest -q          # runs unit + integration tests
uv run ruff check         # lint
uv run ruff format        # autoformat
uv run mypy --strict src/ # type-check
```

Coverage floor (pyproject): 70%. Pytest fails under that.

## Build the container

```bash
# IMPORTANT: always --platform linux/amd64 — Cloud Run only runs amd64
# so an arm64 image built on an M-series Mac will fail at startup.
docker build --platform linux/amd64 -t watchdawg-api .
docker run --rm -p 8000:8080 --env-file .env watchdawg-api
```

The image is built from `python:3.12-slim-bookworm`, runs as non-root
`app` (uid 1001), and uses `gunicorn -k UvicornWorker -w 2` with tini
as PID 1 for clean signal handling.

## Endpoints

| Method | Path         | Auth      | Purpose                                  |
| ------ | ------------ | --------- | ---------------------------------------- |
| GET    | `/health`    | public    | Liveness.                                |
| GET    | `/health/db` | public    | Readiness — queries `profiles` with count. |
| GET    | `/events`    | Bearer    | Paged events (empty until Phase 2).      |

## Observability

- One JSON log line per event on stdout (Cloud Run → Cloud Logging).
- Every response carries `X-Request-ID`; structlog automatically binds
  it to every log line in the same request scope.
- Any key matching `/api[_-]?key|secret|password|token|authorization/i`
  is redacted before structlog emits the line.

## Security posture

- Service-role key lives only on Cloud Run via `--set-secrets`; never
  bundled into the Docker image.
- CORS is explicit allow-list + Vercel preview regex. No wildcard.
- Security headers (CSP, HSTS, nosniff, Referrer-Policy, Permissions-
  Policy, X-Frame-Options: DENY) on every response.
- slowapi limiter harness is wired; Phase 2+ adds `@limiter.limit(...)`
  to mutating endpoints.
