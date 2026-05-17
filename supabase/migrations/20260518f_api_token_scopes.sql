-- 2026-05-18 Public API v1 scope expansion for api_tokens.
--
-- The /api/v1/* namespace (W5) introduces resource-specific read scopes
-- so a token can be granted "just enough" access:
--
--   read:tasks   read:projects   read:contacts
--   read:deals   read:employees  read:all (catch-all)
--
-- The existing `api_tokens.scopes` column is `jsonb` and stores a JSON
-- array of strings. We keep that representation (no schema change
-- required to admit the new values) and add a parallel `text[]` view
-- column for the tools that prefer native array semantics — `scopes_arr`.
-- The two columns are kept in sync via a trigger.
--
-- We also expose a server-side helper `api_token_has_scope(token_id,
-- scope)` so RLS-aware callers can ask the question in SQL without
-- duplicating the wildcard logic.

-- ─── 1. scopes_arr column (text[]) ───────────────────────────────────
alter table public.api_tokens
  add column if not exists scopes_arr text[] not null default '{}'::text[];

-- Backfill from the jsonb column once.
update public.api_tokens
   set scopes_arr = coalesce(
     (
       select array_agg(value::text)
       from jsonb_array_elements_text(scopes) as t(value)
     ),
     '{}'::text[]
   )
 where scopes_arr = '{}'::text[]
   and jsonb_typeof(scopes) = 'array'
   and jsonb_array_length(scopes) > 0;

-- Keep scopes_arr in sync with scopes (in case the existing admin UI
-- still writes the jsonb column).
create or replace function public.api_tokens_sync_scopes()
returns trigger
language plpgsql
as $$
begin
  if new.scopes is null then
    new.scopes := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.scopes) = 'array' then
    new.scopes_arr := coalesce(
      (
        select array_agg(value::text)
        from jsonb_array_elements_text(new.scopes) as t(value)
      ),
      '{}'::text[]
    );
  else
    new.scopes_arr := '{}'::text[];
  end if;
  return new;
end;
$$;

drop trigger if exists api_tokens_sync_scopes_t on public.api_tokens;
create trigger api_tokens_sync_scopes_t
  before insert or update of scopes on public.api_tokens
  for each row
  execute function public.api_tokens_sync_scopes();

create index if not exists api_tokens_scopes_arr_gin
  on public.api_tokens using gin (scopes_arr);

-- ─── 2. scope-check helper ───────────────────────────────────────────
-- Returns true if the token row holds either the requested scope or one
-- of the wildcards `read:all` / `admin:write`. The helper is `stable`
-- (no side-effects) so it can be inlined into RLS policies if needed.
create or replace function public.api_token_has_scope(
  p_token_id uuid,
  p_scope    text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.api_tokens
    where id = p_token_id
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and (
        p_scope = any(scopes_arr)
        or 'read:all'    = any(scopes_arr)
        or 'admin:write' = any(scopes_arr)
      )
  );
$$;

grant execute on function public.api_token_has_scope(uuid, text)
  to anon, authenticated, service_role;

-- ─── 3. Document the v1 scope catalogue ──────────────────────────────
-- Mirrors lib/api-tokens/verify.ts::V1_SCOPES. Useful as on-DB metadata
-- for ad-hoc dashboards.
comment on column public.api_tokens.scopes_arr is
  'Granted scopes (text[]). Catalogue: read:tasks, read:projects, '
  '|| read:contacts, read:deals, read:employees, read:all, plus legacy '
  '|| scopes mirrored from `scopes` jsonb column.';
