-- 2026-05-27 Fix infinite recursion in workspace_members SELECT policy.
--
-- Symptom: every query against public.workspace_members from an
-- authenticated user returns 500 with
--   "infinite recursion detected in policy for relation workspace_members"
-- (Postgres error 42P17). The originating policy was created in
-- 20260427_workspace_sharing.sql:
--
--   create policy "members read membership of their workspaces"
--     on public.workspace_members for select
--     using (
--       user_id = auth.uid()
--       or workspace_id in (
--         select workspace_id from public.workspace_members
--         where user_id = auth.uid()
--       )
--     );
--
-- The inner subquery selects from workspace_members, which re-applies the
-- same SELECT policy, which re-runs the subquery, ad infinitum. Postgres
-- detects the cycle and aborts the query.
--
-- The blast radius is wide: the lib/workspaces/client.ts list query, the
-- workspace_role_of()-driven UPDATE / DELETE policies on other tables
-- that join workspace_members, /api/workspaces/ensure, /api/workspaces/
-- storage-stats (403s because the role check 500s), /api/crm/tags (same),
-- the multi-workspace switcher in the Desktop OS shell, and every
-- workspace-member-gated widget that silently falls back to an empty /
-- skeleton state when the role check throws.
--
-- Fix: replace the recursive subquery with a SECURITY DEFINER helper
-- (public.is_workspace_member) that bypasses RLS while still scoping
-- to the calling user. The helper was already defined in the same
-- 20260427 migration and was the intended pattern — the SELECT policy
-- just didn't get migrated to use it.
--
-- Why this is safe:
--   * is_workspace_member(ws_id) is SECURITY DEFINER + STABLE + scoped
--     by auth.uid(), so it discloses only the calling user's
--     membership of one specific workspace at a time. No data leak.
--   * The first arm (user_id = auth.uid()) is unchanged, so users can
--     still always see their own membership row even if the helper
--     short-circuits.
--   * `workspace_role_of()` (used by UPDATE / DELETE / INSERT WITH
--     CHECK) is already SECURITY DEFINER and not affected.
--
-- Idempotent: drop-if-exists + create. Re-running the migration is a
-- no-op once applied.

drop policy if exists "members read membership of their workspaces"
  on public.workspace_members;

create policy "members read membership of their workspaces"
  on public.workspace_members for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );
