-- Drop Polar billing columns. Paddle replaces it entirely.
-- 2026-04-29

alter table public.subscriptions
  drop column if exists polar_customer_id,
  drop column if exists polar_subscription_id,
  drop column if exists polar_status;

alter table public.workspace_storage_addons
  drop column if exists polar_subscription_id,
  drop column if exists polar_status;

drop table if exists public.polar_webhook_events;

-- The shared current_period_end stays — Paddle uses it too.
