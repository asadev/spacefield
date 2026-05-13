-- 2026-05-13 Pre-launch waitlist + suspicious-login event log.
--
-- waitlist_signups: collected by /waitlist before public launch. Public
-- inserts are allowed via a stored procedure that we expose; selects are
-- service-role only. We dedupe on (lower(email)) so a user clicking the
-- form twice doesn't bloat the list.
--
-- No RLS policies on direct table access — all writes go through the
-- public.waitlist_join RPC which sanitises input.

create table if not exists public.waitlist_signups (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  email_lower  text generated always as (lower(email)) stored,
  role         text,
  user_agent   text,
  source       text,
  ip_hash      text,
  created_at   timestamptz not null default now()
);

create unique index if not exists waitlist_signups_email_lower_idx
  on public.waitlist_signups (email_lower);

alter table public.waitlist_signups enable row level security;
-- No policies — selects/inserts via service role + the RPC below only.

create or replace function public.waitlist_join(
  p_email      text,
  p_role       text default null,
  p_user_agent text default null,
  p_source     text default null,
  p_ip_hash    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Tiny validation. Real email RFC is sprawling; we just reject obvious junk.
  if p_email is null or length(p_email) > 255 or position('@' in p_email) = 0 then
    raise exception 'invalid email';
  end if;

  insert into public.waitlist_signups (email, role, user_agent, source, ip_hash)
  values (p_email, nullif(p_role, ''), p_user_agent, p_source, p_ip_hash)
  on conflict (email_lower) do nothing;
end;
$$;

-- Allow anon role to call the RPC (it's the form action invoker).
revoke all on function public.waitlist_join(text, text, text, text, text) from public;
grant execute on function public.waitlist_join(text, text, text, text, text) to anon, authenticated;
