-- ─────────────────────────────────────────────────────────────────────
-- 20260531a_whatsapp_v2_wave1.sql — WhatsApp inbox v2, Wave 1
--
-- Wave 1 = EPIC-01 (conversations as a first-class entity) +
--          EPIC-02 (media render/compose plumbing) +
--          EPIC-06 (realtime + read path).
--
-- This is the KEYSTONE migration. Everything else in the WhatsApp v2
-- blueprint (status/assign/labels/notes/broadcasts/automation) attaches
-- to whatsapp_conversations created here.
--
-- What it does:
--   1. CREATE public.whatsapp_conversations  (one row per instance+remote)
--   2. ALTER  public.whatsapp_messages       (conversation_id + media
--             re-host + reactions/notes/reply/sender columns)
--   3. Backfill conversations from existing messages (idempotent)
--   4. Backfill whatsapp_messages.conversation_id (idempotent)
--   5. Add both tables to the supabase_realtime publication (EPIC-06)
--   6. Private storage bucket `whatsapp-media` for re-hosted media (EPIC-02)
--
-- Idempotent: re-applying is a no-op (if-not-exists / on-conflict /
-- where-is-null guards throughout).
--
-- Rollback (manual):
--   alter publication supabase_realtime drop table public.whatsapp_messages;
--   alter publication supabase_realtime drop table public.whatsapp_conversations;
--   alter table public.whatsapp_messages drop column conversation_id, ...;
--   drop table if exists public.whatsapp_conversations;
-- ─────────────────────────────────────────────────────────────────────

-- 1. ──────────────── whatsapp_conversations (KEYSTONE) ────────────────
create table if not exists public.whatsapp_conversations (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  instance_id         uuid not null references public.whatsapp_instances(id) on delete cascade,
  contact_id          uuid references public.crm_contacts(id) on delete set null,

  -- Dedupe key: the REMOTE party identifier, independent of CRM linkage.
  -- Individual = digits-only phone; group = group JID localpart. Stable
  -- across later contact-linking so threads never fragment.
  source_id           text not null,
  source_jid          text,                         -- full JID, populated going forward
  chat_type           text not null default 'individual'
                        check (chat_type in ('individual','group')),
  title               text,                          -- cached display name (contact / group subject)
  avatar_url          text,                          -- cached WA profile picture (EPIC-07)

  -- Lifecycle (columns land now; UI/logic is Wave 2 — cheap to add once).
  status              smallint not null default 0,   -- 0 open,1 resolved,2 pending,3 snoozed
  priority            smallint not null default 0,   -- 0 none .. 4 urgent
  assignee_id         uuid references auth.users(id) on delete set null,
  snoozed_until       timestamptz,

  -- Activity / preview (maintained by the webhook + send routes).
  last_message_at     timestamptz,
  last_message_preview text,
  last_direction      text,
  last_activity_at    timestamptz,
  first_reply_at      timestamptz,
  waiting_since       timestamptz,

  -- Unread tracking. read_cursor_at is the source of truth (operator has
  -- seen everything created on/before it); unread_count is a fast cache.
  unread_count        int not null default 0,
  read_cursor_at      timestamptz,

  custom_attributes   jsonb not null default '{}'::jsonb,
  additional_attributes jsonb not null default '{}'::jsonb,
  is_pinned           boolean not null default false,
  is_archived         boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (instance_id, source_id)
);

create index if not exists whatsapp_conv_ws_status_last_idx
  on public.whatsapp_conversations(workspace_id, status, last_message_at desc);
create index if not exists whatsapp_conv_assignee_idx
  on public.whatsapp_conversations(assignee_id, status);
create index if not exists whatsapp_conv_contact_idx
  on public.whatsapp_conversations(contact_id);
create index if not exists whatsapp_conv_snoozed_idx
  on public.whatsapp_conversations(snoozed_until) where status = 3;

alter table public.whatsapp_conversations enable row level security;

drop policy if exists "wa_conv select for ws members" on public.whatsapp_conversations;
create policy "wa_conv select for ws members"
  on public.whatsapp_conversations for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_conv insert for ws members" on public.whatsapp_conversations;
create policy "wa_conv insert for ws members"
  on public.whatsapp_conversations for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_conv update for ws members" on public.whatsapp_conversations;
create policy "wa_conv update for ws members"
  on public.whatsapp_conversations for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_conv delete for ws owners admins" on public.whatsapp_conversations;
create policy "wa_conv delete for ws owners admins"
  on public.whatsapp_conversations for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- updated_at trigger (reuse the existing whatsapp_touch_updated_at fn).
drop trigger if exists whatsapp_conversations_touch on public.whatsapp_conversations;
create trigger whatsapp_conversations_touch
  before update on public.whatsapp_conversations
  for each row execute function public.whatsapp_touch_updated_at();

-- 2. ──────────────── ALTER whatsapp_messages ────────────────
alter table public.whatsapp_messages
  add column if not exists conversation_id     uuid references public.whatsapp_conversations(id) on delete cascade,
  add column if not exists is_private          boolean not null default false,
  add column if not exists reply_to_message_id text,
  add column if not exists reactions           jsonb   not null default '[]'::jsonb,
  add column if not exists media_storage_path  text,
  add column if not exists media_thumbnail_path text,
  add column if not exists media_mime          text,
  add column if not exists transcription       text,
  add column if not exists is_starred          boolean not null default false,
  add column if not exists edited_at           timestamptz,
  add column if not exists deleted_at          timestamptz,
  add column if not exists sender_name         text,   -- group: participant pushName
  add column if not exists sender_jid          text;   -- group: participant JID

create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages(conversation_id, created_at);

-- 3. ──────────────── Backfill conversations ────────────────
-- One conversation per (instance_id, remote source_id). Idempotent via
-- the unique constraint + on-conflict-do-nothing.
insert into public.whatsapp_conversations
  (workspace_id, instance_id, contact_id, source_id, chat_type,
   last_message_at, last_message_preview, last_direction, unread_count, created_at)
select
  t.workspace_id,
  t.instance_id,
  (array_agg(t.contact_id) filter (where t.contact_id is not null))[1] as contact_id,
  t.source_id,
  case
    when length(t.source_id) >= 17 or t.source_id like '%-%' or t.source_id like '120363%'
      then 'group' else 'individual'
  end as chat_type,
  max(t.created_at)                                              as last_message_at,
  (array_agg(t.body order by t.created_at desc))[1]             as last_message_preview,
  (array_agg(t.direction order by t.created_at desc))[1]        as last_direction,
  count(*) filter (where t.direction = 'inbound' and t.status <> 'read') as unread_count,
  min(t.created_at)                                             as created_at
from (
  select
    workspace_id, instance_id, contact_id, body, direction, status, created_at,
    case when direction = 'inbound' then from_number else to_number end as source_id
  from public.whatsapp_messages
) t
where t.source_id is not null and t.source_id <> ''
group by t.workspace_id, t.instance_id, t.source_id
on conflict (instance_id, source_id) do nothing;

-- Refine group detection from the whatsapp_groups cache (precise > heuristic).
update public.whatsapp_conversations c
set chat_type = 'group'
from public.whatsapp_groups g
where g.instance_id = c.instance_id
  and split_part(g.evolution_group_id, '@', 1) = c.source_id
  and c.chat_type <> 'group';

-- Title from group subject (cache), then from CRM contact name.
update public.whatsapp_conversations c
set title = g.name
from public.whatsapp_groups g
where g.instance_id = c.instance_id
  and split_part(g.evolution_group_id, '@', 1) = c.source_id
  and g.name is not null and c.title is null;

update public.whatsapp_conversations c
set title = nullif(trim(coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'')), '')
from public.crm_contacts ct
where ct.id = c.contact_id and c.title is null;

-- 4. ──────────────── Backfill whatsapp_messages.conversation_id ────────────────
update public.whatsapp_messages m
set conversation_id = c.id
from public.whatsapp_conversations c
where c.instance_id = m.instance_id
  and c.source_id = (case when m.direction = 'inbound' then m.from_number else m.to_number end)
  and m.conversation_id is null;

-- 5. ──────────────── Realtime (EPIC-06) ────────────────
-- Add both tables to the supabase_realtime publication. RLS still gates
-- realtime payloads per workspace, so cross-tenant leakage is impossible.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end $$;

-- REPLICA IDENTITY FULL so realtime UPDATE payloads carry old+new (needed
-- for status-tick + assignment-change subscriptions to see what changed).
alter table public.whatsapp_messages replica identity full;
alter table public.whatsapp_conversations replica identity full;

-- 6. ──────────────── Storage bucket for re-hosted media (EPIC-02) ────────────────
-- Private bucket; media is served through an authenticated proxy route
-- that enforces workspace membership, so no per-object storage RLS needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 52428800)  -- 50 MB cap
on conflict (id) do nothing;
