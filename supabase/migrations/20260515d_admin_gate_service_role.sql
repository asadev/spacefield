-- 2026-05-15 admin_caller_is_admin() — allow service-role bypass.
--
-- Inspector found that cron jobs (audit-purge, slow-queries-snapshot)
-- and the admin slow-queries dashboard all call SECURITY DEFINER RPCs
-- gated on admin_caller_is_admin(). When invoked with a service-role
-- key, auth.uid() is NULL inside the function → the admin check fails
-- → the RPC raises 'admin only' → 500 at the route. The /admin/insights
-- /slow-queries page also uses the service-role client and hits the
-- same gate.
--
-- Fix: short-circuit on auth.role() = 'service_role' inside the helper.
-- Service-role already bypasses RLS at the table layer, so widening
-- the gate here only matches existing trust boundaries — no new
-- privilege is granted.
--
-- Rollback (irreversible without restoring prior function body): the
-- prior version is in 20260427_admin_query_slim.sql:10-21. Re-running
-- that section would restore the old check.

create or replace function public.admin_caller_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Service-role JWT (used by server actions, crons, admin pages
    -- that explicitly need bypass) always passes.
    auth.role() = 'service_role'
    -- Otherwise the caller must be flagged as admin in profiles.
    or coalesce(
      (select is_admin from public.profiles where user_id = auth.uid() limit 1),
      false
    );
$$;

revoke all on function public.admin_caller_is_admin() from public;
grant execute on function public.admin_caller_is_admin() to anon, authenticated, service_role;
