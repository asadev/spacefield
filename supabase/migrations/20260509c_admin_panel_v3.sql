-- ─────────────────────────────────────────────────────────────────────
-- Admin panel v3 — 2026-05-09 (round 3, post-laptop-restart)
--
-- Massive expansion of the platform-control plane. Every editable
-- knob a SaaS like Spacefield could conceivably want.
--
--  1. ai_providers              — Anthropic/OpenAI/Google/etc. API keys
--  2. ai_provider_health        — last ping result per provider
--  3. agent_tool_overrides      — per-agent override of a skill's tool
--  4. agent_workflows           — compose skills into multi-step flows
--  5. site_banners              — top-of-page announcements
--  6. push_campaigns            — mass push notification sends
--  7. push_subscriptions        — per-user push endpoints
--  8. maintenance_state         — global maintenance toggle
--  9. rate_limit_rules          — per-route/tier/user
-- 10. ip_rules                  — allow/block list
-- 11. security_policies         — global 2FA / session / password rules
-- 12. sso_configs               — per-workspace SAML/OAuth
-- 13. brand_configs             — per-workspace branding
-- 14. locales + locale_strings  — translation catalog
-- 15. coupons + coupon_redemptions — discount codes
-- 16. referral_program + referral_events — referrals
-- 17. content_moderation_rules  — banned words, thresholds
-- 18. moderation_queue          — flagged content
-- 19. eval_suites + eval_runs   — AI eval framework
-- 20. prompt_library            — reusable prompts with versions
-- 21. error_events              — Sentry-lite error tracking
-- 22. backup_snapshots          — backup metadata
-- 23. data_export_requests      — GDPR/compliance exports
-- 24. cohorts + cohort_users    — analytics cohorts
-- 25. funnels + funnel_events   — conversion funnels
-- 26. announcements             — internal "what's new" log
-- 27. integrations              — third-party integration registry
-- 28. webhook_subscriptions     — user-facing outgoing webhooks
-- ─────────────────────────────────────────────────────────────────────

-- 1. ai_providers
create table if not exists public.ai_providers (
  id              text primary key,
  display_name    text not null,
  base_url        text,
  api_key_env     text not null,
  api_key_set     boolean not null default false,
  status          text not null default 'live'
                    check (status in ('live','paused','disabled')),
  cost_quota_usd  numeric default 0,
  spent_usd       numeric not null default 0,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

alter table public.ai_providers enable row level security;
drop policy if exists "admins read providers" on public.ai_providers;
create policy "admins read providers" on public.ai_providers for select
  using (public.admin_caller_is_admin());
drop policy if exists "admins write providers" on public.ai_providers;
create policy "admins write providers" on public.ai_providers for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.ai_provider_health (
  provider_id   text references public.ai_providers(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  status        text not null,
  latency_ms    int,
  error         text,
  primary key (provider_id, checked_at)
);

alter table public.ai_provider_health enable row level security;
drop policy if exists "admins read provider_health" on public.ai_provider_health;
create policy "admins read provider_health" on public.ai_provider_health for select
  using (public.admin_caller_is_admin());
drop policy if exists "admins write provider_health" on public.ai_provider_health;
create policy "admins write provider_health" on public.ai_provider_health for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- Seed standard providers
insert into public.ai_providers (id, display_name, base_url, api_key_env)
values
  ('anthropic', 'Anthropic Claude', 'https://api.anthropic.com', 'ANTHROPIC_API_KEY'),
  ('openai',    'OpenAI',           'https://api.openai.com',    'OPENAI_API_KEY'),
  ('google',    'Google Gemini',    'https://generativelanguage.googleapis.com', 'GOOGLE_API_KEY'),
  ('xai',       'xAI Grok',         'https://api.x.ai',          'XAI_API_KEY'),
  ('mistral',   'Mistral',          'https://api.mistral.ai',    'MISTRAL_API_KEY'),
  ('groq',      'Groq',             'https://api.groq.com',      'GROQ_API_KEY')
on conflict (id) do nothing;

-- 2. agent_tool_overrides — per-agent override of a skill's tool
create table if not exists public.agent_tool_overrides (
  agent_id              text references public.ai_agents(id) on delete cascade,
  skill_id              text not null,
  tool_name             text not null,
  override_description  text,
  override_input_schema jsonb,
  read_only_override    boolean,
  requires_confirmation_override boolean,
  enabled               boolean not null default true,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null,
  primary key (agent_id, skill_id, tool_name)
);

alter table public.agent_tool_overrides enable row level security;
drop policy if exists "admins all on agent_tool_overrides" on public.agent_tool_overrides;
create policy "admins all on agent_tool_overrides" on public.agent_tool_overrides for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 3. agent_workflows — compose skills into multi-step flows
create table if not exists public.agent_workflows (
  id              text primary key,
  display_name    text not null,
  description     text not null default '',
  steps           jsonb not null default '[]'::jsonb,
  trigger_kind    text not null default 'manual'
                    check (trigger_kind in ('manual','event','cron')),
  trigger_config  jsonb not null default '{}'::jsonb,
  status          text not null default 'draft'
                    check (status in ('live','draft','disabled')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
alter table public.agent_workflows enable row level security;
drop policy if exists "admins all on agent_workflows" on public.agent_workflows;
create policy "admins all on agent_workflows" on public.agent_workflows for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 4. site_banners
create table if not exists public.site_banners (
  id            uuid primary key default gen_random_uuid(),
  message       text not null,
  cta_label     text,
  cta_href      text,
  variant       text not null default 'info'
                  check (variant in ('info','warning','success','error')),
  audience      text not null default 'all'
                  check (audience in ('all','authenticated','tier','allowlist')),
  audience_tiers jsonb not null default '[]'::jsonb,
  audience_user_ids jsonb not null default '[]'::jsonb,
  starts_at     timestamptz,
  ends_at       timestamptz,
  enabled       boolean not null default true,
  dismissible   boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.site_banners enable row level security;
drop policy if exists "anyone reads active banners" on public.site_banners;
create policy "anyone reads active banners" on public.site_banners for select
  using (
    enabled = true
    or public.admin_caller_is_admin()
  );
drop policy if exists "admins write banners" on public.site_banners;
create policy "admins write banners" on public.site_banners for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 5. push_campaigns + push_subscriptions
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "users own push_subs" on public.push_subscriptions;
create policy "users own push_subs" on public.push_subscriptions for all
  using (user_id = auth.uid() or public.admin_caller_is_admin())
  with check (user_id = auth.uid() or public.admin_caller_is_admin());

create table if not exists public.push_campaigns (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  url           text,
  audience      text not null default 'all'
                  check (audience in ('all','tier','allowlist','workspace')),
  audience_tiers jsonb not null default '[]'::jsonb,
  audience_user_ids jsonb not null default '[]'::jsonb,
  audience_workspace_ids jsonb not null default '[]'::jsonb,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  status        text not null default 'draft'
                  check (status in ('draft','scheduled','sending','sent','failed')),
  total_targets int not null default 0,
  total_sent    int not null default 0,
  total_failed  int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.push_campaigns enable row level security;
drop policy if exists "admins all on push_campaigns" on public.push_campaigns;
create policy "admins all on push_campaigns" on public.push_campaigns for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 6. maintenance_state (singleton row)
create table if not exists public.maintenance_state (
  id            int primary key default 1 check (id = 1),
  enabled       boolean not null default false,
  message       text not null default '',
  read_only     boolean not null default false,
  allowlist_user_ids jsonb not null default '[]'::jsonb,
  starts_at     timestamptz,
  ends_at       timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.maintenance_state enable row level security;
drop policy if exists "anyone reads maintenance" on public.maintenance_state;
create policy "anyone reads maintenance" on public.maintenance_state for select
  using (true);
drop policy if exists "admins write maintenance" on public.maintenance_state;
create policy "admins write maintenance" on public.maintenance_state for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

insert into public.maintenance_state (id, enabled, message)
values (1, false, '') on conflict (id) do nothing;

-- 7. rate_limit_rules
create table if not exists public.rate_limit_rules (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('global','tier','user','workspace','route')),
  scope_value   text,
  route_pattern text,
  limit_count   int not null,
  window_sec    int not null default 60,
  burst_count   int,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.rate_limit_rules enable row level security;
drop policy if exists "admins all on rate_limit_rules" on public.rate_limit_rules;
create policy "admins all on rate_limit_rules" on public.rate_limit_rules for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 8. ip_rules
create table if not exists public.ip_rules (
  id            uuid primary key default gen_random_uuid(),
  cidr          text not null,
  action        text not null check (action in ('allow','block')),
  reason        text,
  expires_at    timestamptz,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.ip_rules enable row level security;
drop policy if exists "admins all on ip_rules" on public.ip_rules;
create policy "admins all on ip_rules" on public.ip_rules for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 9. security_policies (singleton)
create table if not exists public.security_policies (
  id                       int primary key default 1 check (id = 1),
  enforce_2fa              boolean not null default false,
  enforce_2fa_for_admins   boolean not null default true,
  session_timeout_minutes  int not null default 1440,
  password_min_length      int not null default 8,
  password_require_uppercase boolean not null default false,
  password_require_number  boolean not null default true,
  password_require_symbol  boolean not null default false,
  max_login_attempts       int not null default 5,
  lockout_duration_minutes int not null default 30,
  allow_sso_only           boolean not null default false,
  metadata                 jsonb not null default '{}'::jsonb,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users(id) on delete set null
);
alter table public.security_policies enable row level security;
drop policy if exists "anyone reads security policies" on public.security_policies;
create policy "anyone reads security policies" on public.security_policies for select
  using (auth.role() = 'authenticated');
drop policy if exists "admins write security policies" on public.security_policies;
create policy "admins write security policies" on public.security_policies for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

insert into public.security_policies (id) values (1) on conflict (id) do nothing;

-- 10. sso_configs
create table if not exists public.sso_configs (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade,
  protocol            text not null check (protocol in ('saml','oidc','google','microsoft')),
  display_name        text not null,
  entity_id           text,
  sso_url             text,
  certificate         text,
  client_id           text,
  client_secret_env   text,
  metadata_xml        text,
  status              text not null default 'pending'
                        check (status in ('pending','active','disabled','failed')),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);
alter table public.sso_configs enable row level security;
drop policy if exists "admins all on sso_configs" on public.sso_configs;
create policy "admins all on sso_configs" on public.sso_configs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 11. brand_configs (per-workspace overrides; null workspace_id = global)
create table if not exists public.brand_configs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references public.workspaces(id) on delete cascade,
  brand_name        text,
  logo_url          text,
  logo_dark_url     text,
  favicon_url       text,
  primary_color     text,
  accent_color      text,
  font_family       text,
  email_footer_html text,
  custom_css        text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  unique (workspace_id)
);
alter table public.brand_configs enable row level security;
drop policy if exists "anyone reads brand" on public.brand_configs;
create policy "anyone reads brand" on public.brand_configs for select
  using (true);
drop policy if exists "admins write brand" on public.brand_configs;
create policy "admins write brand" on public.brand_configs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 12. locales + locale_strings
create table if not exists public.locales (
  code        text primary key,
  display_name text not null,
  enabled     boolean not null default true,
  is_default  boolean not null default false,
  rtl         boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.locales enable row level security;
drop policy if exists "anyone reads locales" on public.locales;
create policy "anyone reads locales" on public.locales for select using (true);
drop policy if exists "admins write locales" on public.locales;
create policy "admins write locales" on public.locales for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

insert into public.locales (code, display_name, enabled, is_default)
values
  ('en', 'English', true, true),
  ('ar', 'Arabic',  false, false),
  ('ur', 'Urdu',    false, false)
on conflict (code) do nothing;

create table if not exists public.locale_strings (
  locale_code text references public.locales(code) on delete cascade,
  string_key  text not null,
  value       text not null,
  context     text,
  updated_at  timestamptz not null default now(),
  primary key (locale_code, string_key)
);
alter table public.locale_strings enable row level security;
drop policy if exists "anyone reads locale_strings" on public.locale_strings;
create policy "anyone reads locale_strings" on public.locale_strings for select using (true);
drop policy if exists "admins write locale_strings" on public.locale_strings;
create policy "admins write locale_strings" on public.locale_strings for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 13. coupons + redemptions
create table if not exists public.coupons (
  code              text primary key,
  description       text not null default '',
  kind              text not null check (kind in ('percent','fixed','tier_upgrade','free_months')),
  value             numeric not null default 0,
  applies_to_tiers  jsonb not null default '[]'::jsonb,
  max_redemptions   int,
  redemption_count  int not null default 0,
  per_user_limit    int default 1,
  starts_at         timestamptz,
  ends_at           timestamptz,
  enabled           boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
alter table public.coupons enable row level security;
drop policy if exists "admins all on coupons" on public.coupons;
create policy "admins all on coupons" on public.coupons for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_code text references public.coupons(code) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
);
alter table public.coupon_redemptions enable row level security;
drop policy if exists "admins read redemptions" on public.coupon_redemptions;
create policy "admins read redemptions" on public.coupon_redemptions for select
  using (public.admin_caller_is_admin() or user_id = auth.uid());
drop policy if exists "admins write redemptions" on public.coupon_redemptions;
create policy "admins write redemptions" on public.coupon_redemptions for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 14. content moderation
create table if not exists public.moderation_rules (
  id            uuid primary key default gen_random_uuid(),
  rule_kind     text not null check (rule_kind in ('banned_word','regex','threshold','length')),
  pattern       text not null,
  action        text not null check (action in ('block','flag','review')),
  applies_to    text not null check (applies_to in ('chat','crm','social','toshare','any')),
  severity      int not null default 1 check (severity between 1 and 5),
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.moderation_rules enable row level security;
drop policy if exists "admins all moderation_rules" on public.moderation_rules;
create policy "admins all moderation_rules" on public.moderation_rules for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.moderation_queue (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  source_id     text,
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  content       text not null,
  rule_id       uuid references public.moderation_rules(id) on delete set null,
  severity      int not null default 1,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','escalated')),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);
alter table public.moderation_queue enable row level security;
drop policy if exists "admins all moderation_queue" on public.moderation_queue;
create policy "admins all moderation_queue" on public.moderation_queue for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 15. eval suites
create table if not exists public.eval_suites (
  id              text primary key,
  display_name    text not null,
  description     text not null default '',
  cases           jsonb not null default '[]'::jsonb,
  target_kind     text not null check (target_kind in ('agent','skill','workflow')),
  target_id       text,
  scoring_method  text not null default 'exact'
                    check (scoring_method in ('exact','contains','regex','llm_judge','custom')),
  enabled         boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
alter table public.eval_suites enable row level security;
drop policy if exists "admins all eval_suites" on public.eval_suites;
create policy "admins all eval_suites" on public.eval_suites for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.eval_runs (
  id              uuid primary key default gen_random_uuid(),
  suite_id        text references public.eval_suites(id) on delete cascade,
  triggered_by    uuid references auth.users(id) on delete set null,
  total_cases     int not null default 0,
  passed_cases    int not null default 0,
  failed_cases    int not null default 0,
  errored_cases   int not null default 0,
  duration_ms     int,
  status          text not null default 'running'
                    check (status in ('running','completed','failed','cancelled')),
  results         jsonb not null default '[]'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
alter table public.eval_runs enable row level security;
drop policy if exists "admins all eval_runs" on public.eval_runs;
create policy "admins all eval_runs" on public.eval_runs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 16. prompt library
create table if not exists public.prompt_library (
  id              text primary key,
  display_name    text not null,
  description     text not null default '',
  category        text not null default '',
  tags            jsonb not null default '[]'::jsonb,
  current_version int not null default 1,
  status          text not null default 'live'
                    check (status in ('live','draft','archived')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
alter table public.prompt_library enable row level security;
drop policy if exists "anyone reads live prompts" on public.prompt_library;
create policy "anyone reads live prompts" on public.prompt_library for select
  using (status = 'live' or public.admin_caller_is_admin());
drop policy if exists "admins write prompts" on public.prompt_library;
create policy "admins write prompts" on public.prompt_library for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.prompt_versions (
  prompt_id       text references public.prompt_library(id) on delete cascade,
  version         int not null,
  body            text not null,
  variables       jsonb not null default '[]'::jsonb,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (prompt_id, version)
);
alter table public.prompt_versions enable row level security;
drop policy if exists "anyone reads prompt versions" on public.prompt_versions;
create policy "anyone reads prompt versions" on public.prompt_versions for select using (true);
drop policy if exists "admins write prompt versions" on public.prompt_versions;
create policy "admins write prompt versions" on public.prompt_versions for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 17. error events
create table if not exists public.error_events (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  level         text not null default 'error'
                  check (level in ('debug','info','warning','error','fatal')),
  source        text,
  message       text not null,
  fingerprint   text,
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  request_id    text,
  url           text,
  user_agent    text,
  stack         text,
  context       jsonb not null default '{}'::jsonb,
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id) on delete set null
);
alter table public.error_events enable row level security;
drop policy if exists "admins all error_events" on public.error_events;
create policy "admins all error_events" on public.error_events for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists error_events_fingerprint_idx
  on public.error_events (fingerprint, occurred_at desc);

-- 18. backup snapshots (metadata only — actual data lives in storage)
create table if not exists public.backup_snapshots (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'manual'
                  check (kind in ('manual','scheduled','pre_migration')),
  scope         text not null default 'full'
                  check (scope in ('full','workspace','table')),
  scope_target  text,
  storage_url   text,
  size_bytes    bigint,
  status        text not null default 'pending'
                  check (status in ('pending','running','completed','failed','restored')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  triggered_by  uuid references auth.users(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb
);
alter table public.backup_snapshots enable row level security;
drop policy if exists "admins all backup_snapshots" on public.backup_snapshots;
create policy "admins all backup_snapshots" on public.backup_snapshots for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 19. data export requests
create table if not exists public.data_export_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  kind          text not null default 'gdpr_export'
                  check (kind in ('gdpr_export','deletion','workspace_export')),
  status        text not null default 'pending'
                  check (status in ('pending','running','ready','expired','failed')),
  download_url  text,
  expires_at    timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table public.data_export_requests enable row level security;
drop policy if exists "users see own + admin all" on public.data_export_requests;
create policy "users see own + admin all" on public.data_export_requests for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "admins write export reqs" on public.data_export_requests;
create policy "admins write export reqs" on public.data_export_requests for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 20. cohorts + funnels
create table if not exists public.cohorts (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  definition    jsonb not null default '{}'::jsonb,
  user_count    int not null default 0,
  last_computed_at timestamptz,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.cohorts enable row level security;
drop policy if exists "admins all cohorts" on public.cohorts;
create policy "admins all cohorts" on public.cohorts for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.cohort_users (
  cohort_id text references public.cohorts(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
alter table public.cohort_users enable row level security;
drop policy if exists "admins all cohort_users" on public.cohort_users;
create policy "admins all cohort_users" on public.cohort_users for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.funnels (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  steps         jsonb not null default '[]'::jsonb,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.funnels enable row level security;
drop policy if exists "admins all funnels" on public.funnels;
create policy "admins all funnels" on public.funnels for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.funnel_events (
  id          uuid primary key default gen_random_uuid(),
  funnel_id   text references public.funnels(id) on delete cascade,
  step_index  int not null,
  user_id     uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
);
alter table public.funnel_events enable row level security;
drop policy if exists "admins read funnel_events" on public.funnel_events;
create policy "admins read funnel_events" on public.funnel_events for select
  using (public.admin_caller_is_admin());
drop policy if exists "anyone insert funnel events" on public.funnel_events;
create policy "anyone insert funnel events" on public.funnel_events for insert
  with check (auth.role() = 'authenticated');

-- 21. announcements (internal "what's new")
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  category      text not null default 'product'
                  check (category in ('product','platform','security','outage','marketing')),
  audience      text not null default 'all'
                  check (audience in ('all','admin','tier','allowlist')),
  audience_tiers jsonb not null default '[]'::jsonb,
  audience_user_ids jsonb not null default '[]'::jsonb,
  pinned        boolean not null default false,
  published_at  timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.announcements enable row level security;
drop policy if exists "anyone reads published announcements" on public.announcements;
create policy "anyone reads published announcements" on public.announcements for select
  using (
    published_at is not null and published_at <= now()
    or public.admin_caller_is_admin()
  );
drop policy if exists "admins write announcements" on public.announcements;
create policy "admins write announcements" on public.announcements for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 22. integrations registry
create table if not exists public.integrations (
  id            text primary key,
  display_name  text not null,
  category      text not null,
  description   text not null default '',
  logo_url      text,
  homepage_url  text,
  oauth_config  jsonb,
  status        text not null default 'available'
                  check (status in ('available','beta','disabled','deprecated')),
  required_env  jsonb not null default '[]'::jsonb,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);
alter table public.integrations enable row level security;
drop policy if exists "anyone reads enabled integrations" on public.integrations;
create policy "anyone reads enabled integrations" on public.integrations for select
  using (enabled = true or public.admin_caller_is_admin());
drop policy if exists "admins write integrations" on public.integrations;
create policy "admins write integrations" on public.integrations for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

insert into public.integrations (id, display_name, category, status)
values
  ('zapier',     'Zapier',          'automation',   'available'),
  ('slack',      'Slack',           'communication','available'),
  ('hubspot',    'HubSpot',         'crm',          'available'),
  ('salesforce', 'Salesforce',      'crm',          'beta'),
  ('intercom',   'Intercom',        'support',      'available'),
  ('mailchimp',  'Mailchimp',       'email',        'available'),
  ('stripe',     'Stripe',          'payments',     'available'),
  ('quickbooks', 'QuickBooks',      'accounting',   'beta'),
  ('googledrive','Google Drive',    'files',        'available'),
  ('dropbox',    'Dropbox',         'files',        'available'),
  ('notion',     'Notion',          'productivity', 'available')
on conflict (id) do nothing;

-- 23. webhook_subscriptions (user-facing outgoing — for users to subscribe their CRM/Zapier)
create table if not exists public.webhook_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  url           text not null,
  events        jsonb not null default '[]'::jsonb,
  secret        text,
  enabled       boolean not null default true,
  description   text,
  last_delivery_at timestamptz,
  last_delivery_status text,
  failure_count int not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.webhook_subscriptions enable row level security;
drop policy if exists "members read subs" on public.webhook_subscriptions;
create policy "members read subs" on public.webhook_subscriptions for select
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );
drop policy if exists "admins write subs" on public.webhook_subscriptions;
create policy "admins write subs" on public.webhook_subscriptions for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- ─── triggers ───
drop trigger if exists touch_ai_providers on public.ai_providers;
create trigger touch_ai_providers before update on public.ai_providers
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_agent_tool_overrides on public.agent_tool_overrides;
create trigger touch_agent_tool_overrides before update on public.agent_tool_overrides
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_agent_workflows on public.agent_workflows;
create trigger touch_agent_workflows before update on public.agent_workflows
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_site_banners on public.site_banners;
create trigger touch_site_banners before update on public.site_banners
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_push_campaigns on public.push_campaigns;
create trigger touch_push_campaigns before update on public.push_campaigns
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_brand_configs on public.brand_configs;
create trigger touch_brand_configs before update on public.brand_configs
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_coupons on public.coupons;
create trigger touch_coupons before update on public.coupons
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_moderation_rules on public.moderation_rules;
create trigger touch_moderation_rules before update on public.moderation_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_eval_suites on public.eval_suites;
create trigger touch_eval_suites before update on public.eval_suites
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_prompt_library on public.prompt_library;
create trigger touch_prompt_library before update on public.prompt_library
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_announcements on public.announcements;
create trigger touch_announcements before update on public.announcements
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_integrations on public.integrations;
create trigger touch_integrations before update on public.integrations
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_rate_limit_rules on public.rate_limit_rules;
create trigger touch_rate_limit_rules before update on public.rate_limit_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_ip_rules on public.ip_rules;
create trigger touch_ip_rules before update on public.ip_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_webhook_subscriptions on public.webhook_subscriptions;
create trigger touch_webhook_subscriptions before update on public.webhook_subscriptions
  for each row execute function public.touch_updated_at();
