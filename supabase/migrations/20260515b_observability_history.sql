-- 2026-05-15 Observability history — store weekly snapshots of slow_queries.
--
-- The /api/cron/slow-queries-snapshot route reads admin_slow_queries(50)
-- once a week and persists each row here. Gives us a longitudinal view
-- of pg_stat_statements that survives Postgres resets (`pg_stat_statements_reset()`,
-- DB upgrades, instance migrations, etc.) so we can answer
--   "did this query get slower after deploy X?"
-- from the admin/insights page.
--
-- Service-role only — no policies. The cron writes via admin client,
-- the admin/insights reader uses the same. End users have no read path.
-- Additive — drops are deliberately commented out.

create table if not exists public.slow_query_snapshots (
  id               bigserial primary key,
  query            text not null,
  calls            bigint,
  mean_exec_time   numeric,
  total_exec_time  numeric,
  rows             bigint,
  captured_at      timestamptz not null default now()
);

create index if not exists slow_query_snapshots_captured_idx
  on public.slow_query_snapshots (captured_at desc);

-- Cheap path for "show me how this query trended" — same query string
-- repeats across snapshots, so a btree on a 200-char prefix gives us a
-- compact lookup key without ballooning the index on multi-KB queries.
create index if not exists slow_query_snapshots_query_prefix_idx
  on public.slow_query_snapshots (left(query, 200), captured_at desc);

alter table public.slow_query_snapshots enable row level security;
-- No policies — service-role only. RLS-enabled-no-policies means
-- anon + authenticated cannot read or write. The cron uses the
-- service-role key which bypasses RLS.

-- rollback (manual):
--   drop index if exists public.slow_query_snapshots_captured_idx;
--   drop index if exists public.slow_query_snapshots_query_prefix_idx;
--   drop table if exists public.slow_query_snapshots;
