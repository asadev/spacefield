-- 2026-05-30 — P0 SECURITY FIX: public.profiles was world-readable.
--
-- AUTH-01 (platform-scan P0, verified live on prod your-supabase-project-ref):
-- the only SELECT policy on public.profiles was
--     "anyone can read profiles"  FOR SELECT  TO public  USING (true)
-- (pg_policy.polroles = {-} i.e. PUBLIC). Any unauthenticated visitor could
-- read the entire table with the anon key — every full_name / username /
-- designation / bio / socials AND the is_admin flag (admin enumeration).
--
-- ACCESS ANALYSIS (why owner|admin|co-member, and why it's non-breaking):
-- Profiles readers split into service-role (bypass RLS, unaffected) and
-- user-client (RLS-subject, must stay working):
--   user-client OWN-ROW : ProfilePane, OnboardingChecklist, lib/pro/features,
--                          lib/referrals/server, lib/streaks/server
--   user-client CROSS-USER: app/api/chat/members (workspace chat roster),
--                          workspace-settings/MembersSection, WorkspacesPane,
--                          app/api/tools/availability, workspaces/activity
--   service-role        : all /admin, api/me, lib/admin/*, lib/collab/* — bypass
-- The cross-user readers all display fellow workspace members, so the policy
-- must allow reading the profile of anyone who shares a workspace with the
-- caller — otherwise the chat roster / members list / directory break.
--
-- Recursion-safe: public.is_admin() is SECURITY DEFINER (reads profiles as the
-- owner, not through this policy); the workspace_members subquery is itself
-- RLS-limited to the caller's own memberships. Scoping the policy to the
-- `authenticated` role means anon has NO select policy → denied outright.
--
-- Idempotent.

drop policy if exists "anyone can read profiles" on public.profiles;

create policy "profiles selectable by owner, admin, or co-member"
  on public.profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members them
        on them.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and them.user_id = public.profiles.user_id
    )
  );
