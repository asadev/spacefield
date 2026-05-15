-- ─────────────────────────────────────────────────────────────────────────
-- Backfill search_documents from existing source tables.
--
-- Run via Supabase SQL editor after the schema migrations are applied.
-- Safe to run anytime: search_doc_upsert() does an ON CONFLICT update by
-- (entity_type, entity_id), so re-running this script is a no-op (only
-- refreshes already-indexed rows). New writes through the normal app
-- code paths call indexDocument()/search_doc_upsert() inline.
--
-- Covers:
--   - tasks         → entity_type 'task'
--   - projects      → entity_type 'project'
--   - crm_contacts  → entity_type 'contact'
--   - crm_leads     → entity_type 'lead'
--   - crm_deals     → entity_type 'deal'
--   - employees     → entity_type 'employee'
--
-- Tables that ship a `deleted_at` column are filtered for active rows.
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
where t.deleted_at is null;

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
where p.deleted_at is null;

-- ─── crm_contacts ────────────────────────────────────────────────────────
-- href matches lib/collab/comments.ts contact mapping (`/admin/users/<id>`).
select public.search_doc_upsert(
  c.workspace_id,
  'contact',
  c.id,
  nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
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
where nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') is not null
   or c.email is not null;

-- ─── crm_leads ───────────────────────────────────────────────────────────
select public.search_doc_upsert(
  l.workspace_id,
  'lead',
  l.id,
  nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
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
where nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), '') is not null
   or l.email is not null;

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
from public.crm_deals d;

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
where e.archived_at is null;
