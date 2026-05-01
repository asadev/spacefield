-- Spacefield rate limiting — Postgres-backed sliding-window counter.
--
-- One row per rate-limit key (e.g. "user:<uuid>:agent-dispatch" or
-- "ip:1.2.3.4:inbound-form"). The window slides forward when
-- now() - window_start exceeds the configured window length, at which
-- point the counter resets.
--
-- Callers go through public.rate_limit_check(p_key, p_max, p_window_seconds)
-- which is SECURITY DEFINER, so the table itself stays fully locked
-- under RLS. Anon + authenticated can only invoke the RPC.
--
-- The RPC is one atomic INSERT … ON CONFLICT statement — no two-step
-- read/update gap, so concurrent requests with the same key can't
-- race past the cap.

create table if not exists public.rate_limit_buckets (
  id           text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;

-- Hard lock: no role gets direct table access. The SECURITY DEFINER
-- RPC is the only way in.
drop policy if exists "rate_limit_buckets no access" on public.rate_limit_buckets;
create policy "rate_limit_buckets no access"
  on public.rate_limit_buckets
  for all
  using (false)
  with check (false);

revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.rate_limit_check(
  p_key text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count int;
begin
  -- Atomic upsert: reset window if expired, else increment. The
  -- counter ALWAYS ticks for the current call (even denied ones) so
  -- the original "cap-at-p_max" idea (which made the returning check
  -- always-true once the cap was hit) is gone. The counter is now
  -- bounded by RPS × window_seconds per key — fits well inside int4
  -- even under heavy abuse.
  insert into public.rate_limit_buckets as b (id, count, window_start)
  values (p_key, 1, v_now)
  on conflict (id) do update
    set
      count = case
        when v_now - b.window_start > make_interval(secs => p_window_seconds)
          then 1
        else b.count + 1
      end,
      window_start = case
        when v_now - b.window_start > make_interval(secs => p_window_seconds)
          then v_now
        else b.window_start
      end
  returning b.count into v_count;

  return coalesce(v_count, 1) <= p_max;
end;
$$;

revoke all on function public.rate_limit_check(text, int, int) from public;
grant execute on function public.rate_limit_check(text, int, int)
  to anon, authenticated, service_role;
