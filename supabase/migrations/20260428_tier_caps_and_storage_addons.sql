-- 2026-04-28
-- Raise tier base caps to generous defaults + add à la carte storage
-- add-on system. Add-on selection lives at the WORKSPACE level so
-- different workspaces under the same owner can have different caps.

-- ─── update existing tier rows ───
update public.subscription_tiers
   set max_storage_per_workspace_mb = case tier_id
     when 'free'       then 5 * 1024            -- 5 GB
     when 'pro'        then 100 * 1024          -- 100 GB
     when 'team'       then 1024 * 1024         -- 1 TB
     when 'enterprise' then 1024 * 1024         -- 1 TB (admin can raise)
     else max_storage_per_workspace_mb
   end
 where tier_id in ('free','pro','team','enterprise');

-- ─── storage add-ons table ───
-- One row per workspace with the currently-selected add-on (or absent
-- = no add-on). When payment ships we'll add stripe_subscription_id
-- and validity_period columns; for v1 a row simply means "the user
-- chose this add-on, apply it to the cap".
create table if not exists public.workspace_storage_addons (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  addon_gb      integer not null check (addon_gb in (500, 2048, 10240)),
  selected_by   uuid references auth.users(id) on delete set null,
  selected_at   timestamptz not null default now()
);

alter table public.workspace_storage_addons enable row level security;

drop policy if exists "owners admins read addon" on public.workspace_storage_addons;
create policy "owners admins read addon"
  on public.workspace_storage_addons for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

drop policy if exists "owners write addon" on public.workspace_storage_addons;
create policy "owners write addon"
  on public.workspace_storage_addons for all
  using (public.workspace_role_of(workspace_id) = 'owner')
  with check (public.workspace_role_of(workspace_id) = 'owner');

-- ─── replace workspace_storage RPC ───
-- New cap = tier base + add-on. Used by Files Manager / Documents /
-- Sheets / Chat to show + enforce quotas.
create or replace function public.workspace_storage(ws_id uuid)
returns table (
  cap_bytes  bigint,
  used_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with owner as (
    select user_id from public.workspaces where id = ws_id
  ), owner_tier as (
    select coalesce(s.tier_id, 'free') as tier_id from owner o
    left join public.subscriptions s on s.user_id = o.user_id
  ), base as (
    select (t.max_storage_per_workspace_mb::bigint * 1024 * 1024) as base_bytes
    from owner_tier ot
    join public.subscription_tiers t on t.tier_id = ot.tier_id
  ), addon as (
    select coalesce((select addon_gb from public.workspace_storage_addons where workspace_id = ws_id), 0)::bigint as addon_gb
  ), used as (
    select coalesce(sum(size_bytes), 0)::bigint as used_bytes
    from public.workspace_files
    where workspace_id = ws_id
      and deleted_at is null
  )
  select
    (base.base_bytes + (addon.addon_gb * 1024 * 1024 * 1024))::bigint as cap_bytes,
    used.used_bytes
  from base, addon, used;
$$;
