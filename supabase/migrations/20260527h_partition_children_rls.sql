-- Enable RLS on partition CHILDREN of internal analytics parent tables,
-- and add an event trigger so any future monthly partition of these
-- parents auto-inherits RLS without manual intervention.
--
-- Background:
--   Supabase advisor flagged 12 tables (rls_disabled_in_public) on
--   2026-05-25. All 12 were partition children of:
--     - ai_calls_partitioned
--     - api_latency_partitioned
--     - auth_failures_partitioned
--     - login_events_partitioned
--   The parents already had RLS enabled with zero policies (the right
--   posture for service-role-only analytics tables), but PostgreSQL
--   partitioning does NOT inherit RLS to children. Each partition was
--   independently readable/writable by anon + authenticated roles via
--   the project URL. Caught + remediated by the maintainer's forwarded advisor
--   email on 2026-05-27.
--
-- This migration:
--   1. Enables RLS on every existing partition child (no policies →
--      default-deny for non-superuser, service role bypasses → matches
--      parent table behaviour).
--   2. Installs an event trigger on CREATE TABLE that detects new
--      partitions of these parents and enables RLS automatically.
--
-- Idempotent: all statements are safe to re-run.

alter table if exists public.ai_calls_partitioned_default enable row level security;
alter table if exists public.ai_calls_partitioned_y2026_m05 enable row level security;
alter table if exists public.ai_calls_partitioned_y2026_m06 enable row level security;
alter table if exists public.api_latency_partitioned_default enable row level security;
alter table if exists public.api_latency_partitioned_y2026_m05 enable row level security;
alter table if exists public.api_latency_partitioned_y2026_m06 enable row level security;
alter table if exists public.auth_failures_partitioned_default enable row level security;
alter table if exists public.auth_failures_partitioned_y2026_m05 enable row level security;
alter table if exists public.auth_failures_partitioned_y2026_m06 enable row level security;
alter table if exists public.login_events_partitioned_default enable row level security;
alter table if exists public.login_events_partitioned_y2026_m05 enable row level security;
alter table if exists public.login_events_partitioned_y2026_m06 enable row level security;

-- Event trigger: any future partition child of the 4 analytics parents
-- gets RLS enabled on CREATE TABLE. Prevents the advisor from
-- re-flagging the same issue every month when a new partition lands.
create or replace function public._enable_rls_on_new_partitions()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
  parent_oid oid;
  parent_name text;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
  loop
    if obj.schema_name = 'public' then
      select i.inhparent into parent_oid
      from pg_inherits i
      where i.inhrelid = obj.objid
      limit 1;
      if parent_oid is not null then
        select c.relname into parent_name
        from pg_class c
        where c.oid = parent_oid;
        if parent_name in (
          'ai_calls_partitioned',
          'api_latency_partitioned',
          'auth_failures_partitioned',
          'login_events_partitioned'
        ) then
          execute format(
            'alter table %s enable row level security',
            obj.object_identity
          );
          raise notice 'enabled RLS on new partition %', obj.object_identity;
        end if;
      end if;
    end if;
  end loop;
end
$$;

drop event trigger if exists enable_rls_on_new_partitions;
create event trigger enable_rls_on_new_partitions
on ddl_command_end
when tag in ('CREATE TABLE')
execute function public._enable_rls_on_new_partitions();
