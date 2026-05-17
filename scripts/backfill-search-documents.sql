-- ─────────────────────────────────────────────────────────────────────────
-- Backfill search_documents from existing source tables.
--
-- Run via Supabase SQL editor OR pasted as a single Management-API block
-- (everything below is one transaction-safe series of `select` statements
-- that invoke the SECURITY DEFINER `search_doc_upsert(...)` helper from
-- 20260514f_search.sql).
--
-- Safe to run anytime: search_doc_upsert() does an ON CONFLICT update by
-- (entity_type, entity_id), so re-running this script is a no-op (only
-- refreshes already-indexed rows). New writes through the normal app
-- code paths call indexDocument()/search_doc_upsert() inline.
--
-- ─── correctness guarantees ───────────────────────────────────────────────
-- search_documents.title is NOT NULL and workspace_id is NOT NULL. Every
-- branch below filters out rows that would produce a NULL title — the
-- earlier version of this script could fail on crm_contacts rows that had
-- only an email and no name. Each branch's WHERE clause now also requires
-- a non-null derived title.
--
-- Covers (entity_type → source table):
--   - task         → public.tasks            (filter: deleted_at is null)
--   - project      → public.projects         (filter: deleted_at is null)
--   - employee     → public.employees        (filter: archived_at is null)
--   - comment      → public.comments         (filter: deleted_at is null
--                                              AND parent entity is in the
--                                              indexable set — see commentParentHref)
--   - contact      → public.crm_contacts     (filter: derived title not null)
--   - company      → public.crm_companies    (filter: name not null)
--   - lead         → public.crm_leads        (filter: derived title not null)
--   - deal         → public.crm_deals        (filter: name not null)
-- ─────────────────────────────────────────────────────────────────────────

-- ─── tasks ───────────────────────────────────────────────────────────────
select public.search_doc_upsert(
  t.workspace_id,
  'task',
  t.id,
  t.title,
  trim(both ' · ' from
    coalesce(case when t.due_at is not null then 'Due ' || t.due_at::date::text else '' end, '')
    || ' · '
    || coalesce(t.status, '')
  ),
  t.description,
  '/tasks/' || t.id::text,
  'check-square'
)
from public.tasks t
where t.deleted_at is null
  and t.title is not null
  and t.workspace_id is not null;

-- ─── projects ────────────────────────────────────────────────────────────
select public.search_doc_upsert(
  p.workspace_id,
  'project',
  p.id,
  p.name,
  case when p.status is not null then p.status || ' project' else null end,
  p.description,
  '/projects/' || p.id::text,
  'folder'
)
from public.projects p
where p.deleted_at is null
  and p.name is not null
  and p.workspace_id is not null;

-- ─── employees ───────────────────────────────────────────────────────────
select public.search_doc_upsert(
  e.workspace_id,
  'employee',
  e.id,
  e.full_name,
  nullif(trim(both ' · ' from
    coalesce(e.job_title, '')
    || ' · '
    || coalesce(e.department, '')
  ), ''),
  e.email,
  '/people/' || e.id::text,
  'user'
)
from public.employees e
where e.archived_at is null
  and e.full_name is not null
  and e.workspace_id is not null;

-- ─── comments ────────────────────────────────────────────────────────────
-- Mirrors lib/collab/comments.ts: only comments whose parent entity is in
-- the indexable set get a real href. Anything else is skipped (consistent
-- with commentParentHref returning null).
select public.search_doc_upsert(
  c.workspace_id,
  'comment',
  c.id,
  -- body slice → title, with a "(comment)" fallback so NOT NULL holds.
  coalesce(nullif(substring(c.body for 120), ''), '(comment)'),
  'comment on ' || c.entity_type,
  c.body,
  case c.entity_type
    when 'task'    then '/tasks/'    || c.entity_id::text
    when 'project' then '/projects/' || c.entity_id::text
    when 'contact' then '/admin/users/' || c.entity_id::text
  end,
  'message-square'
)
from public.comments c
where c.deleted_at is null
  and c.workspace_id is not null
  and c.entity_type in ('task', 'project', 'contact');

-- ─── crm_contacts ────────────────────────────────────────────────────────
-- href matches lib/collab/comments.ts contact mapping (`/admin/users/<id>`).
-- Filter to rows that can produce a non-null derived title (fixes the
-- title-NOT-NULL violation the earlier version could trigger on
-- email-only contacts).
select public.search_doc_upsert(
  c.workspace_id,
  'contact',
  c.id,
  coalesce(
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
    c.email
  ),
  nullif(trim(both ' · ' from
    coalesce(c.job_title, '')
    || ' · '
    || coalesce(c.email, '')
  ), ''),
  c.notes,
  '/admin/users/' || c.id::text,
  'user'
)
from public.crm_contacts c
where c.workspace_id is not null
  and coalesce(
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
    c.email
  ) is not null;

-- ─── crm_companies ───────────────────────────────────────────────────────
select public.search_doc_upsert(
  co.workspace_id,
  'company',
  co.id,
  co.name,
  nullif(trim(both ' · ' from
    coalesce(co.industry, '')
    || ' · '
    || coalesce(co.size, '')
    || ' · '
    || coalesce(co.domain, '')
  ), ''),
  co.notes,
  '/admin/users/' || co.id::text,
  'building'
)
from public.crm_companies co
where co.workspace_id is not null
  and co.name is not null;

-- ─── crm_leads ───────────────────────────────────────────────────────────
select public.search_doc_upsert(
  l.workspace_id,
  'lead',
  l.id,
  coalesce(
    nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
    l.email
  ),
  nullif(trim(both ' · ' from
    coalesce(l.status, '')
    || ' · '
    || coalesce(l.source, '')
    || ' · '
    || coalesce(l.email, '')
  ), ''),
  l.notes,
  '/admin/users/' || l.id::text,
  'sparkles'
)
from public.crm_leads l
where l.workspace_id is not null
  and coalesce(
    nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
    l.email
  ) is not null;

-- ─── crm_deals ───────────────────────────────────────────────────────────
select public.search_doc_upsert(
  d.workspace_id,
  'deal',
  d.id,
  d.name,
  trim(both ' · ' from
    coalesce(d.status, '')
    || ' · '
    || coalesce(case when d.amount is not null then d.currency || ' ' || d.amount::text else '' end, '')
    || ' · '
    || coalesce(case when d.close_date is not null then 'closes ' || d.close_date::text else '' end, '')
  ),
  null,
  '/admin/users/' || d.id::text,
  'dollar-sign'
)
from public.crm_deals d
where d.workspace_id is not null
  and d.name is not null;
