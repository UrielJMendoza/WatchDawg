# Changelog

All notable changes to WatchDawg ship here. Format: [Keep a Changelog][kac].
Versioning: calver (`phase.minor.patch`) until the first production release.

## [Phase 1 — Infrastructure] — 2026-04-19

### Added

- Next.js 16 + Tailwind 4 + TypeScript strict frontend scaffolded under
  `apps/web`. App Router, no src/ directory, typedRoutes, productionBrowserSourceMaps.
- FastAPI 0.115+ backend under `apps/api` on Python 3.12 with uv, structlog,
  sentry-sdk, slowapi, pyjwt. Multi-stage Dockerfile runs gunicorn+uvicorn
  as non-root on `python:3.12-slim-bookworm`.
- Supabase CLI project under `supabase/` with migration `20260419000001_init.sql`
  creating `public.profiles` with RLS + `handle_new_user` trigger.
- Gotham-adjacent dark theme tokens (HSL under `:root`, mapped via Tailwind v4
  `@theme`), Geist Sans + Geist Mono, `section-header` `@utility`.
- Fixed `UNCLASSIFIED // OSINT` banners on top + bottom of every route.
- Skip-to-main keyboard link, `prefers-reduced-motion` respected globally.
- Supabase email/password + magic-link auth with `/auth/callback` code
  exchange. `/(dashboard)/layout.tsx` guards with `getUser()` (not
  `getSession()`) and redirects unauthenticated requests to `/login`.
- Next 16 proxy (renamed from middleware) refreshes the Supabase session
  cookie on every request.
- `WatchdawgMap`: MapLibre GL 5 + deck.gl 9 (interleaved MapboxOverlay) on
  the CARTO dark-matter style. Initial view 43.5°E 15°N zoom 4.5. 1° graticule
  across the focus bbox lat 10..30, lon 32..55. Lazy-loaded to keep the
  dashboard's initial bundle ≲ 140 KB gzipped.
- Three-pane dashboard shell: topbar (48px) + left-nav (240px) + map + detail
  panel (360px) + timeline strip (32px). Height budget
  `calc(100vh - 3rem)` to clear the fixed banners.
- `/health`, `/health/db`, `/events` routes. `/events` returns the stable
  `{items, total, next_cursor}` shape Phase 2 will populate; JWT-required
  from Phase 1 so routes cannot ship unauthenticated later.
- ASGI middleware: `RequestIDMiddleware` (UUID4 fallback, bound to structlog
  contextvars) and `SecurityHeadersMiddleware` (CSP `default-src 'none'`,
  HSTS preload, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options: DENY`).
- CORS built from explicit allow-list + Vercel preview regex as a single
  combined regex, `allow_credentials=False`.
- Zustand-backed `LIVE/DEGRADED/OFFLINE` pill, fed by a `HealthPoller` client
  component that hits `/health` every 30s. 3 consecutive failures flip to
  OFFLINE.
- GitHub Actions CI: `ci-web` (typecheck + lint + test + build) and `ci-api`
  (ruff + mypy --strict + pytest, coverage floor 70%).
- GitHub Actions deploy: `deploy-api` via Workload Identity Federation; no
  long-lived service-account JSON key. Reproducible runbook at
  `infra/gcp/WIF_SETUP.md`.
- Pre-commit hooks: ruff + prettier + ripsecrets + check-added-large-files +
  trailing-whitespace + detect-private-key.

### Security posture

- Service-role key lives only on Cloud Run via `--set-secrets` from GCP
  Secret Manager.
- CORS has no wildcard. Allowed origins regex OR's the explicit list with
  `^https://watchdawg-[a-z0-9-]+\.vercel\.app$` for previews.
- WIF attribute-condition restricts token exchange to this repo on
  `refs/heads/main` only.
- RLS on `public.profiles` from row zero; anon key sees zero rows.

### Tests

- 22 vitest cases (frontend): classification banner, login form, dashboard
  shell primitives, status pill variants, status store transitions, map
  component aria + graticule shape, axe-core zero critical violations.
- 20 pytest cases (backend): `/health` liveness + db readiness + fallback
  degrade, request-id header round-trip, every security header, CORS
  allow/deny including Vercel preview regex, `/events` unauthenticated +
  expired + wrong-signature + happy path, response-shape contract.

### Known out-of-scope for Phase 1

- No ingestion from any external source. The map is empty because the data
  doesn't exist yet. Phase 2 lands GDELT, AISStream, OpenSky, NewsData,
  Reddit.
- `prophet`, `shapely`, `geopandas`, `pandas`, `numpy`, `scikit-learn`,
  `anthropic`, `tenacity` are **not** installed. They'll land in the phase
  that first imports them.

[kac]: https://keepachangelog.com/en/1.1.0/
