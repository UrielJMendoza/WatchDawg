-- ============================================================================
-- WatchDawg — 0001_init
-- Phase 1: enable extensions and create the auth-linked profiles table.
-- All other tables (events, ais_positions, entities, etc.) come in later
-- migrations. Idempotent — safe to re-run.
-- ============================================================================

-- Required extensions
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- profiles — one row per auth.users row, auto-created via trigger.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'viewer'
    check (role in ('viewer', 'analyst', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read and update their own profile only.
drop policy if exists profiles_self_read   on public.profiles;
drop policy if exists profiles_self_update on public.profiles;

create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- handle_new_user — auto-create a profile row on signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
