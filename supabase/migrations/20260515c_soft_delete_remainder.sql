-- ─────────────────────────────────────────────────────────────────────────
-- Soft-delete remainder
--
-- tasks + projects already have a `deleted_at timestamptz` column +
-- partial active-row indexes (see 20260514d_tasks.sql). This migration
-- brings the rest of the high-traffic tables onto the same convention so
-- callers can soft-delete (set `deleted_at = now()`) and queries can
-- exclude the tombstones via the partial index.
--
-- Fully additive + idempotent:
--   - `add column if not exists` so re-running is a no-op.
--   - The `to_regclass` gate skips tables that haven't been created yet
--     (e.g. shared_links/forms/notes are planned features but the
--     migrations haven't landed).
--   - Partial indexes are `create index if not exists`.
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.workspaces') is not null then
    alter table public.workspaces add column if not exists deleted_at timestamptz;
    create index if not exists workspaces_active_idx
      on public.workspaces (id)
      where deleted_at is null;
  end if;

  if to_regclass('public.shared_links') is not null then
    alter table public.shared_links add column if not exists deleted_at timestamptz;
    create index if not exists shared_links_active_idx
      on public.shared_links (id)
      where deleted_at is null;
  end if;

  if to_regclass('public.forms') is not null then
    alter table public.forms add column if not exists deleted_at timestamptz;
    create index if not exists forms_active_idx
      on public.forms (id)
      where deleted_at is null;
  end if;

  if to_regclass('public.notes') is not null then
    alter table public.notes add column if not exists deleted_at timestamptz;
    create index if not exists notes_active_idx
      on public.notes (id)
      where deleted_at is null;
  end if;
end $$;
