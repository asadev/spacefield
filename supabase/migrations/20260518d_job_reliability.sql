-- ─────────────────────────────────────────────────────────────────────
-- 20260518d_job_reliability.sql
--
-- Job-reliability + cron hardening (Wave-2 W1).
--
--   1. extend workflow_runs.status to allow 'stuck'
--   2. add ai_batch_jobs.status CHECK incl. 'stuck'
--   3. helper RPC: detect_stuck_jobs(threshold_minutes) → counts
--      stuck rows so the cron handler can log a single roll-up row
--   4. helper RPC: stuck_jobs_alert(payload) → fans out an in-app
--      notification to every admin (profiles.is_admin = true). Used
--      by /api/cron/stuck-jobs-detect.
--   5. webhook_deliveries_v2 already has `attempt` + `retry_scheduled`
--      + `exhausted` (added in 20260509b). We extend it with two
--      retry-bookkeeping columns so the retry wrapper has somewhere
--      to persist scheduling state without re-using the metadata
--      jsonb bag.
--        next_attempt_at  timestamptz  — when the next retry is due
--        delivery_group   uuid         — groups all attempts of one
--                                       logical delivery so the
--                                       admin UI can show them as a
--                                       single thread
-- ─────────────────────────────────────────────────────────────────────

-- 1. workflow_runs.status — add 'stuck'
do $$
begin
  if exists (
    select 1
      from information_schema.constraint_column_usage
     where table_schema = 'public'
       and table_name   = 'workflow_runs'
       and constraint_name = 'workflow_runs_status_check'
  ) then
    alter table public.workflow_runs
      drop constraint workflow_runs_status_check;
  end if;
end$$;

alter table public.workflow_runs
  add constraint workflow_runs_status_check
  check (status in ('running','completed','failed','cancelled','stuck'));

-- 2. ai_batch_jobs.status — enforce + add 'stuck'
do $$
begin
  if exists (
    select 1
      from information_schema.constraint_column_usage
     where table_schema = 'public'
       and table_name   = 'ai_batch_jobs'
       and constraint_name = 'ai_batch_jobs_status_check'
  ) then
    alter table public.ai_batch_jobs
      drop constraint ai_batch_jobs_status_check;
  end if;
end$$;

alter table public.ai_batch_jobs
  add constraint ai_batch_jobs_status_check
  check (status in ('queued','running','done','failed','cancelled','stuck'));

-- Index to make "stuck-candidates" scans cheap.
create index if not exists workflow_runs_running_started_idx
  on public.workflow_runs (started_at)
  where status = 'running';

create index if not exists ai_batch_jobs_running_started_idx
  on public.ai_batch_jobs (started_at)
  where status = 'running';

-- 3. detect_stuck_jobs — flips rows whose started_at is older than
--    threshold_minutes and returns the counts. Returns one row.
create or replace function public.detect_stuck_jobs(threshold_minutes int default 30)
returns table (
  workflow_stuck int,
  batch_stuck    int,
  threshold_min  int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - make_interval(mins => threshold_minutes);
  w_count int := 0;
  b_count int := 0;
begin
  with updated as (
    update public.workflow_runs
       set status = 'stuck',
           finished_at = coalesce(finished_at, now()),
           error = coalesce(error, format(
             'auto-marked stuck after %s min (started %s)',
             threshold_minutes::text,
             started_at::text
           ))
     where status = 'running'
       and started_at < cutoff
     returning 1
  )
  select count(*)::int into w_count from updated;

  with updated as (
    update public.ai_batch_jobs
       set status = 'stuck',
           completed_at = coalesce(completed_at, now()),
           error = coalesce(error, format(
             'auto-marked stuck after %s min (started %s)',
             threshold_minutes::text,
             coalesce(started_at, created_at)::text
           ))
     where status = 'running'
       and coalesce(started_at, created_at) < cutoff
     returning 1
  )
  select count(*)::int into b_count from updated;

  workflow_stuck := w_count;
  batch_stuck    := b_count;
  threshold_min  := threshold_minutes;
  return next;
end;
$$;

revoke all on function public.detect_stuck_jobs(int) from public;
grant execute on function public.detect_stuck_jobs(int) to service_role;

-- 4. stuck_jobs_alert — fan-out helper. Inserts one notification row per
--    admin user. Called by the cron handler when detect_stuck_jobs
--    returns a non-zero count.
create or replace function public.stuck_jobs_alert(
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
      'ops.jobs.stuck',
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

revoke all on function public.stuck_jobs_alert(text, text, jsonb) from public;
grant execute on function public.stuck_jobs_alert(text, text, jsonb) to service_role;

-- 5. webhook_deliveries_v2 — retry bookkeeping columns.
alter table public.webhook_deliveries_v2
  add column if not exists next_attempt_at timestamptz;

alter table public.webhook_deliveries_v2
  add column if not exists delivery_group  uuid;

create index if not exists wd_v2_delivery_group_idx
  on public.webhook_deliveries_v2 (delivery_group, attempt);

create index if not exists wd_v2_next_attempt_idx
  on public.webhook_deliveries_v2 (next_attempt_at)
  where status = 'retry_scheduled';
