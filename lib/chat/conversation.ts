import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-record /chat conversation persistence.
 *
 * The /api/chat/stream endpoint used to be fully stateless: every turn
 * was just `[{ role: "user", content: message }]` against the model.
 * That worked for one-off questions but felt amnesiac after two turns
 * ("about that task" — what task?). This module hangs the missing
 * memory off the existing `agent_conversation_messages` table.
 *
 * Design notes:
 *  - Same table as the dispatcher's conversation history, namespaced
 *    by `channel`. We use `channel = 'chat:<context_ref>'` so /chat
 *    rows can't bleed into dispatcher rows (which use channel='whatsapp'
 *    etc.) and per-record /chat threads stay isolated from one another.
 *    Without a context_ref we fall back to `channel = 'chat:workspace'`
 *    so unscoped /chat is one global thread per (workspace,user).
 *  - History window: 20 turns (10 user + 10 assistant) matches the
 *    dispatcher's HISTORY_LIMIT — keeps the system prompt size
 *    predictable for caching.
 *  - Persistence is fire-and-forget on the response path: an upstream
 *    error must not lose the user's message, so we record the user
 *    turn BEFORE the model call and only append the assistant turn
 *    after the stream completes.
 *  - We use the admin client for the write so a failed RLS hop on the
 *    user's cookie session (rare but observed in long-stream paths)
 *    doesn't silently drop the row. Membership is already verified
 *    upstream by the route handler.
 */

import { createAdminClient } from "@/lib/supabase/admin";

/** History limit — matches lib/agent/runtime/dispatcher.ts so the
 *  /chat surface and the dispatcher feel symmetric. */
export const CHAT_HISTORY_LIMIT = 20;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Build the namespaced channel string for a /chat thread. Keeps the
 *  format in one place so the loader + recorder + any future analytics
 *  query agree. */
export function chatChannel(contextRef: string | null | undefined): string {
  const trimmed = (contextRef ?? "").trim();
  return trimmed ? `chat:${trimmed}` : "chat:workspace";
}

interface LoadParams {
  workspaceId: string;
  userId: string;
  contextRef: string | null;
  /** Override the default admin client (tests). */
  client?: SupabaseClient;
  /** Max turns to return. Clamped to [1, CHAT_HISTORY_LIMIT]. */
  limit?: number;
}

/**
 * Load the most-recent N turns for this (workspace, user, context_ref).
 * Returned in chronological order — oldest first — so callers can pass
 * the result straight to the Anthropic `messages` array.
 *
 * Returns an empty array on any error so a transient DB blip degrades
 * gracefully into a stateless turn instead of failing the chat.
 */
export async function loadChatHistory(p: LoadParams): Promise<ChatTurn[]> {
  if (!p.workspaceId || !p.userId) return [];
  const client = p.client ?? createAdminClient();
  const limit = Math.max(1, Math.min(p.limit ?? CHAT_HISTORY_LIMIT, CHAT_HISTORY_LIMIT));
  const channel = chatChannel(p.contextRef);

  const { data, error } = await client
    .from("agent_conversation_messages")
    .select("role, content")
    .eq("workspace_id", p.workspaceId)
    .eq("user_id", p.userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Reverse so oldest comes first — what the SDK expects.
  return (data as ChatTurn[]).slice().reverse();
}

interface RecordParams {
  workspaceId: string;
  userId: string;
  contextRef: string | null;
  role: "user" | "assistant";
  content: string;
  client?: SupabaseClient;
}

/**
 * Append a single turn to the conversation log. Best-effort: errors
 * are swallowed (logged) because losing a memory write must not
 * surface as a failed user response.
 *
 * We trim assistant content to 20k chars to avoid a runaway streaming
 * response (rare, but possible if the model hits a tool-loop) bloating
 * the row.
 */
export async function recordChatTurn(p: RecordParams): Promise<void> {
  if (!p.workspaceId || !p.userId) return;
  const content = (p.content ?? "").slice(0, 20000);
  if (!content.trim()) return;

  const client = p.client ?? createAdminClient();
  const channel = chatChannel(p.contextRef);

  // We populate both channel (for the dispatcher-shared lookup index)
  // and context_ref (the new column from 20260519d_agent_conversations.sql)
  // so analytics queries don't have to string-parse the channel.
  const { error } = await client.from("agent_conversation_messages").insert({
    workspace_id: p.workspaceId,
    user_id: p.userId,
    channel,
    role: p.role,
    content,
    context_ref: p.contextRef ?? null,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[chat/conversation] recordChatTurn failed:", error.message);
  }
}
