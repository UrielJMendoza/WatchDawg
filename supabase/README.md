# WatchDawg — Supabase

Database migrations and local Supabase config live here.

## First-time setup

```bash
# Install the Supabase CLI — https://supabase.com/docs/guides/cli
# (brew: `brew install supabase/tap/supabase`; pnpm: `pnpm add -g supabase`.)

# 1. Create a Supabase project in the dashboard (free tier, us-east-1
#    or us-west-1). Copy the project ref from the URL:
#    https://supabase.com/dashboard/project/<project-ref>

# 2. Link this repo to that project.
supabase login
supabase link --project-ref <project-ref>

# 3. Push all migrations to the linked project.
supabase db push
```

## Day-to-day workflow

```bash
# Add a new migration (generates a timestamped .sql file in ./migrations/)
supabase migration new <snake_case_name>
$EDITOR supabase/migrations/<new>.sql

# Apply locally (spins up a Docker-backed Supabase stack for tests)
supabase start            # one-time, leaves containers running
supabase db reset         # replays ALL migrations from scratch
supabase stop             # free the ports

# Apply to the linked production project
supabase db push

# Inspect the current remote schema
supabase db dump --schema public > /tmp/prod.sql
```

Never edit an applied migration. Always add a new one — that's what makes
the history replayable against a fresh clone.

## Migrations

| File                          | What it does                                   |
| ----------------------------- | ---------------------------------------------- |
| `20260419000001_init.sql`     | Extensions, `profiles`, RLS, `handle_new_user` |

## Bootstrap fallback — Supabase SQL Editor

If a new contributor hasn't installed the CLI yet and needs to bring a
personal Supabase project up manually, they can paste the migration into
the Supabase dashboard SQL Editor:

1. Open `https://supabase.com/dashboard/project/<project-ref>/sql`.
2. New query → paste the contents of the latest migration file.
3. Run.
4. Verify in Table Editor that `public.profiles` exists with RLS enabled.

The CLI-based workflow is still the canonical path; the SQL Editor is
only for onboarding before `supabase login` is set up.

## Layout note

The spec originally located migrations at `infra/supabase/migrations/`,
but the Supabase CLI hard-codes `./supabase/migrations/` as the search
path. Since the CLI workflow is the value we care about (replayable
against any environment), migrations live here and `infra/supabase/`
is a pointer README.
