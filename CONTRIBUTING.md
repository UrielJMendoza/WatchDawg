# Contributing to WatchDawg

Thanks for looking. This is a portfolio / defense-industry OSINT project;
contributions are welcome but the architecture is opinionated.

## Prerequisites

- Node **20.x** (`.nvmrc`) and `pnpm` 9.x
- Python **3.12** (`.python-version`) and `uv` (<https://docs.astral.sh/uv/>)
- Docker (for backend image builds)
- `pre-commit` (`pip install pre-commit`)
- Supabase CLI (for database migrations)
- Google Cloud SDK (only needed for infra work)

## Local development

```bash
# one-time setup
pre-commit install

# frontend
pnpm install
pnpm -C apps/web dev          # http://localhost:3000

# backend
cd apps/api
uv sync
uv run uvicorn watchdawg_api.main:app --reload   # http://localhost:8000
```

Copy `apps/web/.env.example` → `apps/web/.env.local` and
`apps/api/.env.example` → `apps/api/.env` and fill in the values.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): add classification banner
fix(api): correct CORS regex for Vercel preview URLs
chore: bump ruff to 0.8.4
docs: add WIF setup runbook
test(api): cover security-headers middleware
ci: add axe job to ci-web
```

Scope is optional but recommended. Keep each commit under ~400 lines of diff;
split across logical seams if larger.

## Adding a Supabase migration

```bash
# from repo root
supabase migration new <snake_case_name>
# edits land in infra/supabase/migrations/<timestamp>_<name>.sql
supabase db reset        # replays all migrations locally
```

Never edit an applied migration. Always add a new one.

## Code style

- **TypeScript**: strict mode, `noUncheckedIndexedAccess`, no `any` without
  a tracking-issue comment. Lint with `pnpm -C apps/web lint`.
- **Python**: `ruff` (format + lint) and `mypy --strict`. All function
  signatures get type hints. All external-payload boundaries get a
  pydantic v2 model.
- **No `print()`** in production Python. Use `structlog`.
- **No emoji** in the UI. This is a defense-adjacent product.

## Before you open a PR

```bash
pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web test
cd apps/api && uv run ruff check && uv run mypy --strict src/ && uv run pytest -q
```

CI will run the same checks. A failing check blocks merge.
