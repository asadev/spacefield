-- 2026-05-30 — SEARCH-01 backfill: index existing employees into search_documents.
--
-- The People/HR write path never indexed employees, so the global search index
-- held 0 of 14 employees (Cmd-K returned nothing for staff). This one-time,
-- idempotent backfill indexes every non-deleted employee. (Runtime indexing so
-- NEW/edited employees stay searchable is a separate follow-up in the People
-- write path.)
--
-- Conventions match the runtime indexer + the CRM backfill (20260530c):
--   entity_type 'employee', href /people/<id> (real route — app/people/[id]),
--   icon 'user', title=full_name, subtitle=job_title · department, body=email.
-- search_documents.fts is a GENERATED column, so we insert plain columns only.
--
-- Already applied to prod via the Management API (HTTP 201, 14 rows) and
-- recorded in supabase_migrations.schema_migrations as 20260530g.

insert into public.search_documents
  (workspace_id, entity_type, entity_id, title, subtitle, body, href, icon, updated_at)
select
  e.workspace_id,
  'employee',
  e.id,
  coalesce(nullif(trim(e.full_name), ''), 'Unnamed employee'),
  nullif(concat_ws(' · ', e.job_title, e.department), ''),
  e.email,
  '/people/' || e.id::text,
  'user',
  now()
from public.employees e
where e.deleted_at is null
on conflict (entity_type, entity_id) do update set
  title      = excluded.title,
  subtitle   = excluded.subtitle,
  body       = excluded.body,
  href       = excluded.href,
  icon       = excluded.icon,
  updated_at = now();
