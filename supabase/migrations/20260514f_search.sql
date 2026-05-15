-- 2026-05-14 Global search index.
--
-- A denormalised table of every searchable entity in the workspace,
-- populated by callers (server actions, importers) via two helper RPCs
-- — search_doc_upsert / search_doc_remove — and queried by a single
-- `global_search(text)` RPC that the command palette + /api/search
-- + /search page all funnel through.
--
-- Why denormalised + caller-driven instead of a Postgres FTS
-- materialized view + cross-table triggers:
--
--   1. The list of "searchable" tables is open-ended (CRM contacts,
--      deals, tasks, people, files, shares, …) and several of those
--      tables are created in PARALLEL by other agents tonight. A
--      single MV would need to know every source schema; coupling
--      this migration to migrations that may merge in any order is
--      fragile.
--   2. Triggers on every source table doubles the surface area for
--      future schema migrations to think about. Caller-driven keeps
--      the search side a passive sink.
--   3. tsvector is computed in a generated column so writers don't
--      have to think about index maintenance.
--
-- Rollback:
--   drop function if exists public.global_search(text, int);
--   drop function if exists public.search_doc_upsert(uuid, text, uuid, text, text, text, text, text);
--   drop function if exists public.search_doc_remove(text, uuid);
--   drop table if exists public.search_documents cascade;

-- ───────────────────────────────────────────────────────────────────
-- search_documents — one row per searchable entity
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.search_documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  entity_type   text not null,        -- snake_case table name: 'crm_contact', 'task', 'file', …
  entity_id     uuid not null,        -- PK of the source row
  title         text not null,
  subtitle      text,
  body          text,
  href          text not null,        -- where clicking takes you
  icon          text,                 -- lucide icon name or emoji
  fts           tsvector generated always as (
                  to_tsvector('simple',
                    coalesce(title,'')    || ' ' ||
                    coalesce(subtitle,'') || ' ' ||
                    coalesce(body,'')
                  )
                ) stored,
  updated_at    timestamptz not null default now()
);

create unique index if not exists search_documents_entity_uniq
  on public.search_documents (entity_type, entity_id);

create index if not exists search_documents_fts_idx
  on public.search_documents using gin (fts);

create index if not exists search_documents_workspace_idx
  on public.search_documents (workspace_id);

create index if not exists search_documents_workspace_type_idx
  on public.search_documents (workspace_id, entity_type);

alter table public.search_documents enable row level security;

-- Members of the workspace can read documents scoped to that workspace.
-- Writes are funnelled through the security-definer RPCs below; no
-- direct INSERT/UPDATE/DELETE policy is granted to authenticated.
create policy search_documents_select on public.search_documents
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ───────────────────────────────────────────────────────────────────
-- Helper RPCs called from server actions / importers
-- ───────────────────────────────────────────────────────────────────

-- Upsert by (entity_type, entity_id). Idempotent. Caller is expected
-- to be a workspace member of the supplied workspace_id; we don't
-- re-check inside the RPC because the SECURITY DEFINER context already
-- bypasses RLS — every caller is server-side.
create or replace function public.search_doc_upsert(
  p_workspace_id uuid,
  p_entity_type  text,
  p_entity_id    uuid,
  p_title        text,
  p_subtitle     text,
  p_body         text,
  p_href         text,
  p_icon         text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.search_documents
    (workspace_id, entity_type, entity_id, title, subtitle, body, href, icon, updated_at)
  values
    (p_workspace_id, p_entity_type, p_entity_id, p_title, p_subtitle, p_body, p_href, p_icon, now())
  on conflict (entity_type, entity_id) do update
    set workspace_id = excluded.workspace_id,
        title        = excluded.title,
        subtitle     = excluded.subtitle,
        body         = excluded.body,
        href         = excluded.href,
        icon         = excluded.icon,
        updated_at   = now();
$$;

create or replace function public.search_doc_remove(
  p_entity_type text,
  p_entity_id   uuid
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.search_documents
   where entity_type = p_entity_type
     and entity_id   = p_entity_id;
$$;

-- ───────────────────────────────────────────────────────────────────
-- global_search — the single read path used by the UI
-- ───────────────────────────────────────────────────────────────────
--
-- security invoker so workspace-membership RLS filters results. We
-- rely on the RLS policy above, not on a workspace_id parameter, so
-- the RPC can be called without the caller having to know which
-- workspaces it currently belongs to.

create or replace function public.global_search(
  p_query text,
  p_limit int default 30
) returns table (
  entity_type text,
  entity_id   uuid,
  title       text,
  subtitle    text,
  href        text,
  icon        text,
  rank        real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    entity_type,
    entity_id,
    title,
    subtitle,
    href,
    icon,
    ts_rank(fts, plainto_tsquery('simple', p_query)) as rank
  from public.search_documents
  where p_query is not null
    and length(trim(p_query)) > 0
    and fts @@ plainto_tsquery('simple', p_query)
  order by rank desc, updated_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- Grants — only the read RPC is callable by authenticated clients. The
-- upsert/remove RPCs are SECURITY DEFINER so we keep them service-role
-- only (revoke from public + don't grant to authenticated). Server
-- code calls them via the admin client.
grant execute on function public.global_search(text, int) to authenticated;

revoke all on function public.search_doc_upsert(uuid, text, uuid, text, text, text, text, text) from public;
revoke all on function public.search_doc_remove(text, uuid) from public;

-- ───────────────────────────────────────────────────────────────────
-- Caller integration — for the agents wiring up tasks / employees /
-- crm-contacts / files / shares in parallel branches:
--
-- After your INSERT (or after an UPDATE that changed title/subtitle/body):
--   select public.search_doc_upsert(
--     '<workspace_uuid>'::uuid,
--     'task',                       -- entity_type, snake_case
--     '<row_id>'::uuid,
--     'Buy groceries',              -- title
--     'Due 2026-05-20 · Asad',      -- subtitle (free-form context line)
--     null,                         -- body — long text, optional
--     '/tasks/<row_id>',            -- href
--     'check-square'                -- icon (lucide name) or emoji
--   );
--
-- After a DELETE:
--   select public.search_doc_remove('task', '<row_id>'::uuid);
--
-- These RPCs are SECURITY DEFINER and must be called from server-side
-- code (server actions, route handlers) using the admin Supabase
-- client. Don't expose them to the browser.
-- ───────────────────────────────────────────────────────────────────
