-- 2026-05-19 Native Postgres FTS on the heavy user-content tables.
--
-- Why this is separate from the search_documents denormalised index
-- (20260514f_search.sql):
--
--   - search_documents is great for the cross-entity command-palette
--     "type to jump anywhere" experience: it indexes a short title /
--     subtitle / body slice across every entity type so one tsvector
--     covers all of them.
--   - But for in-context searches over the user's OWN content (filter
--     tasks by keyword inside a project, search comments inside a
--     thread, search projects in a workspace), we want a tsvector that
--     lives ON the row itself. That way:
--       * the query keeps RLS context (no cross-workspace leak risk
--         from a stale search_documents row)
--       * the planner can combine the FTS predicate with workspace_id
--         / project_id / deleted_at filters without joining to a
--         denormalised mirror table
--       * updates are atomic with the row (generated column → no
--         trigger glue to keep in sync)
--
-- Shape: a STORED generated `search_tsv tsvector` column on each table,
-- computed from the natural text fields with the `simple` dictionary
-- (matches the dictionary used by search_documents so query helpers can
-- share a tokeniser config). GIN index on each column.
--
-- Rollback:
--   drop index if exists public.tasks_search_tsv_idx;
--   drop index if exists public.projects_search_tsv_idx;
--   drop index if exists public.comments_search_tsv_idx;
--   alter table public.tasks    drop column if exists search_tsv;
--   alter table public.projects drop column if exists search_tsv;
--   alter table public.comments drop column if exists search_tsv;

-- ─── tasks: title + description ─────────────────────────────────────
alter table public.tasks
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  ) stored;

create index if not exists tasks_search_tsv_idx
  on public.tasks using gin (search_tsv)
  where deleted_at is null;

-- ─── projects: name + description ───────────────────────────────────
alter table public.projects
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' || coalesce(description, '')
    )
  ) stored;

create index if not exists projects_search_tsv_idx
  on public.projects using gin (search_tsv)
  where deleted_at is null;

-- ─── comments: body ─────────────────────────────────────────────────
alter table public.comments
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple', coalesce(body, ''))
  ) stored;

create index if not exists comments_search_tsv_idx
  on public.comments using gin (search_tsv)
  where deleted_at is null;
