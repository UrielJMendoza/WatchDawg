-- WatchDawg — initial migration (Phase 1).
--
-- Creates the bare-minimum schema Phase 1 needs:
--   * extensions: postgis, pg_trgm, uuid-ossp, citext
--   * public.profiles (1:1 mirror of auth.users with a role enum)
--   * RLS: every user can see and update exactly their own row
--   * trigger: new auth.users insert mirrors id+email into profiles
--
-- Phase 2+ migrations add: events, sources, analyst_notes, materialised
-- aggregate tables, spatial indexes. This file must not be edited in
-- place — always add a new migration.

-- ── Extensions ─────────────────────────────────────────────────────────
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";
create extension if not exists citext;

-- ── profiles ───────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    email      citext unique not null,
    role       text not null default 'viewer'
               check (role in ('viewer', 'analyst', 'admin')),
    created_at timestamptz not null default now()
);

comment on table public.profiles is
    'Application-facing user record. One row per auth.users row.';
comment on column public.profiles.role is
    'Access tier: viewer (read-only), analyst (annotate), admin (everything).';

-- ── Row-Level Security ─────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- The anon role never reads profiles. authenticated users read/update self.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
    on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- service_role bypasses RLS by default (it's how the backend reads every
-- row); nothing extra to grant there. authenticated callers get the
-- minimum privileges RLS then filters.
grant select, update (role, email) on public.profiles to authenticated;

-- ── handle_new_user trigger ────────────────────────────────────────────
-- Mirrors new auth.users rows into public.profiles. Runs as security
-- definer because auth.users is in the protected auth schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

comment on function public.handle_new_user() is
    'Mirrors new auth.users rows into public.profiles with default role=viewer.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();
