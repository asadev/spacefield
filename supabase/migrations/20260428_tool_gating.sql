-- Add per-tool kill switch + tier allow-list + per-workspace override.
-- 2026-04-28

-- ─── tools registry ───
-- A row per tool slug. Created lazily on first admin edit; default
-- behavior for unrecorded slugs is "live + allowed by tier rules".
create table if not exists public.tool_settings (
  slug         text primary key,
  disabled     boolean not null default false,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.tool_settings enable row level security;

drop policy if exists "anyone reads tool_settings" on public.tool_settings;
create policy "anyone reads tool_settings"
  on public.tool_settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "admins write tool_settings" on public.tool_settings;
create policy "admins write tool_settings"
  on public.tool_settings for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- ─── tier allow-list column ───
alter table public.subscription_tiers
  add column if not exists allowed_tool_slugs jsonb not null default '[]'::jsonb;

-- ─── per-workspace overrides ───
-- granted = true: workspace can install this tool (overrides tier).
-- granted = false: workspace cannot install this tool (overrides tier allow).
create table if not exists public.workspace_tool_grants (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug         text not null,
  granted      boolean not null,
  granted_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, slug)
);

alter table public.workspace_tool_grants enable row level security;

drop policy if exists "members read grants" on public.workspace_tool_grants;
create policy "members read grants"
  on public.workspace_tool_grants for select
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write grants" on public.workspace_tool_grants;
create policy "admins write grants"
  on public.workspace_tool_grants for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- ─── availability check helper ───
-- Resolves: is this tool installable in this workspace by this caller?
-- Returns 'allowed' | 'disabled' | 'tier_locked' | 'workspace_blocked'.
-- Caller must be a member of the workspace; admins always 'allowed'.
create or replace function public.tool_availability(ws_id uuid, tool_slug text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_disabled boolean;
  override   boolean;
  tier_id    text;
  allowed    jsonb;
  is_admin   boolean;
begin
  select disabled into is_disabled from public.tool_settings where slug = tool_slug;
  if coalesce(is_disabled, false) then
    return 'disabled';
  end if;

  is_admin := public.admin_caller_is_admin();
  if is_admin then
    return 'allowed';
  end if;

  select granted into override
  from public.workspace_tool_grants
  where workspace_id = ws_id and slug = tool_slug;

  if override is not null then
    return case when override then 'allowed' else 'workspace_blocked' end;
  end if;

  select s.tier_id, t.allowed_tool_slugs into tier_id, allowed
  from public.workspaces w
  left join public.subscriptions s on s.user_id = w.user_id
  left join public.subscription_tiers t on t.tier_id = coalesce(s.tier_id, 'free')
  where w.id = ws_id;

  if allowed is null or jsonb_array_length(allowed) = 0 then
    -- empty allow-list = allow everything (compat default until admin
    -- explicitly trims a tier).
    return 'allowed';
  end if;

  if exists (select 1 from jsonb_array_elements_text(allowed) e where e = tool_slug) then
    return 'allowed';
  end if;

  return 'tier_locked';
end;
$$;

grant execute on function public.tool_availability(uuid, text) to authenticated;
