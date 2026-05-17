-- 2026-05-19 Search-documents backfill (run during deploy).
--
-- The original script lives at scripts/backfill-search-documents.sql and
-- is meant for hand-pasting into the Supabase SQL editor. This migration
-- runs the same logic at deploy time via the Management API, so test
-- workspaces that pre-date the 20260514f_search.sql migration get their
-- existing tasks/projects/employees/comments/crm rows indexed without a
-- manual step.
--
-- Idempotency:
--   - search_doc_upsert() is ON CONFLICT (entity_type, entity_id) DO UPDATE,
--     so re-running this migration only refreshes already-indexed rows.
--   - This migration is wrapped in a single `do $$ ... end $$` block so
--     a partial failure rolls back cleanly (no half-populated index).
--   - Safety caps: every branch is bounded by a LIMIT (100k inserts per
--     entity type) to keep the backfill bounded even if a noisy test
--     workspace seeded huge fixtures. Production workspaces are nowhere
--     near this limit today; raise per-entity if/when we cross it.
--
-- Rollback: this only writes via search_doc_upsert(). To undo the
-- backfill, truncate public.search_documents — the runtime indexers
-- will repopulate it on the next write to each source row.

do $$
declare
  v_cap constant int := 100000;  -- per-entity-type ceiling
begin
  -- ─── tasks ───────────────────────────────────────────────────────────
  perform public.search_doc_upsert(
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
  from (
    select id, workspace_id, title, due_at, status, description
      from public.tasks
     where deleted_at is null
       and title is not null
       and workspace_id is not null
     order by created_at desc
     limit v_cap
  ) t;

  -- ─── projects ────────────────────────────────────────────────────────
  perform public.search_doc_upsert(
    p.workspace_id,
    'project',
    p.id,
    p.name,
    case when p.status is not null then p.status || ' project' else null end,
    p.description,
    '/projects/' || p.id::text,
    'folder'
  )
  from (
    select id, workspace_id, name, status, description
      from public.projects
     where deleted_at is null
       and name is not null
       and workspace_id is not null
     order by created_at desc
     limit v_cap
  ) p;

  -- ─── employees ───────────────────────────────────────────────────────
  -- Guard: employees table is created by 20260514e_people.sql. It exists
  -- in every environment we deploy to today; if for some reason it
  -- doesn't (fresh dev DB), to_regclass returns null and we skip the
  -- branch instead of failing the whole migration.
  if to_regclass('public.employees') is not null then
    perform public.search_doc_upsert(
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
    from (
      select id, workspace_id, full_name, job_title, department, email
        from public.employees
       where archived_at is null
         and full_name is not null
         and workspace_id is not null
       order by created_at desc
       limit v_cap
    ) e;
  end if;

  -- ─── comments ────────────────────────────────────────────────────────
  perform public.search_doc_upsert(
    c.workspace_id,
    'comment',
    c.id,
    coalesce(nullif(substring(c.body for 120), ''), '(comment)'),
    'comment on ' || c.entity_type,
    c.body,
    case c.entity_type
      when 'task'    then '/tasks/'       || c.entity_id::text
      when 'project' then '/projects/'    || c.entity_id::text
      when 'contact' then '/admin/users/' || c.entity_id::text
    end,
    'message-square'
  )
  from (
    select id, workspace_id, body, entity_type, entity_id
      from public.comments
     where deleted_at is null
       and workspace_id is not null
       and entity_type in ('task', 'project', 'contact')
     order by created_at desc
     limit v_cap
  ) c;

  -- ─── crm_contacts ────────────────────────────────────────────────────
  if to_regclass('public.crm_contacts') is not null then
    perform public.search_doc_upsert(
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
    from (
      select id, workspace_id, first_name, last_name, email, job_title, notes
        from public.crm_contacts
       where workspace_id is not null
         and coalesce(
               nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
               email
             ) is not null
       order by created_at desc
       limit v_cap
    ) c;
  end if;

  -- ─── crm_companies ───────────────────────────────────────────────────
  if to_regclass('public.crm_companies') is not null then
    perform public.search_doc_upsert(
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
    from (
      select id, workspace_id, name, industry, size, domain, notes
        from public.crm_companies
       where workspace_id is not null
         and name is not null
       order by created_at desc
       limit v_cap
    ) co;
  end if;

  -- ─── crm_leads ───────────────────────────────────────────────────────
  if to_regclass('public.crm_leads') is not null then
    perform public.search_doc_upsert(
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
    from (
      select id, workspace_id, first_name, last_name, email, status, source, notes
        from public.crm_leads
       where workspace_id is not null
         and coalesce(
               nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
               email
             ) is not null
       order by created_at desc
       limit v_cap
    ) l;
  end if;

  -- ─── crm_deals ───────────────────────────────────────────────────────
  if to_regclass('public.crm_deals') is not null then
    perform public.search_doc_upsert(
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
    from (
      select id, workspace_id, name, status, amount, currency, close_date
        from public.crm_deals
       where workspace_id is not null
         and name is not null
       order by created_at desc
       limit v_cap
    ) d;
  end if;
end $$;
