"use client";

/* useChatRealtime — Supabase Realtime subscription scoped to a single
 * chat channel. The chat app composes one of these per active channel
 * to receive INSERT / UPDATE / DELETE events on chat_messages.
 *
 * Callers receive raw row payloads — message-list reconciliation
 * (de-dup, attachment expansion, scroll behaviour) lives in the chat
 * app where it can use its own state.
 *
 * Why a hook? So the channel id can change on the fly (channel switch)
 * without remounting the whole app, and so cleanup is automatic on
 * unmount.
 */

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase/client";

export interface ChatMessageRowRaw {
  id: string;
  channel_id: string;
  workspace_id: string;
  user_id: string;
  body: string;
  attachments: unknown;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ChatRealtimeHandlers {
  onInsert?: (row: ChatMessageRowRaw) => void;
  onUpdate?: (row: ChatMessageRowRaw, old: Partial<ChatMessageRowRaw>) => void;
  onDelete?: (oldRow: Partial<ChatMessageRowRaw>) => void;
}

export function useChatRealtime(
  channelId: string | null,
  handlers: ChatRealtimeHandlers
) {
  // Keep the latest handlers in a ref so subscribing doesn't need to
  // re-run every time the parent re-renders.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!channelId) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel(`chat-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRowRaw;
          handlersRef.current.onInsert?.(row);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRowRaw;
          const old = (payload.old ?? {}) as Partial<ChatMessageRowRaw>;
          handlersRef.current.onUpdate?.(row, old);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const old = (payload.old ?? {}) as Partial<ChatMessageRowRaw>;
          handlersRef.current.onDelete?.(old);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId]);
}
