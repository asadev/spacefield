-- spacefield profiles
-- 2026-04-27
--
-- Public profiles table — anyone can read (so usernames + bios show up
-- across the app), only the owner can update.
--
-- A new auth.users row triggers a profile row to be created with the
-- defaults from the OAuth payload (full_name + avatar_url) so signups
-- "just work" without an extra round-trip from the client.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  full_name    text,
  designation  text,        -- job title / role (e.g. "Real Estate Broker")
  bio          text,
  avatar_url   text,
  socials      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Username constraints — letters, digits, underscore, dash, 3..30 chars.
alter table public.profiles
  drop constraint if exists profiles_username_format,
  add constraint profiles_username_format
    check (username is null or username ~ '^[a-zA-Z0-9_-]{3,30}$');

create index if not exists profiles_username_idx
  on public.profiles (lower(username));

-- ─────────────── RLS ───────────────
alter table public.profiles enable row level security;

drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles"
  on public.profiles for select
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own profile" on public.profiles;
create policy "users delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────── updated_at trigger ───────────────
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- ─────────────── Auto-create profile on signup ───────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users into profiles (no-op if already present).
insert into public.profiles (user_id, full_name, avatar_url)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (user_id) do nothing;

-- ─────────────── Username availability ───────────────
-- Case-insensitive check. Returns true if no profile claims this name
-- (or claims it with a different user_id).
create or replace function public.is_username_available(
  check_username text,
  for_user_id    uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.profiles
     where lower(username) = lower(check_username)
       and (for_user_id is null or user_id <> for_user_id)
  );
$$;

grant execute on function public.is_username_available(text, uuid) to anon, authenticated;
