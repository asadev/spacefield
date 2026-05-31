"use client";

/* WhatsApp inbox v2 — shared-inbox conversation experience.
 *
 * Left pane  : conversation list (cursor-paginated, client-side search filter).
 * Right pane : message thread (load-older upward pagination), media bubbles,
 *              reactions, reply/quote, status ticks, group sender names, and
 *              internal-note rendering.
 * Composer   : text (Enter to send / Shift+Enter newline), attach
 *              (image/video/document → base64 media send), and a voice button
 *              (MediaRecorder → voice note). Reply target shows above the input.
 *
 * Realtime (EPIC-06) replaces polling: Supabase Postgres Changes on
 *   - whatsapp_messages INSERT/UPDATE (open thread → live bubble + status)
 *   - whatsapp_conversations UPDATE   (list ordering / unread / preview)
 * A slow 30s poll stays as a fallback only. Channels are cleaned up on unmount.
 *
 * Mobile-first, identical features on every device — layout is responsive CSS
 * only (no behaviour is branched by screen size; voice is feature-detected,
 * not device-detected).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchConversations,
  fetchThreadMessages,
  markConversationRead,
  sendConversationText,
  sendConversationMedia,
  reactToMessage,
  mediaUrl,
  type WaConversation,
  type WaThreadMessage,
  type WaMediaKind,
  type WaReaction,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  formatPhone,
  formatRelative,
  formatStatusIcon,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

/** Slow poll as a realtime fallback only. */
const LIST_POLL_MS = 30_000;
const CONV_PAGE = 30;
const MSG_PAGE = 50;
const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type ReplyTarget = { id: string; preview: string; outbound: boolean } | null;

export default function ConversationsTab({ workspaceId, compact }: Props) {
  // ── conversation list ────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [convCursor, setConvCursor] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [convErr, setConvErr] = useState<string | null>(null);
  const [convMore, setConvMore] = useState(false);
  const [search, setSearch] = useState("");

  // ── selected thread ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<WaConversation | null>(null);
  const [messages, setMessages] = useState<WaThreadMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgErr, setMsgErr] = useState<string | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // ── composer ─────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [reply, setReply] = useState<ReplyTarget>(null);
  const [recording, setRecording] = useState(false);
  const [showChat, setShowChat] = useState(false); // mobile pane toggle

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<WaConversation | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Feature-detect voice recording once (not device-detect): same code path on
  // every device; the mic button simply hides when the API is unavailable.
  const voiceSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined"
    );
  }, []);

  // ── conversation list fetching ───────────────────────────────────────────
  const loadConversations = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const res = await fetchConversations(workspaceId, {
        cursor: opts?.append ? opts.cursor ?? convCursor : null,
        limit: CONV_PAGE,
      });
      if (!res.ok) {
        setConvErr(res.error);
        setConvLoading(false);
        return;
      }
      setConvErr(null);
      setConvCursor(res.data.next_cursor);
      setConvMore(!!res.data.next_cursor);
      setConversations((prev) =>
        opts?.append ? mergeConversations(prev, res.data.items) : res.data.items,
      );
      setConvLoading(false);
    },
    [workspaceId, convCursor],
  );

  // Initial load + slow poll fallback.
  useEffect(() => {
    setConvLoading(true);
    void loadConversations();
    const id = setInterval(() => void loadConversations(), LIST_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ── thread fetching ──────────────────────────────────────────────────────
  const loadThread = useCallback(
    async (conv: WaConversation) => {
      setMsgErr(null);
      const res = await fetchThreadMessages(workspaceId, conv.id, {
        limit: MSG_PAGE,
      });
      if (!res.ok) {
        setMsgErr(res.error);
        setMsgLoading(false);
        return;
      }
      // API returns newest-first; render ascending (newest at the bottom).
      const asc = [...res.data.items].reverse();
      setMessages(asc);
      setOlderCursor(res.data.next_cursor);
      setHasOlder(res.data.has_more);
      setMsgLoading(false);
    },
    [workspaceId],
  );

  const loadOlder = useCallback(async () => {
    const conv = selectedRef.current;
    if (!conv || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    const res = await fetchThreadMessages(workspaceId, conv.id, {
      before: olderCursor,
      limit: MSG_PAGE,
    });
    setLoadingOlder(false);
    if (!res.ok) return;
    const asc = [...res.data.items].reverse();
    setMessages((prev) => mergeMessages(asc, prev));
    setOlderCursor(res.data.next_cursor);
    setHasOlder(res.data.has_more);
  }, [workspaceId, olderCursor, loadingOlder]);

  // Clear unread for a conversation (server + local).
  const clearUnread = useCallback(
    async (conv: WaConversation) => {
      if (conv.unread_count <= 0) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)),
      );
      await markConversationRead(workspaceId, conv.id);
    },
    [workspaceId],
  );

  const openConversation = useCallback(
    (conv: WaConversation) => {
      setSelected(conv);
      setReply(null);
      setSendErr(null);
      setMessages([]);
      setMsgLoading(true);
      if (compact) setShowChat(true);
      void loadThread(conv);
      void clearUnread(conv);
    },
    [compact, loadThread, clearUnread],
  );

  // Auto-scroll to newest on message-count change / selection change.
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ block: "end" });
  }, [messages.length, selected?.id]);

  // ── realtime (EPIC-06) ───────────────────────────────────────────────────
  // Channel 1: messages for the OPEN conversation (live bubbles + status).
  useEffect(() => {
    if (!selected || !isSupabaseConfigured()) return;
    const conversationId = selected.id;
    const supabase = getSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`wa_msgs:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          // Client-side workspace guard on top of RLS.
          if (row.workspace_id && row.workspace_id !== workspaceId) return;
          const next = normalizeRealtimeMessage(row);
          setMessages((prev) => {
            const idx = prev.findIndex(
              (m) =>
                m.id === next.id ||
                (next.evolution_message_id &&
                  m.evolution_message_id === next.evolution_message_id),
            );
            if (idx === -1) {
              // Drop an optimistic local echo of the same outbound text.
              const optimisticIdx = prev.findIndex(
                (m) =>
                  m._optimistic &&
                  m.direction === next.direction &&
                  (m.body ?? "") === (next.body ?? ""),
              );
              if (optimisticIdx !== -1) {
                const copy = [...prev];
                copy[optimisticIdx] = next;
                return copy;
              }
              return [...prev, next];
            }
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...next, _optimistic: false };
            return copy;
          });
          // A fresh inbound while the thread is open → mark read immediately.
          if (
            payload.eventType === "INSERT" &&
            next.direction === "inbound"
          ) {
            void markConversationRead(workspaceId, conversationId);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, workspaceId]);

  // Channel 2: conversation rows for this workspace (list ordering/unread).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`wa_convs:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          // Cheapest correct path: refetch the first page so names + previews +
          // unread + ordering all stay consistent with the server's view.
          void loadConversations();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ── search filter (client-side over the loaded list) ─────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const blob =
        `${c.name ?? ""} ${c.phone ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [conversations, search]);

  // Look up a quoted message inside the loaded thread for inline preview.
  const messageById = useMemo(() => {
    const map = new Map<string, WaThreadMessage>();
    for (const m of messages) {
      map.set(m.id, m);
      if (m.evolution_message_id) map.set(m.evolution_message_id, m);
    }
    return map;
  }, [messages]);

  // ── sending ──────────────────────────────────────────────────────────────
  const handleSendText = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const conv = selected;
      const text = draft.trim();
      if (!conv || !text) return;
      const optimistic: WaThreadMessage = {
        id: `local-${Date.now()}`,
        direction: "outbound",
        body: text,
        status: "queued",
        created_at: new Date().toISOString(),
        media_type: null,
        media_mime: null,
        media_storage_path: null,
        reactions: [],
        reply_to_message_id: reply?.id ?? null,
        sender_name: null,
        is_private: false,
        evolution_message_id: null,
        _optimistic: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      setDraft("");
      const quoted = reply?.id;
      setReply(null);
      setSending(true);
      setSendErr(null);
      const res = await sendConversationText({
        workspace_id: workspaceId,
        conversation_id: conv.id,
        phone: conv.source_id ?? conv.phone ?? undefined,
        message: text,
        quoted_message_id: quoted,
      });
      setSending(false);
      if (!res.ok) {
        setSendErr(res.error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimistic.id ? { ...m, status: "failed" } : m,
          ),
        );
        return;
      }
      // Reconcile the optimistic row with the server id (realtime may also do
      // this; both paths dedupe).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id
            ? {
                ...m,
                id: res.data.id ?? m.id,
                evolution_message_id: res.data.message_id ?? null,
                status: "sent",
                _optimistic: false,
              }
            : m,
        ),
      );
      bumpConversationLocally(conv.id, text, "outbound");
    },
    [selected, draft, reply, workspaceId],
  );

  const handleSendMedia = useCallback(
    async (file: File, kind: WaMediaKind) => {
      const conv = selected;
      if (!conv) return;
      setSending(true);
      setSendErr(null);
      try {
        const base64 = await fileToBase64(file);
        const quoted = reply?.id;
        setReply(null);
        const res = await sendConversationMedia({
          workspace_id: workspaceId,
          conversation_id: conv.id,
          phone: conv.source_id ?? conv.phone ?? undefined,
          media: {
            base64,
            mime: file.type || "application/octet-stream",
            fileName: file.name,
            kind,
          },
          caption: draft.trim() || undefined,
          quoted_message_id: quoted,
        });
        if (!res.ok) {
          setSendErr(res.error);
          return;
        }
        setDraft("");
        // Reload the thread tail so the new media bubble (with storage path)
        // shows even if realtime is unavailable.
        await loadThread(conv);
        bumpConversationLocally(conv.id, mediaPreview(kind), "outbound");
      } catch (err) {
        setSendErr(err instanceof Error ? err.message : "media_send_failed");
      } finally {
        setSending(false);
      }
    },
    [selected, draft, reply, workspaceId, loadThread],
  );

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-picking the same file
      if (!file) return;
      const kind = kindFromMime(file.type);
      void handleSendMedia(file, kind);
    },
    [handleSendMedia],
  );

  // ── voice recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!voiceSupported || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const conv = selectedRef.current;
        if (conv && blob.size > 0) {
          const file = new File([blob], `voice-${Date.now()}.webm`, {
            type: blob.type,
          });
          void handleSendMedia(file, "audio");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setSendErr(
        err instanceof Error ? err.message : "microphone_unavailable",
      );
    }
  }, [voiceSupported, recording, handleSendMedia]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
  }, []);

  // Stop any in-flight recording on unmount.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  // ── reactions ────────────────────────────────────────────────────────────
  const handleReact = useCallback(
    async (msg: WaThreadMessage, emoji: string) => {
      // Toggle: if we already reacted with this emoji, remove it.
      const mine = (msg.reactions ?? []).find((r) => r.fromMe);
      const nextEmoji = mine && mine.emoji === emoji ? "" : emoji;
      // Optimistic.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, reactions: applyMyReaction(m.reactions, nextEmoji) }
            : m,
        ),
      );
      const res = await reactToMessage(workspaceId, msg.id, nextEmoji);
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, reactions: res.data.reactions } : m,
          ),
        );
      }
    },
    [workspaceId],
  );

  // ── helpers for local list bumps ─────────────────────────────────────────
  function bumpConversationLocally(
    convId: string,
    preview: string,
    direction: "inbound" | "outbound",
  ) {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === convId);
      if (idx === -1) return prev;
      const updated: WaConversation = {
        ...prev[idx],
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
        last_direction: direction,
      };
      const rest = prev.filter((_, i) => i !== idx);
      return [updated, ...rest];
    });
  }

  const showLeftOnMobile = compact && !showChat;
  const showRightOnMobile = compact && showChat;

  return (
    <div className={`flex h-full bg-app ${compact ? "flex-col" : "flex-row"}`}>
      {/* ── Conversation list ── */}
      {(!compact || showLeftOnMobile) && (
        <aside
          className={`flex flex-col border-r border-app bg-app-elevated ${
            compact ? "w-full" : "w-[320px] min-w-[280px]"
          }`}
        >
          <div className="shrink-0 border-b border-app p-2">
            <label className="flex items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5">
              <MiniIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-sm text-app outline-none placeholder:text-faint"
                aria-label="Search conversations"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="p-4 text-xs text-faint">loading…</div>
            ) : convErr ? (
              <div className="p-3">
                <ErrorBlock body={convErr} onRetry={() => void loadConversations()} />
              </div>
            ) : filtered.length === 0 ? (
              <ConvEmpty compact={compact} />
            ) : (
              <>
                <ul role="list" className="divide-y divide-app">
                  {filtered.map((c) => {
                    const active = selected?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openConversation(c)}
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                            active ? "bg-tool-accent-soft" : "hover:bg-surface"
                          }`}
                          aria-current={active ? "true" : undefined}
                        >
                          <Avatar conv={c} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1">
                                {c.is_group ? (
                                  <span className="shrink-0 text-faint">
                                    <MiniIcon name="users" size={12} />
                                  </span>
                                ) : null}
                                <span className="truncate text-sm font-medium text-app">
                                  {c.name?.trim() || formatPhone(c.phone)}
                                </span>
                              </div>
                              <span className="shrink-0 text-[0.65rem] text-faint">
                                {formatRelative(c.last_message_at)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-secondary">
                                {c.last_direction === "outbound" ? "You: " : ""}
                                {c.last_message_preview ?? "—"}
                              </span>
                              {c.unread_count > 0 ? (
                                <span className="shrink-0 rounded-full bg-tool-accent px-1.5 py-px text-[0.6rem] font-semibold text-app-elevated">
                                  {c.unread_count > 99 ? "99+" : c.unread_count}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {convMore && !search ? (
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() =>
                        void loadConversations({ append: true })
                      }
                      className="w-full rounded-md border border-app bg-surface px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-app-elevated hover:text-app"
                    >
                      Load more
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>
      )}

      {/* ── Thread ── */}
      {(!compact || showRightOnMobile) && (
        <section className="flex min-w-0 flex-1 flex-col bg-app">
          {!selected ? (
            <EmptyState
              kicker="whatsapp.inbox"
              compact={compact}
              title="Pick a conversation"
              body={
                <span>
                  Replies from your phone sync here automatically. Media, voice
                  notes, reactions and replies all work both ways.
                </span>
              }
            />
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
                {compact ? (
                  <button
                    type="button"
                    onClick={() => setShowChat(false)}
                    className="rounded-md p-1 text-secondary hover:bg-surface"
                    aria-label="Back to conversations"
                  >
                    <MiniIcon name="back" size={16} />
                  </button>
                ) : null}
                <Avatar conv={selected} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    {selected.is_group ? (
                      <span className="shrink-0 text-faint">
                        <MiniIcon name="users" size={12} />
                      </span>
                    ) : null}
                    <span className="truncate text-sm font-medium text-app">
                      {selected.name?.trim() || formatPhone(selected.phone)}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[0.65rem] text-faint">
                    {selected.is_group ? "group chat" : formatPhone(selected.phone)}
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-app p-3">
                {hasOlder && messages.length > 0 ? (
                  <div className="mb-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                      className="rounded-full border border-app bg-app-elevated px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:text-app disabled:opacity-60"
                    >
                      {loadingOlder ? "loading…" : "Load older"}
                    </button>
                  </div>
                ) : null}

                {msgLoading ? (
                  <div className="text-xs text-faint">loading messages…</div>
                ) : msgErr ? (
                  <ErrorBlock
                    body={msgErr}
                    onRetry={() => selected && void loadThread(selected)}
                  />
                ) : messages.length === 0 ? (
                  <div className="mt-8 text-center text-xs text-faint">
                    No messages yet. Send the first one below.
                  </div>
                ) : (
                  <ul role="list" className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        msg={m}
                        workspaceId={workspaceId}
                        isGroup={selected.is_group}
                        quoted={
                          m.reply_to_message_id
                            ? messageById.get(m.reply_to_message_id) ?? null
                            : null
                        }
                        onReply={() =>
                          setReply({
                            id: m.evolution_message_id ?? m.id,
                            preview: bubblePreview(m),
                            outbound: m.direction === "outbound",
                          })
                        }
                        onReact={(emoji) => void handleReact(m, emoji)}
                      />
                    ))}
                  </ul>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Composer ── */}
              <form
                onSubmit={handleSendText}
                className="shrink-0 border-t border-app bg-app-elevated p-2"
              >
                {sendErr ? (
                  <div className="mb-2">
                    <ErrorBlock body={sendErr} />
                  </div>
                ) : null}

                {reply ? (
                  <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-tool-accent bg-surface px-2 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
                        Replying to {reply.outbound ? "your message" : "them"}
                      </div>
                      <div className="truncate text-xs text-secondary">
                        {reply.preview}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReply(null)}
                      className="rounded p-0.5 text-faint hover:text-app"
                      aria-label="Cancel reply"
                    >
                      <MiniIcon name="close" size={14} />
                    </button>
                  </div>
                ) : null}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                    className="hidden"
                    onChange={onPickFile}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    className="shrink-0 rounded-md border border-app bg-surface p-2 text-secondary hover:bg-app-elevated hover:text-app disabled:opacity-60"
                    aria-label="Attach file"
                    title="Attach image, video or document"
                  >
                    <MiniIcon name="paperclip" size={16} />
                  </button>

                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void handleSendText();
                      }
                    }}
                    placeholder="Write a reply — Enter to send, Shift+Enter for newline"
                    rows={1}
                    className="max-h-32 min-h-[40px] w-full resize-y rounded-md border border-app bg-surface px-2 py-2 text-sm text-app outline-none placeholder:text-faint focus:border-tool-accent"
                    aria-label="Message body"
                    disabled={sending}
                  />

                  {voiceSupported ? (
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      disabled={sending && !recording}
                      className={`shrink-0 rounded-md border p-2 disabled:opacity-60 ${
                        recording
                          ? "border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                          : "border-app bg-surface text-secondary hover:bg-app-elevated hover:text-app"
                      }`}
                      aria-label={recording ? "Stop recording" : "Record voice note"}
                      title={recording ? "Stop & send voice note" : "Record voice note"}
                    >
                      <MiniIcon name={recording ? "stop" : "mic"} size={16} />
                    </button>
                  ) : null}

                  <PrimaryButton
                    type="submit"
                    disabled={!draft.trim() || sending}
                    loading={sending && !recording}
                  >
                    <MiniIcon name="send" /> Send
                  </PrimaryButton>
                </div>
                <p className="mt-1 text-[0.6rem] text-faint">
                  {recording
                    ? "Recording… tap the stop button to send."
                    : "Outbound counts against your daily cap."}
                </p>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/* ════════════════════════════ sub-components ════════════════════════════ */

function Avatar({ conv, size = 36 }: { conv: WaConversation; size?: number }) {
  const label = (conv.name?.trim() || conv.phone || "?").trim();
  const initial = label.replace(/^\+/, "").charAt(0).toUpperCase() || "?";
  return (
    <div
      className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-tool-accent-soft font-semibold text-tool-accent"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {conv.is_group ? <MiniIcon name="users" size={size * 0.45} /> : initial}
    </div>
  );
}

function ConvEmpty({ compact }: { compact: boolean }) {
  return (
    <div className="p-4">
      <div
        className="rounded-xl border border-dashed border-app bg-app-elevated p-4 text-center"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          whatsapp.inbox
        </div>
        <h4 className="mt-2 text-sm font-semibold text-app">No conversations yet</h4>
        <p className="mt-1 text-xs text-secondary">
          Inbound messages appear here. Message a contact from any tool to start
          a thread.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  workspaceId,
  isGroup,
  quoted,
  onReply,
  onReact,
}: {
  msg: WaThreadMessage;
  workspaceId: string;
  isGroup: boolean;
  quoted: WaThreadMessage | null;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const out = msg.direction === "outbound";

  // Internal note — never styled as a customer-facing bubble.
  if (msg.is_private) {
    return (
      <li className="flex justify-center">
        <div className="max-w-[85%] rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-800 dark:text-amber-200">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] opacity-80">
            internal note{msg.sender_name ? ` · ${msg.sender_name}` : ""}
          </div>
          {msg.body ? (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
              {msg.body}
            </p>
          ) : null}
          <div className="mt-0.5 text-right text-[0.6rem] opacity-70">
            {fmtTime(msg.created_at)}
          </div>
        </div>
      </li>
    );
  }

  const tone =
    msg.status === "failed"
      ? "danger"
      : msg.status === "queued"
        ? "neutral"
        : null;

  return (
    <li
      className={`group/bubble flex ${out ? "justify-end" : "justify-start"}`}
      onMouseLeave={() => setShowPicker(false)}
    >
      <div className={`flex max-w-[80%] flex-col ${out ? "items-end" : "items-start"}`}>
        {isGroup && !out && msg.sender_name ? (
          <span className="mb-0.5 px-1 text-[0.65rem] font-medium text-tool-accent">
            {msg.sender_name}
          </span>
        ) : null}

        <div
          className={`relative rounded-2xl px-3 py-1.5 text-sm ${
            out
              ? "rounded-br-sm bg-tool-accent text-app-elevated"
              : "rounded-bl-sm border border-app bg-app-elevated text-app"
          }`}
        >
          {/* Quoted snippet */}
          {quoted ? (
            <div
              className={`mb-1 rounded-md border-l-2 px-2 py-0.5 text-xs ${
                out
                  ? "border-app-elevated/60 bg-black/10"
                  : "border-tool-accent bg-surface"
              }`}
            >
              <div className="truncate opacity-80">{bubblePreview(quoted)}</div>
            </div>
          ) : msg.reply_to_message_id ? (
            <div
              className={`mb-1 rounded-md border-l-2 px-2 py-0.5 text-xs opacity-70 ${
                out ? "border-app-elevated/60 bg-black/10" : "border-tool-accent bg-surface"
              }`}
            >
              <div className="truncate italic">replied message</div>
            </div>
          ) : null}

          <MediaContent msg={msg} workspaceId={workspaceId} />

          {msg.body ? (
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          ) : null}

          <div className="mt-0.5 flex items-center justify-end gap-1 text-[0.6rem] opacity-80">
            <span>{fmtTime(msg.created_at)}</span>
            {out ? (
              <span
                className={
                  msg.status === "read"
                    ? "text-sky-200"
                    : msg.status === "failed"
                      ? "text-rose-200"
                      : ""
                }
              >
                {formatStatusIcon(msg.status)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Reactions row */}
        {msg.reactions && msg.reactions.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap gap-1 px-1">
            {collapseReactions(msg.reactions).map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(r.emoji)}
                className={`rounded-full border px-1.5 py-px text-[0.7rem] ${
                  r.mine
                    ? "border-tool-accent bg-tool-accent-soft"
                    : "border-app bg-app-elevated"
                }`}
                title={r.mine ? "Remove your reaction" : "React"}
              >
                {r.emoji}
                {r.count > 1 ? (
                  <span className="ml-0.5 text-[0.6rem] text-faint">{r.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {tone ? (
          <div className="mt-0.5 px-1 text-[0.6rem]">
            <Pill tone={tone}>{msg.status}</Pill>
          </div>
        ) : null}

        {/* Hover/long-press affordances: reply + react */}
        <div className="mt-0.5 flex items-center gap-1 px-1 opacity-0 transition-opacity group-hover/bubble:opacity-100">
          <button
            type="button"
            onClick={onReply}
            className="rounded p-0.5 text-faint hover:text-app"
            aria-label="Reply"
            title="Reply"
          >
            <MiniIcon name="reply" size={13} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="rounded p-0.5 text-faint hover:text-app"
              aria-label="Add reaction"
              title="React"
            >
              <MiniIcon name="smile" size={13} />
            </button>
            {showPicker ? (
              <div
                className={`absolute z-10 mt-1 flex gap-0.5 rounded-full border border-app bg-app-elevated px-1.5 py-1 shadow-lg ${
                  out ? "right-0" : "left-0"
                }`}
              >
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(emoji);
                      setShowPicker(false);
                    }}
                    className="rounded-full px-1 text-base hover:bg-surface"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function MediaContent({
  msg,
  workspaceId,
}: {
  msg: WaThreadMessage;
  workspaceId: string;
}) {
  if (!msg.media_type) return null;

  // Media re-host not finished (or unavailable) — never use the raw media_url.
  if (!msg.media_storage_path) {
    return (
      <div className="mb-1 flex items-center gap-1.5 rounded-md border border-dashed border-app/60 px-2 py-1.5 text-[0.7rem] opacity-80">
        <MiniIcon name="image" size={14} />
        <span>media still processing / unavailable</span>
      </div>
    );
  }

  const src = mediaUrl(workspaceId, msg.id);
  const kind = msg.media_type;

  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt="" className="mb-1 max-h-72 rounded-md" />
      </a>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        className="mb-1 max-h-72 max-w-full rounded-md"
      />
    );
  }
  if (kind === "audio") {
    return <audio src={src} controls className="mb-1 w-56 max-w-full" />;
  }
  // document (and any other type) → download link.
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download
      className="mb-1 flex items-center gap-2 rounded-md border border-app/60 px-2 py-1.5 text-xs hover:bg-surface"
    >
      <MiniIcon name="file" size={16} />
      <span className="min-w-0 flex-1 truncate">
        {msg.media_mime ?? "document"}
      </span>
      <MiniIcon name="download" size={14} />
    </a>
  );
}

/* ════════════════════════════ pure helpers ════════════════════════════ */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mediaPreview(kind: WaMediaKind): string {
  switch (kind) {
    case "image":
      return "📷 Photo";
    case "video":
      return "🎬 Video";
    case "audio":
      return "🎤 Voice message";
    case "document":
      return "📄 Document";
    default:
      return "Attachment";
  }
}

function bubblePreview(m: WaThreadMessage): string {
  const text = (m.body ?? "").trim();
  if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  if (m.media_type) return mediaPreview(m.media_type as WaMediaKind);
  return "message";
}

function kindFromMime(mime: string): WaMediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("read_failed"));
        return;
      }
      // Strip the `data:<mime>;base64,` prefix — the API wants bare base64.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

/** Replace our reaction in a reactions array (empty emoji removes it). */
function applyMyReaction(
  reactions: WaReaction[] | null,
  emoji: string,
): WaReaction[] {
  const existing = Array.isArray(reactions) ? reactions : [];
  const without = existing.filter((r) => !r.fromMe);
  return emoji ? [...without, { emoji, fromMe: true, actor: "self" }] : without;
}

/** Collapse a reactions array into unique-emoji counts + a "mine" flag. */
function collapseReactions(
  reactions: WaReaction[],
): Array<{ emoji: string; count: number; mine: boolean }> {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    if (!r.emoji) continue;
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.fromMe) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

/** Normalize a realtime row (snake_case DB row) into a WaThreadMessage. */
function normalizeRealtimeMessage(row: Record<string, unknown>): WaThreadMessage {
  return {
    id: String(row.id),
    direction: (row.direction as "inbound" | "outbound") ?? "inbound",
    body: (row.body as string | null) ?? null,
    status: (row.status as WaThreadMessage["status"]) ?? "sent",
    created_at:
      (row.created_at as string) ??
      (row.received_at as string) ??
      (row.sent_at as string) ??
      new Date().toISOString(),
    media_type: (row.media_type as string | null) ?? null,
    media_mime: (row.media_mime as string | null) ?? null,
    media_storage_path: (row.media_storage_path as string | null) ?? null,
    reactions: Array.isArray(row.reactions)
      ? (row.reactions as WaReaction[])
      : [],
    reply_to_message_id: (row.reply_to_message_id as string | null) ?? null,
    sender_name: (row.sender_name as string | null) ?? null,
    is_private: (row.is_private as boolean | null) ?? false,
    evolution_message_id: (row.evolution_message_id as string | null) ?? null,
  };
}

/** Merge a freshly-fetched first page over the existing list, de-duping by id
 * and keeping server order (newest activity first). */
function mergeConversations(
  prev: WaConversation[],
  incoming: WaConversation[],
): WaConversation[] {
  const seen = new Set(incoming.map((c) => c.id));
  const tail = prev.filter((c) => !seen.has(c.id));
  return [...incoming, ...tail];
}

/** Prepend older messages (ascending) ahead of the current set, de-duping. */
function mergeMessages(
  older: WaThreadMessage[],
  current: WaThreadMessage[],
): WaThreadMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const head = older.filter((m) => !seen.has(m.id));
  return [...head, ...current];
}
