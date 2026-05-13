-- ─────────────────────────────────────────────────────────────────────
-- Database hardening — 2026-05-14 (Agent D)
--
-- Additive-only safety + observability pass over public schema. Designed
-- to be applied zero-downtime on a live database. No DROPs, no
-- destructive ALTERs, no UPDATEs against existing rows. Every statement
-- is idempotent (`if not exists` / `or replace` / `if exists`).
--
-- Sections:
--   1. admin_audit_log append-only RLS (restrictive policies that DENY
--      UPDATE and DELETE for anon + authenticated; service-role keeps
--      its bypass).
--   2. slow_queries_top_50 view (only if pg_stat_statements is
--      installed) + admin_slow_queries(limit_n) RPC.
--   3. table_sizes view — pg_total_relation_size for public.* tables.
--   4. deleted_at soft-delete columns on crm_contacts, crm_leads,
--      crm_deals + partial indexes (deleted_at is null).
--   5. admin_purge_audit_log(p_older_than_days) helper — SECURITY
--      DEFINER, manual call only.
--   6. db_backup_drills table — log of executed restore drills.
--
-- ROLLBACK
--   Every statement here is additive. To roll back fully:
--     - drop policy "admin_audit_log no update" on public.admin_audit_log;
--     - drop policy "admin_audit_log no delete" on public.admin_audit_log;
--     - drop view  if exists public.slow_queries_top_50;
--     - drop view  if exists public.table_sizes;
--     - drop function if exists public.admin_slow_queries(int);
--     - drop function if exists public.admin_purge_audit_log(int);
--     - alter table public.crm_contacts drop column if exists deleted_at;
--     - alter table public.crm_leads    drop column if exists deleted_at;
--     - alter table public.crm_deals    drop column if exists deleted_at;
--     - drop table if exists public.db_backup_drills;
--   No data is mutated, so rollback is non-destructive.
-- ─────────────────────────────────────────────────────────────────────


-- 1. ───────────────── admin_audit_log: append-only RLS ─────────────────
-- The audit table was created in 20260509_admin_panel_foundation.sql with
-- RLS enabled. We add RESTRICTIVE policies that block UPDATE and DELETE
-- for both anon and authenticated. Service-role bypasses RLS, so the
-- existing server-side writers continue to work.
--
-- Restrictive policies ALL must allow the operation; combined with the
-- existing permissive policies, the effective rule becomes:
--   - INSERT: allowed where the permissive policy allows.
--   - UPDATE: denied for anon + authenticated (using-expression = false).
--   - DELETE: denied for anon + authenticated (using-expression = false).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_audit_log'
  ) then
    -- Idempotent — drop and recreate so we can run this migration twice.
    execute 'drop policy if exists "admin_audit_log no update" on public.admin_audit_log';
    execute 'create policy "admin_audit_log no update"
               on public.admin_audit_log
               as restrictive
               for update
               to anon, authenticated
               using (false)
               with check (false)';

    execute 'drop policy if exists "admin_audit_log no delete" on public.admin_audit_log';
    execute 'create policy "admin_audit_log no delete"
               on public.admin_audit_log
               as restrictive
               for delete
               to anon, authenticated
               using (false)';
  end if;
end $$;


-- 2. ───────────────── slow-query digest ─────────────────
-- Only create the view if the pg_stat_statements extension is installed
-- on this database (Supabase usually has it available but unloaded by
-- default in some plans). The view exposes the top 50 by mean exec time
-- so admins can spot what to index.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    execute $view$
      create or replace view public.slow_queries_top_50 as
        select
          query,
          calls,
          mean_exec_time,
          total_exec_time,
          rows
        from public.pg_stat_statements
        order by mean_exec_time desc
        limit 50
    $view$;
  end if;
end $$;

-- admin_slow_queries — RPC that returns the slowest queries if the view
-- exists, or an empty set if pg_stat_statements isn't loaded. SECURITY
-- DEFINER so it can read the view regardless of caller grants; the body
-- still gates on admin_caller_is_admin() so non-admin callers get nothing.
create or replace function public.admin_slow_queries(limit_n int default 50)
returns table (
  query           text,
  calls           bigint,
  mean_exec_time  double precision,
  total_exec_time double precision,
  rows            bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_caller_is_admin() then
    return;
  end if;

  if not exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'slow_queries_top_50'
  ) then
    return;
  end if;

  return query execute format(
    'select query, calls, mean_exec_time, total_exec_time, rows
       from public.slow_queries_top_50
      limit %s',
    greatest(1, least(coalesce(limit_n, 50), 500))
  );
end;
$$;

revoke all on function public.admin_slow_queries(int) from public;
grant execute on function public.admin_slow_queries(int) to authenticated;


-- 3. ───────────────── table-size monitor view ─────────────────
-- Quick "what's eating disk" view over public schema. SECURITY INVOKER
-- (default) — pg_class/pg_namespace are world-readable so this works
-- for any authenticated caller; admin UI gates on the route.
create or replace view public.table_sizes as
  select
    n.nspname::text                                     as schema_name,
    c.relname::text                                     as table_name,
    pg_total_relation_size(c.oid)                       as total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid))       as total_pretty,
    c.reltuples::bigint                                 as row_estimate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname = 'public'
  order by pg_total_relation_size(c.oid) desc;


-- 4. ───────────────── soft-delete columns ─────────────────
-- Add `deleted_at` to the three core CRM entities that today have no
-- recovery path after a bulk-delete in the UI. Partial indexes keep the
-- active-row lookups fast (the index only stores rows where
-- deleted_at is null).
--
-- App-side reads must filter `deleted_at is null` to hide trashed rows
-- (RLS unchanged so the rows are still visible for a Trash view).

alter table public.crm_contacts
  add column if not exists deleted_at timestamptz;
create index if not exists crm_contacts_active_idx
  on public.crm_contacts (workspace_id)
  where deleted_at is null;

alter table public.crm_leads
  add column if not exists deleted_at timestamptz;
create index if not exists crm_leads_active_idx
  on public.crm_leads (workspace_id)
  where deleted_at is null;

alter table public.crm_deals
  add column if not exists deleted_at timestamptz;
create index if not exists crm_deals_active_idx
  on public.crm_deals (workspace_id)
  where deleted_at is null;


-- 5. ───────────────── audit log retention helper ─────────────────
-- Manual call, not scheduled. Lets an admin prune very old audit rows
-- if/when retention policy is set. Restrictive append-only policies
-- above DENY DELETE for anon+authenticated; this function runs as
-- SECURITY DEFINER so its DELETE bypasses RLS (the function owner is the
-- migration runner, typically `postgres`).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_audit_log'
  ) then
    execute $fn$
      create or replace function public.admin_purge_audit_log(p_older_than_days int)
      returns integer
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_deleted int;
      begin
        -- manual call, not scheduled
        if not public.admin_caller_is_admin() then
          raise exception 'admin only';
        end if;

        if p_older_than_days is null or p_older_than_days < 30 then
          raise exception 'retention floor is 30 days';
        end if;

        delete from public.admin_audit_log
         where created_at < now() - make_interval(days => p_older_than_days);

        get diagnostics v_deleted = row_count;
        return v_deleted;
      end;
      $body$
    $fn$;

    execute 'revoke all on function public.admin_purge_audit_log(int) from public';
    execute 'grant execute on function public.admin_purge_audit_log(int) to authenticated';
  end if;
end $$;


-- 6. ───────────────── backup drill log ─────────────────
-- Records each time we actually performed a restore-from-backup drill.
-- The launch checklist treats "have we ever restored?" as the gating
-- question; this is where we record the answer.
create table if not exists public.db_backup_drills (
  id            uuid primary key default gen_random_uuid(),
  drilled_at    timestamptz not null default now(),
  restored_to   text,                          -- e.g. "fresh Supabase project"
  ok            boolean not null,
  duration_min  int,
  notes         text,
  by_user       uuid references auth.users(id) on delete set null
);

alter table public.db_backup_drills enable row level security;
-- No policies — service-role-only via admin UI / scripts.

create index if not exists db_backup_drills_drilled_at_idx
  on public.db_backup_drills (drilled_at desc);
