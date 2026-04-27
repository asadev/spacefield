-- 2026-04-28 — Polar.sh billing integration.
--
-- Wires our existing tier + storage-addon rows to live Polar
-- subscription IDs so the webhook can authoritatively flip state.
--
-- Pre-existing rows from the v1 mock flow keep working: any
-- workspace_storage_addons row that pre-dates this migration gets
-- payment_status = 'mock', and the cap RPC keeps treating those as
-- effective until the user re-purchases via Polar.

-- ─── subscriptions: link to Polar ───
alter table public.subscriptions
  add column if not exists polar_customer_id     text,
  add column if not exists polar_subscription_id text unique,
  add column if not exists polar_status          text,
  add column if not exists current_period_end    timestamptz;

-- ─── workspace_storage_addons: payment status ───
alter table public.workspace_storage_addons
  add column if not exists polar_subscription_id text unique,
  add column if not exists polar_status          text,
  add column if not exists payment_status        text not null default 'mock',
  add column if not exists current_period_end    timestamptz;

-- ─── webhook event log (idempotency + audit) ───
create table if not exists public.polar_webhook_events (
  event_id     text primary key,
  type         text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.polar_webhook_events enable row level security;
-- No policies → only service-role can read/write. Webhook handler runs
-- with service role.

-- ─── effective cap update ───
-- Only count active (or legacy mock) add-ons toward the cap. Pending
-- add-ons (just-clicked-checkout, webhook hasn't fired) do NOT count.
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
    select coalesce((
      select addon_gb
      from public.workspace_storage_addons
      where workspace_id = ws_id
        and payment_status in ('mock','active')
    ), 0)::bigint as addon_gb
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
