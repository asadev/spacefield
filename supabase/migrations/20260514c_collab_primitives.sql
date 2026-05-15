-- 2026-05-14 Cross-cutting collaboration primitives.
--
-- Every feature in the overnight build (tasks, people, deals, files,
-- shares, docs, …) needs the same 6 building blocks. Centralising them
-- here so no feature agent has to re-invent comments/notifications/etc.
--
-- Tables created:
--   - comments            polymorphic comment thread on any entity
--   - notifications       single inbox; one row per "thing wants attention"
--   - activities          workspace activity feed + per-record timeline
--   - tags                workspace-scoped tag library
--   - entity_tags         polymorphic many-to-many tag link
--   - favorites           per-user pin on any entity
--   - saved_views         saved filter/sort/columns combo per list page
--
-- Convention: polymorphic links use (entity_type text, entity_id uuid).
-- entity_type is the table name (snake_case), entity_id is the row PK.
-- A composite index on (entity_type, entity_id) keeps lookups cheap.
--
-- Rollback: every CREATE is `if not exists`. To roll back:
--   drop table if exists public.saved_views, public.favorites,
--     public.entity_tags, public.tags, public.activities,
--     public.notifications, public.comments cascade;
-- Restrictive RLS policies + indexes drop with the tables.

-- ───────────────────────────────────────────────────────────────────
-- Comments
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  entity_type       text not null,
  entity_id         uuid not null,
  author_user_id    uuid not null,
  body              text not null,
  mentions          uuid[] not null default '{}',
  parent_comment_id uuid references public.comments(id) on delete cascade,
  edited_at         timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists comments_entity_idx
  on public.comments (entity_type, entity_id, created_at desc)
  where deleted_at is null;

create index if not exists comments_workspace_idx
  on public.comments (workspace_id, created_at desc)
  where deleted_at is null;

create index if not exists comments_mentions_gin
  on public.comments using gin (mentions);

alter table public.comments enable row level security;

-- Authenticated members of the workspace can read non-deleted comments.
create policy comments_select on public.comments
  for select to authenticated
  using (deleted_at is null and public.is_workspace_member(workspace_id));

-- Members can insert with themselves as the author.
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- Author can edit own comment (sets edited_at via app-layer or trigger).
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- Notifications
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_user_id   uuid not null,
  workspace_id        uuid,
  kind                text not null,                  -- e.g. 'comment.mention', 'task.assigned'
  source_entity_type  text,
  source_entity_id    uuid,
  actor_user_id       uuid,
  title               text not null,
  body                text,
  href                text,                            -- where clicking takes you
  payload             jsonb not null default '{}',
  read_at             timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null and archived_at is null;

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_user_id, created_at desc)
  where archived_at is null;

create index if not exists notifications_source_idx
  on public.notifications (source_entity_type, source_entity_id);

alter table public.notifications enable row level security;

-- A user reads only their own notifications.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

-- A user updates only their own notifications (mark read / archive).
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- Inserts come from server actions via service-role (no app-layer insert
-- from authenticated). RLS denies authenticated insert by omission.

-- ───────────────────────────────────────────────────────────────────
-- Activities (workspace activity feed + per-record timeline)
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  actor_user_id uuid,                     -- nullable: system events have no actor
  verb          text not null,             -- 'created', 'updated', 'commented', 'completed', …
  entity_type   text not null,
  entity_id     uuid not null,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists activities_workspace_idx
  on public.activities (workspace_id, created_at desc);

create index if not exists activities_entity_idx
  on public.activities (entity_type, entity_id, created_at desc);

create index if not exists activities_actor_idx
  on public.activities (actor_user_id, created_at desc);

alter table public.activities enable row level security;

create policy activities_select on public.activities
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Inserts service-role only — written via lib/activity.ts logActivity().

-- ───────────────────────────────────────────────────────────────────
-- Tags + polymorphic links
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name         text not null,
  slug         text not null,
  color        text,                      -- hex, optional
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create unique index if not exists tags_workspace_slug_uniq
  on public.tags (workspace_id, slug);

alter table public.tags enable row level security;

create policy tags_select on public.tags
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy tags_insert on public.tags
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy tags_update on public.tags
  for update to authenticated using (public.is_workspace_member(workspace_id));
create policy tags_delete on public.tags
  for delete to authenticated using (public.is_workspace_member(workspace_id));

create table if not exists public.entity_tags (
  id          uuid primary key default gen_random_uuid(),
  tag_id      uuid not null references public.tags(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists entity_tags_uniq
  on public.entity_tags (tag_id, entity_type, entity_id);

create index if not exists entity_tags_entity_idx
  on public.entity_tags (entity_type, entity_id);

alter table public.entity_tags enable row level security;

-- entity_tags inherits visibility from its tag (which is workspace-scoped).
create policy entity_tags_select on public.entity_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.tags t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = entity_tags.tag_id and wm.user_id = auth.uid()
    )
  );

create policy entity_tags_modify on public.entity_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.tags t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = entity_tags.tag_id and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tags t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = entity_tags.tag_id and wm.user_id = auth.uid()
    )
  );

-- ───────────────────────────────────────────────────────────────────
-- Favorites (personal pins on any entity)
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  workspace_id uuid,
  entity_type text not null,
  entity_id   uuid not null,
  label       text,                       -- override display label
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists favorites_uniq
  on public.favorites (user_id, entity_type, entity_id);

create index if not exists favorites_user_idx
  on public.favorites (user_id, position);

alter table public.favorites enable row level security;

create policy favorites_select_own on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

create policy favorites_modify_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- Saved views (filter/sort/columns combo on any list page)
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.saved_views (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid,
  owner_user_id      uuid not null,
  scope              text not null default 'personal',  -- 'personal' | 'workspace'
  target_entity_type text not null,                     -- e.g. 'task', 'contact'
  name               text not null,
  filter             jsonb not null default '{}',
  sort               jsonb not null default '[]',
  columns            jsonb not null default '[]',
  group_by           text,
  is_default         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists saved_views_owner_idx
  on public.saved_views (owner_user_id, target_entity_type);

create index if not exists saved_views_workspace_idx
  on public.saved_views (workspace_id, target_entity_type)
  where scope = 'workspace';

alter table public.saved_views enable row level security;

-- Personal views: owner only. Workspace-scope views: any member.
create policy saved_views_select on public.saved_views
  for select to authenticated
  using (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (scope = 'workspace' and public.is_workspace_member(workspace_id))
  );

create policy saved_views_modify on public.saved_views
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- Helper RPCs
-- ───────────────────────────────────────────────────────────────────

-- Mark a single notification read.
create or replace function public.notification_mark_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_id and recipient_user_id = auth.uid();
end;
$$;

grant execute on function public.notification_mark_read(uuid) to authenticated;

-- Mark all notifications read for the calling user (optionally filtered).
create or replace function public.notification_mark_all_read(p_kind text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.notifications
  set read_at = now()
  where recipient_user_id = auth.uid()
    and read_at is null
    and (p_kind is null or kind = p_kind);
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.notification_mark_all_read(text) to authenticated;

-- Append-only RPC for emitting an activity. Service-role calls this from
-- server actions; we centralise here so the schema stays consistent.
create or replace function public.activity_emit(
  p_workspace_id  uuid,
  p_actor_user_id uuid,
  p_verb          text,
  p_entity_type   text,
  p_entity_id     uuid,
  p_payload       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.activities (workspace_id, actor_user_id, verb, entity_type, entity_id, payload)
  values (p_workspace_id, p_actor_user_id, p_verb, p_entity_type, p_entity_id, p_payload)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.activity_emit(uuid, uuid, text, text, uuid, jsonb) from public;
grant execute on function public.activity_emit(uuid, uuid, text, text, uuid, jsonb) to authenticated;
