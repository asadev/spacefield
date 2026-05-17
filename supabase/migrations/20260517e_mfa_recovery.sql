-- 2026-05-17 MFA recovery codes (Security S4).
--
-- Backstop for users who enroll a TOTP authenticator and then lose the
-- device. Codes are issued in batches (default 8), are single-use, and
-- regenerating a batch invalidates every previously-issued un-used code.
--
-- Storage: only the hash is persisted server-side; the plain code is
-- shown to the user exactly once at generation time. We use SHA-256 of
-- (server-pepper || code) — these are 50-bit entropy single-use tokens,
-- not passwords, so a single peppered hash is appropriate (and lets us
-- look up consumption with an equality scan instead of needing bcrypt
-- per-row work).
--
-- RPC `consume_mfa_recovery_code` is the only write path callers use; it
-- runs SECURITY DEFINER so the row update bypasses the read-only RLS
-- policy below.

create table if not exists public.mfa_recovery_codes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  code_hash    text not null,
  used_at      timestamptz,
  used_ip_hash text,
  created_at   timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id) where used_at is null;

create unique index if not exists mfa_recovery_codes_hash_idx
  on public.mfa_recovery_codes (user_id, code_hash);

alter table public.mfa_recovery_codes enable row level security;

-- Read-only own-rows. We never re-expose the hash usefully — knowing
-- your own bcrypt-like hash doesn't help an attacker reverse it — but
-- the view below is the documented surface for the UI to count
-- remaining codes.
drop policy if exists mfa_recovery_codes_select_own on public.mfa_recovery_codes;
create policy mfa_recovery_codes_select_own
  on public.mfa_recovery_codes for select to authenticated
  using (user_id = auth.uid());

-- Convenience view — strips hash + ip columns so the UI can render the
-- "N codes remaining" badge without ever pulling the secret material.
create or replace view public.my_mfa_recovery_codes as
  select id, used_at, created_at
    from public.mfa_recovery_codes
   where user_id = auth.uid();

grant select on public.my_mfa_recovery_codes to authenticated;

-- ============================================================
-- RPC: consume_mfa_recovery_code
-- ============================================================
-- Called from /auth/reauth when the user enters a recovery code instead
-- of their TOTP. The caller must already be authenticated (auth.uid()
-- is checked). Returns true if a matching un-used row existed and was
-- just marked used; false otherwise. Constant-ish time on the happy
-- path; we don't try to be timing-safe against a network-distant
-- attacker (the bottleneck there is Supabase RTT, not the comparison).

create or replace function public.consume_mfa_recovery_code(
  p_code_hash text,
  p_ip_hash   text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select id into row_id
    from public.mfa_recovery_codes
   where user_id   = auth.uid()
     and used_at   is null
     and code_hash = p_code_hash
   limit 1;

  if row_id is null then
    return false;
  end if;

  update public.mfa_recovery_codes
     set used_at      = now(),
         used_ip_hash = coalesce(p_ip_hash, used_ip_hash)
   where id = row_id;

  return true;
end;
$$;

revoke all on function public.consume_mfa_recovery_code(text, text) from public;
grant execute on function public.consume_mfa_recovery_code(text, text) to authenticated;
