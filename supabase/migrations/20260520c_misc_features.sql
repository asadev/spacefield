-- 2026-05-20c — Agent C3 feature lib: api-token expiry tracking, user
-- feedback inbox, prompt A/B assignment ledger, AI usage overages.
--
-- All additions are additive — no existing column drops, no policy
-- replacements, no breaking changes. Rollback steps are documented
-- inline below each block (kept commented so a stray re-run can't
-- undo the table).
--
-- Why one big file rather than four small ones: keeps the migration
-- pointer count down (Supabase migration table grows linearly), and
-- these four features are all tiny + co-deployed by Agent C3.

-- ─────────────────────────────────────────────────────────────────
-- 1. api_tokens.expiry_reminder_sent_at
-- ─────────────────────────────────────────────────────────────────
-- `expires_at` and `last_used_at` already exist on api_tokens (see
-- 20260509b_admin_panel_v2.sql). The /api/cron/api-token-reminder
-- route emails users when their token is ≤14 days from expiry. To
-- avoid spamming the same user every day for two weeks, the cron
-- stamps `expiry_reminder_sent_at` after the first email and skips
-- tokens that already have a stamp within the last ~16 days.

alter table public.api_tokens
  add column if not exists expiry_reminder_sent_at timestamptz;

create index if not exists api_tokens_expiring_soon_idx
  on public.api_tokens (expires_at)
  where revoked_at is null and expires_at is not null;

-- rollback:
--   drop index if exists public.api_tokens_expiring_soon_idx;
--   alter table public.api_tokens drop column if exists expiry_reminder_sent_at;


-- ─────────────────────────────────────────────────────────────────
-- 2. user_feedback
-- ─────────────────────────────────────────────────────────────────
-- Backs the <FeedbackButton /> in the admin chrome. Submitters insert
-- one row per click; admins triage via /admin/feedback (future page).
-- Keep the columns boring — text + optional url + optional metadata.
--
-- We do NOT add an FK to auth.users on user_id because anonymous (not
-- signed-in) submissions are allowed: the column is nullable. Storage
-- of email is opt-in and only persisted when the submitter explicitly
-- enters it (the button auto-fills from session when possible).

create table if not exists public.user_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  email         text,
  url           text,        -- the page the user was on
  message       text not null,
  user_agent    text,
  status        text not null default 'open'
                  check (status in ('open','triaged','resolved','wontfix')),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists user_feedback_created_idx
  on public.user_feedback (created_at desc);
create index if not exists user_feedback_status_idx
  on public.user_feedback (status, created_at desc);
create index if not exists user_feedback_user_idx
  on public.user_feedback (user_id, created_at desc)
  where user_id is not null;

alter table public.user_feedback enable row level security;

-- Authenticated users can insert their own feedback. Anonymous insert
-- is permitted via the service-role path in /api/feedback so we don't
-- need an anon-insert policy on the table itself.
drop policy if exists "user_feedback insert own" on public.user_feedback;
create policy "user_feedback insert own"
  on public.user_feedback for insert
  with check (
    auth.uid() is null
    or user_id is null
    or user_id = auth.uid()
  );

-- Submitters can read their own rows. Admins read everything.
drop policy if exists "user_feedback read own" on public.user_feedback;
create policy "user_feedback read own"
  on public.user_feedback for select
  using (
    (user_id is not null and user_id = auth.uid())
    or public.admin_caller_is_admin()
  );

-- Admins update status; submitters can't edit after submit.
drop policy if exists "user_feedback admin update" on public.user_feedback;
create policy "user_feedback admin update"
  on public.user_feedback for update
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- rollback:
--   drop policy if exists "user_feedback admin update" on public.user_feedback;
--   drop policy if exists "user_feedback read own" on public.user_feedback;
--   drop policy if exists "user_feedback insert own" on public.user_feedback;
--   drop index if exists public.user_feedback_user_idx;
--   drop index if exists public.user_feedback_status_idx;
--   drop index if exists public.user_feedback_created_idx;
--   drop table if exists public.user_feedback;


-- ─────────────────────────────────────────────────────────────────
-- 3. prompt_ab_assignments
-- ─────────────────────────────────────────────────────────────────
-- Records the (user, skill) → variant mapping picked by
-- lib/agent/runtime/ab.ts. The assignment is deterministic from
-- a hash of (user_id, skill_id, salt) so the same user always sees
-- the same variant across requests — we still log it because we want
-- to be able to slice metrics (latency, satisfaction, error rate)
-- by variant for the experiment readout.
--
-- One row per (user, skill, run-of-experiment). The unique index on
-- (user_id, skill_id) means a user only ever has one assignment per
-- skill; the cron / admin can drop and re-roll the table when they
-- start a new experiment cycle.

create table if not exists public.prompt_ab_assignments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  skill_id      text not null,
  variant       text not null check (variant in ('A','B','C')),
  experiment_id text,
  assigned_at   timestamptz not null default now()
);

create unique index if not exists prompt_ab_assignments_user_skill_uk
  on public.prompt_ab_assignments (user_id, skill_id);

create index if not exists prompt_ab_assignments_skill_variant_idx
  on public.prompt_ab_assignments (skill_id, variant);

alter table public.prompt_ab_assignments enable row level security;

-- Read-only for the assigned user (so they can see their own bucket
-- via /api/me if we ever expose it). Admin reads everything via
-- service-role + admin_caller_is_admin policy bypass.
drop policy if exists "prompt_ab_assignments read own"
  on public.prompt_ab_assignments;
create policy "prompt_ab_assignments read own"
  on public.prompt_ab_assignments for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());

-- No insert/update policies — only the service-role writer (runtime).

-- rollback:
--   drop policy if exists "prompt_ab_assignments read own" on public.prompt_ab_assignments;
--   drop index if exists public.prompt_ab_assignments_skill_variant_idx;
--   drop index if exists public.prompt_ab_assignments_user_skill_uk;
--   drop table if exists public.prompt_ab_assignments;


-- ─────────────────────────────────────────────────────────────────
-- 4. ai_usage_overages
-- ─────────────────────────────────────────────────────────────────
-- Records every overage charge — i.e. every AI call that pushed a
-- workspace's monthly spend ABOVE its tier budget. Each row is one
-- "you went over by $X.YZ" data point. Sum by workspace_id +
-- billing_month to compute the overage line item billed at the end
-- of the month.
--
-- The post-call recordAiCall path inserts at most one row per AI
-- call — the worker computes the per-call USD that fell into the
-- over-budget bucket and persists it here.

create table if not exists public.ai_usage_overages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  ai_call_id      uuid,   -- soft pointer; ai_calls has no PK FK target yet
  tier            text not null,
  budget_usd      numeric(12,4) not null,
  used_before_usd numeric(12,4) not null,
  call_cost_usd   numeric(12,6) not null,
  overage_usd     numeric(12,6) not null check (overage_usd > 0),
  billing_month   date not null default date_trunc('month', now())::date,
  created_at      timestamptz not null default now()
);

create index if not exists ai_usage_overages_ws_month_idx
  on public.ai_usage_overages (workspace_id, billing_month desc);
create index if not exists ai_usage_overages_month_idx
  on public.ai_usage_overages (billing_month desc);

alter table public.ai_usage_overages enable row level security;

-- Workspace members can read their own workspace's overages so the
-- billing settings page can show "You went over by $X this month".
drop policy if exists "ai_usage_overages read by workspace"
  on public.ai_usage_overages;
create policy "ai_usage_overages read by workspace"
  on public.ai_usage_overages for select
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );

-- No insert/update policies — only the service-role writer (runtime).

-- rollback:
--   drop policy if exists "ai_usage_overages read by workspace" on public.ai_usage_overages;
--   drop index if exists public.ai_usage_overages_month_idx;
--   drop index if exists public.ai_usage_overages_ws_month_idx;
--   drop table if exists public.ai_usage_overages;
