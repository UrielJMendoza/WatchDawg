# WatchDawg

[![Status: Phase 1 of 7](https://img.shields.io/badge/status-phase%201%20of%207-amber)](https://github.com/jeramiahmm/watchdawg)
[![Classification](https://img.shields.io/badge/UNCLASSIFIED-%2F%2F%20OSINT-2EA043)](#classification)

Real-time OSINT maritime-security situational awareness for the Red Sea and Horn of Africa.

> **Classification:** `UNCLASSIFIED // OSINT`
>
> This is a portfolio project demonstrating OSINT methodology. It is not classified, not affiliated with any government, and not a substitute for an analyst.

## Current phase: 1 of 7

Phase 1 builds the skeleton end-to-end: an empty Gotham-styled dark map, login screen, and a deployed FastAPI backend on Cloud Run. No data ingestion yet. Subsequent phases add ingestion (2), interaction surface (3), entity ontology (4), analytics + ML (5), multi-user (6), and polish (7).

## Architecture

```
                           +----------------------+
                           |   GitHub Actions     |
                           |   (15-min cron)      |
                           +-----------+----------+
                                       |
                                       v
+------------+      +------------------+-------------------+
|  Vercel    |<---->|        Cloud Run (us-central1)       |
|  Next.js   | HTTP |        FastAPI + Pydantic v2          |
|  MapLibre  |      |        watchdawg-api service          |
|  Deck.gl   |      +------------------+-------------------+
+-----+------+                         |
      |                                v
      |                         +------+-------+
      +------------------------>|   Supabase   |
            Supabase Auth /     | Postgres +   |
            anon-key reads      | PostGIS +    |
                                | Auth + RLS   |
                                +--------------+
```

## Tech stack (locked)

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + MapLibre GL + Deck.gl + Recharts + uPlot
- **Backend:** Python 3.12 + FastAPI + Pydantic v2 + httpx + structlog
- **Database + Auth:** Supabase (Postgres + PostGIS + Auth + RLS)
- **Scheduling:** GitHub Actions cron (no APScheduler)
- **Deploy:** Vercel (web) + Google Cloud Run (api) + Supabase free tier
- **Cost target:** $0/month

## Repo layout

```
watchdawg/
├── apps/
│   ├── web/              Next.js 15 frontend (Vercel)
│   └── api/              FastAPI backend (Cloud Run)
├── infra/
│   └── supabase/
│       └── migrations/   SQL migrations (apply in order)
└── .github/
    └── workflows/        Deploy + cron workflows
```

## Local development

### Prerequisites

- Node.js 20+ and pnpm 9+
- Python 3.12 + pip
- Docker (optional, for local API)
- A Supabase project (free tier)
- API keys for: Anthropic, AISStream.io, NewsData.io, OpenSky, Reddit (Phase 2 onward)

### Frontend

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# NEXT_PUBLIC_API_BASE_URL (http://localhost:8000 for local).
pnpm install
pnpm dev
# -> http://localhost:3000
```

### Backend

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Fill in the variables.
uvicorn watchdawg_api.main:app --reload --port 8000
# -> http://localhost:8000/health
```

Or via Docker:

```bash
docker compose up --build
```

## Phase 1 — manual setup (one-time)

These steps require human action and are **not** automated:

1. **Supabase** — create a free-tier project, choose a region near `us-central1` (e.g. `us-east-1`).
   - Run `infra/supabase/migrations/0001_init.sql` in the SQL editor.
   - Copy the project URL, anon key, and service-role key into the env files.
2. **Vercel** — connect the GitHub repo. Set Root Directory to `apps/web`. Add env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`.
3. **Google Cloud** — create a project, enable Cloud Run + Artifact Registry + Secret Manager, set up Workload Identity Federation for GitHub Actions, store secrets, then push to `main` to trigger the deploy workflow.
4. **GitHub Actions** — set repo variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `API_BASE_URL`. After the first Cloud Run deploy, copy the service URL into Vercel env `NEXT_PUBLIC_API_BASE_URL`.

Detailed steps live in `apps/api/README.md` and `apps/web/.env.example`.

## What this tool is NOT

- Not a targeting tool
- Not a real-time predictive engine
- Not classified, not affiliated with any government
- Not a substitute for an analyst — it supports them

## License

MIT (code). Data licenses per source.
