-- Agent BG — v7 admin panel.
--
-- Adds first-class support for "custom" iframe apps inside the OS shell:
--   - extends app_registry with custom_url, tool_kind, is_user_created
--   - admin-only RPC `register_custom_app(...)` for safe insertion with
--     URL + slug validation
--
-- Pre-existing apps stay backwards-compatible (tool_kind defaults to
-- 'native', is_user_created defaults to false). Iframe routing reads
-- custom_url. Native apps continue to ignore the new columns.

alter table public.app_registry
  add column if not exists custom_url      text,
  add column if not exists tool_kind       text not null default 'native'
    check (tool_kind in ('native','iframe','redirect')),
  add column if not exists is_user_created boolean not null default false;

create index if not exists app_registry_user_created_idx
  on public.app_registry(is_user_created)
  where is_user_created = true;

-- ───────────────────────────────────────────────────────────────────
-- Helper RPC: admin-only insert.
--
-- Validates:
--   * caller is admin (admin_caller_is_admin())
--   * URL begins with https:// (or http://localhost for dev)
--   * slug is lowercase letters, digits, hyphens, starting with a letter
--
-- Returns the freshly inserted app_registry row.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.register_custom_app(
  p_id          text,
  p_title       text,
  p_url         text,
  p_description text default '',
  p_icon        text default null,
  p_access_mode text default 'authenticated'
)
returns public.app_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.app_registry;
begin
  if not public.admin_caller_is_admin() then
    raise exception 'forbidden — admin only';
  end if;

  -- validate URL begins with https://
  if p_url is null or not (p_url like 'https://%' or p_url like 'http://localhost%') then
    raise exception 'custom_url must be https:// (http://localhost allowed for dev)';
  end if;

  -- validate slug
  if p_id is null or p_id !~ '^[a-z][a-z0-9-]*$' then
    raise exception 'id must be lowercase letters, digits, hyphens; start with letter';
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title must not be empty';
  end if;

  if p_access_mode is null or p_access_mode not in ('public','authenticated','tier','allowlist','admin_only') then
    raise exception 'invalid access_mode';
  end if;

  insert into public.app_registry
    (id, domain, title, description, category, icon, custom_url, tool_kind, is_user_created, access_mode, published)
  values
    (p_id, 'solutions', p_title, coalesce(p_description, ''), 'custom', p_icon, p_url, 'iframe', true, p_access_mode, true)
  returning * into new_row;

  return new_row;
end;
$$;

grant execute on function public.register_custom_app(text, text, text, text, text, text) to authenticated;
