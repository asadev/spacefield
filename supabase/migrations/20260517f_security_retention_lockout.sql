-- 2026-05-17 — Retention + lockout + suspicious-login signals.
--
-- Owners: Security Agent S5 (sec-s5-retention).
-- Closes SA-005 (paddle retention), SA-007 (invite email-confirmed
-- defence), plus the suspicious-login alert + account-lockout checklist
-- items.

-- ─── Paddle retention RPC ──────────────────────────────────────────
-- Daily cron prunes paddle_webhook_events rows older than N days that
-- have processed_at IS NOT NULL. Unprocessed rows stay so a rerun can
-- still pick them up.
create or replace function public.purge_old_paddle_events(
  p_older_than_days int default 90
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.admin_caller_is_admin() then
    raise exception 'admin only';
  end if;

  -- 30-day retention floor so a misconfigured arg can't nuke recent
  -- history. Matches the convention used by admin_purge_audit_log.
  if coalesce(p_older_than_days, 0) < 30 then
    p_older_than_days := 30;
  end if;

  delete from public.paddle_webhook_events
   where processed_at is not null
     and received_at < (now() - make_interval(days => p_older_than_days));

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_old_paddle_events(int) from public;
grant execute on function public.purge_old_paddle_events(int) to service_role;

-- ─── auth_failures + account_lockouts ─────────────────────────────
-- Brute-force shield. record_auth_failure is called by the sign-in
-- handler on every bad password / OTP. After N fails in M minutes the
-- account is locked for L minutes. is_account_locked is read by the
-- sign-in handler before it bothers verifying credentials.
create table if not exists public.auth_failures (
  id          bigserial primary key,
  email_lower text not null,
  ip_hash     text,
  ua_hash     text,
  occurred_at timestamptz not null default now()
);
create index if not exists auth_failures_email_time_idx
  on public.auth_failures (email_lower, occurred_at desc);
alter table public.auth_failures enable row level security;
-- No policies — service-role only.

create table if not exists public.account_lockouts (
  email_lower  text primary key,
  locked_until timestamptz not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);
alter table public.account_lockouts enable row level security;
-- No policies — service-role only (sign-in handler reads via RPC).

create or replace function public.is_account_locked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.account_lockouts
     where email_lower = lower(p_email)
       and locked_until > now()
  );
$$;
revoke all on function public.is_account_locked(text) from public;
grant execute on function public.is_account_locked(text)
  to anon, authenticated, service_role;

create or replace function public.record_auth_failure(
  p_email       text,
  p_ip_hash     text default null,
  p_ua_hash     text default null,
  p_threshold   int  default 6,
  p_window_min  int  default 10,
  p_lock_min    int  default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n_fails int;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return false;
  end if;

  insert into public.auth_failures (email_lower, ip_hash, ua_hash)
    values (lower(p_email), p_ip_hash, p_ua_hash);

  select count(*) into n_fails
    from public.auth_failures
   where email_lower = lower(p_email)
     and occurred_at > now() - make_interval(mins => p_window_min);

  if n_fails >= p_threshold then
    insert into public.account_lockouts (email_lower, locked_until, reason)
      values (
        lower(p_email),
        now() + make_interval(mins => p_lock_min),
        format('%s failures in %s minutes', n_fails, p_window_min)
      )
      on conflict (email_lower) do update set
        locked_until = excluded.locked_until,
        reason       = excluded.reason;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.record_auth_failure(text, text, text, int, int, int)
  from public;
grant execute on function public.record_auth_failure(text, text, text, int, int, int)
  to anon, authenticated, service_role;

-- Manual override so an admin (or the account owner via a reset flow)
-- can clear a lockout. Not gated on admin_caller_is_admin because the
-- reset-link flow runs as the user themselves; the calling code is
-- responsible for proving identity before invoking this.
create or replace function public.clear_account_lockout(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_lockouts where email_lower = lower(p_email);
  delete from public.auth_failures   where email_lower = lower(p_email);
end;
$$;
revoke all on function public.clear_account_lockout(text) from public;
grant execute on function public.clear_account_lockout(text) to service_role;

-- ─── login_events history (for suspicious-login detection) ────────
-- Every successful sign-in is logged with hashed ip + ua. The scanner
-- cron reads rows with alerted=true and notified_at IS NULL, then
-- emits the in-app notification and (eventually) the email.
create table if not exists public.login_events (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  ip_hash      text,
  ua_hash      text,
  occurred_at  timestamptz not null default now(),
  alerted      boolean not null default false,
  notified_at  timestamptz
);
create index if not exists login_events_user_time_idx
  on public.login_events (user_id, occurred_at desc);
create index if not exists login_events_pending_alerts_idx
  on public.login_events (occurred_at)
  where alerted = true and notified_at is null;

alter table public.login_events enable row level security;
drop policy if exists login_events_select_own on public.login_events;
create policy login_events_select_own on public.login_events
  for select to authenticated using (user_id = auth.uid());
-- Inserts only via the record_login RPC (security definer) — no insert
-- policy for authenticated.

-- RPC: record a successful login + tell caller whether it looks new.
-- "Looks new" iff we have NO login in the last 60 days for this user
-- matching either the supplied ip_hash or ua_hash.
create or replace function public.record_login(
  p_ip_hash text default null,
  p_ua_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  looks_new boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- If we have *neither* signal we can't say if it's new — default to
  -- "not new" rather than spamming an alert.
  if p_ip_hash is null and p_ua_hash is null then
    insert into public.login_events (user_id, ip_hash, ua_hash, alerted)
      values (auth.uid(), p_ip_hash, p_ua_hash, false);
    return false;
  end if;

  select not exists(
    select 1 from public.login_events
     where user_id = auth.uid()
       and (
         (p_ip_hash is not null and ip_hash = p_ip_hash)
         or (p_ua_hash is not null and ua_hash = p_ua_hash)
       )
       and occurred_at > now() - interval '60 days'
  ) into looks_new;

  insert into public.login_events (user_id, ip_hash, ua_hash, alerted)
    values (auth.uid(), p_ip_hash, p_ua_hash, looks_new);

  return looks_new;
end;
$$;
revoke all on function public.record_login(text, text) from public;
grant execute on function public.record_login(text, text) to authenticated;

-- Service-role helper for the scanner cron to mark a row as notified.
create or replace function public.mark_login_event_notified(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.login_events set notified_at = now()
   where id = p_id and notified_at is null;
$$;
revoke all on function public.mark_login_event_notified(bigint) from public;
grant execute on function public.mark_login_event_notified(bigint) to service_role;

-- ─── accept_workspace_invite hardening (SA-007) ───────────────────
-- Defence-in-depth: also check email_confirmed_at on the calling
-- auth.users row. The existing function lives at
-- supabase/migrations/20260427_workspace_sharing.sql:323-365 and takes
-- (invite_id uuid) → workspace_members. We REPLACE it with the same
-- signature (so production callers in app/tools/_components/
-- WorkspacesPane.tsx keep working) plus the email-confirmed guard.
create or replace function public.accept_workspace_invite(invite_id uuid)
returns public.workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  inv          public.workspace_invites%rowtype;
  caller_email text;
  member_row   public.workspace_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- SA-007 — require confirmed email. Defence in depth even if
  -- Supabase auth config ever lets unconfirmed accounts get a session.
  select email into caller_email
    from auth.users
   where id = auth.uid()
     and email_confirmed_at is not null;
  if caller_email is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  select * into inv from public.workspace_invites where id = invite_id;
  if inv.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invite no longer pending' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.workspace_invites set status = 'expired' where id = inv.id;
    raise exception 'invite expired' using errcode = 'P0001';
  end if;
  if not (
    inv.invitee_user_id = auth.uid()
    or (inv.invitee_email is not null and lower(inv.invitee_email) = lower(caller_email))
  ) then
    raise exception 'invite not addressed to you' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do update set role = excluded.role
  returning * into member_row;

  update public.workspace_invites
     set status = 'accepted', accepted_at = now(), invitee_user_id = auth.uid()
   where id = inv.id;

  return member_row;
end;
$$;

grant execute on function public.accept_workspace_invite(uuid) to authenticated;
