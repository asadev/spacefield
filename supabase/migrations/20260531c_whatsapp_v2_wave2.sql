-- ─────────────────────────────────────────────────────────────────────
-- 20260531c_whatsapp_v2_wave2.sql — WhatsApp inbox v2, Wave 2
--
-- Wave 2 = EPIC-03 (lifecycle: status/assignee/snooze/priority) +
--          EPIC-04 (labels + internal notes + @mentions) +
--          EPIC-05 (quick replies / canned responses) +
--          EPIC-07 (contact sidebar + custom fields).
--
-- The lifecycle COLUMNS (status, priority, assignee_id, snoozed_until,
-- first_reply_at, waiting_since, last_activity_at, custom_attributes,
-- avatar_url) already landed in Wave 1 (20260531a). The inbound
-- auto-reopen lives in whatsapp_record_inbound (20260531b). So Wave 2
-- adds the NEW satellite tables for labels/taggings/participants/
-- canned-responses/custom-attribute-definitions, plus a couple of
-- security-definer RPCs for lifecycle activity-event hooks.
--
-- What it does:
--   1. CREATE whatsapp_labels                       (workspace-scoped labels)
--   2. CREATE whatsapp_taggings                     (polymorphic conv|contact tag)
--   3. CREATE whatsapp_conversation_participants     (watchers / @mentioned)
--   4. CREATE whatsapp_canned_responses             ('/'+short_code quick replies)
--   5. CREATE whatsapp_custom_attribute_definitions (admin-defined custom fields)
--   6. RPC whatsapp_mark_resolved / _set_status      (first_reply_at-safe helpers)
--
-- RLS recipe (matches Wave 1): enable RLS; select/insert/update gated on
-- workspace_role_of(workspace_id) in ('owner','admin','member'); delete
-- gated to ('owner','admin'). Every table carries workspace_id so the
-- gate reads the column directly (no joins in the policy).
--
-- Idempotent: create-if-not-exists / drop-policy-if-exists / on-conflict
-- guards throughout. Re-applying is a no-op.
--
-- Rollback (manual):
--   drop table if exists public.whatsapp_taggings;
--   drop table if exists public.whatsapp_labels;
--   drop table if exists public.whatsapp_conversation_participants;
--   drop table if exists public.whatsapp_canned_responses;
--   drop table if exists public.whatsapp_custom_attribute_definitions;
--   drop function if exists public.whatsapp_set_status(uuid,smallint,timestamptz);
-- ─────────────────────────────────────────────────────────────────────

-- 1. ──────────────── whatsapp_labels ────────────────
create table if not exists public.whatsapp_labels (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  title           text not null,
  color           text not null default '#64748b',     -- hex; UI swatch
  show_on_sidebar boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, title)
);
create index if not exists whatsapp_labels_ws_idx
  on public.whatsapp_labels(workspace_id);

alter table public.whatsapp_labels enable row level security;

drop policy if exists "wa_labels select" on public.whatsapp_labels;
create policy "wa_labels select" on public.whatsapp_labels for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_labels insert" on public.whatsapp_labels;
create policy "wa_labels insert" on public.whatsapp_labels for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_labels update" on public.whatsapp_labels;
create policy "wa_labels update" on public.whatsapp_labels for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_labels delete" on public.whatsapp_labels;
create policy "wa_labels delete" on public.whatsapp_labels for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 2. ──────────────── whatsapp_taggings (polymorphic) ────────────────
-- One join table serves both conversation labels and contact labels.
create table if not exists public.whatsapp_taggings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  label_id      uuid not null references public.whatsapp_labels(id) on delete cascade,
  taggable_type text not null check (taggable_type in ('conversation','contact')),
  taggable_id   uuid not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (label_id, taggable_type, taggable_id)
);
create index if not exists whatsapp_taggings_target_idx
  on public.whatsapp_taggings(taggable_type, taggable_id);
create index if not exists whatsapp_taggings_ws_idx
  on public.whatsapp_taggings(workspace_id);
create index if not exists whatsapp_taggings_label_idx
  on public.whatsapp_taggings(label_id);

alter table public.whatsapp_taggings enable row level security;

drop policy if exists "wa_taggings select" on public.whatsapp_taggings;
create policy "wa_taggings select" on public.whatsapp_taggings for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_taggings insert" on public.whatsapp_taggings;
create policy "wa_taggings insert" on public.whatsapp_taggings for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_taggings update" on public.whatsapp_taggings;
create policy "wa_taggings update" on public.whatsapp_taggings for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_taggings delete" on public.whatsapp_taggings;
create policy "wa_taggings delete" on public.whatsapp_taggings for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 3. ──────────────── whatsapp_conversation_participants ────────────────
-- Watchers beyond the single assignee. @mention auto-adds a row.
create table if not exists public.whatsapp_conversation_participants (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index if not exists whatsapp_participants_conv_idx
  on public.whatsapp_conversation_participants(conversation_id);
create index if not exists whatsapp_participants_user_idx
  on public.whatsapp_conversation_participants(user_id);
create index if not exists whatsapp_participants_ws_idx
  on public.whatsapp_conversation_participants(workspace_id);

alter table public.whatsapp_conversation_participants enable row level security;

drop policy if exists "wa_participants select" on public.whatsapp_conversation_participants;
create policy "wa_participants select" on public.whatsapp_conversation_participants for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_participants insert" on public.whatsapp_conversation_participants;
create policy "wa_participants insert" on public.whatsapp_conversation_participants for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_participants delete" on public.whatsapp_conversation_participants;
create policy "wa_participants delete" on public.whatsapp_conversation_participants for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 4. ──────────────── whatsapp_canned_responses ────────────────
-- '/'+short_code in the composer inserts content; {{var}} interpolated at
-- insert time from the linked CRM contact (firstName/city/...).
create table if not exists public.whatsapp_canned_responses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  short_code   text not null,
  content      text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, short_code)
);
create index if not exists whatsapp_canned_ws_idx
  on public.whatsapp_canned_responses(workspace_id);

alter table public.whatsapp_canned_responses enable row level security;

drop policy if exists "wa_canned select" on public.whatsapp_canned_responses;
create policy "wa_canned select" on public.whatsapp_canned_responses for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_canned insert" on public.whatsapp_canned_responses;
create policy "wa_canned insert" on public.whatsapp_canned_responses for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_canned update" on public.whatsapp_canned_responses;
create policy "wa_canned update" on public.whatsapp_canned_responses for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_canned delete" on public.whatsapp_canned_responses;
create policy "wa_canned delete" on public.whatsapp_canned_responses for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 5. ──────────────── whatsapp_custom_attribute_definitions ────────────────
-- Admin-defined custom fields. Values live in the custom_attributes jsonb
-- on whatsapp_conversations (or crm_contacts.custom for contact-model).
create table if not exists public.whatsapp_custom_attribute_definitions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  display_name     text not null,
  attribute_key    text not null,
  attribute_type   text not null default 'text'
                     check (attribute_type in ('text','number','currency','date','list','checkbox')),
  attribute_model  text not null default 'conversation'
                     check (attribute_model in ('conversation','contact')),
  attribute_values jsonb not null default '[]'::jsonb,   -- options for list type
  position         int not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, attribute_model, attribute_key)
);
create index if not exists whatsapp_custom_def_ws_idx
  on public.whatsapp_custom_attribute_definitions(workspace_id, attribute_model);

alter table public.whatsapp_custom_attribute_definitions enable row level security;

drop policy if exists "wa_custom_def select" on public.whatsapp_custom_attribute_definitions;
create policy "wa_custom_def select" on public.whatsapp_custom_attribute_definitions for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_custom_def insert" on public.whatsapp_custom_attribute_definitions;
create policy "wa_custom_def insert" on public.whatsapp_custom_attribute_definitions for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_custom_def update" on public.whatsapp_custom_attribute_definitions;
create policy "wa_custom_def update" on public.whatsapp_custom_attribute_definitions for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_custom_def delete" on public.whatsapp_custom_attribute_definitions;
create policy "wa_custom_def delete" on public.whatsapp_custom_attribute_definitions for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- updated_at triggers (reuse the Wave-1 whatsapp_touch_updated_at fn).
drop trigger if exists whatsapp_labels_touch on public.whatsapp_labels;
create trigger whatsapp_labels_touch before update on public.whatsapp_labels
  for each row execute function public.whatsapp_touch_updated_at();
drop trigger if exists whatsapp_canned_touch on public.whatsapp_canned_responses;
create trigger whatsapp_canned_touch before update on public.whatsapp_canned_responses
  for each row execute function public.whatsapp_touch_updated_at();
drop trigger if exists whatsapp_custom_def_touch on public.whatsapp_custom_attribute_definitions;
create trigger whatsapp_custom_def_touch before update on public.whatsapp_custom_attribute_definitions
  for each row execute function public.whatsapp_touch_updated_at();

-- 6. ──────────────── lifecycle RPC ────────────────
-- Single-statement SECURITY DEFINER setter so the status route stamps
-- last_activity_at and clears snoozed_until atomically. Called by the
-- service-role admin client; revoked from public/anon/authenticated.
create or replace function public.whatsapp_set_status(
  p_conversation_id uuid, p_status smallint, p_snoozed_until timestamptz default null
) returns void language sql security definer set search_path = public as $$
  update public.whatsapp_conversations set
    status = p_status,
    snoozed_until = case when p_status = 3 then p_snoozed_until else null end,
    last_activity_at = now()
  where id = p_conversation_id;
$$;

revoke all on function public.whatsapp_set_status(uuid,smallint,timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.whatsapp_set_status(uuid,smallint,timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.whatsapp_set_status(uuid,smallint,timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.whatsapp_set_status(uuid,smallint,timestamptz) to service_role';
  end if;
end $$;

-- 7. ──────────────── snooze-waker RPC ────────────────
-- Flips every due snoozed conversation (status=3, snoozed_until<=now) back to
-- open in one UPDATE … RETURNING, returning the woken count. Called by the
-- /api/cron/whatsapp-snooze-waker cron via the service-role client.
create or replace function public.whatsapp_wake_snoozed()
returns integer language plpgsql security definer set search_path = public as $$
declare
  woken integer;
begin
  with updated as (
    update public.whatsapp_conversations
       set status = 0, snoozed_until = null, last_activity_at = now()
     where status = 3 and snoozed_until is not null and snoozed_until <= now()
     returning id
  )
  select count(*) into woken from updated;
  return coalesce(woken, 0);
end;
$$;

revoke all on function public.whatsapp_wake_snoozed() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.whatsapp_wake_snoozed() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.whatsapp_wake_snoozed() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.whatsapp_wake_snoozed() to service_role';
  end if;
end $$;
