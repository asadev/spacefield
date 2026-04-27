-- Admin dashboard aggregate RPC.
-- Replaces 4 full-table reads (`workspace_files.select(size_bytes)`,
-- `subscriptions.select(tier_id, status)` etc.) with one round-trip
-- that returns SQL-side aggregates as a single JSON row.

create or replace function public.admin_dashboard_stats()
returns table (
  users_count          bigint,
  workspaces_count     bigint,
  files_count          bigint,
  files_total_bytes    bigint,
  active_subs_total    bigint,
  active_subs_by_tier  jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with caller as (
    select coalesce(p.is_admin, false) as is_admin
    from public.profiles p
    where p.user_id = auth.uid()
  ),
  guard as (
    -- Hard fail when the caller isn't an admin. Casting null to bigint
    -- via raise rather than returning empty rows so the client gets a
    -- recognisable 401-ish error instead of silently zeroed stats.
    select case
      when coalesce((select is_admin from caller), false) then 1
      else 1 / 0
    end as ok
  ),
  agg_subs as (
    select tier_id, count(*) as n
    from public.subscriptions
    where status in ('active', 'trialing')
    group by tier_id
  ),
  files_agg as (
    select count(*)::bigint as cnt,
           coalesce(sum(size_bytes), 0)::bigint as total
    from public.workspace_files
    where coalesce(deleted_at, '9999-12-31'::timestamptz) > now()
  )
  select
    (select count(*)::bigint from public.profiles)
      as users_count,
    (select count(*)::bigint from public.workspaces)
      as workspaces_count,
    (select cnt from files_agg) as files_count,
    (select total from files_agg) as files_total_bytes,
    (select coalesce(sum(n), 0)::bigint from agg_subs)
      as active_subs_total,
    (select coalesce(jsonb_object_agg(tier_id, n), '{}'::jsonb) from agg_subs)
      as active_subs_by_tier
  -- Force the guard CTE to materialise; the divide-by-zero fires
  -- BEFORE we return rows when the caller isn't an admin.
  from guard;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;
