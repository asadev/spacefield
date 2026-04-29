-- Spacefield AI agent — credit ledger.
--
-- Two buckets (quick + deep) per (workspace, user, month). The cap is
-- seeded by the runtime from TIER_DEFAULTS in lib/agent/runtime/budget.ts
-- on first call of the month. Events table is the audit trail.
--
-- Conversation history lives in agent_conversation_messages — the agent
-- runtime reads the last 20 turns on every dispatch.

create table if not exists public.agent_credit_balances (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  month        date not null,
  quick_used   bigint not null default 0,
  quick_cap    bigint not null,
  deep_used    bigint not null default 0,
  deep_cap     bigint not null,
  primary key (workspace_id, user_id, month)
);

create index if not exists agent_credit_balances_user_idx
  on public.agent_credit_balances(user_id);

alter table public.agent_credit_balances enable row level security;

drop policy if exists "agent_credit_balances self read" on public.agent_credit_balances;
create policy "agent_credit_balances self read"
  on public.agent_credit_balances for select
  using (user_id = auth.uid());

drop policy if exists "agent_credit_balances self insert" on public.agent_credit_balances;
create policy "agent_credit_balances self insert"
  on public.agent_credit_balances for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_credit_balances self update" on public.agent_credit_balances;
create policy "agent_credit_balances self update"
  on public.agent_credit_balances for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.agent_credit_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  bucket        text not null check (bucket in ('quick','deep')),
  tokens        bigint not null,
  model         text not null,
  call_kind     text not null,
  request_id    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists agent_credit_events_user_created_idx
  on public.agent_credit_events(user_id, created_at desc);
create index if not exists agent_credit_events_request_idx
  on public.agent_credit_events(request_id) where request_id is not null;

alter table public.agent_credit_events enable row level security;

drop policy if exists "agent_credit_events self read" on public.agent_credit_events;
create policy "agent_credit_events self read"
  on public.agent_credit_events for select
  using (user_id = auth.uid());

drop policy if exists "agent_credit_events self insert" on public.agent_credit_events;
create policy "agent_credit_events self insert"
  on public.agent_credit_events for insert
  with check (user_id = auth.uid());

-- Atomic increment helper. Called from the runtime to avoid a
-- read-modify-write race when many tool calls fire in quick succession.
create or replace function public.agent_credit_increment(
  p_workspace_id uuid,
  p_user_id uuid,
  p_month date,
  p_column text,
  p_delta bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_column not in ('quick_used','deep_used') then
    raise exception 'invalid column %', p_column;
  end if;
  if p_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  execute format(
    'update public.agent_credit_balances set %I = %I + $1
       where workspace_id = $2 and user_id = $3 and month = $4',
    p_column, p_column
  ) using p_delta, p_workspace_id, p_user_id, p_month;
end;
$$;

revoke all on function public.agent_credit_increment(uuid,uuid,date,text,bigint) from public;
grant execute on function public.agent_credit_increment(uuid,uuid,date,text,bigint) to authenticated;

-- Conversation history. We keep this small (20 most-recent rows per
-- user+channel) and rely on the model's caching to keep cost down.
create table if not exists public.agent_conversation_messages (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel      text not null,
  role         text not null check (role in ('user','assistant')),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists agent_conversation_messages_lookup_idx
  on public.agent_conversation_messages(user_id, workspace_id, channel, created_at desc);

alter table public.agent_conversation_messages enable row level security;

drop policy if exists "agent_conversation self read" on public.agent_conversation_messages;
create policy "agent_conversation self read"
  on public.agent_conversation_messages for select
  using (user_id = auth.uid());

drop policy if exists "agent_conversation self insert" on public.agent_conversation_messages;
create policy "agent_conversation self insert"
  on public.agent_conversation_messages for insert
  with check (user_id = auth.uid());
