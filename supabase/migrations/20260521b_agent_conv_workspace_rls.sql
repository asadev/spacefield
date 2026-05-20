-- 2026-05-21 Tighten agent_conversation_messages RLS to also check
-- workspace membership (qa-c-agent-conv-rls P1).
--
-- Background: 20260429_agent_credits.sql created the table and added
-- two policies — "agent_conversation self read" and
-- "agent_conversation self insert" — both gated only on
-- `user_id = auth.uid()`. 20260519d_agent_conversations.sql kept the
-- same shape.
--
-- That's fine for the dispatcher (where every row's user is the
-- requesting human), but agent_conversation_messages carries
-- workspace_id, and a workspace ought to be able to wipe its own
-- conversation history without the user being able to read messages
-- from a workspace they're no longer a member of. The fix is to AND
-- the existing user-id check with is_workspace_member(workspace_id)
-- when the row has a workspace_id at all. Some legacy rows have null
-- workspace_id (channel = 'whatsapp' rows from before the column was
-- enforced), so we explicitly allow the null case to preserve those.
--
-- Rollback (manual):
--   drop policy if exists "agent_conversation self read" on public.agent_conversation_messages;
--   drop policy if exists "agent_conversation self insert" on public.agent_conversation_messages;
--   create policy "agent_conversation self read"
--     on public.agent_conversation_messages for select
--     using (user_id = auth.uid());
--   create policy "agent_conversation self insert"
--     on public.agent_conversation_messages for insert
--     with check (user_id = auth.uid());

drop policy if exists "agent_conversation self read"
  on public.agent_conversation_messages;

create policy "agent_conversation self read"
  on public.agent_conversation_messages for select
  using (
    user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  );

drop policy if exists "agent_conversation self insert"
  on public.agent_conversation_messages;

create policy "agent_conversation self insert"
  on public.agent_conversation_messages for insert
  with check (
    user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  );
