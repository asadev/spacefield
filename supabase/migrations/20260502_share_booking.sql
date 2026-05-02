-- ─────────────────────────────────────────────────────────────────────────
-- Share booking event RPC + booked-slot lookup helper.
--
-- Booking flow: visitor picks a slot → POST to /api/share/book →
-- share_record_booking RPC inserts a 'submit' event with the chosen
-- slot, and bumps submit_count. Already-booked slots are then visible to
-- new visitors so they can't double-book.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.share_record_booking(
  p_link_id     uuid,
  p_start_local text,
  p_invitee_name text,
  p_invitee_email text,
  p_notes       text,
  p_ip_hash     text,
  p_ua_hash     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_event_id bigint;
  v_already_booked int;
begin
  if p_invitee_name is null or length(trim(p_invitee_name)) = 0 then
    raise exception 'name required';
  end if;
  if p_invitee_email is null or length(trim(p_invitee_email)) = 0 then
    raise exception 'email required';
  end if;
  if p_start_local is null or length(p_start_local) < 16 then
    raise exception 'invalid start time';
  end if;

  select * into v_link
    from public.share_links
   where id = p_link_id
     and status = 'active'
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'booking page not found or expired';
  end if;

  if v_link.type <> 'booking' then
    raise exception 'link is not a booking page';
  end if;

  -- Check the slot isn't already taken
  select count(*) into v_already_booked
    from public.share_events
   where link_id = p_link_id
     and event = 'submit'
     and (payload->>'startLocal') = p_start_local;

  if v_already_booked > 0 then
    raise exception 'slot already booked';
  end if;

  update public.share_links
     set submit_count = submit_count + 1,
         updated_at = now()
   where id = p_link_id;

  insert into public.share_events (link_id, event, ip_hash, ua_hash, payload)
  values (
    p_link_id,
    'submit',
    p_ip_hash,
    p_ua_hash,
    jsonb_build_object(
      'startLocal', p_start_local,
      'inviteeName', trim(p_invitee_name),
      'inviteeEmail', trim(p_invitee_email),
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'bookedAt', now()
    )
  )
  returning id into v_event_id;

  return p_link_id;  -- return the link id (for chaining; event id is bigint)
end;
$$;

-- Returns the set of startLocal strings already booked for a link, so the
-- public viewer can hide them.
create or replace function public.share_booked_slots(p_link_id uuid)
returns setof text
language sql
security definer
set search_path = public
as $$
  select distinct (payload->>'startLocal')::text
    from public.share_events
   where link_id = p_link_id
     and event = 'submit'
     and payload ? 'startLocal';
$$;

grant execute on function public.share_record_booking to anon, authenticated;
grant execute on function public.share_booked_slots   to anon, authenticated;
