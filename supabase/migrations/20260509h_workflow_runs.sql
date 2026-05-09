-- ─────────────────────────────────────────────────────────────────────
-- Admin panel v7 — workflow runs (Agent BF)
--
-- Records each manual / event / cron invocation of an `agent_workflows`
-- row. Used by the workflow runner to track progress, surface step
-- output to the admin UI ("Recent runs" panel), and provide a real
-- audit trail beyond the per-mutation `admin_audit_log` rows.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.workflow_runs (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   text not null references public.agent_workflows(id) on delete cascade,
  triggered_by  uuid references auth.users(id) on delete set null,
  trigger_kind  text not null default 'manual'
                  check (trigger_kind in ('manual','event','cron')),
  status        text not null default 'running'
                  check (status in ('running','completed','failed','cancelled')),
  step_results  jsonb not null default '[]'::jsonb,
  input         jsonb,
  output        jsonb,
  error         text,
  duration_ms   int,
  metadata      jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

alter table public.workflow_runs enable row level security;

drop policy if exists "admins all workflow_runs" on public.workflow_runs;
create policy "admins all workflow_runs" on public.workflow_runs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists workflow_runs_workflow_idx
  on public.workflow_runs (workflow_id, started_at desc);
