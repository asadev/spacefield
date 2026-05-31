"use client";

/* WhatsApp inbox v2 — shared-inbox conversation experience.
 *
 * Wave 1: list (cursor-paginated) · thread (load-older) · media bubbles ·
 *         reactions · reply/quote · status ticks · group sender names ·
 *         internal-note rendering · realtime (Postgres Changes) + slow poll.
 * Wave 2: filter chips + default "Open & mine" queue · lifecycle actions
 *         (status/assign/snooze/priority) in the list row menu + chat header ·
 *         quick replies ('/'+short_code → interpolated insert) · internal-note
 *         composer toggle · label filter · contact sidebar (lazy) ·
 *         settings panel (lazy).
 *
 * Mobile-first, identical features on every device — layout is responsive CSS
 * only (no behaviour is branched by screen size; voice is feature-detected).
 *
 * Heavy/rare panels (ContactSidebar, InboxSettings) are next/dynamic so their
 * JS only loads on demand — keeps the Vercel webpack compile under 8GB.
 */

import dynamic from "next/dynamic";
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
  addConversationLabel,
  aiAssist,
  fetchCanned,
  fetchConversations,
  fetchLabels,
  fetchMembers,
  fetchThreadMessages,
  markConversationRead,
  patchLifecycle,
  postNote,
  reactToMessage,
  removeConversationLabel,
  sendConversationText,
  sendConversationMedia,
  mediaUrl,
  WA_PRIORITY_LABEL,
  WA_STATUS_NAME,
  type WaCanned,
  type WaConversation,
  type WaLabel,
  type WaMember,
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

// Lazy — only fetched when the operator opens the sidebar / settings.
const ContactSidebar = dynamic(() => import("./ContactSidebar"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-xs text-faint">loading contact…</div>
  ),
});
const InboxSettings = dynamic(() => import("./InboxSettings"), { ssr: false });

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
type FilterView = "open_mine" | "unassigned" | "resolved" | "pending" | "all";

const FILTER_CHIPS: Array<{ key: FilterView; label: string }> = [
  { key: "open_mine", label: "Open & mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const SNOOZE_PRESETS: Array<{ label: string; hours: number }> = [
  { label: "3 hours", hours: 3 },
  { label: "Tomorrow", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "Next week", hours: 168 },
];

export default function ConversationsTab({ workspaceId, compact }: Props) {
  // ── conversation list ────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [convCursor, setConvCursor] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [convErr, setConvErr] = useState<string | null>(null);
  const [convMore, setConvMore] = useState(false);
  const [search, setSearch] = useState("");

  // ── Wave 2 filters ───────────────────────────────────────────────────────
  const [view, setView] = useState<FilterView>("open_mine");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const viewRef = useRef<{ view: FilterView; labelFilter: string | null }>({
    view: "open_mine",
    labelFilter: null,
  });
  useEffect(() => {
    viewRef.current = { view, labelFilter };
  }, [view, labelFilter]);

  // ── workspace metadata (labels + members) ────────────────────────────────
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [members, setMembers] = useState<WaMember[]>([]);
  const labelById = useMemo(() => {
    const m = new Map<string, WaLabel>();
    for (const l of labels) m.set(l.id, l);
    return m;
  }, [labels]);

  // ── selected thread ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<WaConversation | null>(null);
  const [messages, setMessages] = useState<WaThreadMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgErr, setMsgErr] = useState<string | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarReloadKey, setSidebarReloadKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── composer ─────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [reply, setReply] = useState<ReplyTarget>(null);
  const [recording, setRecording] = useState(false);
  const [showChat, setShowChat] = useState(false); // mobile pane toggle
  const [noteMode, setNoteMode] = useState(false); // internal-note composer
  const [postingNote, setPostingNote] = useState(false);

  // quick replies (canned) — fetched per workspace; "/" opens the menu
  const [canned, setCanned] = useState<WaCanned[]>([]);
  const [showCanned, setShowCanned] = useState(false);
  const [cannedQuery, setCannedQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<WaConversation | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Feature-detect voice recording once (not device-detect).
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
      const v = viewRef.current;
      const res = await fetchConversations(workspaceId, {
        cursor: opts?.append ? opts.cursor ?? convCursor : null,
        limit: CONV_PAGE,
        view:
          v.view === "open_mine"
            ? "open_mine"
            : v.view === "unassigned"
              ? "unassigned"
              : "all",
        status:
          v.view === "resolved"
            ? "resolved"
            : v.view === "pending"
              ? "pending"
              : null,
        label_id: v.labelFilter,
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

  // Initial + slow poll fallback. Re-fetch on filter change.
  useEffect(() => {
    setConvLoading(true);
    void loadConversations();
    const id = setInterval(() => void loadConversations(), LIST_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, view, labelFilter]);

  // Load labels + members once per workspace (used by chips, row chips, pickers).
  useEffect(() => {
    void (async () => {
      const [l, m] = await Promise.all([
        fetchLabels(workspaceId),
        fetchMembers(workspaceId),
      ]);
      if (l.ok) setLabels(l.data);
      if (m.ok) setMembers(m.data);
    })();
  }, [workspaceId]);

  // Load canned responses once per workspace (cheap; re-render of menu only).
  useEffect(() => {
    void (async () => {
      const res = await fetchCanned(workspaceId);
      if (res.ok) setCanned(res.data);
    })();
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
      setNoteMode(false);
      setShowCanned(false);
      setMessages([]);
      setMsgLoading(true);
      if (compact) {
        setShowChat(true);
        setSidebarOpen(false);
      }
      void loadThread(conv);
      void clearUnread(conv);
    },
    [compact, loadThread, clearUnread],
  );

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ block: "end" });
  }, [messages.length, selected?.id]);

  // ── realtime (EPIC-06) — messages for OPEN conversation ──────────────────
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
          if (payload.eventType === "INSERT" && next.direction === "inbound") {
            void markConversationRead(workspaceId, conversationId);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, workspaceId]);

  // ── realtime — conversation rows for this workspace ──────────────────────
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

  const messageById = useMemo(() => {
    const map = new Map<string, WaThreadMessage>();
    for (const m of messages) {
      map.set(m.id, m);
      if (m.evolution_message_id) map.set(m.evolution_message_id, m);
    }
    return map;
  }, [messages]);

  // ── lifecycle actions (status / assign / snooze / priority) ──────────────
  const applyLifecycle = useCallback(
    async (
      conv: WaConversation,
      patch: {
        status?: number;
        priority?: number;
        assignee_id?: string | null;
        snoozed_until?: string | null;
      },
    ) => {
      // optimistic local update on the list + selected
      const patchLocal = (c: WaConversation): WaConversation => ({
        ...c,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.assignee_id !== undefined
          ? {
              assignee_id: patch.assignee_id,
              assignee_name: patch.assignee_id
                ? members.find((m) => m.id === patch.assignee_id)?.name ?? null
                : null,
            }
          : {}),
      });
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? patchLocal(c) : c)));
      setSelected((prev) => (prev && prev.id === conv.id ? patchLocal(prev) : prev));
      const res = await patchLifecycle(workspaceId, conv.id, patch);
      if (!res.ok) {
        // revert by refetching the list
        void loadConversations();
        return;
      }
      // if status moved out of the current filter, refresh the list
      if (patch.status !== undefined) void loadConversations();
      if (sidebarOpen) setSidebarReloadKey((k) => k + 1);
    },
    [workspaceId, members, loadConversations, sidebarOpen],
  );

  // ── sending text ─────────────────────────────────────────────────────────
  const handleSendText = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const conv = selected;
      const text = draft.trim();
      if (!conv || !text) return;

      // Internal-note path — never sent to WhatsApp.
      if (noteMode) {
        setPostingNote(true);
        setSendErr(null);
        const mentions = members
          .filter((m) => {
            const handle = m.name.toLowerCase().replace(/\s+/g, "");
            const first = m.name.split(/\s+/)[0]?.toLowerCase() ?? "";
            const uname = (m.username ?? "").toLowerCase();
            return (
              text.toLowerCase().includes(`@${handle}`) ||
              (first && text.toLowerCase().includes(`@${first}`)) ||
              (uname && text.toLowerCase().includes(`@${uname}`))
            );
          })
          .map((m) => m.id);
        const res = await postNote(workspaceId, conv.id, text, mentions);
        setPostingNote(false);
        if (!res.ok) {
          setSendErr(res.error);
          return;
        }
        setDraft("");
        setNoteMode(false);
        await loadThread(conv);
        return;
      }

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
    [selected, draft, reply, workspaceId, noteMode, members, loadThread],
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
      e.target.value = "";
      if (!file) return;
      const kind = kindFromMime(file.type);
      void handleSendMedia(file, kind);
    },
    [handleSendMedia],
  );

  // ── quick replies ('/'+short_code) ───────────────────────────────────────
  const onDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      // Open the canned menu when the draft is exactly "/foo" (a leading slash
      // command with no spaces) and not in note mode.
      if (!noteMode && /^\/[^\s]*$/.test(value)) {
        setShowCanned(true);
        setCannedQuery(value.slice(1).toLowerCase());
      } else {
        setShowCanned(false);
      }
    },
    [noteMode],
  );

  const insertCanned = useCallback(
    async (c: WaCanned) => {
      const conv = selected;
      setShowCanned(false);
      if (!conv) {
        setDraft(c.content);
        return;
      }
      // Fetch the interpolated render for THIS conversation (fills {{vars}}).
      const res = await fetchCanned(workspaceId, conv.id);
      let text = c.content;
      if (res.ok) {
        const match = res.data.find((x) => x.id === c.id);
        if (match?.rendered) text = match.rendered;
      }
      setDraft(text);
    },
    [selected, workspaceId],
  );

  const cannedMatches = useMemo(() => {
    if (!showCanned) return [];
    const q = cannedQuery.trim();
    const list = q
      ? canned.filter(
          (c) =>
            c.short_code.toLowerCase().startsWith(q) ||
            c.short_code.toLowerCase().includes(q),
        )
      : canned;
    return list.slice(0, 8);
  }, [showCanned, cannedQuery, canned]);

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
      setSendErr(err instanceof Error ? err.message : "microphone_unavailable");
    }
  }, [voiceSupported, recording, handleSendMedia]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  // ── reactions ────────────────────────────────────────────────────────────
  const handleReact = useCallback(
    async (msg: WaThreadMessage, emoji: string) => {
      const mine = (msg.reactions ?? []).find((r) => r.fromMe);
      const nextEmoji = mine && mine.emoji === emoji ? "" : emoji;
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

  // ── quick label toggle from the row (uses first sidebar label) ───────────
  const toggleRowLabel = useCallback(
    async (conv: WaConversation, labelId: string) => {
      const has = (conv.label_ids ?? []).includes(labelId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id
            ? {
                ...c,
                label_ids: has
                  ? (c.label_ids ?? []).filter((x) => x !== labelId)
                  : [...(c.label_ids ?? []), labelId],
              }
            : c,
        ),
      );
      if (has) await removeConversationLabel(workspaceId, conv.id, labelId);
      else await addConversationLabel(workspaceId, conv.id, labelId);
    },
    [workspaceId],
  );

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
  const sidebarLabels = useMemo(
    () => labels.filter((l) => l.show_on_sidebar).slice(0, 6),
    [labels],
  );

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
            <div className="mb-2 flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5">
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
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 rounded-md border border-app bg-surface p-2 text-secondary hover:bg-app hover:text-app"
                aria-label="Inbox settings"
                title="Quick replies, labels, custom fields"
              >
                <MiniIcon name="list" size={16} />
              </button>
            </div>

            {/* filter chips */}
            <div className="flex flex-wrap gap-1">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setView(chip.key);
                    setLabelFilter(null);
                  }}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.12em] ${
                    view === chip.key && !labelFilter
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-surface text-secondary hover:text-app"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* label filter chips (sidebar labels) */}
            {sidebarLabels.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {sidebarLabels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      setLabelFilter((cur) => (cur === l.id ? null : l.id))
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] ${
                      labelFilter === l.id
                        ? "border-tool-accent"
                        : "border-app hover:bg-surface"
                    }`}
                    style={
                      labelFilter === l.id
                        ? { backgroundColor: `${l.color}22`, color: l.color }
                        : { color: l.color }
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="p-4 text-xs text-faint">loading…</div>
            ) : convErr ? (
              <div className="p-3">
                <ErrorBlock body={convErr} onRetry={() => void loadConversations()} />
              </div>
            ) : filtered.length === 0 ? (
              <ConvEmpty compact={compact} view={view} />
            ) : (
              <>
                <ul role="list" className="divide-y divide-app">
                  {filtered.map((c) => {
                    const active = selected?.id === c.id;
                    return (
                      <li key={c.id}>
                        <ConversationRow
                          conv={c}
                          active={active}
                          labelById={labelById}
                          members={members}
                          sidebarLabels={sidebarLabels}
                          onOpen={() => openConversation(c)}
                          onLifecycle={(patch) => void applyLifecycle(c, patch)}
                          onToggleLabel={(labelId) => void toggleRowLabel(c, labelId)}
                        />
                      </li>
                    );
                  })}
                </ul>
                {convMore && !search ? (
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => void loadConversations({ append: true })}
                      className="w-full rounded-md border border-app bg-surface px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-app hover:text-app"
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
                  Replies from your phone sync here automatically. Assign, label,
                  snooze, drop a private note, or fire a quick reply with{" "}
                  <code className="rounded bg-surface px-1">/</code>.
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
                    <StatusDot status={toStatusNum(selected.status)} />
                  </div>
                  <div className="truncate font-mono text-[0.65rem] text-faint">
                    {selected.assignee_name
                      ? `assigned · ${selected.assignee_name}`
                      : selected.is_group
                        ? "group chat"
                        : formatPhone(selected.phone)}
                  </div>
                </div>

                {/* header lifecycle actions */}
                <HeaderActions
                  conv={selected}
                  members={members}
                  onLifecycle={(patch) => void applyLifecycle(selected, patch)}
                />
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  className={`shrink-0 rounded-md border p-1.5 ${
                    sidebarOpen
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-surface text-secondary hover:text-app"
                  }`}
                  aria-label="Contact details"
                  title="Contact details"
                >
                  <MiniIcon name="users" size={15} />
                </button>
              </header>

              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
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
                    className="relative shrink-0 border-t border-app bg-app-elevated p-2"
                  >
                    {sendErr ? (
                      <div className="mb-2">
                        <ErrorBlock body={sendErr} />
                      </div>
                    ) : null}

                    {/* canned-reply popover */}
                    {showCanned ? (
                      <div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-56 overflow-y-auto rounded-md border border-app bg-app-elevated shadow-lg">
                        {cannedMatches.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-faint">
                            No quick reply matches. Create one in settings.
                          </div>
                        ) : (
                          cannedMatches.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                void insertCanned(c);
                              }}
                              className="flex w-full flex-col items-start gap-0.5 border-b border-app px-3 py-1.5 text-left last:border-0 hover:bg-surface"
                            >
                              <code className="text-[0.7rem] font-medium text-tool-accent">
                                /{c.short_code}
                              </code>
                              <span className="line-clamp-2 text-xs text-secondary">
                                {c.content}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}

                    {reply && !noteMode ? (
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

                    {/* note-mode toggle row */}
                    <div className="mb-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteMode((v) => !v);
                          setReply(null);
                          setShowCanned(false);
                        }}
                        className={`rounded-md border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.12em] ${
                          noteMode
                            ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "border-app bg-surface text-secondary hover:text-app"
                        }`}
                        title="Internal note — never sent to the customer"
                      >
                        {noteMode ? "Note mode ON" : "Add note"}
                      </button>
                      {noteMode ? (
                        <span className="text-[0.6rem] text-amber-700 dark:text-amber-300">
                          Private — use @name to notify a teammate
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                        className="hidden"
                        onChange={onPickFile}
                      />
                      {!noteMode ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sending}
                          className="shrink-0 rounded-md border border-app bg-surface p-2 text-secondary hover:bg-app hover:text-app disabled:opacity-60"
                          aria-label="Attach file"
                          title="Attach image, video or document"
                        >
                          <MiniIcon name="paperclip" size={16} />
                        </button>
                      ) : null}

                      <textarea
                        value={draft}
                        onChange={(e) => onDraftChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            void handleSendText();
                          }
                          if (e.key === "Escape") setShowCanned(false);
                        }}
                        placeholder={
                          noteMode
                            ? "Internal note (only your team sees this)…"
                            : "Reply — Enter to send, / for quick replies"
                        }
                        rows={1}
                        className={`max-h-32 min-h-[40px] w-full resize-y rounded-md border px-2 py-2 text-sm text-app outline-none placeholder:text-faint focus:border-tool-accent ${
                          noteMode
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-app bg-surface"
                        }`}
                        aria-label={noteMode ? "Internal note" : "Message body"}
                        disabled={sending || postingNote}
                      />

                      {voiceSupported && !noteMode ? (
                        <button
                          type="button"
                          onClick={recording ? stopRecording : startRecording}
                          disabled={sending && !recording}
                          className={`shrink-0 rounded-md border p-2 disabled:opacity-60 ${
                            recording
                              ? "border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                              : "border-app bg-surface text-secondary hover:bg-app hover:text-app"
                          }`}
                          aria-label={recording ? "Stop recording" : "Record voice note"}
                          title={recording ? "Stop & send voice note" : "Record voice note"}
                        >
                          <MiniIcon name={recording ? "stop" : "mic"} size={16} />
                        </button>
                      ) : null}

                      <PrimaryButton
                        type="submit"
                        disabled={!draft.trim() || sending || postingNote}
                        loading={(sending || postingNote) && !recording}
                      >
                        {noteMode ? (
                          <>Save note</>
                        ) : (
                          <>
                            <MiniIcon name="send" /> Send
                          </>
                        )}
                      </PrimaryButton>
                    </div>
                    <p className="mt-1 text-[0.6rem] text-faint">
                      {recording
                        ? "Recording… tap the stop button to send."
                        : noteMode
                          ? "Notes are internal — the customer never sees them."
                          : "Outbound counts against your daily cap."}
                    </p>
                  </form>
                </div>

                {/* ── Contact sidebar (lazy) ── */}
                {sidebarOpen && !compact ? (
                  <div className="w-[300px] shrink-0 border-l border-app">
                    <ContactSidebar
                      workspaceId={workspaceId}
                      conversationId={selected.id}
                      reloadKey={sidebarReloadKey}
                      onClose={() => setSidebarOpen(false)}
                      onInsertDraft={(t) => {
                        setNoteMode(false);
                        setDraft(t);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      )}

      {/* mobile sidebar overlay */}
      {sidebarOpen && compact && selected ? (
        <div className="fixed inset-0 z-40 bg-app">
          <ContactSidebar
            workspaceId={workspaceId}
            conversationId={selected.id}
            reloadKey={sidebarReloadKey}
            onClose={() => setSidebarOpen(false)}
            onInsertDraft={(t) => {
              setNoteMode(false);
              setDraft(t);
              setSidebarOpen(false);
            }}
          />
        </div>
      ) : null}

      {/* settings modal (lazy) */}
      {settingsOpen ? (
        <InboxSettings
          workspaceId={workspaceId}
          onClose={() => {
            setSettingsOpen(false);
            // refresh labels + canned after edits
            void (async () => {
              const [l, c] = await Promise.all([
                fetchLabels(workspaceId),
                fetchCanned(workspaceId),
              ]);
              if (l.ok) setLabels(l.data);
              if (c.ok) setCanned(c.data);
            })();
          }}
        />
      ) : null}
    </div>
  );
}

/* ════════════════════════════ sub-components ════════════════════════════ */

function toStatusNum(s: number | string | null | undefined): number {
  if (typeof s === "number") return s;
  if (typeof s === "string") {
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n)) return n;
    if (s === "open") return 0;
    if (s === "resolved") return 1;
    if (s === "pending") return 2;
    if (s === "snoozed") return 3;
  }
  return 0;
}

function StatusDot({ status }: { status: number }) {
  if (status === 0) return null; // open is the default — no chip noise
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: "resolved", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    2: { label: "pending", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    3: { label: "snoozed", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[0.55rem] font-medium uppercase tracking-[0.1em] ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function PriorityFlag({ priority }: { priority: number }) {
  if (!priority) return null;
  const color =
    priority >= 4
      ? "text-rose-500"
      : priority === 3
        ? "text-orange-500"
        : priority === 2
          ? "text-amber-500"
          : "text-sky-500";
  return (
    <span className={`shrink-0 ${color}`} title={WA_PRIORITY_LABEL[priority]}>
      <MiniIcon name="warning" size={11} />
    </span>
  );
}

function ConversationRow({
  conv,
  active,
  labelById,
  members,
  sidebarLabels,
  onOpen,
  onLifecycle,
  onToggleLabel,
}: {
  conv: WaConversation;
  active: boolean;
  labelById: Map<string, WaLabel>;
  members: WaMember[];
  sidebarLabels: WaLabel[];
  onOpen: () => void;
  onLifecycle: (patch: {
    status?: number;
    priority?: number;
    assignee_id?: string | null;
    snoozed_until?: string | null;
  }) => void;
  onToggleLabel: (labelId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = toStatusNum(conv.status);
  const rowLabels = (conv.label_ids ?? [])
    .map((id) => labelById.get(id))
    .filter((l): l is WaLabel => !!l)
    .slice(0, 3);

  return (
    <div
      className={`group/row relative flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
        active ? "bg-tool-accent-soft" : "hover:bg-surface"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
        aria-current={active ? "true" : undefined}
      >
        <Avatar conv={conv} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              {conv.is_group ? (
                <span className="shrink-0 text-faint">
                  <MiniIcon name="users" size={12} />
                </span>
              ) : null}
              <PriorityFlag priority={conv.priority ?? 0} />
              <span className="truncate text-sm font-medium text-app">
                {conv.name?.trim() || formatPhone(conv.phone)}
              </span>
            </div>
            <span className="shrink-0 text-[0.65rem] text-faint">
              {formatRelative(conv.last_message_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-secondary">
              {conv.last_direction === "outbound" ? "You: " : ""}
              {conv.last_message_preview ?? "—"}
            </span>
            {conv.unread_count > 0 ? (
              <span className="shrink-0 rounded-full bg-tool-accent px-1.5 py-px text-[0.6rem] font-semibold text-app-elevated">
                {conv.unread_count > 99 ? "99+" : conv.unread_count}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <StatusDot status={status} />
            {conv.assignee_name ? (
              <span className="rounded-full bg-surface px-1.5 py-px text-[0.55rem] text-secondary">
                {conv.assignee_name}
              </span>
            ) : null}
            {rowLabels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[0.55rem]"
                style={{ backgroundColor: `${l.color}22`, color: l.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                {l.title}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* row action menu */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded p-1 text-faint opacity-0 transition-opacity hover:bg-app-elevated hover:text-app focus:opacity-100 group-hover/row:opacity-100"
          aria-label="Conversation actions"
        >
          <MiniIcon name="list" size={14} />
        </button>
        {menuOpen ? (
          <RowMenu
            conv={conv}
            members={members}
            sidebarLabels={sidebarLabels}
            currentLabelIds={new Set(conv.label_ids ?? [])}
            onLifecycle={(patch) => {
              setMenuOpen(false);
              onLifecycle(patch);
            }}
            onToggleLabel={(id) => onToggleLabel(id)}
            onClose={() => setMenuOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function RowMenu({
  conv,
  members,
  sidebarLabels,
  currentLabelIds,
  onLifecycle,
  onToggleLabel,
  onClose,
}: {
  conv: WaConversation;
  members: WaMember[];
  sidebarLabels: WaLabel[];
  currentLabelIds: Set<string>;
  onLifecycle: (patch: {
    status?: number;
    priority?: number;
    assignee_id?: string | null;
    snoozed_until?: string | null;
  }) => void;
  onToggleLabel: (labelId: string) => void;
  onClose: () => void;
}) {
  const status = toStatusNum(conv.status);
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-app bg-app-elevated p-1 text-xs shadow-lg">
        <MenuLabel>Status</MenuLabel>
        {([0, 1, 2] as const).map((s) => (
          <MenuItem
            key={s}
            active={status === s}
            onClick={() => onLifecycle({ status: s })}
          >
            {WA_STATUS_NAME[s]}
          </MenuItem>
        ))}

        <MenuLabel>Snooze</MenuLabel>
        {SNOOZE_PRESETS.map((p) => (
          <MenuItem
            key={p.hours}
            onClick={() =>
              onLifecycle({
                status: 3,
                snoozed_until: new Date(
                  Date.now() + p.hours * 3600_000,
                ).toISOString(),
              })
            }
          >
            {p.label}
          </MenuItem>
        ))}

        <MenuLabel>Priority</MenuLabel>
        <div className="flex flex-wrap gap-1 px-2 py-1">
          {([0, 1, 2, 3, 4] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onLifecycle({ priority: p })}
              className={`rounded border px-1.5 py-0.5 text-[0.6rem] ${
                (conv.priority ?? 0) === p
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app text-secondary hover:text-app"
              }`}
            >
              {WA_PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>

        {members.length > 0 ? (
          <>
            <MenuLabel>Assign</MenuLabel>
            <div className="max-h-32 overflow-y-auto">
              <MenuItem
                active={!conv.assignee_id}
                onClick={() => onLifecycle({ assignee_id: null })}
              >
                Unassigned
              </MenuItem>
              {members.map((m) => (
                <MenuItem
                  key={m.id}
                  active={conv.assignee_id === m.id}
                  onClick={() => onLifecycle({ assignee_id: m.id })}
                >
                  {m.name}
                </MenuItem>
              ))}
            </div>
          </>
        ) : null}

        {sidebarLabels.length > 0 ? (
          <>
            <MenuLabel>Labels</MenuLabel>
            <div className="max-h-32 overflow-y-auto">
              {sidebarLabels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onToggleLabel(l.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-app">{l.title}</span>
                  {currentLabelIds.has(l.id) ? (
                    <span className="text-tool-accent">
                      <MiniIcon name="check" size={12} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function HeaderActions({
  conv,
  members,
  onLifecycle,
}: {
  conv: WaConversation;
  members: WaMember[];
  onLifecycle: (patch: {
    status?: number;
    priority?: number;
    assignee_id?: string | null;
    snoozed_until?: string | null;
  }) => void;
}) {
  const [open, setOpen] = useState<null | "status" | "assign" | "snooze">(null);
  const status = toStatusNum(conv.status);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* resolve quick-toggle */}
      <button
        type="button"
        onClick={() => onLifecycle({ status: status === 1 ? 0 : 1 })}
        className={`rounded-md border p-1.5 ${
          status === 1
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
            : "border-app bg-surface text-secondary hover:text-app"
        }`}
        aria-label={status === 1 ? "Reopen" : "Resolve"}
        title={status === 1 ? "Reopen conversation" : "Mark resolved"}
      >
        <MiniIcon name="check" size={15} />
      </button>

      {/* snooze */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === "snooze" ? null : "snooze")}
          className={`rounded-md border p-1.5 ${
            status === 3
              ? "border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-sky-300"
              : "border-app bg-surface text-secondary hover:text-app"
          }`}
          aria-label="Snooze"
          title="Snooze"
        >
          <MiniIcon name="pause" size={15} />
        </button>
        {open === "snooze" ? (
          <Dropdown onClose={() => setOpen(null)}>
            {status === 3 ? (
              <MenuItem onClick={() => { setOpen(null); onLifecycle({ status: 0 }); }}>
                Wake now
              </MenuItem>
            ) : null}
            {SNOOZE_PRESETS.map((p) => (
              <MenuItem
                key={p.hours}
                onClick={() => {
                  setOpen(null);
                  onLifecycle({
                    status: 3,
                    snoozed_until: new Date(
                      Date.now() + p.hours * 3600_000,
                    ).toISOString(),
                  });
                }}
              >
                {p.label}
              </MenuItem>
            ))}
          </Dropdown>
        ) : null}
      </div>

      {/* assign */}
      {members.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === "assign" ? null : "assign")}
            className={`rounded-md border p-1.5 ${
              conv.assignee_id
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-surface text-secondary hover:text-app"
            }`}
            aria-label="Assign"
            title={conv.assignee_name ? `Assigned to ${conv.assignee_name}` : "Assign"}
          >
            <MiniIcon name="users" size={15} />
          </button>
          {open === "assign" ? (
            <Dropdown onClose={() => setOpen(null)}>
              <MenuItem
                active={!conv.assignee_id}
                onClick={() => { setOpen(null); onLifecycle({ assignee_id: null }); }}
              >
                Unassigned
              </MenuItem>
              <div className="max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <MenuItem
                    key={m.id}
                    active={conv.assignee_id === m.id}
                    onClick={() => { setOpen(null); onLifecycle({ assignee_id: m.id }); }}
                  >
                    {m.name}
                  </MenuItem>
                ))}
              </div>
            </Dropdown>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Dropdown({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-app bg-app-elevated p-1 text-xs shadow-lg">
        {children}
      </div>
    </>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 font-mono text-[0.5rem] uppercase tracking-[0.16em] text-faint">
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left capitalize hover:bg-surface ${
        active ? "text-tool-accent" : "text-app"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <MiniIcon name="check" size={12} /> : null}
    </button>
  );
}

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

function ConvEmpty({ compact, view }: { compact: boolean; view: FilterView }) {
  const msg =
    view === "open_mine"
      ? "Nothing open and assigned to you. Switch to All to see everything."
      : view === "unassigned"
        ? "No unassigned conversations — every thread has an owner."
        : view === "resolved"
          ? "No resolved conversations yet."
          : view === "pending"
            ? "Nothing pending."
            : "Inbound messages appear here. Message a contact from any tool to start a thread.";
  return (
    <div className="p-4">
      <div
        className="rounded-xl border border-dashed border-app bg-app-elevated p-4 text-center"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          whatsapp.inbox
        </div>
        <h4 className="mt-2 text-sm font-semibold text-app">No conversations</h4>
        <p className="mt-1 text-xs text-secondary">{msg}</p>
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
      <video src={src} controls className="mb-1 max-h-72 max-w-full rounded-md" />
    );
  }
  if (kind === "audio") {
    return <audio src={src} controls className="mb-1 w-56 max-w-full" />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download
      className="mb-1 flex items-center gap-2 rounded-md border border-app/60 px-2 py-1.5 text-xs hover:bg-surface"
    >
      <MiniIcon name="file" size={16} />
      <span className="min-w-0 flex-1 truncate">{msg.media_mime ?? "document"}</span>
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
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

function applyMyReaction(
  reactions: WaReaction[] | null,
  emoji: string,
): WaReaction[] {
  const existing = Array.isArray(reactions) ? reactions : [];
  const without = existing.filter((r) => !r.fromMe);
  return emoji ? [...without, { emoji, fromMe: true, actor: "self" }] : without;
}

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

function mergeConversations(
  prev: WaConversation[],
  incoming: WaConversation[],
): WaConversation[] {
  const seen = new Set(incoming.map((c) => c.id));
  const tail = prev.filter((c) => !seen.has(c.id));
  return [...incoming, ...tail];
}

function mergeMessages(
  older: WaThreadMessage[],
  current: WaThreadMessage[],
): WaThreadMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const head = older.filter((m) => !seen.has(m.id));
  return [...head, ...current];
}
