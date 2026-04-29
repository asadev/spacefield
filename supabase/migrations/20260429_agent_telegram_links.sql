-- Spacefield AI agent — Phase 2 — Telegram linking.
--
-- Mirrors agent_whatsapp_links: telegram_user_id ⇄ user_id+workspace_id.
-- Inbound webhook looks up the sender id here. If no link, the user
-- runs `/start <code>` in Telegram and the webhook matches the code
-- against agent_telegram_link_codes (10-min TTL).

create table if not exists public.agent_telegram_links (
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  telegram_user_id  bigint not null,
  telegram_username text,
  linked_at         timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create unique index if not exists agent_telegram_links_user_unique
  on public.agent_telegram_links(telegram_user_id);

alter table public.agent_telegram_links enable row level security;

drop policy if exists "agent_telegram_links self read" on public.agent_telegram_links;
create policy "agent_telegram_links self read"
  on public.agent_telegram_links for select
  using (user_id = auth.uid());

drop policy if exists "agent_telegram_links self write" on public.agent_telegram_links;
create policy "agent_telegram_links self write"
  on public.agent_telegram_links for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_telegram_links self delete" on public.agent_telegram_links;
create policy "agent_telegram_links self delete"
  on public.agent_telegram_links for delete
  using (user_id = auth.uid());

create table if not exists public.agent_telegram_link_codes (
  code         text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists agent_telegram_link_codes_expiry_idx
  on public.agent_telegram_link_codes(expires_at);

alter table public.agent_telegram_link_codes enable row level security;

drop policy if exists "agent_telegram_link_codes self read" on public.agent_telegram_link_codes;
create policy "agent_telegram_link_codes self read"
  on public.agent_telegram_link_codes for select
  using (user_id = auth.uid());

drop policy if exists "agent_telegram_link_codes self insert" on public.agent_telegram_link_codes;
create policy "agent_telegram_link_codes self insert"
  on public.agent_telegram_link_codes for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_telegram_link_codes self delete" on public.agent_telegram_link_codes;
create policy "agent_telegram_link_codes self delete"
  on public.agent_telegram_link_codes for delete
  using (user_id = auth.uid());
