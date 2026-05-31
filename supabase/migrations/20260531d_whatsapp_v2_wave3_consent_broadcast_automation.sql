-- ─────────────────────────────────────────────────────────────────────
-- 20260531d_whatsapp_v2_wave3_consent_broadcast_automation.sql
-- WhatsApp inbox v2, Wave 3.
--
-- Wave 3 = EPIC-12 (opt-out / consent + soft-ban awareness — the GUARDRAIL,
--                   ships first because it gates broadcasts) +
--          EPIC-08 (segmented + scheduled + personalized broadcasts +
--                   analytics on the existing send-jobs engine) +
--          EPIC-17 (faster broadcast cadence — runner already idempotent;
--                   no schema, driven 1-min from Hetzner) +
--          EPIC-09 (simple automation: keyword/welcome/away/business-hours +
--                   numbered-menu router on the inbound webhook).
--
-- Builds ON the Wave-1 keystone (whatsapp_conversations) and the existing
-- never-run send engine (whatsapp_send_jobs / whatsapp_send_log / runner /
-- throttle). Does NOT touch the throttle math or rewrite the queue — only
-- ADDS metadata columns + new satellite tables.
--
-- What it does:
--   1.  CREATE whatsapp_contact_state         (consent/opt-out mirror, keyed by contact)
--   2.  CREATE whatsapp_opt_out_log           (audit of STOP / re-subscribe events)
--   3.  CREATE whatsapp_segments              (dynamic audience query, resolved at send time)
--   4.  ALTER  whatsapp_send_jobs             (segment_id, personalization, schedule, recurrence, kind)
--   5.  CREATE whatsapp_automation_rules      (event/conditions/actions JSONB rule engine)
--   6.  CREATE whatsapp_business_hours        (per-workspace timezone + weekly hours + messages)
--   7.  ALTER  whatsapp_instances             (soft_ban_until + soft_ban_reason for EPIC-12)
--   8.  RPC    whatsapp_claim_due_send_jobs   (schedule-aware atomic claim for the runner)
--   9.  RPC    whatsapp_softban_pause / _clear (instance soft-ban toggle)
--
-- RLS recipe (matches Waves 1–2): enable RLS; select/insert/update gated on
-- workspace_role_of(workspace_id) in ('owner','admin','member'); delete gated
-- to ('owner','admin'). Every new table carries workspace_id and the policy
-- reads the column directly (no joins).
--
-- Service-role-only RPCs: revoked from public/anon/authenticated, granted to
-- service_role (the revoke/grant do-block copied from 20260531b).
--
-- Idempotent: create-if-not-exists / add-column-if-not-exists /
-- drop-policy-if-exists / on-conflict / create-or-replace throughout.
-- Re-applying is a no-op.
--
-- Rollback (manual):
--   drop table if exists public.whatsapp_opt_out_log;
--   drop table if exists public.whatsapp_contact_state;
--   drop table if exists public.whatsapp_segments;
--   drop table if exists public.whatsapp_automation_rules;
--   drop table if exists public.whatsapp_business_hours;
--   alter table public.whatsapp_send_jobs drop column segment_id, drop column personalization_template, ...;
--   alter table public.whatsapp_instances drop column soft_ban_until, drop column soft_ban_reason;
--   drop function if exists public.whatsapp_claim_due_send_jobs(int);
--   drop function if exists public.whatsapp_softban_pause(uuid,text,timestamptz);
--   drop function if exists public.whatsapp_softban_clear(uuid);
-- ─────────────────────────────────────────────────────────────────────

-- 1. ──────────────── whatsapp_contact_state (CONSENT — EPIC-12) ────────────────
-- Mirror table (NOT a crm_contacts alter) so consent lives beside WhatsApp
-- without touching the shared CRM schema. One row per (workspace, contact).
-- marketing_consent default FALSE = conservative: a contact is only mailable
-- once they explicitly opt in OR the operator flips the flag. opted_out_at
-- being non-null is an absolute suppression regardless of marketing_consent.
create table if not exists public.whatsapp_contact_state (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  contact_id        uuid not null references public.crm_contacts(id) on delete cascade,
  marketing_consent boolean not null default false,
  opted_out_at      timestamptz,
  opt_out_source    text,            -- 'stop_keyword' | 'manual' | 'import' | 'api'
  opted_in_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, contact_id)
);
create index if not exists whatsapp_contact_state_ws_idx
  on public.whatsapp_contact_state(workspace_id);
create index if not exists whatsapp_contact_state_optout_idx
  on public.whatsapp_contact_state(workspace_id, opted_out_at);

alter table public.whatsapp_contact_state enable row level security;

drop policy if exists "wa_cstate select" on public.whatsapp_contact_state;
create policy "wa_cstate select" on public.whatsapp_contact_state for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_cstate insert" on public.whatsapp_contact_state;
create policy "wa_cstate insert" on public.whatsapp_contact_state for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_cstate update" on public.whatsapp_contact_state;
create policy "wa_cstate update" on public.whatsapp_contact_state for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_cstate delete" on public.whatsapp_contact_state;
create policy "wa_cstate delete" on public.whatsapp_contact_state for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 2. ──────────────── whatsapp_opt_out_log (audit — EPIC-12) ────────────────
create table if not exists public.whatsapp_opt_out_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id   uuid references public.crm_contacts(id) on delete set null,
  action       text not null,        -- 'opt_out' | 'opt_in' | 'consent_granted' | 'consent_revoked'
  reason       text,                  -- e.g. matched keyword, or 'manual by <user>'
  created_at   timestamptz not null default now()
);
create index if not exists whatsapp_opt_out_log_ws_idx
  on public.whatsapp_opt_out_log(workspace_id, created_at desc);
create index if not exists whatsapp_opt_out_log_contact_idx
  on public.whatsapp_opt_out_log(contact_id);

alter table public.whatsapp_opt_out_log enable row level security;

drop policy if exists "wa_optoutlog select" on public.whatsapp_opt_out_log;
create policy "wa_optoutlog select" on public.whatsapp_opt_out_log for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_optoutlog insert" on public.whatsapp_opt_out_log;
create policy "wa_optoutlog insert" on public.whatsapp_opt_out_log for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
-- No update/delete policy: append-only audit (service-role can still write).

-- 3. ──────────────── whatsapp_segments (dynamic audience — EPIC-08) ────────────────
-- query jsonb shape (all keys optional, AND-combined):
--   { "labels":        [uuid,...],        -- conversation/contact taggings
--     "lifecycle":     ["lead","customer"],
--     "status":        ["active",...],     -- crm_contacts.status
--     "tags":          ["wholesale",...],  -- crm_contacts.tags (array overlap)
--     "custom":        { "city": "Lahore", ... },  -- crm_contacts.custom jsonb equality
--     "last_contacted":{ "op": "before"|"after"|"never", "days": 30 },
--     "consent_only":  true,               -- restrict to marketing_consent=true
--     "has_phone":     true }              -- always effectively true for sends
-- Resolved to recipients AT SEND TIME by lib/whatsapp/segments.ts (dynamic),
-- unlike the frozen whatsapp_lists.contact_ids[].
create table if not exists public.whatsapp_segments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  query        jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists whatsapp_segments_ws_idx
  on public.whatsapp_segments(workspace_id);

alter table public.whatsapp_segments enable row level security;

drop policy if exists "wa_segments select" on public.whatsapp_segments;
create policy "wa_segments select" on public.whatsapp_segments for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_segments insert" on public.whatsapp_segments;
create policy "wa_segments insert" on public.whatsapp_segments for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_segments update" on public.whatsapp_segments;
create policy "wa_segments update" on public.whatsapp_segments for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_segments delete" on public.whatsapp_segments;
create policy "wa_segments delete" on public.whatsapp_segments for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 4. ──────────────── ALTER whatsapp_send_jobs (broadcast metadata — EPIC-08) ────────────────
-- The queue/runner/throttle stay UNTOUCHED. These columns add: dynamic
-- segment audience, {{var}} personalization, re-hosted media, send-later +
-- recurrence, and a kind discriminator (broadcast|automation|sequence|status).
alter table public.whatsapp_send_jobs
  add column if not exists segment_id              uuid references public.whatsapp_segments(id) on delete set null,
  add column if not exists list_id                 uuid references public.whatsapp_lists(id) on delete set null,
  add column if not exists personalization_template text,
  add column if not exists media_storage_path      text,
  add column if not exists media_mime              text,
  add column if not exists scheduled_for           timestamptz,
  add column if not exists recurrence              jsonb,
  add column if not exists kind                    text not null default 'broadcast',
  add column if not exists title                   text,
  add column if not exists created_by              uuid references auth.users(id) on delete set null;

-- Partial index so the schedule-aware claim is cheap: only rows that are
-- queued AND either un-scheduled or due. (scheduled_for filter applied in RPC.)
create index if not exists whatsapp_send_jobs_due_idx
  on public.whatsapp_send_jobs(status, scheduled_for, created_at)
  where status = 'queued';

-- 5. ──────────────── whatsapp_automation_rules (EPIC-09) ────────────────
-- App-side rule engine evaluated on the inbound MESSAGES_UPSERT webhook.
-- event_name:  'conversation_created' (first-ever message in a convo)
--            | 'message_created'      (every inbound message)
-- conditions jsonb (all optional, AND-combined):
--   { "keywords":    ["price","rate"],   -- case-insensitive
--     "match":       "contains"|"starts_with"|"equals"|"any",
--     "business_hours": "inside"|"outside",  -- gate by whatsapp_business_hours
--     "first_message_only": true }
-- actions jsonb = ordered [{ "type": ..., "params": {...} }, ...]; vocabulary
--   matches the shared executor (lib/whatsapp/actions.ts):
--   send_text, send_canned, send_media, add_label, set_status, set_priority,
--   assign, send_menu. Lower priority int runs first; the first rule whose
--   actions include a "send_*" marks the message handled (so welcome + a
--   keyword rule don't double-fire unless flagged stop_on_match=false).
create table if not exists public.whatsapp_automation_rules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  event_name    text not null default 'message_created'
                  check (event_name in ('conversation_created','message_created')),
  conditions    jsonb not null default '{}'::jsonb,
  actions       jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  priority      int not null default 100,
  stop_on_match boolean not null default true,
  recipe        text,                  -- 'welcome'|'away'|'keyword'|'menu'|'custom' (UI hint)
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists whatsapp_automation_rules_ws_idx
  on public.whatsapp_automation_rules(workspace_id, active, priority);

alter table public.whatsapp_automation_rules enable row level security;

drop policy if exists "wa_autorules select" on public.whatsapp_automation_rules;
create policy "wa_autorules select" on public.whatsapp_automation_rules for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_autorules insert" on public.whatsapp_automation_rules;
create policy "wa_autorules insert" on public.whatsapp_automation_rules for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_autorules update" on public.whatsapp_automation_rules;
create policy "wa_autorules update" on public.whatsapp_automation_rules for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_autorules delete" on public.whatsapp_automation_rules;
create policy "wa_autorules delete" on public.whatsapp_automation_rules for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 6. ──────────────── whatsapp_business_hours (EPIC-09) ────────────────
-- One row per workspace. weekly jsonb keyed by weekday 0..6 (0=Sunday),
-- each value an array of {open,close} "HH:MM" ranges (empty array = closed):
--   { "0": [], "1": [{"open":"09:00","close":"18:00"}], ... }
-- holidays jsonb = ["2026-06-07", ...] ISO dates (treated as fully closed).
create table if not exists public.whatsapp_business_hours (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  timezone        text not null default 'Asia/Karachi',
  weekly          jsonb not null default '{}'::jsonb,
  holidays        jsonb not null default '[]'::jsonb,
  away_message    text,
  welcome_message text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id)
);
create index if not exists whatsapp_business_hours_ws_idx
  on public.whatsapp_business_hours(workspace_id);

alter table public.whatsapp_business_hours enable row level security;

drop policy if exists "wa_bizhours select" on public.whatsapp_business_hours;
create policy "wa_bizhours select" on public.whatsapp_business_hours for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_bizhours insert" on public.whatsapp_business_hours;
create policy "wa_bizhours insert" on public.whatsapp_business_hours for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_bizhours update" on public.whatsapp_business_hours;
create policy "wa_bizhours update" on public.whatsapp_business_hours for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists "wa_bizhours delete" on public.whatsapp_business_hours;
create policy "wa_bizhours delete" on public.whatsapp_business_hours for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 7. ──────────────── ALTER whatsapp_instances (soft-ban — EPIC-12) ────────────────
-- The throttle is strong but had no way to react to an actual Baileys block.
-- soft_ban_until pauses ALL sends for this instance until it passes; the
-- runner reads it before claiming and re-queues mid-blast if it trips.
alter table public.whatsapp_instances
  add column if not exists soft_ban_until  timestamptz,
  add column if not exists soft_ban_reason text;

-- 8. ──────────────── whatsapp_claim_due_send_jobs RPC (EPIC-08/17) ────────────────
-- Schedule-aware atomic claim. Flips up to p_limit oldest QUEUED jobs whose
-- schedule is due (scheduled_for is null OR <= now) to 'running' in one
-- UPDATE…RETURNING, skipping jobs on soft-banned instances. Replaces the
-- runner's plain "update where status=queued" so a future-scheduled blast
-- is not picked early and a soft-ban pauses the queue. SECURITY DEFINER,
-- service-role only. Returns the full claimed rows for the runner to drain.
create or replace function public.whatsapp_claim_due_send_jobs(p_limit int)
returns setof public.whatsapp_send_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select j.id
      from public.whatsapp_send_jobs j
      join public.whatsapp_instances i on i.id = j.instance_id
     where j.status = 'queued'
       and (j.scheduled_for is null or j.scheduled_for <= now())
       and (i.soft_ban_until is null or i.soft_ban_until <= now())
     order by j.created_at asc
     for update of j skip locked
     limit greatest(p_limit, 0)
  )
  update public.whatsapp_send_jobs j
     set status = 'running', started_at = now()
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.whatsapp_claim_due_send_jobs(int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.whatsapp_claim_due_send_jobs(int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.whatsapp_claim_due_send_jobs(int) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.whatsapp_claim_due_send_jobs(int) to service_role';
  end if;
end $$;

-- 9. ──────────────── soft-ban toggle RPCs (EPIC-12) ────────────────
create or replace function public.whatsapp_softban_pause(
  p_instance_id uuid, p_reason text, p_until timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.whatsapp_instances
     set soft_ban_until = p_until, soft_ban_reason = p_reason, updated_at = now()
   where id = p_instance_id;
$$;

create or replace function public.whatsapp_softban_clear(p_instance_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.whatsapp_instances
     set soft_ban_until = null, soft_ban_reason = null, updated_at = now()
   where id = p_instance_id;
$$;

revoke all on function public.whatsapp_softban_pause(uuid,text,timestamptz) from public;
revoke all on function public.whatsapp_softban_clear(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.whatsapp_softban_pause(uuid,text,timestamptz) from anon';
    execute 'revoke all on function public.whatsapp_softban_clear(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.whatsapp_softban_pause(uuid,text,timestamptz) from authenticated';
    execute 'revoke all on function public.whatsapp_softban_clear(uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.whatsapp_softban_pause(uuid,text,timestamptz) to service_role';
    execute 'grant execute on function public.whatsapp_softban_clear(uuid) to service_role';
  end if;
end $$;

-- updated_at triggers (reuse the Wave-1 whatsapp_touch_updated_at fn).
drop trigger if exists whatsapp_contact_state_touch on public.whatsapp_contact_state;
create trigger whatsapp_contact_state_touch before update on public.whatsapp_contact_state
  for each row execute function public.whatsapp_touch_updated_at();
drop trigger if exists whatsapp_segments_touch on public.whatsapp_segments;
create trigger whatsapp_segments_touch before update on public.whatsapp_segments
  for each row execute function public.whatsapp_touch_updated_at();
drop trigger if exists whatsapp_automation_rules_touch on public.whatsapp_automation_rules;
create trigger whatsapp_automation_rules_touch before update on public.whatsapp_automation_rules
  for each row execute function public.whatsapp_touch_updated_at();
drop trigger if exists whatsapp_business_hours_touch on public.whatsapp_business_hours;
create trigger whatsapp_business_hours_touch before update on public.whatsapp_business_hours
  for each row execute function public.whatsapp_touch_updated_at();
