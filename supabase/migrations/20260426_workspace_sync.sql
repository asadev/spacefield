-- spacefield workspace sync schema
-- 2026-04-26
--
-- Two tables:
--   public.workspaces         — one row per named workspace per user
--   public.workspace_state    — KV store for workspace state (windows,
--                               dock, widgets, wallpaper, etc.)
--
-- Row-Level Security ensures every row is scoped to auth.uid().
-- The client never reads or writes anything for other users.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists workspaces_user_id_idx on public.workspaces(user_id);

alter table public.workspaces enable row level security;

drop policy if exists "users own their workspaces" on public.workspaces;
create policy "users own their workspaces"
  on public.workspaces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workspace_state — KV store
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_state (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  key           text not null,
  value         jsonb not null,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, key)
);

alter table public.workspace_state enable row level security;

drop policy if exists "users access state of their workspaces" on public.workspace_state;
create policy "users access state of their workspaces"
  on public.workspace_state for all
  using (
    workspace_id in (select id from public.workspaces where user_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_workspace_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspaces
     set updated_at = now()
   where id = coalesce(new.workspace_id, old.workspace_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists workspace_state_touch_workspace on public.workspace_state;
create trigger workspace_state_touch_workspace
  after insert or update or delete on public.workspace_state
  for each row execute function public.touch_workspace_updated_at();
