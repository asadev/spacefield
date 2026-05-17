-- 2026-05-18 — Server-side recently-used items per user.
--
-- Owner: Agent N6 (CX polish).
-- Closes `recently-used` checklist item: the Cmd-K palette had a
-- localStorage-only Recent section, which means a user's recents
-- vanish on a different device + are wiped by browser cleaning. This
-- migration introduces a small server-side table that records the last
-- ~50 entity views per user, plus `record_view` and `list_recent`
-- RPCs so the palette can read/write without an extra REST surface.

create table if not exists public.recent_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  workspace_id  uuid,
  entity_type   text not null check (length(entity_type) between 1 and 64),
  entity_id     uuid not null,
  viewed_at     timestamptz not null default now()
);

-- One row per (user, entity_type, entity_id). A re-view bumps viewed_at
-- via ON CONFLICT in the RPC below.
create unique index if not exists recent_items_user_entity_uniq
  on public.recent_items (user_id, entity_type, entity_id);

-- Lookup pattern: latest N rows for a user, ordered by viewed_at desc.
create index if not exists recent_items_user_recent_idx
  on public.recent_items (user_id, viewed_at desc);

alter table public.recent_items enable row level security;

-- Drop and recreate policies to make this migration idempotent across
-- replays.
drop policy if exists recent_items_select_own on public.recent_items;
drop policy if exists recent_items_modify_own on public.recent_items;

create policy recent_items_select_own on public.recent_items
  for select to authenticated
  using (user_id = auth.uid());

create policy recent_items_modify_own on public.recent_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- record_view: upsert (user, type, id) → bump viewed_at, then trim the
-- per-user list back to 50 rows. We trim inline (not in a trigger) to
-- keep the contract obvious + so the function is the only authoritative
-- write path.
create or replace function public.record_view(
  p_entity_type text,
  p_entity_id   uuid,
  p_workspace_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- Silently no-op for unauthenticated callers so the client can call
    -- this opportunistically without crashing the page on sign-out.
    return;
  end if;

  insert into public.recent_items (user_id, workspace_id, entity_type, entity_id, viewed_at)
  values (auth.uid(), p_workspace_id, p_entity_type, p_entity_id, now())
  on conflict (user_id, entity_type, entity_id) do update
    set viewed_at = excluded.viewed_at,
        workspace_id = coalesce(excluded.workspace_id, recent_items.workspace_id);

  -- Cap at 50 entries per user. The DELETE keeps the 50 most-recent
  -- viewed rows and removes everything older. NOT IN with a CTE is
  -- portable and Postgres can plan it cheaply over the unique index.
  delete from public.recent_items
   where user_id = auth.uid()
     and id not in (
       select id
         from public.recent_items
        where user_id = auth.uid()
        order by viewed_at desc
        limit 50
     );
end;
$$;

grant execute on function public.record_view(text, uuid, uuid) to authenticated;

-- list_recent: returns the latest N rows for the caller. Clamped to
-- [1,100] so a runaway client can't blow up the bandwidth budget.
create or replace function public.list_recent(p_limit int default 20)
returns setof public.recent_items
language sql
security definer
set search_path = public
as $$
  select *
    from public.recent_items
   where user_id = auth.uid()
   order by viewed_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function public.list_recent(int) to authenticated;

comment on table public.recent_items is
  '50-most-recent entity views per user. Drives the Cmd-K palette + future "Continue where you left off" surfaces.';
comment on function public.record_view(text, uuid, uuid) is
  'Upsert a viewed entity into recent_items, then trim to the 50 most recent for the caller.';
comment on function public.list_recent(int) is
  'Read the N most recent entity views for the caller (capped at 100).';
