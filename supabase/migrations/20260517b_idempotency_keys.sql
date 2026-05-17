-- 2026-05-17 Idempotency keys table — backs lib/idempotency.ts
-- withIdempotency() helper. When a request carries an idempotency key,
-- we look it up here; if found, return the cached response_body +
-- response_status. Otherwise execute the operation, store the result.
--
-- TTL: rows older than 24h are pruned by lib/idempotency.ts on hit;
-- backup cron at /api/cron/idempotency-purge runs nightly.

create table if not exists public.idempotency_keys (
  key             text primary key,
  response_status int not null,
  response_body   jsonb,
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  created_at      timestamptz not null default now()
);

create index if not exists idempotency_keys_expires_idx
  on public.idempotency_keys (expires_at);

alter table public.idempotency_keys enable row level security;
-- No policies — service-role only access.
