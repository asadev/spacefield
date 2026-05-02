-- ─────────────────────────────────────────────────────────────────────────
-- Share quote-accept RPC
--
-- share_events has RLS — direct inserts from anon/authenticated are blocked
-- by design. This SECURITY DEFINER function records a 'convert' event AND
-- bumps the link's submit_count atomically, just like share_record_submit
-- does for forms.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.share_record_accept(
  p_link_id      uuid,
  p_signer_name  text,
  p_signer_email text,
  p_signer_company text,
  p_ip_hash      text,
  p_ua_hash      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  if p_signer_name is null or length(trim(p_signer_name)) = 0 then
    raise exception 'signer name required';
  end if;

  select * into v_link
    from public.share_links
   where id = p_link_id
     and status = 'active'
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'quote not found or expired';
  end if;

  if v_link.type <> 'quote' then
    raise exception 'link is not a quote';
  end if;

  update public.share_links
     set submit_count = submit_count + 1,
         updated_at = now()
   where id = p_link_id;

  insert into public.share_events (link_id, event, ip_hash, ua_hash, payload)
  values (
    p_link_id,
    'convert',
    p_ip_hash,
    p_ua_hash,
    jsonb_build_object(
      'signerName', trim(p_signer_name),
      'signerEmail', nullif(trim(coalesce(p_signer_email, '')), ''),
      'signerCompany', nullif(trim(coalesce(p_signer_company, '')), ''),
      'signedAt', now()
    )
  );
end;
$$;

grant execute on function public.share_record_accept to anon, authenticated;

comment on function public.share_record_accept is
  'Records a quote acceptance — used by /api/share/accept';
