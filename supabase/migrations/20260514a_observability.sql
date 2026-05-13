-- 2026-05-14 Observability — per-endpoint latency histogram.
-- Inserted from withApiHandler (fire-and-forget) on every API request.
-- Aggregated by the api_latency_summary RPC for the admin/insights view.

create table if not exists public.api_latency (
  id           bigserial primary key,
  source       text not null,
  status       int  not null,
  ms           int  not null,
  user_id      uuid,
  workspace_id uuid,
  release_sha  text,
  region       text,
  ts           timestamptz not null default now()
);

create index if not exists api_latency_source_ts_idx
  on public.api_latency (source, ts desc);

create index if not exists api_latency_ts_idx
  on public.api_latency (ts desc);

alter table public.api_latency enable row level security;
-- No policies — service-role-only writes; reads via the RPC below.

-- p50/p95/p99/error_rate per source over a configurable window.
create or replace function public.api_latency_summary(
  p_window_minutes int default 60
)
returns table (
  source     text,
  count      bigint,
  p50_ms     int,
  p95_ms     int,
  p99_ms     int,
  err_rate   numeric
)
language sql
security definer
set search_path = public
as $$
  select
    source,
    count(*) as count,
    percentile_disc(0.5)  within group (order by ms)::int as p50_ms,
    percentile_disc(0.95) within group (order by ms)::int as p95_ms,
    percentile_disc(0.99) within group (order by ms)::int as p99_ms,
    coalesce((count(*) filter (where status >= 500))::numeric / nullif(count(*), 0), 0) as err_rate
  from public.api_latency
  where ts >= now() - make_interval(mins => p_window_minutes)
  group by source
  order by count desc;
$$;

grant execute on function public.api_latency_summary(int) to authenticated;
