-- 2026-05-18e — Database scalability scaffolds.
--
-- Owner: Wave-2 Agent W2 (database scalability).
-- Goal: prepare the heavy time-series tables for sustainable growth
-- without disrupting the in-flight production tables.
--
-- Ships in four parts:
--   1. Materialised views for the two hottest aggregation queries
--      (ai_cost_daily + api_latency_hourly) — refreshed by the daily
--      cron route /api/cron/refresh-matviews.
--   2. PARTITIONED-TABLE SCAFFOLDS (NOT a destructive swap). For each
--      target time-series table (api_latency, ai_calls, login_events,
--      auth_failures) we ship a `<name>_partitioned` parallel table
--      with RANGE-by-month partitions + a default catch-all. Existing
--      tables remain authoritative for writes; the swap is a manual
--      ops step documented below.
--   3. Slow-query covering indexes — top hot paths identified from
--      pg_stat_statements digest (composite + partial).
--   4. Helper RPCs used by the rotator/refresh crons.
--
-- ─────────────────────────────────────────────────────────────────────
-- PARTITION SWAP PROCEDURE (manual — DO NOT RUN AS PART OF MIGRATION)
-- ─────────────────────────────────────────────────────────────────────
-- Once Asad is ready to flip api_latency over to the partitioned form:
--
--   begin;
--     -- 1. Drain new writes into the partitioned table for a moment.
--     create or replace function public._latency_write_through()
--       returns trigger language plpgsql as $$
--       begin
--         insert into public.api_latency_partitioned
--           (id, source, status, ms, user_id, workspace_id,
--            release_sha, region, ts)
--         values
--           (new.id, new.source, new.status, new.ms, new.user_id,
--            new.workspace_id, new.release_sha, new.region, new.ts);
--         return new;
--       end$$;
--     create trigger api_latency_write_through
--       after insert on public.api_latency
--       for each row execute function public._latency_write_through();
--
--     -- 2. Backfill historical rows.
--     insert into public.api_latency_partitioned
--       select id, source, status, ms, user_id, workspace_id,
--              release_sha, region, ts
--       from public.api_latency;
--
--     -- 3. Rename atomically.
--     alter table public.api_latency           rename to api_latency_legacy;
--     alter table public.api_latency_partitioned rename to api_latency;
--
--     -- 4. Drop the bridge trigger.
--     drop trigger api_latency_write_through on public.api_latency_legacy;
--     drop function public._latency_write_through();
--   commit;
--
-- Repeat with the corresponding _partitioned variant for ai_calls,
-- login_events, auth_failures. Run during low-traffic window.
-- ─────────────────────────────────────────────────────────────────────
--
-- ROLLBACK
--   Everything here is additive + idempotent. To fully revert:
--     drop materialized view if exists public.ai_cost_daily;
--     drop materialized view if exists public.api_latency_hourly;
--     drop table if exists public.api_latency_partitioned     cascade;
--     drop table if exists public.ai_calls_partitioned        cascade;
--     drop table if exists public.login_events_partitioned    cascade;
--     drop table if exists public.auth_failures_partitioned   cascade;
--     drop function if exists public.refresh_scale_matviews();
--     drop function if exists public.create_next_month_partitions();
-- ─────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════
-- 1. MATERIALISED VIEWS
-- ════════════════════════════════════════════════════════════════════

-- ai_cost_daily — one row per (workspace, day, model).
-- Replaces the on-demand scan in ai_cost_summary() for dashboards that
-- look at multi-day windows.
create materialized view if not exists public.ai_cost_daily as
  select
    workspace_id,
    date_trunc('day', ts)::date as day,
    model,
    count(*)              as calls,
    sum(input_tokens)     as input_tokens,
    sum(output_tokens)    as output_tokens,
    sum(cost_usd)         as cost_usd,
    avg(latency_ms)::int  as avg_latency_ms
  from public.ai_calls
  group by workspace_id, day, model
with no data;

-- Unique index is REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- COALESCE the nullable workspace_id so the unique constraint actually
-- holds for service-role / system calls.
create unique index if not exists ai_cost_daily_uniq
  on public.ai_cost_daily (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), day, model);

create index if not exists ai_cost_daily_day_idx
  on public.ai_cost_daily (day desc);


-- api_latency_hourly — p50/p95/p99 per (source, hour).
-- Used by the admin Insights view when the time range is > 1 day; the
-- on-demand RPC stays for sub-hour live windows.
create materialized view if not exists public.api_latency_hourly as
  select
    source,
    date_trunc('hour', ts) as hour,
    count(*) as calls,
    percentile_disc(0.5)  within group (order by ms)::int as p50_ms,
    percentile_disc(0.95) within group (order by ms)::int as p95_ms,
    percentile_disc(0.99) within group (order by ms)::int as p99_ms,
    coalesce(
      (count(*) filter (where status >= 500))::numeric / nullif(count(*), 0),
      0
    ) as err_rate
  from public.api_latency
  group by source, hour
with no data;

create unique index if not exists api_latency_hourly_uniq
  on public.api_latency_hourly (source, hour);

create index if not exists api_latency_hourly_hour_idx
  on public.api_latency_hourly (hour desc);


-- Refresh helper — invoked by /api/cron/refresh-matviews daily.
-- CONCURRENTLY so reads don't block during refresh.
create or replace function public.refresh_scale_matviews()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently public.ai_cost_daily;
  refresh materialized view concurrently public.api_latency_hourly;
end
$$;

revoke all on function public.refresh_scale_matviews() from public;
-- Service-role only — the cron route uses createAdminClient().


-- ════════════════════════════════════════════════════════════════════
-- 2. PARTITIONED-TABLE SCAFFOLDS (parallel; not yet authoritative)
-- ════════════════════════════════════════════════════════════════════
-- The original tables stay in place. These _partitioned siblings are
-- the future home — see the swap procedure at the top of this file.
-- Each scaffold ships:
--   • the parent RANGE-partitioned table
--   • a default catch-all partition
--   • this month + next month's partitions
--   • the same indexes as the legacy table
-- The /api/cron/partition-rotator route creates next month's partition
-- on a daily basis from now on.

-- ───────────────────────── api_latency_partitioned ──────────────────
create table if not exists public.api_latency_partitioned (
  id           bigserial,
  source       text not null,
  status       int  not null,
  ms           int  not null,
  user_id      uuid,
  workspace_id uuid,
  release_sha  text,
  region       text,
  ts           timestamptz not null default now(),
  primary key (id, ts)
) partition by range (ts);

create table if not exists public.api_latency_partitioned_default
  partition of public.api_latency_partitioned default;

-- Indexes on parent propagate to all partitions.
create index if not exists api_latency_part_source_ts_idx
  on public.api_latency_partitioned (source, ts desc);

create index if not exists api_latency_part_ts_idx
  on public.api_latency_partitioned (ts desc);

alter table public.api_latency_partitioned enable row level security;
-- Service-role only writes; reads via RPCs.


-- ───────────────────────── ai_calls_partitioned ─────────────────────
create table if not exists public.ai_calls_partitioned (
  id            uuid not null default gen_random_uuid(),
  workspace_id  uuid,
  user_id       uuid,
  agent_id      uuid,
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  cost_usd      numeric(12,6) not null default 0,
  latency_ms    int,
  status        text not null default 'ok',
  error         text,
  ts            timestamptz not null default now(),
  primary key (id, ts)
) partition by range (ts);

create table if not exists public.ai_calls_partitioned_default
  partition of public.ai_calls_partitioned default;

create index if not exists ai_calls_part_workspace_ts_idx
  on public.ai_calls_partitioned (workspace_id, ts desc);

create index if not exists ai_calls_part_user_ts_idx
  on public.ai_calls_partitioned (user_id, ts desc);

create index if not exists ai_calls_part_agent_ts_idx
  on public.ai_calls_partitioned (agent_id, ts desc);

alter table public.ai_calls_partitioned enable row level security;


-- ───────────────────────── login_events_partitioned ─────────────────
-- Mirrors login_events but drops the FK to auth.users(id) — partitioned
-- tables can't carry FKs that point outside the partition tree in
-- Postgres 15+ without the FK fanning out per-partition. The legacy
-- table keeps its FK; this scaffold relies on application-level
-- cleanup (the workspace/account-purge crons clear orphans).
create table if not exists public.login_events_partitioned (
  id           bigserial,
  user_id      uuid not null,
  ip_hash      text,
  ua_hash      text,
  occurred_at  timestamptz not null default now(),
  alerted      boolean not null default false,
  notified_at  timestamptz,
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table if not exists public.login_events_partitioned_default
  partition of public.login_events_partitioned default;

create index if not exists login_events_part_user_time_idx
  on public.login_events_partitioned (user_id, occurred_at desc);

create index if not exists login_events_part_pending_idx
  on public.login_events_partitioned (occurred_at)
  where alerted = true and notified_at is null;

alter table public.login_events_partitioned enable row level security;


-- ───────────────────────── auth_failures_partitioned ────────────────
create table if not exists public.auth_failures_partitioned (
  id          bigserial,
  email_lower text not null,
  ip_hash     text,
  ua_hash     text,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table if not exists public.auth_failures_partitioned_default
  partition of public.auth_failures_partitioned default;

create index if not exists auth_failures_part_email_time_idx
  on public.auth_failures_partitioned (email_lower, occurred_at desc);

alter table public.auth_failures_partitioned enable row level security;


-- ───────────────────────── month-partition helpers ──────────────────
-- For each (parent_table, ts_col, month_start) creates a child
-- partition named `<parent>_yYYYY_mMM` for [month_start, month_start+1
-- month). Safe to re-run.
create or replace function public._ensure_month_partition(
  p_parent  regclass,
  p_month   date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_child_name text;
  v_start      timestamptz := p_month::timestamptz;
  v_end        timestamptz := (p_month + interval '1 month')::timestamptz;
  v_parent_txt text := p_parent::text;
  v_short_name text;
begin
  v_short_name := split_part(v_parent_txt, '.', 2);
  if v_short_name = '' then
    v_short_name := v_parent_txt;
  end if;
  v_child_name := format('%I.%I',
    'public',
    v_short_name || '_y' || to_char(p_month, 'YYYY') ||
                    '_m' || to_char(p_month, 'MM')
  );

  execute format(
    'create table if not exists %s partition of %s for values from (%L) to (%L)',
    v_child_name, v_parent_txt, v_start, v_end
  );
end
$$;

revoke all on function public._ensure_month_partition(regclass, date) from public;


-- Materialise this month + next month for every partitioned scaffold.
-- Re-running is a no-op thanks to `create table if not exists`.
do $$
declare
  v_this_month date := date_trunc('month', now())::date;
  v_next_month date := (v_this_month + interval '1 month')::date;
  v_table      text;
begin
  foreach v_table in array array[
    'public.api_latency_partitioned',
    'public.ai_calls_partitioned',
    'public.login_events_partitioned',
    'public.auth_failures_partitioned'
  ]
  loop
    perform public._ensure_month_partition(v_table::regclass, v_this_month);
    perform public._ensure_month_partition(v_table::regclass, v_next_month);
  end loop;
end
$$;


-- Cron-callable: materialise next month's partition on every
-- partitioned scaffold. Idempotent.
create or replace function public.create_next_month_partitions()
returns table (parent_table text, month_added date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next_month date := (date_trunc('month', now()) + interval '1 month')::date;
  v_table      text;
begin
  foreach v_table in array array[
    'public.api_latency_partitioned',
    'public.ai_calls_partitioned',
    'public.login_events_partitioned',
    'public.auth_failures_partitioned'
  ]
  loop
    perform public._ensure_month_partition(v_table::regclass, v_next_month);
    parent_table := v_table;
    month_added  := v_next_month;
    return next;
  end loop;
end
$$;

revoke all on function public.create_next_month_partitions() from public;
-- Service-role only via the cron route.


-- ════════════════════════════════════════════════════════════════════
-- 3. SLOW-QUERY COVERING INDEXES
-- ════════════════════════════════════════════════════════════════════
-- Picked from the pg_stat_statements digest (slow_queries_top_50) +
-- known hot paths in the app. Patterns:
--   • composite (scope_id, created_at DESC) for time-bucketed lists.
--   • partial (where deleted_at is null) so soft-deleted rows don't
--     bloat the index.
-- All `create index if not exists`, so safe to re-apply.

-- Tasks list: (workspace_id, status, due_at) is the kanban hot path.
create index if not exists tasks_workspace_status_due_idx
  on public.tasks (workspace_id, status, due_at)
  where deleted_at is null;

-- Tasks "upcoming" widget: (workspace_id, due_at) over active rows.
-- The existing `tasks_workspace_idx` is keyed by created_at, which
-- doesn't help due-date scans.
create index if not exists tasks_workspace_due_active_idx
  on public.tasks (workspace_id, due_at)
  where deleted_at is null and due_at is not null;

-- CRM contacts soft-delete partial: most reads filter deleted_at IS
-- NULL, the existing index doesn't.
create index if not exists crm_contacts_workspace_active_created_idx
  on public.crm_contacts (workspace_id, created_at desc)
  where deleted_at is null;

-- CRM deals list filtered by stage on a pipeline board.
create index if not exists crm_deals_workspace_stage_idx
  on public.crm_deals (workspace_id, stage_id, created_at desc)
  where deleted_at is null;

-- Audit log: admin filter by actor over a window.
create index if not exists admin_audit_log_actor_time_idx
  on public.admin_audit_log (actor_id, created_at desc);


-- ════════════════════════════════════════════════════════════════════
-- 4. GRANTS
-- ════════════════════════════════════════════════════════════════════
-- Read access to the matviews for the authenticated role so the admin
-- dashboard can query them directly. Insights view is admin-only but
-- the per-workspace cost widget reads ai_cost_daily filtered by
-- workspace_id — RLS is not enforced on materialised views, so we keep
-- service-role gating in the API layer instead.
grant select on public.ai_cost_daily      to authenticated;
grant select on public.api_latency_hourly to authenticated;
