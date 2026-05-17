-- ─────────────────────────────────────────────────────────────────────
-- 20260519a_outbox_and_locks.sql
--
-- Wave-3 Y1: reliability primitives.
--
--   1. public.event_outbox  — transactional outbox table. Server actions
--      that need to fire a side-effect "exactly once even on retry"
--      insert a row here inside the same transaction as the primary
--      write; the relay cron (/api/cron/outbox-relay, once a minute)
--      picks queued rows and emits them, then marks them processed.
--
--   2. public.try_advisory_lock_str(p_key text) → returns boolean
--      Single-call wrapper around pg_try_advisory_xact_lock(bigint).
--      Used by lib/db/advisory-lock.ts to gate "only one runner at a
--      time" cron paths (workflow runner, ai-batch runner, the outbox
--      relay itself).
--
--   3. public.claim_outbox_batch(p_limit int) → setof event_outbox rows
--      Atomic claim: flips up to N queued/failed rows from
--      status='queued' → 'processing' inside a single UPDATE, returning
--      the claimed rows. Lets the relay parallelise across ticks
--      without double-dispatch even if the advisory-lock gate isn't
--      held (defence in depth).
--
-- The outbox is intentionally simple: a strongly-typed event_type +
-- a jsonb payload + retry bookkeeping. Consumers (webhooks, push,
-- audit fan-out) are dispatched server-side by the relay cron — the
-- transport-specific code stays in TypeScript so we don't recreate
-- the wheel inside plpgsql.
-- ─────────────────────────────────────────────────────────────────────


-- ────────── 1. event_outbox table ──────────

create table if not exists public.event_outbox (
  id            uuid        primary key default gen_random_uuid(),
  event_type    text        not null,
  payload       jsonb       not null default '{}'::jsonb,
  status        text        not null default 'queued'
                check (status in ('queued','processing','processed','failed','dead')),
  attempts      int         not null default 0,
  max_attempts  int         not null default 5,
  next_attempt_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  /** Optional dedup token — when set, a second insert with the same
   *  token is silently ignored. Lets producers be safely retried at
   *  the application layer without producing duplicate outbox rows. */
  dedupe_key    text
);

-- Partial index: hot path is "next queued row to process".
create index if not exists event_outbox_due_idx
  on public.event_outbox (next_attempt_at)
  where status in ('queued','failed');

-- Triage index for status pages / observability.
create index if not exists event_outbox_status_created_idx
  on public.event_outbox (status, created_at desc);

-- Dedup uniqueness — partial so NULLs don't conflict.
create unique index if not exists event_outbox_dedupe_uidx
  on public.event_outbox (dedupe_key)
  where dedupe_key is not null;

alter table public.event_outbox enable row level security;
-- No policies — service-role only. Outbox is internal plumbing; the
-- application reads it via createAdminClient().


-- ────────── 2. try_advisory_lock_str ──────────

-- Hashes the string key into a bigint with the built-in
-- `extensions.hashtextextended` (seed=0) and attempts a transaction-
-- scoped advisory lock with it. Returns true when the lock was newly
-- acquired by the calling transaction, false if another transaction
-- already holds it.
--
-- Because pg_try_advisory_xact_lock is xact-scoped, the lock is
-- released the moment this function returns (PostgREST wraps each
-- function call in its own transaction). The TypeScript caller uses
-- the boolean as a gate — see lib/db/advisory-lock.ts for the full
-- pattern + trade-offs.

create or replace function public.try_advisory_lock_str(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k bigint;
  ok boolean;
begin
  if p_key is null or length(p_key) = 0 then
    return false;
  end if;
  -- hashtextextended lives in the `extensions` schema by default on
  -- Supabase. Seed is arbitrary but fixed so we get stable hashes
  -- across deploys.
  k := extensions.hashtextextended(p_key, 0::bigint);
  ok := pg_try_advisory_xact_lock(k);
  return ok;
end
$$;

revoke all on function public.try_advisory_lock_str(text) from public;
-- Service-role only.


-- ────────── 3. claim_outbox_batch ──────────

-- Atomically claim up to `p_limit` due rows. Sets status='processing',
-- bumps attempts, and returns the claimed rows so the relay knows what
-- to dispatch. The `FOR UPDATE SKIP LOCKED` semantics built into the
-- CTE update mean concurrent relays don't double-claim — but we still
-- recommend gating the relay with the advisory lock above.

create or replace function public.claim_outbox_batch(p_limit int default 25)
returns setof public.event_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  capped int := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  return query
    with picked as (
      select id
        from public.event_outbox
       where status in ('queued', 'failed')
         and next_attempt_at <= now()
         and attempts < max_attempts
       order by next_attempt_at asc
       limit capped
         for update skip locked
    )
    update public.event_outbox o
       set status = 'processing',
           attempts = o.attempts + 1
      from picked
     where o.id = picked.id
    returning o.*;
end
$$;

revoke all on function public.claim_outbox_batch(int) from public;


-- ────────── 4. event_outbox_mark_processed / mark_failed helpers ──────────

-- Convenience helpers so the TypeScript relay doesn't have to write
-- two near-identical UPDATEs. Both run as SECURITY DEFINER under
-- service-role and are not granted to the public role.

create or replace function public.event_outbox_mark_processed(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.event_outbox
     set status = 'processed',
         processed_at = now(),
         error = null
   where id = p_id;
$$;

revoke all on function public.event_outbox_mark_processed(uuid) from public;

create or replace function public.event_outbox_mark_failed(
  p_id     uuid,
  p_error  text,
  p_backoff_seconds int default 60
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row record;
begin
  select attempts, max_attempts
    into row
    from public.event_outbox
   where id = p_id;
  if not found then
    return;
  end if;

  if row.attempts >= row.max_attempts then
    update public.event_outbox
       set status = 'dead',
           error = p_error,
           processed_at = now()
     where id = p_id;
  else
    update public.event_outbox
       set status = 'failed',
           error = p_error,
           next_attempt_at = now() + make_interval(secs => greatest(1, p_backoff_seconds))
     where id = p_id;
  end if;
end
$$;

revoke all on function public.event_outbox_mark_failed(uuid, text, int) from public;
