-- Spacefield AI agent — WhatsApp linking.
--
-- agent_whatsapp_links: phone number ⇄ user_id+workspace_id. Inbound
-- webhook looks up the sender phone here; if not linked, we run the
-- 6-digit linking flow.
--
-- agent_whatsapp_link_codes: short-lived codes minted by the Settings UI.
-- The user texts the code from their phone; the webhook matches it,
-- creates the link row, and deletes the code. 10-minute TTL.

create table if not exists public.agent_whatsapp_links (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  whatsapp_number text not null,
  linked_at       timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create unique index if not exists agent_whatsapp_links_phone_unique
  on public.agent_whatsapp_links(whatsapp_number);

alter table public.agent_whatsapp_links enable row level security;

drop policy if exists "agent_whatsapp_links self read" on public.agent_whatsapp_links;
create policy "agent_whatsapp_links self read"
  on public.agent_whatsapp_links for select
  using (user_id = auth.uid());

drop policy if exists "agent_whatsapp_links self write" on public.agent_whatsapp_links;
create policy "agent_whatsapp_links self write"
  on public.agent_whatsapp_links for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_whatsapp_links self delete" on public.agent_whatsapp_links;
create policy "agent_whatsapp_links self delete"
  on public.agent_whatsapp_links for delete
  using (user_id = auth.uid());

create table if not exists public.agent_whatsapp_link_codes (
  code         text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists agent_whatsapp_link_codes_expiry_idx
  on public.agent_whatsapp_link_codes(expires_at);

alter table public.agent_whatsapp_link_codes enable row level security;

drop policy if exists "agent_whatsapp_link_codes self read" on public.agent_whatsapp_link_codes;
create policy "agent_whatsapp_link_codes self read"
  on public.agent_whatsapp_link_codes for select
  using (user_id = auth.uid());

drop policy if exists "agent_whatsapp_link_codes self insert" on public.agent_whatsapp_link_codes;
create policy "agent_whatsapp_link_codes self insert"
  on public.agent_whatsapp_link_codes for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_whatsapp_link_codes self delete" on public.agent_whatsapp_link_codes;
create policy "agent_whatsapp_link_codes self delete"
  on public.agent_whatsapp_link_codes for delete
  using (user_id = auth.uid());
