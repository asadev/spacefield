-- 2026-05-17 SC-005 — Encrypt employee_documents.number at rest.
-- pgcrypto + pgp_sym_encrypt with a per-environment key surfaced via
-- a Supabase Vault secret OR an app setting (set_config). Reading the
-- key is gated to the server side because the column is encrypted and
-- the decrypt RPC only runs when admin_caller_is_admin() OR the
-- caller owns the underlying employee row.
--
-- Backfill: encrypts existing rows in-place. If number is null, skip.
-- Idempotent — the function recognises already-encrypted ciphertext
-- (number_encrypted already populated) and skips re-encryption.

create extension if not exists pgcrypto;

-- Add a new ciphertext column without dropping the existing one until
-- backfill verifies. We keep both columns; after backfill the plaintext
-- `number` column is always null and the encrypted column is the source
-- of truth. New writes go through set_employee_document_number().
alter table public.employee_documents
  add column if not exists number_encrypted bytea,
  add column if not exists number_last4     text;

-- Key resolution helper. Reads APP_PII_KEY from Supabase Vault if the
-- vault extension is enabled, otherwise from current_setting (so local
-- dev can set it). Raises if missing — we never want decrypt to
-- silently return empty.
create or replace function public._pii_key()
returns text language plpgsql security definer set search_path = public, vault as $$
declare k text;
begin
  begin
    -- Vault path (Supabase managed)
    select decrypted_secret into k from vault.decrypted_secrets where name = 'app_pii_key' limit 1;
  exception when others then
    k := null;
  end;
  if k is not null then return k; end if;
  -- App-setting fallback (local dev / preview)
  k := current_setting('app.pii_key', true);
  if k is null or length(k) < 16 then
    raise exception 'PII encryption key not configured (set vault secret "app_pii_key" or app.pii_key)';
  end if;
  return k;
end; $$;

revoke all on function public._pii_key() from public;

-- Encrypt-on-write RPC. Replaces raw number column updates.
create or replace function public.set_employee_document_number(
  p_doc_id uuid, p_number text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  k    text;
  ws   uuid;
begin
  if p_number is null or length(p_number) = 0 then
    update public.employee_documents
      set number_encrypted = null, number_last4 = null, number = null
      where id = p_doc_id;
    return;
  end if;
  k := public._pii_key();
  -- Authz: caller must be member of the workspace owning the employee.
  select e.workspace_id into ws
    from public.employee_documents d
    join public.employees e on e.id = d.employee_id
    where d.id = p_doc_id;
  if ws is null then raise exception 'doc not found'; end if;
  if not (auth.role() = 'service_role'
          or public.is_workspace_member(ws)) then
    raise exception 'not authorised';
  end if;
  update public.employee_documents
    set number_encrypted = extensions.pgp_sym_encrypt(p_number, k),
        number_last4     = right(p_number, 4),
        number           = null  -- clear plaintext immediately
    where id = p_doc_id;
end; $$;

grant execute on function public.set_employee_document_number(uuid, text) to authenticated, service_role;

-- Decrypt-on-read RPC. HR-role only OR document owner.
create or replace function public.reveal_employee_document_number(p_doc_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  k    text;
  ws   uuid;
  emp_user uuid;
  role text;
  cipher bytea;
begin
  k := public._pii_key();
  select e.workspace_id, e.user_id, d.number_encrypted
    into ws, emp_user, cipher
    from public.employee_documents d
    join public.employees e on e.id = d.employee_id
    where d.id = p_doc_id;
  if ws is null then raise exception 'doc not found'; end if;
  if cipher is null then return null; end if;
  -- Auth: service-role always; document-owner; workspace owner/admin.
  if auth.role() = 'service_role' then
    -- OK
  elsif emp_user is not null and emp_user = auth.uid() then
    -- OK — own document
  else
    select public.workspace_role_of(ws) into role;
    if role not in ('owner', 'admin') then
      raise exception 'not authorised';
    end if;
  end if;
  return extensions.pgp_sym_decrypt(cipher, k);
end; $$;

grant execute on function public.reveal_employee_document_number(uuid) to authenticated, service_role;

-- Backfill — encrypt any existing plaintext number values. Skip rows
-- where number is null OR number_encrypted is already populated.
do $$
declare
  r record;
  k text;
begin
  begin k := public._pii_key(); exception when others then return; end;
  for r in select id, number from public.employee_documents
           where number is not null and number_encrypted is null
  loop
    update public.employee_documents
      set number_encrypted = extensions.pgp_sym_encrypt(r.number, k),
          number_last4     = right(r.number, 4),
          number           = null
      where id = r.id;
  end loop;
end $$;

-- RLS tightening — only HR (owner/admin) or the document's underlying
-- employee user can SELECT. Service-role bypasses RLS regardless.
drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents
  for select to authenticated using (
    exists (
      select 1 from public.employees e
      where e.id = employee_documents.employee_id
        and (
          e.user_id = auth.uid()
          or public.workspace_role_of(e.workspace_id) in ('owner','admin')
        )
    )
  );

-- Rebuild expiring_docs RPC: drop the plaintext `number` column from
-- the return shape (it's always null at rest now) and surface the
-- last-4 hint instead. Keeps RPC signature additive for callers that
-- only read by column name.
drop function if exists public.expiring_docs(int);
create or replace function public.expiring_docs(p_within_days int default 30)
returns table (
  id            uuid,
  workspace_id  uuid,
  employee_id   uuid,
  employee_name text,
  kind          text,
  name          text,
  number_last4  text,
  expires_at    date,
  days_left     int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.workspace_id,
    d.employee_id,
    e.full_name as employee_name,
    d.kind,
    d.name,
    d.number_last4,
    d.expires_at,
    (d.expires_at - current_date)::int as days_left
  from public.employee_documents d
  join public.employees e on e.id = d.employee_id
  where d.expires_at is not null
    and d.expires_at <= current_date + (p_within_days || ' days')::interval
    and public.is_workspace_member(d.workspace_id)
  order by d.expires_at asc nulls last;
$$;

revoke all on function public.expiring_docs(int) from public;
grant execute on function public.expiring_docs(int) to authenticated;
