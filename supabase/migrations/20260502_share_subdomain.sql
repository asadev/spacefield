-- ─────────────────────────────────────────────────────────────────────────
-- Share custom subdomain per workspace.
--
-- Each workspace can claim a unique sub.share.example.com (e.g. "acme.share.example.com").
-- All links minted by that workspace then resolve at the custom subdomain by
-- default, with the apex share.example.com as a fallback.
--
-- Reservation rules:
--   - 3-32 chars, lowercase letters/digits/hyphen, must start with a letter
--   - Globally unique
--   - Reserved words (www, api, admin, mail, etc.) blocked
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspaces
  add column if not exists share_subdomain text;

-- Case-insensitive uniqueness; nulls allowed (most workspaces won't claim one)
create unique index if not exists workspaces_share_subdomain_uniq
  on public.workspaces (lower(share_subdomain))
  where share_subdomain is not null;

-- Validation function used by the claim RPC
create or replace function public.share_subdomain_valid(p_sub text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_reserved text[] := array[
    'www','api','admin','mail','app','staff','support','help','blog',
    'docs','status','assets','static','cdn','dev','staging','test',
    'example','root','localhost','share','share','public','private'
  ];
begin
  if p_sub is null then return false; end if;
  if length(p_sub) < 3 or length(p_sub) > 32 then return false; end if;
  if p_sub <> lower(p_sub) then return false; end if;
  if not p_sub ~ '^[a-z][a-z0-9-]*[a-z0-9]$' then return false; end if;
  if p_sub = any(v_reserved) then return false; end if;
  return true;
end;
$$;

-- Atomic claim RPC
create or replace function public.share_claim_subdomain(
  p_workspace_id uuid,
  p_subdomain    text   -- pass null to clear
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_lower text;
begin
  -- Must be a member with admin/owner role
  select role into v_role
    from public.workspace_members
   where workspace_id = p_workspace_id
     and user_id = auth.uid();

  if v_role is null then
    raise exception 'not a member of this workspace';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'only owners or admins can change the subdomain';
  end if;

  if p_subdomain is null then
    update public.workspaces set share_subdomain = null where id = p_workspace_id;
    return null;
  end if;

  v_lower := lower(trim(p_subdomain));

  if not public.share_subdomain_valid(v_lower) then
    raise exception 'invalid subdomain (3-32 chars, [a-z0-9-], starts with a letter, not reserved)';
  end if;

  -- Check uniqueness explicitly so the error message is friendly
  if exists (
    select 1 from public.workspaces
     where lower(share_subdomain) = v_lower
       and id <> p_workspace_id
  ) then
    raise exception 'subdomain already taken';
  end if;

  update public.workspaces set share_subdomain = v_lower where id = p_workspace_id;
  return v_lower;
end;
$$;

grant execute on function public.share_subdomain_valid    to anon, authenticated;
grant execute on function public.share_claim_subdomain    to authenticated;

comment on column public.workspaces.share_subdomain is
  'Custom subdomain for share.example.com (e.g. "acme" → acme.share.example.com). Globally unique.';
