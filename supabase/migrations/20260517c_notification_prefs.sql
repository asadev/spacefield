-- Per-user notification preferences (P5 CX polish).
--
-- Lets users opt in/out of notification categories from
-- /account/notifications. The row is upserted on save and read on
-- render — when the row is missing we fall back to the column defaults
-- (which represent the "out of the box" experience).
--
-- RLS: each row is keyed by `user_id`, and policies restrict
-- select/insert/update to the owning auth.uid(). No service-role
-- bypass policy is needed here — the only call site is the user's own
-- preferences page acting via the user-scoped Supabase client.

create table if not exists public.notification_prefs (
  user_id          uuid primary key references auth.users(id) on delete cascade,

  -- Mentions / collaboration
  comment_mention  boolean not null default true,
  task_assigned    boolean not null default true,
  task_completed   boolean not null default false,

  -- Workflow approvals
  timeoff_decision boolean not null default true,
  workspace_invite boolean not null default true,

  -- Digest + marketing (off by default — explicit opt-in)
  weekly_digest    boolean not null default false,
  email_marketing  boolean not null default false,

  updated_at       timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists notification_prefs_select_own on public.notification_prefs;
create policy notification_prefs_select_own on public.notification_prefs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_prefs_insert_own on public.notification_prefs;
create policy notification_prefs_insert_own on public.notification_prefs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_prefs_update_own on public.notification_prefs;
create policy notification_prefs_update_own on public.notification_prefs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helpful when batched senders (digests, etc.) want to fetch only
-- users who opted in. Partial-index on `weekly_digest = true` keeps
-- the index tiny since most users leave it off.
create index if not exists notification_prefs_weekly_digest_idx
  on public.notification_prefs (user_id)
  where weekly_digest = true;
