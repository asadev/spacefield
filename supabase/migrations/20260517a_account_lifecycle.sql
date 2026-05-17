-- 2026-05-17 Account + workspace lifecycle.
--
-- Two soft-delete queues with a 30-day grace period, plus the RPCs the
-- /account and /workspace/settings pages call to request / cancel, and
-- the hard-delete RPCs the daily cron uses to flush expired rows.
--
-- Design choice — we keep the queue tables (instead of just a
-- deleted_at on auth.users / public.workspaces) because:
--   * Asad wants the cancel-window to be visible to the user. A
--     dedicated row with grace_until + requested_at is easier to read,
--     show in the UI, and reason about than nullable timestamps.
--   * auth.users is owned by Supabase auth and we shouldn't be writing
--     bespoke columns there.
--   * Workspaces already has deleted_at (migration 20260515c) for
--     other soft-delete flows; the queue here is the canonical
--     pending-deletion record, but we also stamp deleted_at on
--     workspaces.deleted_at = grace_until so existing reads that filter
--     `where deleted_at is null` automatically hide the workspace
--     immediately, while still allowing the owner to recover.

-- ============================================================
-- account_deletion_requests
-- ============================================================

create table if not exists public.account_deletion_requests (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  grace_until  timestamptz not null default (now() + interval '30 days'),
  cancelled_at timestamptz,
  reason       text,
  ip_hash      text
);

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_select_own on public.account_deletion_requests;
create policy account_deletion_select_own on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid());

-- Inserts + cancels go through SECURITY DEFINER RPCs only; no direct
-- write policy. Service-role bypasses RLS for the hard-delete pass.

-- ============================================================
-- workspace_deletion_requests
-- ============================================================

create table if not exists public.workspace_deletion_requests (
  workspace_id   uuid primary key references public.workspaces(id) on delete cascade,
  requested_by   uuid not null,
  requested_at   timestamptz not null default now(),
  grace_until    timestamptz not null default (now() + interval '30 days'),
  cancelled_at   timestamptz,
  reason         text
);

alter table public.workspace_deletion_requests enable row level security;

drop policy if exists workspace_deletion_select_member on public.workspace_deletion_requests;
create policy workspace_deletion_select_member on public.workspace_deletion_requests
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- ============================================================
-- RPC: request_account_deletion
-- ============================================================

create or replace function public.request_account_deletion(
  p_reason text default null,
  p_ip_hash text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  gu timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.account_deletion_requests (user_id, reason, ip_hash)
  values (auth.uid(), p_reason, p_ip_hash)
  on conflict (user_id) do update set
    requested_at = now(),
    grace_until  = now() + interval '30 days',
    cancelled_at = null,
    reason       = excluded.reason,
    ip_hash      = excluded.ip_hash
  returning grace_until into gu;
  return gu;
end;
$$;

revoke all on function public.request_account_deletion(text, text) from public;
grant execute on function public.request_account_deletion(text, text) to authenticated;

-- ============================================================
-- RPC: cancel_account_deletion
-- ============================================================

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.account_deletion_requests
     set cancelled_at = now()
   where user_id = auth.uid()
     and cancelled_at is null;
end;
$$;

revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ============================================================
-- RPC: request_workspace_deletion (owner-only)
-- ============================================================

create or replace function public.request_workspace_deletion(
  p_workspace_id uuid,
  p_reason text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  gu timestamptz;
  role_text text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- workspace_role_of returns the workspace_role enum value or null.
  -- Cast to text so we don't depend on the enum name elsewhere.
  select public.workspace_role_of(p_workspace_id)::text into role_text;
  if role_text is null or role_text <> 'owner' then
    raise exception 'only the workspace owner can request deletion';
  end if;

  insert into public.workspace_deletion_requests (workspace_id, requested_by, reason)
  values (p_workspace_id, auth.uid(), p_reason)
  on conflict (workspace_id) do update set
    requested_at = now(),
    grace_until  = now() + interval '30 days',
    cancelled_at = null,
    reason       = excluded.reason,
    requested_by = excluded.requested_by
  returning grace_until into gu;

  -- Mirror onto workspaces.deleted_at so all the existing "active
  -- workspace" reads filter it out immediately. We still keep the row
  -- alive (no FK cascade fires) so the owner can cancel within the
  -- grace window. The cron does the actual hard-delete.
  update public.workspaces
     set deleted_at = gu
   where id = p_workspace_id;

  return gu;
end;
$$;

revoke all on function public.request_workspace_deletion(uuid, text) from public;
grant execute on function public.request_workspace_deletion(uuid, text) to authenticated;

-- ============================================================
-- RPC: cancel_workspace_deletion (owner-only)
-- ============================================================

create or replace function public.cancel_workspace_deletion(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  role_text text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select public.workspace_role_of(p_workspace_id)::text into role_text;
  if role_text is null or role_text <> 'owner' then
    raise exception 'only the workspace owner can cancel deletion';
  end if;

  update public.workspace_deletion_requests
     set cancelled_at = now()
   where workspace_id = p_workspace_id
     and cancelled_at is null;

  -- Clear the soft-delete tombstone so existing reads see it again.
  update public.workspaces
     set deleted_at = null
   where id = p_workspace_id;
end;
$$;

revoke all on function public.cancel_workspace_deletion(uuid) from public;
grant execute on function public.cancel_workspace_deletion(uuid) to authenticated;

-- ============================================================
-- RPC: hard_delete_expired_accounts (cron only)
-- ============================================================

create or replace function public.hard_delete_expired_accounts()
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

  -- on delete cascade on account_deletion_requests.user_id cleans the
  -- queue row automatically when auth.users is deleted. profiles +
  -- workspaces + all FK-cascaded rows go with it.
  delete from auth.users
   where id in (
     select user_id
       from public.account_deletion_requests
      where cancelled_at is null
        and grace_until < now()
   );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.hard_delete_expired_accounts() from public;
grant execute on function public.hard_delete_expired_accounts() to service_role;

-- ============================================================
-- RPC: hard_delete_expired_workspaces (cron only)
-- ============================================================

create or replace function public.hard_delete_expired_workspaces()
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

  delete from public.workspaces
   where id in (
     select workspace_id
       from public.workspace_deletion_requests
      where cancelled_at is null
        and grace_until < now()
   );

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.hard_delete_expired_workspaces() from public;
grant execute on function public.hard_delete_expired_workspaces() to service_role;
