-- 2026-04-28
-- Workspace settings: permissions/identity columns + activity log +
-- transfer-ownership RPC + storage-analytics RPCs.

-- ─── identity + permissions on public.workspaces ───
alter table public.workspaces
  add column if not exists description    text,
  add column if not exists avatar_url     text,
  add column if not exists archived_at    timestamptz,
  add column if not exists default_member_role public.workspace_role not null default 'member',
  add column if not exists who_can_invite       text not null default 'admins',  -- 'admins' | 'members'
  add column if not exists who_can_install      text not null default 'admins',  -- 'admins' | 'members'
  add column if not exists who_can_uninstall    text not null default 'admins';

-- ─── activity log ───
create table if not exists public.workspace_activity (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  kind         text not null,    -- 'member_joined' | 'member_left' | 'role_changed' | 'invited' | 'invite_accepted' | 'settings_changed' | 'transferred' | 'archived' | 'unarchived' | 'file_uploaded_summary' | 'tool_installed' | 'tool_uninstalled'
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists workspace_activity_ws_idx
  on public.workspace_activity(workspace_id, created_at desc);

alter table public.workspace_activity enable row level security;

drop policy if exists "members read activity" on public.workspace_activity;
create policy "members read activity"
  on public.workspace_activity for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "owners admins write activity" on public.workspace_activity;
create policy "owners admins write activity"
  on public.workspace_activity for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- Helper RPC the route handlers + triggers can call.
create or replace function public.log_workspace_activity(
  ws_id    uuid,
  k        text,
  body     jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.workspace_activity (workspace_id, actor_id, kind, payload)
  values (ws_id, auth.uid(), k, body);
$$;

grant execute on function public.log_workspace_activity(uuid, text, jsonb) to authenticated;

-- ─── storage-analytics RPCs ───
-- Breakdown by content_type bucket — easy 5-bucket classifier in SQL.
create or replace function public.workspace_storage_by_kind(ws_id uuid)
returns table (
  kind        text,
  file_count  bigint,
  total_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with classified as (
    select
      case
        when content_type like 'image/%' then 'image'
        when content_type like 'video/%' then 'video'
        when content_type like 'audio/%' then 'audio'
        when content_type = 'application/pdf' then 'pdf'
        when content_type like 'text/%' or content_type in ('application/json','application/javascript') then 'text'
        when content_type in ('application/zip','application/x-tar','application/gzip','application/x-7z-compressed') then 'archive'
        when content_type in (
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv'
        ) then 'sheet'
        when content_type in (
          'text/markdown',
          'application/rtf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) then 'document'
        else 'other'
      end as kind,
      size_bytes
    from public.workspace_files
    where workspace_id = ws_id
      and deleted_at is null
      and public.is_workspace_member(ws_id)
  )
  select kind, count(*)::bigint as file_count, coalesce(sum(size_bytes),0)::bigint as total_bytes
  from classified
  group by kind
  order by total_bytes desc;
$$;

grant execute on function public.workspace_storage_by_kind(uuid) to authenticated;

-- Breakdown by uploader (top-N).
create or replace function public.workspace_storage_by_user(ws_id uuid)
returns table (
  user_id     uuid,
  file_count  bigint,
  total_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, count(*)::bigint, coalesce(sum(size_bytes),0)::bigint
  from public.workspace_files
  where workspace_id = ws_id
    and deleted_at is null
    and public.is_workspace_member(ws_id)
  group by user_id
  order by sum(size_bytes) desc nulls last;
$$;

grant execute on function public.workspace_storage_by_user(uuid) to authenticated;

-- Top-N largest files.
create or replace function public.workspace_top_files(ws_id uuid, top_n int default 10)
returns table (
  id           uuid,
  name         text,
  size_bytes   bigint,
  content_type text,
  user_id      uuid,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, size_bytes, content_type, user_id, created_at
  from public.workspace_files
  where workspace_id = ws_id
    and deleted_at is null
    and public.is_workspace_member(ws_id)
  order by size_bytes desc
  limit top_n;
$$;

grant execute on function public.workspace_top_files(uuid, int) to authenticated;

-- Trash size + oldest item.
create or replace function public.workspace_trash_summary(ws_id uuid)
returns table (
  file_count   bigint,
  total_bytes  bigint,
  oldest_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    coalesce(sum(size_bytes),0)::bigint,
    min(deleted_at)
  from public.workspace_files
  where workspace_id = ws_id
    and deleted_at is not null
    and public.is_workspace_member(ws_id);
$$;

grant execute on function public.workspace_trash_summary(uuid) to authenticated;

-- Upload trend — last 30 days, daily totals.
create or replace function public.workspace_upload_trend_30d(ws_id uuid)
returns table (
  day          date,
  file_count   bigint,
  total_bytes  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'utc')::date as day,
    count(*)::bigint,
    coalesce(sum(size_bytes),0)::bigint
  from public.workspace_files
  where workspace_id = ws_id
    and deleted_at is null
    and created_at > now() - interval '30 days'
    and public.is_workspace_member(ws_id)
  group by 1
  order by 1;
$$;

grant execute on function public.workspace_upload_trend_30d(uuid) to authenticated;

-- ─── transfer ownership ───
create or replace function public.transfer_workspace_ownership(
  ws_id    uuid,
  new_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.workspace_role;
begin
  caller_role := public.workspace_role_of(ws_id);
  if caller_role <> 'owner' then
    raise exception 'only the current owner can transfer ownership' using errcode = '42501';
  end if;
  -- Make sure the target is a member.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = new_user
  ) then
    raise exception 'target user is not a member of this workspace' using errcode = 'P0001';
  end if;
  update public.workspaces set user_id = new_user where id = ws_id;
  -- Demote previous owner to admin (caller); promote new user to owner.
  update public.workspace_members
     set role = 'admin'
   where workspace_id = ws_id and user_id = auth.uid();
  update public.workspace_members
     set role = 'owner'
   where workspace_id = ws_id and user_id = new_user;
  perform public.log_workspace_activity(
    ws_id,
    'transferred',
    jsonb_build_object('from', auth.uid(), 'to', new_user)
  );
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
