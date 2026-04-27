-- Files Manager — Trash & Tags
-- 2026-04-27
--
-- Adds soft-delete + arbitrary tag chips to public.workspace_files.
--
--   * deleted_at: null = live; non-null = trashed (still counts against
--     workspace storage; can be restored or permanently deleted).
--   * tags:      jsonb array of { name: text, color: text }. Max 6 colors
--                enforced in the app. No DB-level shape check so this can
--                evolve without a migration.
--
-- The application/admin clients are responsible for filtering by
-- `deleted_at is null` on default file lists; RLS is unchanged so a
-- trashed row is still visible to workspace members for the Trash view.
--
-- workspace_storage() RPC continues to count trashed files against the
-- quota (intentional — emptying the trash is the only way to free space).

alter table public.workspace_files
  add column if not exists deleted_at timestamptz,
  add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists workspace_files_deleted_idx
  on public.workspace_files (workspace_id, deleted_at);

create index if not exists workspace_files_tags_idx
  on public.workspace_files using gin (tags);
