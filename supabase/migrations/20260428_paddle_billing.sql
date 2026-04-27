-- 2026-04-28 Paddle billing integration. Mirrors the polar columns on
-- subscriptions + workspace_storage_addons + an idempotency log.

alter table public.subscriptions
  add column if not exists paddle_customer_id     text,
  add column if not exists paddle_subscription_id text unique,
  add column if not exists paddle_status          text;

alter table public.workspace_storage_addons
  add column if not exists paddle_subscription_id text unique,
  add column if not exists paddle_status          text;

create table if not exists public.paddle_webhook_events (
  event_id   text primary key,
  type       text not null,
  payload    jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.paddle_webhook_events enable row level security;
-- No policies → only service-role can read/write.
