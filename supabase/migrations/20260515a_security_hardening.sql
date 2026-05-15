-- Security hardening for the Share RPCs (Fix Agent V-3, SA-001).
--
-- 1. `share_mint` previously trusted whatever workspace_id the client
--    sent. With SECURITY DEFINER and `grant execute … to authenticated`
--    that meant any signed-in user could mint a link inside any
--    workspace they don't belong to — handing them a public URL on the
--    target's vanity subdomain with arbitrary payload, and a forged
--    submit_count fan-out target.
--
--    Patch: after the type-check, if `p_workspace_id is not null`,
--    require that the calling auth.uid() is a member of that workspace
--    via the existing `public.is_workspace_member(uuid)` helper.
--
-- 2. `share_record_submit` accepts a `jsonb` payload from anon callers
--    on the public form viewer. With no size check, a single attacker
--    can pump megabyte-sized JSON blobs into `share_events.payload`
--    and exhaust storage / blow up downstream readers.
--
--    Patch: reject payloads whose serialised text length exceeds 16 KB.
--    Real form submissions are well under 4 KB; 16 KB leaves headroom.
--
-- Both functions are re-declared with `create or replace`. We preserve
-- the original signatures + return types so callers (RLS-bound app code
-- + supabase-js .rpc()) don't need to change.

create or replace function public.share_mint(
  p_workspace_id   uuid,
  p_owner_user_id  uuid,
  p_type           text,
  p_payload        jsonb,
  p_source_tool    text default null,
  p_custom_slug    text default null,
  p_custom_subdomain text default null,
  p_expires_at     timestamptz default null
)
returns public.share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_row  public.share_links;
  v_alphabet text := 'abcdefghijkmnpqrstuvwxyz23456789';  -- no 0,o,1,l,i ambiguity
  v_attempts int := 0;
begin
  if p_type not in ('form','page','quote','booking','redirect','file') then
    raise exception 'invalid link type: %', p_type;
  end if;

  -- SA-001: workspace_id must be a workspace the caller belongs to.
  -- Personal links (workspace_id null) keep working unchanged.
  if p_workspace_id is not null then
    if not public.is_workspace_member(p_workspace_id) then
      raise exception 'not a member of workspace %', p_workspace_id;
    end if;
  end if;

  if p_custom_slug is not null then
    if not p_custom_slug ~ '^[a-z0-9-]{3,40}$' then
      raise exception 'custom slug must be 3-40 chars, [a-z0-9-]';
    end if;
    v_slug := p_custom_slug;
  else
    loop
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'could not generate unique slug after 10 attempts';
      end if;
      v_slug := '';
      for i in 1..7 loop
        v_slug := v_slug || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
      exit when not exists (
        select 1 from public.share_links
        where slug = v_slug
          and (custom_subdomain is null and p_custom_subdomain is null
               or custom_subdomain = p_custom_subdomain)
      );
    end loop;
  end if;

  insert into public.share_links
    (workspace_id, owner_user_id, type, slug, custom_subdomain, payload, source_tool, expires_at)
  values
    (p_workspace_id, p_owner_user_id, p_type, v_slug, p_custom_subdomain, p_payload, p_source_tool, p_expires_at)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.share_record_submit(
  p_link_id   uuid,
  p_payload   jsonb,
  p_ip_hash   text,
  p_ua_hash   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SA-001 (b): cap payload size to keep anon callers from filling
  -- the events table with oversized blobs.
  if p_payload is not null
     and octet_length(p_payload::text) > 16384 then
    raise exception 'submission payload exceeds 16 KB limit';
  end if;

  update public.share_links
     set submit_count = submit_count + 1,
         updated_at = now()
   where id = p_link_id;

  insert into public.share_events (link_id, event, ip_hash, ua_hash, payload)
  values (p_link_id, 'submit', p_ip_hash, p_ua_hash, p_payload);
end;
$$;

-- Re-grants (idempotent — the create-or-replace above doesn't drop the
-- existing grants, but keeping these explicit means a fresh DB rebuild
-- from this migration alone still gets the right surface).
grant execute on function public.share_mint           to authenticated;
grant execute on function public.share_record_submit  to anon, authenticated;
