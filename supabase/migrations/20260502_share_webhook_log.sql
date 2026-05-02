-- ─────────────────────────────────────────────────────────────────────────
-- Share webhook delivery log.
--
-- Every outbound webhook attempt (success or failure) records a row so
-- workspace admins can debug "why didn't my Zapier hook fire?" without
-- waiting on logs. Append-only; old rows pruned by a periodic job
-- (not yet built).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.share_webhook_deliveries (
  id              bigserial primary key,
  link_id         uuid not null references public.share_links(id) on delete cascade,
  workspace_id    uuid references public.workspaces(id) on delete cascade,
  event           text not null,
  webhook_url     text not null,
  status          text not null check (status in ('success','timeout','network_error','non_2xx','signing_skipped','unknown')),
  http_status     integer,
  response_excerpt text,
  signed          boolean not null default false,
  attempted_at    timestamptz not null default now(),
  duration_ms     integer
);

create index if not exists share_webhook_deliveries_link_idx
  on public.share_webhook_deliveries (link_id, attempted_at desc);

create index if not exists share_webhook_deliveries_ws_idx
  on public.share_webhook_deliveries (workspace_id, attempted_at desc)
  where workspace_id is not null;

alter table public.share_webhook_deliveries enable row level security;

-- Read: link owner or workspace member can see the delivery log
create policy "share_webhook_deliveries_read"
  on public.share_webhook_deliveries for select
  using (
    link_id in (
      select id from public.share_links
       where auth.uid() = owner_user_id
          or workspace_id in (
            select workspace_id from public.workspace_members where user_id = auth.uid()
          )
    )
  );

-- Inserts go through the SECURITY DEFINER recorder below.
create or replace function public.share_record_webhook_delivery(
  p_link_id uuid,
  p_event   text,
  p_webhook_url text,
  p_status  text,
  p_http_status integer,
  p_response_excerpt text,
  p_signed boolean,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
    from public.share_links where id = p_link_id;

  insert into public.share_webhook_deliveries
    (link_id, workspace_id, event, webhook_url, status, http_status,
     response_excerpt, signed, duration_ms)
  values
    (p_link_id, v_workspace_id, p_event, p_webhook_url, p_status, p_http_status,
     left(coalesce(p_response_excerpt, ''), 500), p_signed, p_duration_ms);
end;
$$;

grant execute on function public.share_record_webhook_delivery to authenticated, service_role;

comment on table public.share_webhook_deliveries is
  'Append-only log of every outbound Share webhook attempt. Useful for debugging silent webhook failures.';
