-- 20260428_tier_member_caps.sql
--
-- Realign tier prices, member caps, and storage caps with the live
-- product model:
--   Free:  $0/mo,  1 user (no invites), 5 GB
--   Pro:   $10/mo, 1 user (no invites), 100 GB
--   Team:  $30/mo, 5 members included, 1 TB; extra seats $5/mo each
--          (the +seats add-on is a separate Paddle product handled
--          outside this migration).
--   Enterprise: bespoke (unchanged).
--
-- Also adds a trigger that ENFORCES the member cap on
-- workspace_members INSERT — prior versions stored the cap as data
-- only, which let invites bypass the limit silently.

-- Update existing tier rows.
update public.subscription_tiers
   set price_cents_monthly = 0,
       price_cents_yearly = 0,
       max_owned_workspaces = 1,
       max_storage_per_workspace_mb = 5120,
       max_members_per_workspace = 1,
       updated_at = now()
 where tier_id = 'free';

update public.subscription_tiers
   set price_cents_monthly = 1000,
       price_cents_yearly = 8400,
       max_owned_workspaces = 1,
       max_storage_per_workspace_mb = 102400,
       max_members_per_workspace = 1,
       updated_at = now()
 where tier_id = 'pro';

update public.subscription_tiers
   set price_cents_monthly = 3000,
       price_cents_yearly = 25200,
       max_owned_workspaces = 25,
       max_storage_per_workspace_mb = 1048576,
       max_members_per_workspace = 5,
       updated_at = now()
 where tier_id = 'team';

-- ─────────────────── member-cap enforcement ───────────────────────────
-- Fires before INSERT on workspace_members. Reads the workspace OWNER's
-- tier (members can be on any plan; only the owner's plan counts toward
-- the cap — that's the entity paying for the seat). If the owner has
-- purchased extra seats, those are not yet in scope (Paddle product
-- pending) so we add a hook here that future migrations can extend.
--
-- Bypasses on the owner's own row (the on_workspace_created trigger
-- inserts the owner as the first member; we never want to block that).

create or replace function public.enforce_workspace_member_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_uid uuid;
  cap integer;
  current_count integer;
  extra_seats integer := 0;
begin
  -- Look up the workspace's owner.
  select user_id into owner_uid
    from public.workspaces
   where id = new.workspace_id;

  -- Owner adding themselves: never blocked. on_workspace_created uses
  -- service-role and seeds the owner row immediately after the
  -- workspace insert; that bypass keeps the cap from rejecting the
  -- workspace's first member (the owner).
  if owner_uid is null or new.user_id = owner_uid then
    return new;
  end if;

  -- Pull the owner's tier cap. Free + Pro = 1 (owner only); Team = 5.
  select t.max_members_per_workspace
    into cap
    from public.subscriptions s
    join public.subscription_tiers t on t.tier_id = s.tier_id
   where s.user_id = owner_uid;

  -- No subscription row → assume free tier cap.
  if cap is null then cap := 1; end if;

  -- Future hook: workspace_extra_seats table (Paddle "Team Seat"
  -- add-on, $5/mo each). When that table exists this query becomes a
  -- COALESCE. Until then extra_seats stays 0.
  -- select coalesce(num_seats, 0) into extra_seats
  --   from public.workspace_extra_seats where workspace_id = new.workspace_id;
  cap := cap + coalesce(extra_seats, 0);

  -- Existing member count (excludes the row about to be inserted).
  select count(*) into current_count
    from public.workspace_members
   where workspace_id = new.workspace_id;

  if current_count >= cap then
    raise exception 'workspace member cap reached for tier (% members allowed)', cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_member_quota on public.workspace_members;
create trigger workspace_member_quota
  before insert on public.workspace_members
  for each row execute function public.enforce_workspace_member_quota();
