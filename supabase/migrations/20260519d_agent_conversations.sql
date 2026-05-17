-- 2026-05-19 Agent conversation persistence — ensure the table exists
-- on every environment + add a context_ref column for the /chat surface.
--
-- Backstory: agent_conversation_messages was introduced in
-- 20260429_agent_credits.sql for the dispatcher → it stores user +
-- assistant turns keyed by (workspace_id, user_id, channel). The new
-- /chat streaming endpoint wants the same persistence so the stateless
-- per-record assistant can carry context across turns.
--
-- Why a new migration instead of editing 20260429:
--   - Existing migration is already applied in prod; mutating it would
--     not re-run.
--   - This file uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
--     EXISTS so it's a safe no-op on environments that already have the
--     20260429 version, and creates the table from scratch on any
--     environment that doesn't (e.g. a fresh dev DB starting from a
--     reset).
--
-- The /chat endpoint stores `channel = 'chat:<context_ref or workspace>'`
-- — same column, same shape, just a different namespace. We don't need
-- a new table; we just need a non-null context_ref slot for richer
-- per-record analytics later.
--
-- Rollback:
--   alter table public.agent_conversation_messages drop column if exists context_ref;
--   (do NOT drop the table — the dispatcher depends on it.)

-- Ensure the table exists. Mirrors 20260429_agent_credits.sql.
create table if not exists public.agent_conversation_messages (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel      text not null,
  role         text not null check (role in ('user','assistant')),
  content      text not null,
  created_at   timestamptz not null default now()
);

-- Add the optional record reference. NULL for dispatcher rows (which
-- key by channel='whatsapp'|'telegram'|'app' etc.), populated for /chat
-- rows so we can later show "conversations about this task" without
-- string-parsing the channel.
alter table public.agent_conversation_messages
  add column if not exists context_ref text;

-- Lookup index used by both the dispatcher (loadHistory) and the new
-- /chat conversation loader.
create index if not exists agent_conversation_messages_lookup_idx
  on public.agent_conversation_messages(user_id, workspace_id, channel, created_at desc);

-- Secondary index for "everything about this context_ref" lookups. It's
-- partial (only rows that set context_ref) so dispatcher inserts don't
-- pay a write cost.
create index if not exists agent_conversation_messages_context_idx
  on public.agent_conversation_messages(workspace_id, user_id, context_ref, created_at desc)
  where context_ref is not null;

alter table public.agent_conversation_messages enable row level security;

drop policy if exists "agent_conversation self read" on public.agent_conversation_messages;
create policy "agent_conversation self read"
  on public.agent_conversation_messages for select
  using (user_id = auth.uid());

drop policy if exists "agent_conversation self insert" on public.agent_conversation_messages;
create policy "agent_conversation self insert"
  on public.agent_conversation_messages for insert
  with check (user_id = auth.uid());
