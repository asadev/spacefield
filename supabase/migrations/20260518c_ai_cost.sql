-- 2026-05-18 AI cost tracking + async batch jobs.
--
-- Two related tables added in one migration so they can be applied
-- atomically:
--   1. ai_calls         — per-call ledger: model, tokens, $cost, latency.
--   2. ai_batch_jobs    — async queue for >30s AI tasks; the cron route
--                         in app/api/cron/ai-batch-runner picks rows up.
--
-- Both are workspace-scoped via the existing is_workspace_member helper.
-- Reads are RLS-gated; writes go through the service-role client.

-- ────────────────────────── ai_calls ──────────────────────────
create table if not exists public.ai_calls (
  id            uuid primary key default gen_random_uuid(),
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
  ts            timestamptz not null default now()
);

create index if not exists ai_calls_workspace_ts_idx on public.ai_calls (workspace_id, ts desc);
create index if not exists ai_calls_user_ts_idx      on public.ai_calls (user_id, ts desc);
create index if not exists ai_calls_agent_ts_idx     on public.ai_calls (agent_id, ts desc);

alter table public.ai_calls enable row level security;

drop policy if exists ai_calls_select on public.ai_calls;
create policy ai_calls_select on public.ai_calls
  for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));

-- Cost summary RPC: groups by (agent_id, model) over a window. Used by
-- both the admin per-agent dashboard and the user-facing budget widget.
create or replace function public.ai_cost_summary(
  p_window_minutes int default 1440,
  p_workspace_id   uuid default null
) returns table (
  agent_id      uuid,
  model         text,
  calls         bigint,
  input_tokens  bigint,
  output_tokens bigint,
  cost_usd      numeric
) language sql security definer set search_path = public as $$
  select agent_id,
         model,
         count(*)             as calls,
         sum(input_tokens)    as input_tokens,
         sum(output_tokens)   as output_tokens,
         sum(cost_usd)        as cost_usd
  from public.ai_calls
  where ts >= now() - make_interval(mins => p_window_minutes)
    and (p_workspace_id is null or workspace_id = p_workspace_id)
  group by agent_id, model
  order by cost_usd desc nulls last;
$$;

grant execute on function public.ai_cost_summary(int, uuid) to authenticated;

-- ────────────────────────── ai_batch_jobs ──────────────────────────
-- Status lifecycle: queued → running → done | failed.
-- Cancelled is allowed but not currently emitted by the runner.
create table if not exists public.ai_batch_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid,
  user_id       uuid,
  agent_id      uuid,
  prompt        text not null,
  model         text not null,
  status        text not null default 'queued',  -- queued | running | done | failed | cancelled
  result        text,
  error         text,
  callback_url  text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create index if not exists ai_batch_jobs_status_created_idx
  on public.ai_batch_jobs (status, created_at);
create index if not exists ai_batch_jobs_workspace_idx
  on public.ai_batch_jobs (workspace_id, created_at desc);

alter table public.ai_batch_jobs enable row level security;

drop policy if exists ai_batch_jobs_select on public.ai_batch_jobs;
create policy ai_batch_jobs_select on public.ai_batch_jobs
  for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));
