-- WhatsApp inbox v2 — Wave 4 schema
-- EPIC-10 (groups manage) · EPIC-13 (search + saved views) · EPIC-14 (macros)
-- EPIC-15 (reporting events) · EPIC-16 (notifications taxonomy already on the
-- shared `notifications` table — no new table). EPIC-11 (AI assist) is
-- inbox-side only and needs no schema beyond whatsapp_messages.transcription
-- (already present from Wave 1/2).
--
-- Idempotent: re-runnable. RLS recipe matches Waves 1–3 (workspace_role_of
-- gating; delete owner/admin). Service-role-only RPCs revoke anon/authenticated.

-- ─────────────────────────────────────────────────────────────────────────
-- EPIC-10 — extend whatsapp_groups for management + participants
-- (currently only subject + member_count). All adds are nullable / defaulted.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_groups
  add column if not exists participants jsonb not null default '[]'::jsonb,
  add column if not exists description text,
  add column if not exists avatar_url text,
  add column if not exists owner_jid text,
  add column if not exists is_announce boolean not null default false,
  add column if not exists is_locked boolean not null default false,
  add column if not exists invite_code text,
  add column if not exists last_synced_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────
-- EPIC-13 — full-text / trigram search over message bodies.
-- pg_trgm is installed; a GIN trgm index on body powers ILIKE '%q%' across
-- ALL history fast. Partial: skip private notes + tombstoned rows so customer
-- search doesn't surface internal notes.
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

create index if not exists whatsapp_messages_body_trgm_idx
  on public.whatsapp_messages using gin (body gin_trgm_ops)
  where body is not null and is_private = false and deleted_at is null;

-- Helps the search route order/scope by workspace + recency.
create index if not exists whatsapp_messages_ws_created_idx
  on public.whatsapp_messages (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- EPIC-13 — saved views (named filter combos per user)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query jsonb not null default '{}'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_saved_views_ws_user_idx
  on public.whatsapp_saved_views (workspace_id, user_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- EPIC-14 — macros (one-tap multi-action) reusing lib/whatsapp/actions.ts
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_macros (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  actions jsonb not null default '[]'::jsonb,
  visibility text not null default 'global' check (visibility in ('global','personal')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_macros_ws_idx
  on public.whatsapp_macros (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- EPIC-15 — append-only reporting events for analytics
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_reporting_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_name text not null,            -- conversation_created|conversation_resolved|first_response|reply_time|conversation_reopened
  value numeric,                       -- generic numeric (e.g. seconds for first_response/reply_time)
  value_in_business_hours numeric,     -- same metric clamped to business hours
  conversation_id uuid,                -- FK-less on purpose (events survive convo delete for history)
  contact_id uuid,
  user_id uuid,                        -- the operator (assignee/replier), nullable
  instance_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_reporting_events_ws_name_created_idx
  on public.whatsapp_reporting_events (workspace_id, event_name, created_at desc);
create index if not exists whatsapp_reporting_events_ws_created_idx
  on public.whatsapp_reporting_events (workspace_id, created_at desc);

-- ═════════════════════════════════════════════════════════════════════════
-- RLS — workspace-gated like the rest of the WhatsApp surface.
-- ═════════════════════════════════════════════════════════════════════════

-- whatsapp_saved_views: a user manages their OWN views within a workspace.
alter table public.whatsapp_saved_views enable row level security;
drop policy if exists wa_saved_views_sel on public.whatsapp_saved_views;
create policy wa_saved_views_sel on public.whatsapp_saved_views for select
  using (
    user_id = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin','member')
  );
drop policy if exists wa_saved_views_ins on public.whatsapp_saved_views;
create policy wa_saved_views_ins on public.whatsapp_saved_views for insert
  with check (
    user_id = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin','member')
  );
drop policy if exists wa_saved_views_upd on public.whatsapp_saved_views;
create policy wa_saved_views_upd on public.whatsapp_saved_views for update
  using (
    user_id = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin','member')
  )
  with check (
    user_id = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin','member')
  );
drop policy if exists wa_saved_views_del on public.whatsapp_saved_views;
create policy wa_saved_views_del on public.whatsapp_saved_views for delete
  using (
    user_id = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin','member')
  );

-- whatsapp_macros: any workspace member reads + writes; delete owner/admin.
alter table public.whatsapp_macros enable row level security;
drop policy if exists wa_macros_sel on public.whatsapp_macros;
create policy wa_macros_sel on public.whatsapp_macros for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists wa_macros_ins on public.whatsapp_macros;
create policy wa_macros_ins on public.whatsapp_macros for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists wa_macros_upd on public.whatsapp_macros;
create policy wa_macros_upd on public.whatsapp_macros for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
drop policy if exists wa_macros_del on public.whatsapp_macros;
create policy wa_macros_del on public.whatsapp_macros for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- whatsapp_reporting_events: members read; writes are service-role only
-- (emitted server-side via the admin client, which bypasses RLS). We add a
-- SELECT policy so the analytics route could read with a user client too, but
-- the dashboards read via the admin client after the route auth-gates.
alter table public.whatsapp_reporting_events enable row level security;
drop policy if exists wa_reporting_sel on public.whatsapp_reporting_events;
create policy wa_reporting_sel on public.whatsapp_reporting_events for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
-- no insert/update/delete policy → only service_role can write.

-- ═════════════════════════════════════════════════════════════════════════
-- EPIC-15 — server-side analytics aggregation RPC (one round trip).
-- SECURITY DEFINER so it can read reporting events regardless of the caller's
-- RLS, but it ONLY ever scopes to the workspace id the route passes after it
-- has auth-gated the caller. Returns a jsonb bundle.
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.whatsapp_analytics_overview(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with ev as (
    select * from public.whatsapp_reporting_events
    where workspace_id = p_workspace_id
      and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'new_conversations',
      (select count(*) from ev where event_name = 'conversation_created'),
    'resolved_conversations',
      (select count(*) from ev where event_name = 'conversation_resolved'),
    'reopened_conversations',
      (select count(*) from ev where event_name = 'conversation_reopened'),
    'first_response_count',
      (select count(*) from ev where event_name = 'first_response'),
    'avg_first_response_seconds',
      (select round(avg(value)) from ev where event_name = 'first_response' and value is not null),
    'median_first_response_seconds',
      (select round(percentile_cont(0.5) within group (order by value))
         from ev where event_name = 'first_response' and value is not null),
    'avg_resolution_seconds',
      (select round(avg(value)) from ev where event_name = 'conversation_resolved' and value is not null),
    'reply_count',
      (select count(*) from ev where event_name = 'reply_time'),
    'avg_reply_seconds',
      (select round(avg(value)) from ev where event_name = 'reply_time' and value is not null),
    -- busiest hours: created+reply events bucketed by hour-of-day (0..23).
    'busiest_hours',
      coalesce((
        select jsonb_object_agg(h::text, c)
        from (
          select extract(hour from created_at)::int as h, count(*) as c
          from ev
          where event_name in ('conversation_created','reply_time','first_response')
          group by 1
        ) hh
      ), '{}'::jsonb)
  );
$$;
revoke all on function public.whatsapp_analytics_overview(uuid, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.whatsapp_analytics_overview(uuid, timestamptz, timestamptz) to service_role;

-- Conversation-volume time series (per-day counts) for the Volume dashboard.
create or replace function public.whatsapp_analytics_volume(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'Asia/Karachi'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with days as (
    select to_char((d at time zone p_tz)::date, 'YYYY-MM-DD') as day,
           count(*) filter (where event_name = 'conversation_created') as new_convos,
           count(*) filter (where event_name = 'conversation_resolved') as resolved,
           count(*) filter (where event_name = 'first_response') as first_responses
    from public.whatsapp_reporting_events e
    cross join lateral (select e.created_at as d) x
    where e.workspace_id = p_workspace_id
      and e.created_at >= p_from and e.created_at < p_to
    group by 1
    order by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', day, 'new_convos', new_convos, 'resolved', resolved,
    'first_responses', first_responses
  )), '[]'::jsonb)
  from days;
$$;
revoke all on function public.whatsapp_analytics_volume(uuid, timestamptz, timestamptz, text) from anon, authenticated;
grant execute on function public.whatsapp_analytics_volume(uuid, timestamptz, timestamptz, text) to service_role;
