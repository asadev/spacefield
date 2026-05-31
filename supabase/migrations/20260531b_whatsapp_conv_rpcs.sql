-- 20260531b_whatsapp_conv_rpcs.sql — atomic conversation-activity RPCs (WhatsApp v2 Wave 1)
-- Single-statement SECURITY DEFINER helpers so concurrent webhooks can't lose an unread increment.
-- Called only by the service-role admin client; revoked from public/anon/authenticated.

create or replace function public.whatsapp_record_inbound(
  p_conversation_id uuid, p_preview text, p_created_at timestamptz, p_is_read boolean default false
) returns void language sql security definer set search_path = public as $$
  update public.whatsapp_conversations set
    last_message_at = p_created_at, last_message_preview = p_preview,
    last_direction = 'inbound', last_activity_at = p_created_at, waiting_since = p_created_at,
    unread_count = case when p_is_read then unread_count else unread_count + 1 end,
    status = case when status in (1,3) then 0 else status end,
    snoozed_until = case when status in (1,3) then null else snoozed_until end
  where id = p_conversation_id;
$$;

create or replace function public.whatsapp_record_outbound(
  p_conversation_id uuid, p_preview text, p_created_at timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.whatsapp_conversations set
    last_message_at = p_created_at, last_message_preview = p_preview,
    last_direction = 'outbound', last_activity_at = p_created_at, waiting_since = null,
    first_reply_at = coalesce(first_reply_at, p_created_at)
  where id = p_conversation_id;
$$;

revoke all on function public.whatsapp_record_inbound(uuid,text,timestamptz,boolean) from public;
revoke all on function public.whatsapp_record_outbound(uuid,text,timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.whatsapp_record_inbound(uuid,text,timestamptz,boolean) from anon';
    execute 'revoke all on function public.whatsapp_record_outbound(uuid,text,timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.whatsapp_record_inbound(uuid,text,timestamptz,boolean) from authenticated';
    execute 'revoke all on function public.whatsapp_record_outbound(uuid,text,timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.whatsapp_record_inbound(uuid,text,timestamptz,boolean) to service_role';
    execute 'grant execute on function public.whatsapp_record_outbound(uuid,text,timestamptz) to service_role';
  end if;
end $$;
