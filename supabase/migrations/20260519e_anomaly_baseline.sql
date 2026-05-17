-- 2026-05-19 Anomaly baseline — historical p95/error-rate baseline per
-- (source, hour-of-day) over the last 7 days.
--
-- Used by /api/cron/anomaly-check (Wave-3 Y6 ops). Every 30 minutes the
-- cron compares the current 30-min window's p95 and error rate to the
-- baseline below; if current p95 is >= 3x the baseline p95 OR the
-- current error rate >= 5%, an admin notification is fan-ed out via
-- public.anomaly_alert (mirrors stuck_jobs_alert).
--
-- We key the baseline by (source, hour_of_day) rather than a single
-- "average" because traffic shape is very different at 03:00 UTC
-- vs 14:00 UTC — comparing apples-to-apples for the same hour of day
-- avoids paging on the normal evening spike.
--
-- The view reads from api_latency_hourly (the existing matview refreshed
-- daily by /api/cron/refresh-matviews) so the baseline cost is one
-- index scan per cron tick, not a percentile_disc over millions of rows.

-- Baseline: median p95 and median err_rate per (source, hour-of-day)
-- over the last 7 full days, excluding the current hour.
create or replace view public.api_latency_baseline as
  select
    source,
    extract(hour from hour)::int as hour_of_day,
    count(*)::int                 as sample_hours,
    percentile_disc(0.5) within group (order by p95_ms)::int as baseline_p95_ms,
    percentile_disc(0.5) within group (order by err_rate)::numeric as baseline_err_rate
  from public.api_latency_hourly
  where hour >= now() - interval '7 days'
    and hour <  date_trunc('hour', now())
  group by source, extract(hour from hour);

comment on view public.api_latency_baseline is
  'Per (source, hour-of-day) p95/err_rate baseline over last 7 days. '
  'Source = endpoint label from withApiHandler. Used by anomaly-check cron.';

-- Admin fan-out: insert one notification row per admin profile.
-- Mirrors public.stuck_jobs_alert (20260518d_job_reliability.sql) so
-- service-role-only inserts stay consistent with the RLS-deny default.
create or replace function public.anomaly_alert(
  p_title text,
  p_body  text,
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
      'ops.anomaly.latency',
      p_title,
      p_body,
      '/admin/status',
      coalesce(p_payload, '{}'::jsonb)
    from admins a
    returning 1
  )
  select count(*)::int into inserted from ins;
  return inserted;
end;
$$;

revoke all on function public.anomaly_alert(text, text, jsonb) from public;
grant execute on function public.anomaly_alert(text, text, jsonb) to service_role;

-- Read access for admins so the baseline view can be inspected from
-- the SQL console. The view itself reads only the matview (which is
-- already admin-readable via the existing observability stack).
grant select on public.api_latency_baseline to service_role;
