-- Admin panel: profiles.is_admin flag, is_admin_user() RPC,
-- and contact_messages.resolved_at column.
-- 2026-04-27

-- ───────────────────────── profiles.is_admin ─────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin) where is_admin = true;

-- ───────────────────────── is_admin_user() RPC ─────────────────────────
-- Returns true if the calling user has profiles.is_admin = true.
-- Used by app/admin/* layout to gate access.
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid() limit 1),
    false
  );
$$;

grant execute on function public.is_admin_user() to anon, authenticated;

-- ───────────────────────── contact_messages ─────────────────────────
-- The contact form (app/contact/page.tsx) inserts here as anon. The table
-- has anon-INSERT only and no SELECT policy by design; the admin panel
-- reads via the service-role client.
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text not null,
  topic       text not null default 'general',
  message     text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.contact_messages enable row level security;

drop policy if exists "anon can insert contact messages" on public.contact_messages;
create policy "anon can insert contact messages"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

-- Schema add for already-existing installs: resolved_at column.
alter table public.contact_messages
  add column if not exists resolved_at timestamptz;

create index if not exists contact_messages_resolved_idx
  on public.contact_messages (resolved_at);
create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);
