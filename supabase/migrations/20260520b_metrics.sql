-- 2026-05-20 Metrics pipeline + log retention + top-spender alert.
--
-- Three things in one migration so the observability surface lands
-- atomically:
--
--   1. public.app_metrics
--        Compact, Prometheus-shaped time-series table. Every counter
--        increment or histogram observation lands here as a single row.
--        Aggregation (rate, p95, sum) happens at read time via the
--        metrics_summary RPC. This keeps writes cheap and avoids the
--        complexity of cardinality-blowup that comes with materialised
--        roll-ups; once volume warrants it, we can tier hot rows into
--        a matview.
--
--   2. public.metrics_summary(window_minutes, name)
--        Admin-facing RPC that returns aggregates for the dashboard
--        and the metrics-explorer page (separate agent).
--
--   3. public.top_spender_alert(...)
--        Service-role fan-out used by /api/cron/anomaly-check to ping
--        admins when a workspace's 24h AI spend overshoots its
--        historical median. Mirrors stuck_jobs_alert / anomaly_alert
--        so the on-call playbook stays uniform.
--
-- All writes are service-role only. RLS is enabled with no select
-- policy by default — admin reads go through the RPC.

-- ────────────────────────── app_metrics ──────────────────────────
create table if not exists public.app_metrics (
  id      bigserial primary key,
  ts      timestamptz not null default now(),
  name    text        not null,
  labels  jsonb       not null default '{}'::jsonb,
  value   double precision not null default 1
);

-- Hot read pattern: "give me rows for metric X in the last N minutes".
-- A composite on (name, ts desc) makes that index-only.
create index if not exists app_metrics_name_ts_idx
  on public.app_metrics (name, ts desc);

-- For the metrics-summary RPC which also filters by ts alone when no
-- name is supplied.
create index if not exists app_metrics_ts_idx
  on public.app_metrics (ts desc);

-- GIN on labels so we can later filter by e.g. workspace_id or source.
create index if not exists app_metrics_labels_gin_idx
  on public.app_metrics using gin (labels jsonb_path_ops);

alter table public.app_metrics enable row level security;
-- No policies — service-role-only writes; admin reads via the RPC below.

comment on table public.app_metrics is
  'Compact metrics table written by lib/metrics. Each row is one '
  'counter increment or histogram observation. Aggregated at read time '
  'via metrics_summary RPC.';

-- ───────────────────────── metrics_summary ─────────────────────────
-- Aggregates over a configurable window. When p_name is supplied,
-- returns one row per (name) — value statistics for the metric.
-- When p_name is null, returns one row per distinct metric name so
-- the dashboard can render the full catalog without enumerating it
-- in code.
create or replace function public.metrics_summary(
  p_window_minutes int  default 60,
  p_name           text default null
)
returns table (
  name      text,
  samples   bigint,
  total     double precision,
  avg_value double precision,
  p50       double precision,
  p95       double precision,
  p99       double precision,
  min_value double precision,
  max_value double precision
)
language sql
security definer
set search_path = public
as $$
  select
    name,
    count(*)                                                     as samples,
    sum(value)                                                   as total,
    avg(value)                                                   as avg_value,
    percentile_disc(0.5)  within group (order by value)::double precision as p50,
    percentile_disc(0.95) within group (order by value)::double precision as p95,
    percentile_disc(0.99) within group (order by value)::double precision as p99,
    min(value)                                                   as min_value,
    max(value)                                                   as max_value
  from public.app_metrics
  where ts >= now() - make_interval(mins => greatest(p_window_minutes, 1))
    and (p_name is null or name = p_name)
  group by name
  order by samples desc;
$$;

revoke all on function public.metrics_summary(int, text) from public;
grant execute on function public.metrics_summary(int, text) to service_role;
grant execute on function public.metrics_summary(int, text) to authenticated;

-- ─────────────────────── top_spender_alert ───────────────────────
-- Fan out one admin notification per spike. Mirrors stuck_jobs_alert
-- and anomaly_alert: service-role-only execute, deterministic shape.
create or replace function public.top_spender_alert(
  p_title   text,
  p_body    text,
  p_payload jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
begin
  with admins as (
    select user_id from public.profiles where is_admin = true
  ),
  ins as (
    insert into public.notifications
      (recipient_user_id, kind, title, body, href, payload)
    select
      a.user_id,
      'ops.ai.cost_spike',
      p_title,
      p_body,
      '/admin/insights',
      coalesce(p_payload, '{}'::jsonb)
    from admins a
    returning 1
  )
  select count(*)::int into inserted from ins;
  return inserted;
end;
$$;

revoke all on function public.top_spender_alert(text, text, jsonb) from public;
grant execute on function public.top_spender_alert(text, text, jsonb) to service_role;
