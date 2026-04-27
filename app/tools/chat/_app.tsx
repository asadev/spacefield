"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Chat — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Real-time messaging scoped to the active workspace.
     Left:  channel list (general pinned, alphabetical otherwise, unread dot)
     Main:  scrollable message list + composer with file attachments and
            @-mentions
   Files attached to a message reuse the same Files Manager storage layer
   (R2 + workspace_files + per-workspace storage cap), so Chat attachments
   count against the same workspace quota as Documents/Sheets/Files.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { NativeAppProps } from "../_data/tools-list";
import { useChatRealtime, type ChatMessageRowRaw } from "../_components/useChatRealtime";

const ACTIVE_WS_KEY = "workspaces:active:v1";

interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  created_by: string | null;
  created_at: string;
}

interface Attachment {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
}

interface Message {
  id: string;
  channel_id: string;
  workspace_id: string;
  user_id: string;
  body: string;
  attachments: Attachment[];
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface Member {
  user_id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface PendingAttachment {
  localId: string;
  name: string;
  size_bytes: number;
  content_type: string;
  fileId?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
}

function readActiveWorkspace(): { id: string | null; name: string } {
  if (typeof window === "undefined") return { id: null, name: "Workspace" };
  try {
    const id = window.localStorage.getItem(ACTIVE_WS_KEY) || null;
    let name = "Workspace";
    const raw = window.localStorage.getItem("workspaces:list:v1");
    if (raw && id) {
      const list = JSON.parse(raw) as Array<{ id: string; name: string }>;
      const m = list.find((w) => w.id === id);
      if (m) name = m.name;
    }
    return { id, name };
  } catch {
    return { id: null, name: "Workspace" };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function initialsFor(member: Member | null, fallback: string): string {
  const src = member?.full_name || member?.username || fallback;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isImage(ct: string | null): boolean {
  return Boolean(ct && ct.startsWith("image/"));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("read failed"));
        return;
      }
      const idx = r.indexOf(",");
      resolve(idx === -1 ? r : r.slice(idx + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// Sort: #general first, then alphabetical.
function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => {
    if (a.kind === "general" && b.kind !== "general") return -1;
    if (b.kind === "general" && a.kind !== "general") return 1;
    if (a.name === "general" && b.name !== "general") return -1;
    if (b.name === "general" && a.name !== "general") return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function ChatApp({ width }: NativeAppProps) {
  const supabase = useMemo(() => getSupabase(), []);
  const initial = useMemo(() => readActiveWorkspace(), []);
  const [activeId] = useState<string | null>(initial.id);
  const [activeName] = useState<string>(initial.name);

  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user ? { id: data.user.id, email: data.user.email ?? null } : null);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const [role, setRole] = useState<"owner" | "admin" | "member" | null>(null);
  useEffect(() => {
    if (!activeId || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("workspace_role_of", {
        ws_id: activeId,
      });
      if (cancelled) return;
      const r = typeof data === "string" ? data : null;
      if (r === "owner" || r === "admin" || r === "member") setRole(r);
      else setRole(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, activeId, user]);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const memberMap = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [composer, setComposer] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load channels.
  const refreshChannels = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(
        `/api/chat/channels/list?workspace_id=${encodeURIComponent(activeId)}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as { channels: Channel[] };
      const sorted = sortChannels(json.channels ?? []);
      setChannels(sorted);
      setActiveChannelId((curr) => {
        if (curr && sorted.some((c) => c.id === curr)) return curr;
        return sorted[0]?.id ?? null;
      });
    } catch {
      /* swallow */
    }
  }, [activeId]);

  useEffect(() => {
    if (!authChecked || !user || !activeId) return;
    void refreshChannels();
  }, [authChecked, user, activeId, refreshChannels]);

  // Load members.
  useEffect(() => {
    if (!authChecked || !user || !activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/members?workspace_id=${encodeURIComponent(activeId)}`
        );
        if (!res.ok) return;
        const json = (await res.json()) as { members: Member[] };
        if (cancelled) return;
        setMembers(json.members ?? []);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, user, activeId]);

  // Load unread counts.
  const refreshUnread = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(
        `/api/chat/unread?workspace_id=${encodeURIComponent(activeId)}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        counts: Record<string, number>;
        total: number;
      };
      setUnreadCounts(json.counts ?? {});
    } catch {
      /* swallow */
    }
  }, [activeId]);
  useEffect(() => {
    void refreshUnread();
    const id = window.setInterval(() => {
      void refreshUnread();
    }, 30000);
    return () => window.clearInterval(id);
  }, [refreshUnread]);

  // Load messages for active channel.
  useEffect(() => {
    if (!activeChannelId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/messages/list?channel_id=${encodeURIComponent(activeChannelId)}`
        );
        if (!res.ok) {
          setLoadingMessages(false);
          return;
        }
        const json = (await res.json()) as { messages: Message[] };
        if (cancelled) return;
        const list = (json.messages ?? []).slice().reverse();
        setMessages(list);
        setLoadingMessages(false);
        // Scroll to bottom on first load.
        requestAnimationFrame(() => {
          const el = messageListRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } catch {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChannelId]);

  // Mark active channel read on open / focus.
  const markRead = useCallback(async () => {
    if (!activeChannelId) return;
    try {
      await fetch("/api/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: activeChannelId }),
      });
      setUnreadCounts((m) => {
        if (!m[activeChannelId]) return m;
        const next = { ...m };
        next[activeChannelId] = 0;
        return next;
      });
      window.dispatchEvent(new CustomEvent("spacefield:chat-read"));
    } catch {
      /* swallow */
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return;
    void markRead();
  }, [activeChannelId, markRead]);

  useEffect(() => {
    const onFocus = () => {
      void markRead();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [markRead]);

  // Realtime subscription for the active channel.
  // Attachments are not present on the Realtime payload (we'd need to
  // fetch them) — for v1 we re-fetch the single message after insert
  // when it has attachments, which is rare on the hot path.
  const upsertMessageFromRaw = useCallback(
    async (raw: ChatMessageRowRaw) => {
      if (raw.deleted_at) {
        setMessages((curr) => curr.filter((m) => m.id !== raw.id));
        return;
      }
      let attachments: Attachment[] = [];
      const ids: string[] = Array.isArray(raw.attachments)
        ? (raw.attachments as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : [];
      if (ids.length > 0) {
        const { data: files } = await supabase
          .from("workspace_files")
          .select("id, name, size_bytes, content_type")
          .in("id", ids);
        attachments = (files ?? []).map((f) => ({
          id: f.id as string,
          name: f.name as string,
          size_bytes: Number(f.size_bytes ?? 0),
          content_type: (f.content_type as string | null) ?? null,
        }));
      }
      const next: Message = {
        id: raw.id,
        channel_id: raw.channel_id,
        workspace_id: raw.workspace_id,
        user_id: raw.user_id,
        body: raw.body,
        attachments,
        reply_to: raw.reply_to,
        edited_at: raw.edited_at,
        deleted_at: raw.deleted_at,
        created_at: raw.created_at,
      };
      setMessages((curr) => {
        const idx = curr.findIndex((m) => m.id === next.id);
        if (idx === -1) return [...curr, next];
        const copy = curr.slice();
        copy[idx] = { ...copy[idx], ...next, attachments };
        return copy;
      });
    },
    [supabase]
  );

  useChatRealtime(activeChannelId, {
    onInsert: (row) => {
      void upsertMessageFromRaw(row).then(() => {
        // Auto-scroll to bottom if user is near the bottom; mark read.
        const el = messageListRef.current;
        if (el) {
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distance < 100) {
            requestAnimationFrame(() => {
              el.scrollTop = el.scrollHeight;
            });
          }
        }
        if (document.visibilityState === "visible") {
          void markRead();
        } else if (user && row.user_id !== user.id) {
          // Bump unread badge for this channel until user opens.
          setUnreadCounts((m) => ({
            ...m,
            [row.channel_id]: (m[row.channel_id] ?? 0) + 1,
          }));
        }
      });
    },
    onUpdate: (row) => {
      void upsertMessageFromRaw(row);
    },
    onDelete: (oldRow) => {
      const id = oldRow.id;
      if (typeof id === "string") {
        setMessages((curr) => curr.filter((m) => m.id !== id));
      }
    },
  });

  // Upload a file via /api/files/save-content (same path Documents/Sheets use).
  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      if (!activeId) throw new Error("no workspace");
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/files/save-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeId,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: base64,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body?.error ?? `upload failed (${res.status})`);
      }
      const json = (await res.json()) as { file: { id: string } };
      return json.file.id;
    },
    [activeId]
  );

  const startUploads = useCallback(
    (files: File[]) => {
      if (!activeId || files.length === 0) return;
      const queued: PendingAttachment[] = files.map((f) => ({
        localId: uid(),
        name: f.name,
        size_bytes: f.size,
        content_type: f.type || "application/octet-stream",
        status: "uploading",
      }));
      setPendingAttachments((curr) => [...curr, ...queued]);
      queued.forEach((q, i) => {
        const file = files[i];
        void (async () => {
          try {
            const id = await uploadFile(file);
            setPendingAttachments((curr) =>
              curr.map((p) =>
                p.localId === q.localId
                  ? { ...p, fileId: id, status: "ready" }
                  : p
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "upload failed";
            setPendingAttachments((curr) =>
              curr.map((p) =>
                p.localId === q.localId
                  ? { ...p, status: "error", error: msg }
                  : p
              )
            );
          }
        })();
      });
    },
    [activeId, uploadFile]
  );

  const onPickFiles = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;
      const arr: File[] = [];
      for (let i = 0; i < list.length; i++) arr.push(list[i]);
      startUploads(arr);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [startUploads]
  );

  const onDropFiles = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const list = e.dataTransfer?.files;
      if (!list || list.length === 0) return;
      const arr: File[] = [];
      for (let i = 0; i < list.length; i++) arr.push(list[i]);
      startUploads(arr);
    },
    [startUploads]
  );

  const removePending = useCallback((localId: string) => {
    setPendingAttachments((curr) => curr.filter((p) => p.localId !== localId));
  }, []);

  // Send message.
  const sendMessage = useCallback(async () => {
    if (!activeChannelId) return;
    const trimmed = composer.trim();
    const ready = pendingAttachments.filter((p) => p.status === "ready" && p.fileId);
    if (trimmed.length === 0 && ready.length === 0) return;
    if (pendingAttachments.some((p) => p.status === "uploading")) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/chat/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: activeChannelId,
          body: trimmed,
          attachment_ids: ready.map((p) => p.fileId).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMsg(body?.error ?? `send failed (${res.status})`);
        return;
      }
      // Realtime INSERT will append the message; no optimistic insert needed.
      setComposer("");
      setPendingAttachments([]);
      requestAnimationFrame(() => {
        const el = messageListRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "send failed");
    } finally {
      setSending(false);
    }
  }, [activeChannelId, composer, pendingAttachments]);

  const onComposerKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  // @-mention dropdown logic.
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionAnchor, setMentionAnchor] = useState<number>(0);
  const onComposerChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setComposer(v);
      // Detect "@..." at the cursor.
      const ta = e.target;
      const caret = ta.selectionStart ?? v.length;
      const before = v.slice(0, caret);
      const m = /(^|\s)@([a-zA-Z0-9_-]*)$/.exec(before);
      if (m) {
        setMentionOpen(true);
        setMentionQuery(m[2] ?? "");
        setMentionAnchor(caret - (m[2]?.length ?? 0) - 1);
      } else {
        setMentionOpen(false);
        setMentionQuery("");
      }
    },
    []
  );

  const filteredMentions = useMemo(() => {
    if (!mentionOpen) return [] as Member[];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => {
        if (user && m.user_id === user.id) return false;
        if (!q) return true;
        return (
          (m.username ?? "").toLowerCase().includes(q) ||
          (m.full_name ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [mentionOpen, mentionQuery, members, user]);

  const insertMention = useCallback(
    (m: Member) => {
      const handle = m.username || (m.full_name ?? "user").replace(/\s+/g, "");
      setComposer((prev) => {
        const start = mentionAnchor;
        const ta = composerRef.current;
        const caret = ta?.selectionStart ?? prev.length;
        const before = prev.slice(0, start);
        const after = prev.slice(caret);
        const next = `${before}@${handle} ${after}`;
        // Restore caret after insertion on next tick.
        requestAnimationFrame(() => {
          if (ta) {
            const pos = before.length + handle.length + 2;
            ta.focus();
            ta.setSelectionRange(pos, pos);
          }
        });
        return next;
      });
      setMentionOpen(false);
      setMentionQuery("");
    },
    [mentionAnchor]
  );

  // Channel create.
  const submitNewChannel = useCallback(async () => {
    if (!activeId) return;
    const clean = newChannelName.trim().toLowerCase();
    if (!clean) return;
    setCreatingChannel(true);
    setChannelError(null);
    try {
      const res = await fetch("/api/chat/channels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: activeId, name: clean }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setChannelError(body?.error ?? `failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { channel: Channel };
      setChannels((curr) => sortChannels([...curr, json.channel]));
      setActiveChannelId(json.channel.id);
      setNewChannelName("");
      setShowNewChannelModal(false);
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "failed");
    } finally {
      setCreatingChannel(false);
    }
  }, [activeId, newChannelName]);

  // Edit / delete handlers.
  const startEdit = useCallback((m: Message) => {
    setEditingId(m.id);
    setEditingDraft(m.body);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId) return;
    const body = editingDraft.trim();
    if (!body) return;
    try {
      const res = await fetch("/api/chat/messages/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, body }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { message: ChatMessageRowRaw };
      void upsertMessageFromRaw(json.message);
      setEditingId(null);
      setEditingDraft("");
    } catch {
      /* swallow */
    }
  }, [editingId, editingDraft, upsertMessageFromRaw]);

  const deleteMessage = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `/api/chat/messages/delete?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) return;
      setMessages((curr) => curr.filter((m) => m.id !== id));
    } catch {
      /* swallow */
    }
  }, []);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  );

  const isAdmin = role === "owner" || role === "admin";
  const sidebarHidden = width < 540;

  // Auth gating render.
  if (authChecked && !user) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app text-secondary text-sm">
        Sign in to chat with your workspace.
      </div>
    );
  }
  if (!activeId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app text-secondary text-sm">
        Select a workspace to start chatting.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-app text-app">
      {/* Sidebar */}
      {!sidebarHidden && (
        <aside
          className="flex shrink-0 flex-col border-r border-app bg-app-elevated"
          style={{ width: 240 }}
        >
          <div className="flex items-center justify-between border-b border-app px-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-xs uppercase tracking-wider text-faint">
                Workspace
              </div>
              <div className="truncate text-sm font-medium text-app">
                {activeName}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <div className="text-xs uppercase tracking-wider text-faint">
              Channels
            </div>
            {isAdmin && (
              <button
                type="button"
                aria-label="New channel"
                onClick={() => setShowNewChannelModal(true)}
                className="grid h-5 w-5 place-items-center rounded text-secondary hover:bg-surface hover:text-app"
              >
                <span className="text-base leading-none">+</span>
              </button>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-1">
            {channels.map((c) => {
              const unread = unreadCounts[c.id] ?? 0;
              const isActive = c.id === activeChannelId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveChannelId(c.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                    isActive
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:bg-surface hover:text-app"
                  }`}
                >
                  <span className="text-faint">#</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  {unread > 0 && !isActive && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-tool-accent px-1 text-[10px] font-medium text-app-elevated">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
            {channels.length === 0 && (
              <div className="px-2 py-2 text-xs text-faint">No channels</div>
            )}
          </nav>
        </aside>
      )}

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-app">
              {activeChannel ? `# ${activeChannel.name}` : "Chat"}
            </div>
            <div className="truncate text-xs text-faint">
              {members.length} member{members.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messageListRef}
          className="flex-1 overflow-y-auto"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFiles}
        >
          {loadingMessages && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-faint">
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="text-base text-app">
                {activeChannel
                  ? `Start the conversation in #${activeChannel.name}`
                  : "Pick a channel"}
              </div>
              <div className="text-xs text-faint">
                Messages and files stay inside this workspace.
              </div>
            </div>
          ) : (
            <ul className="flex flex-col py-2">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const stack =
                  prev &&
                  prev.user_id === m.user_id &&
                  new Date(m.created_at).getTime() -
                    new Date(prev.created_at).getTime() <
                    5 * 60 * 1000;
                const member = memberMap.get(m.user_id) ?? null;
                const ownMessage = user?.id === m.user_id;
                const editing = editingId === m.id;
                return (
                  <li
                    key={m.id}
                    className={`group flex gap-3 px-4 ${
                      stack ? "py-0.5" : "pt-3 pb-0.5"
                    } hover:bg-surface/50`}
                  >
                    <div className="w-8 shrink-0">
                      {!stack ? (
                        member?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={member.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-tool-accent-soft text-xs font-medium text-tool-accent">
                            {initialsFor(
                              member,
                              ownMessage ? user?.email ?? "Me" : "User"
                            )}
                          </div>
                        )
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 text-[10px] font-mono text-faint pt-1 text-right pr-1">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!stack && (
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`text-sm font-medium ${
                              ownMessage ? "text-tool-accent" : "text-app"
                            }`}
                          >
                            {member?.full_name ||
                              member?.username ||
                              (ownMessage ? "You" : "User")}
                          </span>
                          <span className="font-mono text-[11px] text-faint">
                            {formatRelative(m.created_at)}
                          </span>
                          {m.edited_at && (
                            <span className="text-[11px] text-faint">
                              (edited)
                            </span>
                          )}
                        </div>
                      )}
                      {editing ? (
                        <div className="mt-1 flex flex-col gap-1">
                          <textarea
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className="w-full resize-none rounded-md border border-app bg-app-elevated p-2 text-sm text-app outline-none focus:border-tool-accent"
                            rows={Math.min(6, Math.max(2, editingDraft.split("\n").length))}
                          />
                          <div className="flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={submitEdit}
                              className="rounded-md bg-tool-accent px-2 py-1 text-app-elevated"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditingDraft("");
                              }}
                              className="rounded-md border border-app px-2 py-1 text-secondary"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words text-sm text-app">
                          {m.body}
                        </div>
                      )}
                      {m.attachments.length > 0 && !editing && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {m.attachments.map((a) => (
                            <AttachmentChip key={a.id} attachment={a} />
                          ))}
                        </div>
                      )}
                    </div>
                    {!editing && ownMessage && (
                      <div className="opacity-0 group-hover:opacity-100 flex shrink-0 gap-1 self-start pt-1 text-xs text-faint">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          className="rounded px-1 hover:text-app"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessage(m.id)}
                          className="rounded px-1 hover:text-app"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Composer */}
        <div className="relative border-t border-app bg-app-elevated p-3">
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingAttachments.map((p) => (
                <div
                  key={p.localId}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                    p.status === "error"
                      ? "border-red-400/40 bg-red-500/10 text-red-400"
                      : "border-app bg-surface text-secondary"
                  }`}
                >
                  <span className="truncate max-w-[180px]">{p.name}</span>
                  <span className="font-mono text-[10px] text-faint">
                    {p.status === "uploading"
                      ? "uploading…"
                      : p.status === "ready"
                      ? formatBytes(p.size_bytes)
                      : p.error ?? "error"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePending(p.localId)}
                    className="text-faint hover:text-app"
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {errorMsg && (
            <div className="mb-2 text-xs text-red-400">{errorMsg}</div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface hover:text-app"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.5l-8.5 8.5a5 5 0 11-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 11-3-3l8-8" />
              </svg>
            </button>
            <textarea
              ref={composerRef}
              value={composer}
              onChange={onComposerChange}
              onKeyDown={onComposerKey}
              placeholder={
                activeChannel
                  ? `Message #${activeChannel.name}`
                  : "Pick a channel"
              }
              rows={1}
              className="max-h-40 min-h-[36px] flex-1 resize-none rounded-md border border-app bg-app px-3 py-2 text-sm text-app outline-none placeholder:text-faint focus:border-tool-accent"
              style={{ height: "auto" }}
              onInput={(e) => {
                const ta = e.currentTarget;
                ta.style.height = "auto";
                ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
              }}
              disabled={!activeChannelId || sending}
            />
            <button
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={
                !activeChannelId ||
                sending ||
                pendingAttachments.some((p) => p.status === "uploading") ||
                (composer.trim().length === 0 &&
                  pendingAttachments.filter((p) => p.status === "ready").length === 0)
              }
              className="h-8 shrink-0 rounded-md bg-tool-accent px-3 text-xs font-medium text-app-elevated disabled:opacity-40"
            >
              Send
            </button>
          </div>
          <div className="mt-1 text-[10px] text-faint">
            Press Cmd+Enter to send
          </div>

          {/* @-mention dropdown */}
          {mentionOpen && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-12 mb-1 w-64 overflow-hidden rounded-md border border-app bg-app-elevated shadow-lg">
              {filteredMentions.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(m);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-app hover:bg-surface"
                >
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatar_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-tool-accent-soft text-[10px] text-tool-accent">
                      {initialsFor(m, "U")}
                    </div>
                  )}
                  <span className="flex-1 truncate">
                    {m.full_name || m.username || "User"}
                  </span>
                  {m.username && (
                    <span className="font-mono text-[10px] text-faint">
                      @{m.username}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* New channel modal */}
      {showNewChannelModal && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-app bg-app-elevated p-4 shadow-xl">
            <div className="text-sm font-medium text-app">New channel</div>
            <div className="mt-1 text-xs text-faint">
              Lowercase letters, digits, and dashes.
            </div>
            <input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="random"
              className="mt-3 w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app outline-none focus:border-tool-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitNewChannel();
                if (e.key === "Escape") setShowNewChannelModal(false);
              }}
            />
            {channelError && (
              <div className="mt-2 text-xs text-red-400">{channelError}</div>
            )}
            <div className="mt-3 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowNewChannelModal(false);
                  setNewChannelName("");
                  setChannelError(null);
                }}
                className="rounded-md border border-app px-3 py-1.5 text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingChannel || !newChannelName.trim()}
                onClick={() => {
                  void submitNewChannel();
                }}
                className="rounded-md bg-tool-accent px-3 py-1.5 font-medium text-app-elevated disabled:opacity-40"
              >
                {creatingChannel ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImg = isImage(attachment.content_type);
  useEffect(() => {
    let cancelled = false;
    if (!isImg) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/files/download?id=${encodeURIComponent(attachment.id)}&inline=1`
        );
        if (!res.ok) return;
        const json = (await res.json()) as { url: string };
        if (!cancelled) setUrl(json.url);
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.id, isImg]);

  const onOpen = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/files/download?id=${encodeURIComponent(attachment.id)}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as { url: string };
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      /* swallow */
    }
  }, [attachment.id]);

  if (isImg && url) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block overflow-hidden rounded-md border border-app bg-surface"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.name}
          className="block max-h-48 max-w-xs object-cover"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5 text-left text-xs text-secondary hover:text-app"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate max-w-[180px] text-app">{attachment.name}</span>
      <span className="font-mono text-[10px] text-faint">
        {formatBytes(attachment.size_bytes)}
      </span>
    </button>
  );
}
