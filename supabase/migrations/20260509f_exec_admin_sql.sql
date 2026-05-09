-- 20260509f_exec_admin_sql.sql
--
-- Admin custom-page block library needs a way to run admin-authored SELECT
-- queries from the server. We add a SECURITY DEFINER function gated on
-- public.admin_caller_is_admin(), with text-level guards rejecting anything
-- that isn't a single SELECT or WITH statement and rejecting chained
-- statements (semi-colon followed by non-whitespace).
--
-- Returns `setof jsonb` so supabase-js receives an array of jsonb rows
-- (one per result row), each one a `to_jsonb(t)` of the SELECT row.
--
-- Plus a back-compat alias `admin_exec_select(query text)` that the existing
-- lib/admin-blocks/index.ts fallback expects.

create or replace function public.exec_admin_sql(query text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := lower(ltrim(query));
begin
  if not public.admin_caller_is_admin() then
    raise exception 'forbidden — admin only';
  end if;
  if trimmed not like 'select %' and trimmed not like 'with %' then
    raise exception 'only SELECT or WITH queries are allowed';
  end if;
  -- additional safety: reject semi-colon followed by non-whitespace (chained statements)
  if query ~ ';\s*\S' then
    raise exception 'chained statements are not allowed';
  end if;
  return query execute format('select to_jsonb(t) from (%s) as t', query);
end;
$$;
grant execute on function public.exec_admin_sql(text) to authenticated;

-- Back-compat alias used by lib/admin-blocks/index.ts fallback
create or replace function public.admin_exec_select(query text)
returns setof jsonb
language sql
security definer
set search_path = public
as $$ select public.exec_admin_sql(query); $$;
grant execute on function public.admin_exec_select(text) to authenticated;
