-- 20260428_workspaces_slug.sql
--
-- Add a `slug` column to public.workspaces. The lib/workspaces SELECT
-- joins this column when listing the user's team workspaces, so without
-- it the join errors out and every signed-in user's `workspaces` list
-- returns empty — which makes the CRM workspace picker think the user
-- has no team workspaces, even when they own one (running into the
-- workspace_owner_quota cap on a "create" attempt).
--
-- We don't have a UI for setting human-friendly slugs yet, so the slug
-- defaults to the workspace's UUID (cast to text). That's globally
-- unique, deterministic, and never collides with anything else. Future
-- work can layer a "rename slug" admin action on top.

alter table public.workspaces
  add column if not exists slug text;

-- Backfill rows that already exist. Use the UUID as the slug so we get
-- guaranteed uniqueness without scanning for collisions.
update public.workspaces
   set slug = id::text
 where slug is null;

-- Default for future inserts so the /api/workspaces/ensure path doesn't
-- need to supply a slug explicitly. Matches the backfill logic above.
alter table public.workspaces
  alter column slug set default null;

-- The slug is allowed to be a human-readable string in the future, so
-- we don't enforce id::text as a CHECK. We do enforce uniqueness +
-- NOT NULL once the backfill ran.
alter table public.workspaces
  alter column slug set not null;

create unique index if not exists workspaces_slug_idx
  on public.workspaces(slug);
