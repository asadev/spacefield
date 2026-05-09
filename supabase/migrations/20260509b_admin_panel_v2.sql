-- ─────────────────────────────────────────────────────────────────────
-- Admin panel v2 — 2026-05-09 (round 2)
--
-- 10x the platform-control surface. Adds:
--   1. ai_skills              — DB-driven skill registry (lifts ALL_SKILLS
--                               metadata out of code)
--   2. ai_models              — model registry (admin can add new models
--                               without code change)
--   3. runtime_model_assignments — which model runs which call_kind
--   4. email_templates        — DB-driven templates (subject + html +
--                               variables)
--   5. webhook_endpoints + webhook_deliveries_v2 — generic webhook system
--   6. cron_jobs + cron_runs  — cron monitor with run history
--   7. api_tokens             — user/workspace API tokens
--   8. admin_alerts + admin_alert_events
--   9. user_feature_overrides — per-user explicit feature flag override
--  10. workspace_feature_overrides — per-workspace explicit
--  11. extends feature_enabled() to consider the new overrides
--
-- All admin-write, RLS-locked, with audit hooks where it matters.
-- ─────────────────────────────────────────────────────────────────────

-- 1. ───────────────── ai_skills ─────────────────
-- Mirror of lib/agent/skills/index.ts ALL_SKILLS but in DB so admin can
-- edit metadata. `kind='code'` rows have a `handler_module` pointing at
-- a TS module — runtime imports the handler from there but reads
-- system_fragment, status, tools metadata from this row. `kind='custom'`
-- rows are admin-defined skills with no code; the runtime treats their
-- `tools_json` as the literal tool array and dispatches via a generic
-- HTTP/RPC handler also stored on the row.
create table if not exists public.ai_skills (
  id                          text primary key,
  kind                        text not null default 'code'
                                check (kind in ('code','custom')),
  display_name                text not null,
  description                 text not null default '',
  system_fragment             text not null default '',
  status                      text not null default 'live'
                                check (status in ('live','draft','disabled')),
  handler_module              text,
  -- For custom skills only: array of {name, description, input_schema,
  -- read_only, handler_url, handler_kind ('rpc'|'http')} objects.
  tools_json                  jsonb not null default '[]'::jsonb,
  allowed_workspace_roles     jsonb not null default '["owner","admin","member"]'::jsonb,
  requires_confirmation_default boolean not null default false,
  category                    text not null default 'general',
  icon                        text,
  sort_order                  int not null default 0,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.ai_skills enable row level security;

drop policy if exists "authenticated reads ai_skills" on public.ai_skills;
create policy "authenticated reads ai_skills"
  on public.ai_skills for select
  using (auth.role() = 'authenticated' or public.admin_caller_is_admin());

drop policy if exists "admins write ai_skills" on public.ai_skills;
create policy "admins write ai_skills"
  on public.ai_skills for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 2. ───────────────── ai_models ─────────────────
create table if not exists public.ai_models (
  id                          text primary key,
  provider                    text not null
                                check (provider in ('anthropic','openai','google','xai','meta','mistral','custom')),
  label                       text not null,
  context_window              int not null default 200000,
  max_output_tokens           int not null default 4096,
  supports_vision             boolean not null default false,
  supports_thinking           boolean not null default false,
  supports_tools              boolean not null default true,
  cost_input_per_million      numeric not null default 0,
  cost_output_per_million     numeric not null default 0,
  status                      text not null default 'live'
                                check (status in ('live','beta','deprecated')),
  capability_tier             text not null default 'balanced'
                                check (capability_tier in ('flagship','balanced','fast','reasoning')),
  sort_order                  int not null default 0,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.ai_models enable row level security;

drop policy if exists "authenticated reads ai_models" on public.ai_models;
create policy "authenticated reads ai_models"
  on public.ai_models for select
  using (auth.role() = 'authenticated' or public.admin_caller_is_admin());

drop policy if exists "admins write ai_models" on public.ai_models;
create policy "admins write ai_models"
  on public.ai_models for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 3. ───────────────── runtime_model_assignments ─────────────────
-- One row per call_kind. The runtime reads this to know which model to
-- dispatch with. Falls back to a hardcoded sane default if the row is
-- missing.
create table if not exists public.runtime_model_assignments (
  call_kind                   text primary key
                                check (call_kind in ('classifier','executor','orchestrator','formatter')),
  model_id                    text not null references public.ai_models(id),
  fallback_model_id           text references public.ai_models(id),
  temperature                 numeric not null default 1.0,
  max_tokens                  int not null default 4096,
  metadata                    jsonb not null default '{}'::jsonb,
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.runtime_model_assignments enable row level security;

drop policy if exists "authenticated reads model assignments" on public.runtime_model_assignments;
create policy "authenticated reads model assignments"
  on public.runtime_model_assignments for select
  using (auth.role() = 'authenticated' or public.admin_caller_is_admin());

drop policy if exists "admins write model assignments" on public.runtime_model_assignments;
create policy "admins write model assignments"
  on public.runtime_model_assignments for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 4. ───────────────── email_templates ─────────────────
create table if not exists public.email_templates (
  key                         text primary key,
  display_name                text not null,
  description                 text not null default '',
  category                    text not null default 'transactional'
                                check (category in ('transactional','marketing','auth','notification','digest')),
  role                        text not null default 'noreply'
                                check (role in ('noreply','hello','info','support','sales','invites','security','legal')),
  subject                     text not null,
  html                        text not null,
  plain_text                  text,
  variables_json              jsonb not null default '[]'::jsonb,
  enabled                     boolean not null default true,
  locale                      text not null default 'en',
  last_test_send_at           timestamptz,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.email_templates enable row level security;

drop policy if exists "admins read email_templates" on public.email_templates;
create policy "admins read email_templates"
  on public.email_templates for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write email_templates" on public.email_templates;
create policy "admins write email_templates"
  on public.email_templates for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- Email send log (separate from webhook_deliveries — different shape).
create table if not exists public.email_sends (
  id                          uuid primary key default gen_random_uuid(),
  template_key                text references public.email_templates(key) on delete set null,
  to_email                    text not null,
  subject                     text not null,
  status                      text not null check (status in ('queued','sent','failed','bounced')),
  provider_id                 text,
  error                       text,
  sent_by                     uuid references auth.users(id) on delete set null,
  workspace_id                uuid references public.workspaces(id) on delete set null,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);

alter table public.email_sends enable row level security;

drop policy if exists "admins read email_sends" on public.email_sends;
create policy "admins read email_sends"
  on public.email_sends for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write email_sends" on public.email_sends;
create policy "admins write email_sends"
  on public.email_sends for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists email_sends_template_idx on public.email_sends(template_key, created_at desc);

-- 5. ───────────────── webhook_endpoints + deliveries_v2 ─────────────────
create table if not exists public.webhook_endpoints (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid references public.workspaces(id) on delete cascade,
  name                        text not null,
  url                         text not null,
  events                      jsonb not null default '[]'::jsonb,
  secret                      text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 48),
  enabled                     boolean not null default true,
  max_retries                 int not null default 3,
  last_delivery_at            timestamptz,
  last_delivery_status        text,
  created_by                  uuid references auth.users(id) on delete set null,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.webhook_endpoints enable row level security;

drop policy if exists "members read webhook endpoints" on public.webhook_endpoints;
create policy "members read webhook endpoints"
  on public.webhook_endpoints for select
  using (
    workspace_id is null
    or workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write webhook endpoints" on public.webhook_endpoints;
create policy "admins write webhook endpoints"
  on public.webhook_endpoints for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.webhook_deliveries_v2 (
  id                          uuid primary key default gen_random_uuid(),
  endpoint_id                 uuid references public.webhook_endpoints(id) on delete cascade,
  event                       text not null,
  payload                     jsonb not null default '{}'::jsonb,
  status                      text not null
                                check (status in ('pending','success','timeout','network_error','non_2xx','signing_skipped','retry_scheduled','exhausted')),
  http_status                 int,
  response_excerpt            text,
  attempted_at                timestamptz not null default now(),
  duration_ms                 int,
  signed                      boolean not null default true,
  attempt                     int not null default 1,
  metadata                    jsonb not null default '{}'::jsonb
);

alter table public.webhook_deliveries_v2 enable row level security;

drop policy if exists "admins read webhook_deliveries_v2" on public.webhook_deliveries_v2;
create policy "admins read webhook_deliveries_v2"
  on public.webhook_deliveries_v2 for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write webhook_deliveries_v2" on public.webhook_deliveries_v2;
create policy "admins write webhook_deliveries_v2"
  on public.webhook_deliveries_v2 for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists wd_v2_endpoint_idx on public.webhook_deliveries_v2(endpoint_id, attempted_at desc);

-- 6. ───────────────── cron_jobs + cron_runs ─────────────────
-- The schedule lives in vercel.json (Vercel's source of truth) but the
-- admin can see the registered list, last run status, and disable a
-- cron (the route handler reads `enabled` from this table at the top
-- and short-circuits when false).
create table if not exists public.cron_jobs (
  id                          text primary key,
  path                        text not null,
  schedule                    text not null,
  description                 text not null default '',
  enabled                     boolean not null default true,
  last_run_at                 timestamptz,
  last_run_status             text,
  last_run_duration_ms        int,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.cron_jobs enable row level security;

drop policy if exists "authenticated reads cron_jobs" on public.cron_jobs;
create policy "authenticated reads cron_jobs"
  on public.cron_jobs for select
  using (auth.role() = 'authenticated' or public.admin_caller_is_admin());

drop policy if exists "admins write cron_jobs" on public.cron_jobs;
create policy "admins write cron_jobs"
  on public.cron_jobs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.cron_runs (
  id                          uuid primary key default gen_random_uuid(),
  job_id                      text references public.cron_jobs(id) on delete set null,
  started_at                  timestamptz not null default now(),
  finished_at                 timestamptz,
  status                      text not null
                                check (status in ('running','success','error','timeout','disabled')),
  summary                     text,
  error                       text,
  triggered_by                text not null default 'cron'
                                check (triggered_by in ('cron','manual','webhook','test')),
  metadata                    jsonb not null default '{}'::jsonb
);

alter table public.cron_runs enable row level security;

drop policy if exists "admins read cron_runs" on public.cron_runs;
create policy "admins read cron_runs"
  on public.cron_runs for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write cron_runs" on public.cron_runs;
create policy "admins write cron_runs"
  on public.cron_runs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists cron_runs_job_idx on public.cron_runs(job_id, started_at desc);

-- 7. ───────────────── api_tokens ─────────────────
create table if not exists public.api_tokens (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  workspace_id                uuid references public.workspaces(id) on delete cascade,
  name                        text not null,
  token_hash                  text not null unique,
  prefix                      text not null,
  scopes                      jsonb not null default '[]'::jsonb,
  expires_at                  timestamptz,
  last_used_at                timestamptz,
  last_used_ip                text,
  created_at                  timestamptz not null default now(),
  revoked_at                  timestamptz
);

alter table public.api_tokens enable row level security;

drop policy if exists "users read own api_tokens" on public.api_tokens;
create policy "users read own api_tokens"
  on public.api_tokens for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());

drop policy if exists "admins write api_tokens" on public.api_tokens;
create policy "admins write api_tokens"
  on public.api_tokens for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists api_tokens_user_idx on public.api_tokens(user_id);

-- 8. ───────────────── admin_alerts + alert_events ─────────────────
create table if not exists public.admin_alerts (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  description                 text not null default '',
  condition_type              text not null
                                check (condition_type in ('signup_drop','webhook_failures','error_rate','cron_missed','low_credit','custom_query','agent_failures','storage_pct')),
  condition_params            jsonb not null default '{}'::jsonb,
  action_channels             jsonb not null default '[]'::jsonb,
  action_recipients           jsonb not null default '[]'::jsonb,
  cooldown_minutes            int not null default 30,
  enabled                     boolean not null default true,
  last_evaluated_at           timestamptz,
  last_triggered_at           timestamptz,
  trigger_count               int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references auth.users(id) on delete set null
);

alter table public.admin_alerts enable row level security;

drop policy if exists "admins read admin_alerts" on public.admin_alerts;
create policy "admins read admin_alerts"
  on public.admin_alerts for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write admin_alerts" on public.admin_alerts;
create policy "admins write admin_alerts"
  on public.admin_alerts for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.admin_alert_events (
  id                          uuid primary key default gen_random_uuid(),
  alert_id                    uuid references public.admin_alerts(id) on delete cascade,
  triggered_at                timestamptz not null default now(),
  summary                     text not null,
  payload                     jsonb not null default '{}'::jsonb,
  notified_channels           jsonb not null default '[]'::jsonb
);

alter table public.admin_alert_events enable row level security;

drop policy if exists "admins read alert events" on public.admin_alert_events;
create policy "admins read alert events"
  on public.admin_alert_events for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write alert events" on public.admin_alert_events;
create policy "admins write alert events"
  on public.admin_alert_events for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 9. ───────────────── per-user / per-workspace feature overrides ─────────────────
create table if not exists public.user_feature_overrides (
  user_id                     uuid not null references auth.users(id) on delete cascade,
  flag_key                    text not null references public.feature_flags(key) on delete cascade,
  enabled                     boolean not null,
  reason                      text,
  set_by                      uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  primary key (user_id, flag_key)
);

alter table public.user_feature_overrides enable row level security;

drop policy if exists "users read own feature overrides" on public.user_feature_overrides;
create policy "users read own feature overrides"
  on public.user_feature_overrides for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());

drop policy if exists "admins write user feature overrides" on public.user_feature_overrides;
create policy "admins write user feature overrides"
  on public.user_feature_overrides for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.workspace_feature_overrides (
  workspace_id                uuid not null references public.workspaces(id) on delete cascade,
  flag_key                    text not null references public.feature_flags(key) on delete cascade,
  enabled                     boolean not null,
  reason                      text,
  set_by                      uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  primary key (workspace_id, flag_key)
);

alter table public.workspace_feature_overrides enable row level security;

drop policy if exists "members read workspace feature overrides" on public.workspace_feature_overrides;
create policy "members read workspace feature overrides"
  on public.workspace_feature_overrides for select
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write workspace feature overrides" on public.workspace_feature_overrides;
create policy "admins write workspace feature overrides"
  on public.workspace_feature_overrides for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 10. ───────────────── extend feature_enabled() to consider overrides ─────────────────
create or replace function public.feature_enabled(
  flag_key text,
  uid uuid default auth.uid(),
  ws_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  flag record;
  bucket int;
  user_override boolean;
  ws_override boolean;
begin
  select * into flag from public.feature_flags where key = flag_key;
  if not found then return false; end if;
  if flag.enabled = false then return false; end if;

  -- Per-user explicit override wins above all
  if uid is not null then
    select enabled into user_override
      from public.user_feature_overrides
      where user_id = uid and flag_key = flag_key;
    if user_override is not null then return user_override; end if;
  end if;

  -- Per-workspace explicit override
  if ws_id is not null then
    select enabled into ws_override
      from public.workspace_feature_overrides
      where workspace_id = ws_id and flag_key = flag_key;
    if ws_override is not null then return ws_override; end if;
  end if;

  -- Bulk allowlist hit
  if uid is not null and exists (
    select 1 from jsonb_array_elements_text(flag.allowlist_user_ids) e where e = uid::text
  ) then return true; end if;
  if ws_id is not null and exists (
    select 1 from jsonb_array_elements_text(flag.allowlist_workspace_ids) e where e = ws_id::text
  ) then return true; end if;

  if flag.rollout = 'off' then return false; end if;
  if flag.rollout = 'on' then return true; end if;
  if flag.rollout = 'allowlist' then return false; end if;
  if flag.rollout = 'percent' then
    if uid is null then return false; end if;
    bucket := abs(hashtext(flag_key || ':' || uid::text)) % 100;
    return bucket < flag.rollout_percent;
  end if;

  return false;
end;
$$;

-- 11. ───────────────── helper RPCs ─────────────────

-- Look up which model id a call_kind should use.
create or replace function public.get_runtime_model(p_call_kind text)
returns table (model_id text, fallback_model_id text, temperature numeric, max_tokens int)
language sql
stable
security definer
set search_path = public
as $$
  select model_id, fallback_model_id, temperature, max_tokens
  from public.runtime_model_assignments
  where call_kind = p_call_kind;
$$;

grant execute on function public.get_runtime_model(text) to authenticated;

-- Convenience RPC for the cron-status endpoint to log a run.
create or replace function public.cron_run_record(
  p_job_id text,
  p_status text,
  p_summary text default null,
  p_duration_ms int default null,
  p_error text default null,
  p_triggered_by text default 'cron'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.cron_runs (job_id, finished_at, status, summary, duration_ms, error, triggered_by)
    values (p_job_id, now(), p_status, p_summary, p_duration_ms, p_error, p_triggered_by)
    returning id into new_id;

  update public.cron_jobs
    set last_run_at = now(),
        last_run_status = p_status,
        last_run_duration_ms = p_duration_ms,
        updated_at = now()
    where id = p_job_id;
  return new_id;
end;
$$;

grant execute on function public.cron_run_record(text, text, text, int, text, text) to authenticated, service_role;

-- API token validation — server-side helper. Hashes the provided token,
-- looks up an active row, returns the user_id + workspace_id + scopes if
-- valid. Returns null if invalid/expired/revoked.
create or replace function public.api_token_lookup(p_token_hash text)
returns table (token_id uuid, user_id uuid, workspace_id uuid, scopes jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select id as token_id, user_id, workspace_id, scopes
  from public.api_tokens
  where token_hash = p_token_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;
$$;

grant execute on function public.api_token_lookup(text) to anon, authenticated, service_role;

-- 12. ───────────────── updated_at touch triggers ─────────────────
drop trigger if exists touch_ai_skills on public.ai_skills;
create trigger touch_ai_skills before update on public.ai_skills
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_ai_models on public.ai_models;
create trigger touch_ai_models before update on public.ai_models
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_runtime_model_assignments on public.runtime_model_assignments;
create trigger touch_runtime_model_assignments before update on public.runtime_model_assignments
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_email_templates on public.email_templates;
create trigger touch_email_templates before update on public.email_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_webhook_endpoints on public.webhook_endpoints;
create trigger touch_webhook_endpoints before update on public.webhook_endpoints
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_cron_jobs on public.cron_jobs;
create trigger touch_cron_jobs before update on public.cron_jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_alerts on public.admin_alerts;
create trigger touch_admin_alerts before update on public.admin_alerts
  for each row execute function public.touch_updated_at();

-- 13. ───────────────── seed ai_models ─────────────────
insert into public.ai_models (id, provider, label, context_window, max_output_tokens, supports_vision, supports_thinking, supports_tools, cost_input_per_million, cost_output_per_million, status, capability_tier, sort_order)
values
  ('claude-opus-4-7',                'anthropic', 'Claude Opus 4.7',     200000,  64000, true, true,  true, 15.00, 75.00, 'live', 'flagship', 0),
  ('claude-sonnet-4-6',              'anthropic', 'Claude Sonnet 4.6',   200000,  64000, true, true,  true,  3.00, 15.00, 'live', 'balanced', 10),
  ('claude-haiku-4-5-20251001',      'anthropic', 'Claude Haiku 4.5',    200000,  16384, true, false, true,  1.00,  5.00, 'live', 'fast',     20),
  ('claude-haiku-4-5',               'anthropic', 'Claude Haiku 4.5 (alias)', 200000, 16384, true, false, true, 1.00, 5.00, 'live', 'fast', 21),
  ('claude-sonnet-4-5-20250929',     'anthropic', 'Claude Sonnet 4.5 (legacy)',200000, 64000, true, true,  true, 3.00, 15.00,'deprecated','balanced', 25),
  ('gpt-5',                          'openai',    'GPT-5',               400000,  16384, true, false, true,  5.00, 20.00, 'live', 'flagship', 5),
  ('gpt-5-mini',                     'openai',    'GPT-5 Mini',          400000,  16384, true, false, true,  0.50,  2.00, 'live', 'fast', 6),
  ('gpt-4o-mini',                    'openai',    'GPT-4o Mini (legacy)',128000,  16384, true, false, true,  0.15,  0.60, 'deprecated','fast', 28)
on conflict (id) do nothing;

-- 14. ───────────────── seed runtime_model_assignments ─────────────────
insert into public.runtime_model_assignments (call_kind, model_id, fallback_model_id, temperature, max_tokens)
values
  ('classifier',   'gpt-5-mini',                'claude-haiku-4-5-20251001', 0.0, 256),
  ('executor',     'claude-haiku-4-5-20251001', 'claude-sonnet-4-6',         1.0, 4096),
  ('orchestrator', 'claude-sonnet-4-6',         'claude-opus-4-7',           1.0, 8192),
  ('formatter',    'claude-haiku-4-5-20251001', null,                        0.7, 1024)
on conflict (call_kind) do update set
  model_id = excluded.model_id,
  fallback_model_id = excluded.fallback_model_id,
  temperature = excluded.temperature,
  max_tokens = excluded.max_tokens,
  updated_at = now();

-- 15. ───────────────── seed cron_jobs from current vercel.json ─────────────────
insert into public.cron_jobs (id, path, schedule, description, enabled)
values
  ('social-publish', '/api/cron/social-publish', '0 9 * * *',
   'Publishes scheduled social_posts rows whose scheduled_at has passed.', true)
on conflict (id) do nothing;

-- 16. ───────────────── seed email_templates from lib/email.ts ─────────────────
-- These are rough stubs — admin will edit body/subject per brand. The
-- actual HTML lives in lib/email-templates.ts (committed alongside) so
-- the seed just registers the keys.
insert into public.email_templates (key, display_name, description, category, role, subject, html, variables_json)
values
  ('welcome',
   'Welcome to Spacefield',
   'First-touch email after signup.',
   'transactional', 'hello',
   'Welcome to Space Field',
   '<p>Welcome — fill me in via the admin panel.</p>',
   '["name"]'::jsonb),
  ('workspace_invite',
   'Workspace invitation',
   'Sent when a user is invited to a workspace.',
   'transactional', 'invites',
   'You''ve been invited to {{workspaceName}}',
   '<p>You''ve been invited. Accept here: {{acceptUrl}}</p>',
   '["inviteeName","inviterName","workspaceName","role","acceptUrl"]'::jsonb),
  ('invite_accepted',
   'Invite accepted',
   'Notifies the inviter when their invite was accepted.',
   'notification', 'noreply',
   '{{acceptedBy}} joined {{workspaceName}}',
   '<p>{{acceptedBy}} joined {{workspaceName}}.</p>',
   '["inviterName","acceptedBy","workspaceName","role"]'::jsonb),
  ('contact_received',
   'Contact form auto-reply',
   'Auto-acknowledges contact form submissions.',
   'transactional', 'support',
   'We got your message',
   '<p>Thanks {{name}} — we''ll come back on {{topic}} shortly.</p>',
   '["name","topic"]'::jsonb),
  ('share_form_submitted',
   'Share form submission',
   'Sent to link creator when their form receives a submission.',
   'notification', 'noreply',
   'New form submission on {{linkSlug}}',
   '<p>New submission. Payload: <pre>{{payloadJson}}</pre></p>',
   '["linkSlug","payloadJson","linkUrl"]'::jsonb),
  ('share_quote_accepted',
   'Share quote accepted',
   'Sent to link creator when their quote is signed.',
   'notification', 'noreply',
   'Quote accepted by {{signerName}}',
   '<p>{{signerName}} ({{signerEmail}}) accepted your quote.</p>',
   '["signerName","signerEmail","signerCompany","linkSlug"]'::jsonb),
  ('share_booking_invitee',
   'Share booking confirmation (invitee)',
   'Sent to the invitee after they book a slot.',
   'transactional', 'noreply',
   'Your booking is confirmed',
   '<p>You''re booked for {{slotStart}} (timezone {{timezone}}).</p>',
   '["slotStart","timezone","hostName","cancelUrl"]'::jsonb),
  ('share_booking_host',
   'Share booking notification (host)',
   'Sent to the host when someone books a slot.',
   'notification', 'noreply',
   '{{inviteeName}} booked {{slotStart}}',
   '<p>{{inviteeName}} ({{inviteeEmail}}) booked {{slotStart}}.</p>',
   '["inviteeName","inviteeEmail","slotStart","linkSlug"]'::jsonb)
on conflict (key) do nothing;

-- 17. ───────────────── seed ai_skills from current ALL_SKILLS ─────────────────
insert into public.ai_skills (id, kind, display_name, description, system_fragment, status, handler_module, category, sort_order)
values
  ('workspace', 'code', 'Workspace',
   'List workspaces, switch active, see members, invite teammates.',
   'You can manage workspaces — list, view current, see members, invite teammates. Use list_workspaces to discover. Use invite_member to bring people in.',
   'live', 'lib/agent/skills/workspace', 'workspace', 0),
  ('crm.contacts', 'code', 'CRM — Contacts',
   'Full CRUD on contacts.',
   'You can manage CRM contacts. Use search_contacts before create_contact to avoid duplicates. Required: at least one of email or first_name+last_name.',
   'live', 'lib/agent/skills/crm-contacts', 'crm', 10),
  ('crm.companies', 'code', 'CRM — Companies',
   'Full CRUD on companies.',
   'You can manage CRM companies. Use search_companies before create_company to avoid duplicates. Required: name.',
   'live', 'lib/agent/skills/crm-companies', 'crm', 20),
  ('crm.deals', 'code', 'CRM — Deals',
   'Pipeline deals — create, move stages, close won/lost.',
   'You can manage pipeline deals: list, search, create, update, move stages, close won/lost. Use list_deals to discover state before mutating.',
   'live', 'lib/agent/skills/crm-deals', 'crm', 30),
  ('crm.leads', 'code', 'CRM — Leads',
   'Pre-qualified leads + convert to deal.',
   'You can manage leads. Convert leads to deals via convert_lead_to_deal — atomic two-step that creates a contact + deal and marks the lead converted.',
   'live', 'lib/agent/skills/crm-leads', 'crm', 40),
  ('crm.activities', 'code', 'CRM — Activities',
   'Tasks, calls, meetings, notes attached to records.',
   'You can manage activities (task/call/meeting/email/note). Activities can attach to a contact, company, deal, or lead.',
   'live', 'lib/agent/skills/crm-activities', 'crm', 50),
  ('files', 'code', 'Files',
   'File search + folder ops + soft-delete. No binary upload from chat.',
   'You can manage workspace files: search, see metadata, star/unstar, create/rename/delete folders, soft-delete files. You CANNOT receive file bytes — direct user to upload via the Files app.',
   'live', 'lib/agent/skills/files', 'files', 60),
  ('boards', 'code', 'Boards',
   'Notion-like boards with flexible JSONB cells.',
   'You can manage boards: list, see records, create/update records. Cells are JSONB — merged on update, not overwritten.',
   'live', 'lib/agent/skills/boards', 'boards', 70),
  ('apps', 'code', 'Apps & Tools',
   'Installed-app discovery + Spacefield catalog search.',
   'You can list installed apps for the active workspace, search the full Spacefield catalog, and report on Market Pulse data. Honor tool_availability when describing what users can install.',
   'live', 'lib/agent/skills/apps', 'apps', 80),
  ('meta', 'code', 'Meta',
   'Help, credit balance, about. Always available.',
   'You can give general help, report the user''s credit balance, and explain Spacefield. These are always available regardless of tier.',
   'live', 'lib/agent/skills/meta', 'meta', 90)
on conflict (id) do nothing;
