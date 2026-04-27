-- Workspace chat: channels + messages + read state.
-- 2026-04-28

create extension if not exists pgcrypto;

-- ─── channels ───
create table if not exists public.chat_channels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  kind         text not null default 'topic',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists chat_channels_workspace_idx
  on public.chat_channels(workspace_id);

-- Auto-create #general for every new workspace.
create or replace function public.handle_new_workspace_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (workspace_id, name, kind, created_by)
  values (new.id, 'general', 'general', new.user_id)
  on conflict (workspace_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_create_chat on public.workspaces;
create trigger on_workspace_create_chat
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace_chat();

-- Backfill #general for existing workspaces.
insert into public.chat_channels (workspace_id, name, kind, created_by)
select id, 'general', 'general', user_id
from public.workspaces
on conflict (workspace_id, name) do nothing;

alter table public.chat_channels enable row level security;

drop policy if exists "members read channels" on public.chat_channels;
create policy "members read channels"
  on public.chat_channels for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "owners admins write channels" on public.chat_channels;
create policy "owners admins write channels"
  on public.chat_channels for all
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- ─── messages ───
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.chat_channels(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  body         text not null,
  -- File ids from public.workspace_files. Each attachment is a row
  -- in workspace_files so it counts against the workspace's storage
  -- cap automatically — same path Documents/Sheets/Files Manager use.
  attachments  jsonb not null default '[]'::jsonb,
  -- v2 stubs (not used in v1 UI):
  reply_to     uuid references public.chat_messages(id) on delete set null,
  reactions    jsonb not null default '{}'::jsonb,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists chat_messages_channel_idx
  on public.chat_messages(channel_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "members read messages" on public.chat_messages;
create policy "members read messages"
  on public.chat_messages for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members write messages" on public.chat_messages;
create policy "members write messages"
  on public.chat_messages for insert
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

drop policy if exists "authors edit messages" on public.chat_messages;
create policy "authors edit messages"
  on public.chat_messages for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "authors delete messages" on public.chat_messages;
create policy "authors delete messages"
  on public.chat_messages for delete
  using (user_id = auth.uid() or public.workspace_role_of(workspace_id) in ('owner','admin'));

-- ─── read state ───
create table if not exists public.chat_read_state (
  user_id        uuid not null references auth.users(id) on delete cascade,
  channel_id     uuid not null references public.chat_channels(id) on delete cascade,
  last_read_at   timestamptz not null default now(),
  primary key (user_id, channel_id)
);

alter table public.chat_read_state enable row level security;

drop policy if exists "users own read state" on public.chat_read_state;
create policy "users own read state"
  on public.chat_read_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── unread counts RPC ───
-- Per-channel unread count for the calling user across one workspace.
create or replace function public.chat_unread_counts(ws_id uuid)
returns table (channel_id uuid, unread bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    count(m.id)::bigint
  from public.chat_channels c
  left join public.chat_read_state rs
    on rs.channel_id = c.id and rs.user_id = auth.uid()
  left join public.chat_messages m
    on m.channel_id = c.id
    and m.deleted_at is null
    and m.user_id <> auth.uid()
    and m.created_at > coalesce(rs.last_read_at, '1970-01-01'::timestamptz)
  where c.workspace_id = ws_id
    and public.is_workspace_member(ws_id)
  group by c.id;
$$;

grant execute on function public.chat_unread_counts(uuid) to authenticated;

-- Enable Realtime on chat_messages (Supabase Realtime publishes
-- changes via WebSocket once the table is added to the publication).
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_channels;
