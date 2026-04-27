-- Admin panel: per-page slim aggregates.
-- 2026-04-27
--
-- Each function below replaces a "load N rows just to count/sum them" path
-- in the admin pages with a single SQL aggregate. All are security-definer
-- and gated on profiles.is_admin so the service-role client isn't required.

-- ───────────────────────── caller guard ─────────────────────────
-- Reusable check. Cheap because of profiles_is_admin_idx.
create or replace function public.admin_caller_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid() limit 1),
    false
  );
$$;
grant execute on function public.admin_caller_is_admin() to authenticated;

-- ─────────────── per-user storage rollup (detail page) ───────────────
-- Replaces:
--   select size_bytes, workspace_id from workspace_files where workspace_id = any(ids)
-- on /admin/users/[id]. Returns total bytes + file count for ALL workspaces
-- the user owns, in one query.
create or replace function public.admin_user_storage_stats(p_user_id uuid)
returns table (
  files_count       bigint,
  files_total_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when (select admin_caller_is_admin()) then 1 else 1/0 end::int * 0 + count(f.*),
    coalesce(sum(f.size_bytes), 0)::bigint
  from public.workspaces w
  left join public.workspace_files f
    on f.workspace_id = w.id
   and coalesce(f.deleted_at, '9999-12-31'::timestamptz) > now()
  where w.user_id = p_user_id;
$$;
grant execute on function public.admin_user_storage_stats(uuid) to authenticated;

-- ─────────────── per-workspace member counts (list page) ───────────────
-- Replaces a full read of workspace_members for an arbitrary set of
-- workspace ids on /admin/workspaces. Returns one row per workspace_id.
create or replace function public.admin_workspace_member_counts(
  p_workspace_ids uuid[]
)
returns table (
  workspace_id uuid,
  members      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when (select admin_caller_is_admin()) then m.workspace_id
         else null::uuid end as workspace_id,
    count(*)::bigint as members
  from public.workspace_members m
  where m.workspace_id = any(p_workspace_ids)
  group by m.workspace_id;
$$;
grant execute on function public.admin_workspace_member_counts(uuid[]) to authenticated;

-- ─────────────── per-workspace storage rollup (list page) ──────────────
-- Same idea for workspace_files. One row per workspace_id.
create or replace function public.admin_workspace_storage_stats(
  p_workspace_ids uuid[]
)
returns table (
  workspace_id     uuid,
  files_count      bigint,
  total_bytes      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when (select admin_caller_is_admin()) then f.workspace_id
         else null::uuid end as workspace_id,
    count(*)::bigint as files_count,
    coalesce(sum(f.size_bytes), 0)::bigint as total_bytes
  from public.workspace_files f
  where f.workspace_id = any(p_workspace_ids)
    and coalesce(f.deleted_at, '9999-12-31'::timestamptz) > now()
  group by f.workspace_id;
$$;
grant execute on function public.admin_workspace_storage_stats(uuid[]) to authenticated;

-- ─────────────── single workspace storage total (detail page) ─────────
-- Replaces select size_bytes from workspace_files where workspace_id = X
-- (used only to sum bytes) on /admin/workspaces/[id].
create or replace function public.admin_single_workspace_storage(
  p_workspace_id uuid
)
returns table (
  files_count bigint,
  total_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when (select admin_caller_is_admin()) then count(*)::bigint
         else null::bigint end,
    coalesce(sum(size_bytes), 0)::bigint
  from public.workspace_files
  where workspace_id = p_workspace_id
    and coalesce(deleted_at, '9999-12-31'::timestamptz) > now();
$$;
grant execute on function public.admin_single_workspace_storage(uuid) to authenticated;

-- ─────────────── distinct contact-message topics ──────────────
-- Replaces a 1000-row read of contact_messages.topic on /admin/messages
-- whose only purpose is to populate the topic filter dropdown.
create or replace function public.admin_contact_message_topics()
returns table (topic text)
language sql
stable
security definer
set search_path = public
as $$
  select case when (select admin_caller_is_admin()) then t else null end
  from (
    select distinct topic as t
    from public.contact_messages
    where topic is not null and topic <> ''
  ) s
  order by t;
$$;
grant execute on function public.admin_contact_message_topics() to authenticated;
