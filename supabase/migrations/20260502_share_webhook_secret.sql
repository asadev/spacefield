-- ─────────────────────────────────────────────────────────────────────────
-- Share webhook signing — per-workspace HMAC secret.
--
-- Every webhook fired from this workspace's links is signed:
--   X-Share-Signature: sha256=<hex of HMAC-SHA256(secret, body)>
--   X-Share-Timestamp: <unix-seconds>
--
-- Receivers verify by recomputing the signature with the workspace's
-- secret. Rotating the secret only takes effect for webhooks fired
-- AFTER rotation; old signatures can no longer be verified (intended).
-- ─────────────────────────────────────────────────────────────────────────

-- Column with auto-generated default. gen_random_bytes() is volatile so
-- existing rows get unique secrets on add (PG 12+).
alter table public.workspaces
  add column if not exists share_webhook_secret text not null
  default encode(gen_random_bytes(24), 'hex');

create or replace function public.share_rotate_webhook_secret(
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_new_secret text;
begin
  select role into v_role
    from public.workspace_members
   where workspace_id = p_workspace_id
     and user_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'only owners or admins can rotate the webhook secret';
  end if;
  v_new_secret := encode(gen_random_bytes(24), 'hex');
  update public.workspaces
     set share_webhook_secret = v_new_secret
   where id = p_workspace_id;
  return v_new_secret;
end;
$$;

grant execute on function public.share_rotate_webhook_secret to authenticated;

comment on column public.workspaces.share_webhook_secret is
  'HMAC-SHA256 secret used to sign outbound Share webhooks for this workspace. Rotate via share_rotate_webhook_secret RPC.';
