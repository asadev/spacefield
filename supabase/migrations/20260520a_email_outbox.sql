-- ─────────────────────────────────────────────────────────────────────
-- 20260520a_email_outbox.sql
--
-- Wave-4 Z3: provider-agnostic email sending.
--
-- `public.email_outbox` is the durable store of emails that should
-- eventually go out. Two roles:
--
--   1. **No provider configured** — when neither RESEND_API_KEY nor
--      POSTMARK_API_KEY is set (e.g. local dev, ephemeral preview, or
--      production before the provider is wired), `lib/email/send.ts`
--      writes the would-be email here. A later relay (or human eyes)
--      can replay them once a provider is live.
--
--   2. **Provider call failed** — if the HTTP POST to Resend/Postmark
--      throws or returns non-2xx, we still persist the row so we don't
--      lose the message. The `attempts` + `error` columns are how a
--      future retry job knows to back off.
--
-- RLS: service-role only. There's no user-facing UI for the outbox —
-- it's an operational queue. The admin panel will eventually read it
-- via the service-role client.
--
-- Naming note: we already have `event_outbox` (general-purpose
-- transactional outbox from 20260519a). `email_outbox` is kept
-- separate because the columns are email-shaped (to/subject/html/text)
-- and the retry/backoff semantics are different — emails can sit for
-- days waiting on DNS verification before a real send.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.email_outbox (
  id            uuid        primary key default gen_random_uuid(),
  -- Recipient. Single address per row — we fan-out at the call site
  -- so each recipient is individually trackable / retryable.
  "to"          text        not null,
  subject       text        not null,
  html          text        not null,
  text          text        not null default '',

  -- Logical email kind, used by the relay to pick the right "from"
  -- sender role and to slice metrics. Examples:
  --   'suspicious-login', 'welcome', 'task-assigned',
  --   'weekly-digest', 'account-deletion-confirm'.
  kind          text        not null,

  -- Optional workspace scope. Useful when a workspace owns its own
  -- sending domain — the relay can route through that domain instead
  -- of the platform default.
  workspace_id  uuid        null,

  -- Lifecycle.
  status        text        not null default 'queued'
                check (status in ('queued','sending','sent','failed','dead')),
  attempts      integer     not null default 0,
  provider      text        null,                -- 'resend' | 'postmark' | null
  message_id    text        null,                -- provider-returned id once sent
  error         text        null,                -- last error message if any

  created_at    timestamptz not null default now(),
  sent_at       timestamptz null
);

-- Fast pickup for the relay: queued+failed rows ordered by age.
create index if not exists email_outbox_pickup_idx
  on public.email_outbox (created_at)
  where status in ('queued','failed');

-- Lookup by kind for ops dashboards / debugging.
create index if not exists email_outbox_kind_idx
  on public.email_outbox (kind, created_at desc);

-- Workspace-scoped queries (rare, but cheap to index).
create index if not exists email_outbox_workspace_idx
  on public.email_outbox (workspace_id, created_at desc)
  where workspace_id is not null;

alter table public.email_outbox enable row level security;

-- Default-deny. No `to authenticated` policies exist — only the
-- service-role client (which bypasses RLS) can read/write.
-- Defensively drop any pre-existing permissive policies in case
-- this migration is re-run after manual edits.
drop policy if exists email_outbox_no_user_access on public.email_outbox;
create policy email_outbox_no_user_access on public.email_outbox
  for all to authenticated
  using (false)
  with check (false);


-- ─────────────────────────────────────────────────────────────────────
-- Extension to public.notification_prefs (built on top of 20260517c).
--
-- The original notification_prefs columns are "should I notify the
-- user at all". The new `email_*` columns are "and should the
-- notification ALSO go out via email" — i.e. an email-channel
-- toggle that's independent of the in-app toggle. A user who wants
-- task-assigned notifications in-app but not by email flips
-- email_task_assigned off while leaving task_assigned on.
--
-- Account-state events (deletion confirm, etc.) deliberately do NOT
-- have a toggle here — those always send regardless.
-- ─────────────────────────────────────────────────────────────────────

alter table public.notification_prefs
  add column if not exists email_welcome           boolean not null default true,
  add column if not exists email_suspicious_login  boolean not null default true,
  add column if not exists email_task_assigned     boolean not null default true,
  add column if not exists email_weekly_digest     boolean not null default false,
  add column if not exists email_marketing_channel boolean not null default false;

-- Note: a column called `email_marketing` already exists. The new
-- `email_marketing_channel` is intentionally distinct — the former
-- is the "do you want marketing at all" master toggle, the latter is
-- specifically the email-delivery toggle that the future preference
-- center exposes. They're kept apart so a future in-app marketing
-- surface can be on while email marketing is off.

comment on column public.notification_prefs.email_welcome is
  'Send welcome email on signup. Default true.';
comment on column public.notification_prefs.email_suspicious_login is
  'Send email when a new device sign-in is detected. Default true.';
comment on column public.notification_prefs.email_task_assigned is
  'Send email when a task is assigned. Default true.';
comment on column public.notification_prefs.email_weekly_digest is
  'Send weekly summary by email. Default false (explicit opt-in).';
comment on column public.notification_prefs.email_marketing_channel is
  'Send product-update / marketing emails. Default false.';


-- ─────────────────────────────────────────────────────────────────────
-- Extension to public.login_events: track email-side delivery for the
-- suspicious-login alert separately from the in-app `notified_at`.
--
-- The cron's in-app pass and email pass are different writes (the
-- in-app one is owned by lib/security/suspicious-login.ts, the
-- email one by the route handler) and we want to be able to bail out
-- of either without blocking the other. A NULL `email_sent_at` means
-- the email pass hasn't fired yet for that row.
-- ─────────────────────────────────────────────────────────────────────

alter table public.login_events
  add column if not exists email_sent_at timestamptz null;

create index if not exists login_events_pending_emails_idx
  on public.login_events (occurred_at)
  where alerted = true and notified_at is not null and email_sent_at is null;

comment on column public.login_events.email_sent_at is
  'When the suspicious-login email was dispatched (NULL = pending).';
