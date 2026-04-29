"use client";

/* AgentChat — the in-app chat panel for the Spacefield Assistant.
 *
 * Floats above the desktop, anchored bottom-left. Drag the header to
 * reposition; resize from the bottom-right corner. History persists
 * per-workspace in localStorage (capped at 50 messages). Sends through
 * /api/agent/dispatch with an optional scope.
 *
 * Liquid Glass styling matches the Launchpad — bg-app-elevated/70 +
 * backdrop-blur-2xl + a subtle specular highlight on the header.
 *
 * Slash commands (handled locally without a model call):
 *   /clear     wipe local history
 *   /balance   read the credit balance from /api/agent/balance
 *   /help      list capabilities
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { DispatchScope } from "@/lib/agent/runtime/types";

export type AgentChatScope = NonNullable<DispatchScope> | null;

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ts: number;
  pendingApproval?: {
    skillId: string;
    toolName: string;
    summary: string;
  } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  scope?: AgentChatScope;
  /** Optional bot name override (Settings persona); falls back to "Assistant". */
  botName?: string;
  /** Initial position from the launcher. */
  initialPosition?: { x: number; y: number };
}

const HISTORY_CAP = 50;
const PANEL_W = 380;
const PANEL_H = 560;
const PANEL_MIN_W = 320;
const PANEL_MIN_H = 360;

function uid(): string {
  // crypto.randomUUID is available in modern browsers and Node 18+.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function historyKey(workspaceId: string, scope: AgentChatScope): string {
  return `ws:${workspaceId}:agent-chat-history-v1${scope ? `:${scope}` : ""}`;
}

interface BalanceBody {
  quick: { used: number; cap: number };
  deep: { used: number; cap: number };
  tier: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const SCOPE_LABEL: Record<NonNullable<AgentChatScope>, string> = {
  crm: "CRM",
  files: "Files",
  boards: "Boards",
};

export default function AgentChat({
  open,
  onClose,
  workspaceId,
  scope = null,
  botName = "Assistant",
  initialPosition,
}: Props) {
  const storageKey = useMemo(
    () => historyKey(workspaceId, scope),
    [workspaceId, scope]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: initialPosition?.x ?? 24,
    y: initialPosition?.y ?? 24,
  }));
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: PANEL_W,
    h: PANEL_H,
  });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Hydrate history.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-HISTORY_CAP));
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const trimmed = messages.slice(-HISTORY_CAP);
      localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // quota or parse error — silently drop persistence
    }
  }, [messages, storageKey]);

  // Auto-scroll to the bottom on new messages.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const append = useCallback((m: Omit<ChatMessage, "id" | "ts">) => {
    setMessages((prev) =>
      [
        ...prev,
        { id: uid(), ts: Date.now(), ...m },
      ].slice(-HISTORY_CAP)
    );
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const sendBalance = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agent/balance?workspace_id=${encodeURIComponent(workspaceId)}`
      );
      const body = (await res.json()) as BalanceBody;
      append({
        role: "assistant",
        text: `Tier: ${body.tier}\nQuick: ${fmt(body.quick.used)} / ${fmt(body.quick.cap)} tokens\nDeep: ${fmt(body.deep.used)} / ${fmt(body.deep.cap)} tokens`,
      });
    } catch {
      append({
        role: "assistant",
        text: "Couldn't read your balance. Try Settings → AI.",
      });
    }
  }, [workspaceId, append]);

  const sendHelp = useCallback(() => {
    const lines: string[] = [];
    if (scope) {
      lines.push(
        `Scoped to ${SCOPE_LABEL[scope]}. I can answer questions and run tools inside this app.`
      );
    } else {
      lines.push(
        "I can run things across CRM, files, boards, and workspace settings."
      );
    }
    lines.push("");
    lines.push("Try:");
    lines.push("- show my pipeline");
    lines.push("- create a deal called Acme Q4 for $25k");
    lines.push("- find the Q4 contract file");
    lines.push("- list my workspace members");
    lines.push("");
    lines.push("Slash commands: /balance, /clear, /help");
    append({ role: "assistant", text: lines.join("\n") });
  }, [append, scope]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setDraft("");

      // Slash commands handled locally.
      if (trimmed === "/clear") {
        clearHistory();
        return;
      }
      if (trimmed === "/help") {
        append({ role: "user", text: trimmed });
        sendHelp();
        return;
      }
      if (trimmed === "/balance") {
        append({ role: "user", text: trimmed });
        await sendBalance();
        return;
      }

      append({ role: "user", text: trimmed });
      setBusy(true);
      try {
        const res = await fetch("/api/agent/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            message: trimmed,
            scope: scope ?? null,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          append({
            role: "assistant",
            text:
              err.message ?? err.error ?? `Sorry — request failed (${res.status}).`,
          });
        } else {
          const body = (await res.json()) as {
            reply: string;
            requires_approval: {
              skillId: string;
              toolName: string;
              summary: string;
            } | null;
          };
          append({
            role: "assistant",
            text: body.reply,
            pendingApproval: body.requires_approval ?? null,
          });
        }
      } catch (e) {
        append({
          role: "assistant",
          text: `Network error: ${(e as Error).message}`,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, append, clearHistory, sendBalance, sendHelp, workspaceId, scope]
  );

  // Drag-to-move on the header. We track the pointer relative to the
  // panel's anchor (bottom-left = offset from the viewport's bottom-left).
  const dragRef = useRef<{ startX: number; startY: number; basePos: { x: number; y: number } } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target instanceof HTMLElement && e.target.closest("button")) return;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        basePos: { ...pos },
      };
    },
    [pos]
  );

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      // Bottom-left anchor: x increases moving the panel right, y
      // increases moving it up.
      const nextX = Math.max(8, dragRef.current.basePos.x + dx);
      const nextY = Math.max(8, dragRef.current.basePos.y - dy);
      setPos({ x: nextX, y: nextY });
    },
    []
  );

  const onHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
    },
    []
  );

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    baseW: number;
    baseH: number;
  } | null>(null);
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseW: size.w,
        baseH: size.h,
      };
    },
    [size]
  );
  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeRef.current) return;
      const dw = e.clientX - resizeRef.current.startX;
      const dh = resizeRef.current.startY - e.clientY;
      setSize({
        w: Math.max(PANEL_MIN_W, resizeRef.current.baseW + dw),
        h: Math.max(PANEL_MIN_H, resizeRef.current.baseH + dh),
      });
    },
    []
  );
  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      resizeRef.current = null;
    },
    []
  );

  if (!open) return null;

  const panelStyle: CSSProperties = {
    left: pos.x,
    bottom: pos.y,
    width: size.w,
    height: size.h,
  };

  const title = scope ? `AI · ${SCOPE_LABEL[scope]}` : `AI · ${botName}`;

  return (
    <div
      role="dialog"
      aria-label="Spacefield Assistant chat"
      className="pointer-events-auto fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-app/60 bg-app-elevated/70 text-app shadow-2xl backdrop-blur-2xl"
      style={panelStyle}
    >
      {/* Specular highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.06) 100%)",
        }}
      />

      {/* Header (drag handle) */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        className="flex shrink-0 cursor-move select-none items-center gap-2 border-b border-app/40 bg-app-elevated/40 px-3 py-2"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-tool-accent-soft text-tool-accent">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.6 5.4L20 9l-4 4 1 6-5-2.7L7 19l1-6-4-4 5.4-1.6L12 2z" />
          </svg>
        </span>
        <div className="flex-1 truncate text-[13px] font-semibold">{title}</div>
        <button
          type="button"
          onClick={clearHistory}
          className="rounded-md px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:bg-surface hover:text-app"
          title="Clear local history"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-surface hover:text-app"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M6.4 4.95L4.95 6.4 10.6 12l-5.65 5.6 1.45 1.45L12 13.4l5.6 5.65 1.45-1.45L13.4 12l5.65-5.6L17.6 4.95 12 10.6 6.4 4.95z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm"
      >
        {messages.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-secondary">
            <div className="text-[0.65rem] uppercase tracking-[0.18em] text-faint">
              {scope ? `${SCOPE_LABEL[scope]} assistant` : "Workspace assistant"}
            </div>
            <p className="max-w-[24ch] text-xs">
              Ask anything about your workspace. Try /help.
            </p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
                  mine
                    ? "bg-tool-accent text-white"
                    : "border border-app/40 bg-app-elevated/80 text-app"
                }`}
                style={{
                  animation: "agent-chat-in 0.18s ease-out",
                }}
              >
                {m.text}
                {m.pendingApproval && (
                  <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[0.62rem] uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
                    Pending: {m.pendingApproval.summary}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-app/40 bg-app-elevated/80 px-3 py-2 text-[13px] text-secondary">
              <span className="inline-flex gap-1">
                <Dot delay={0} />
                <Dot delay={0.15} />
                <Dot delay={0.3} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-app/40 bg-app-elevated/40 p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(draft);
              }
            }}
            rows={1}
            placeholder={
              scope
                ? `Ask the ${SCOPE_LABEL[scope]} assistant…`
                : "Ask the assistant…"
            }
            className="max-h-32 min-h-[36px] flex-1 resize-none rounded-xl border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
          />
          <button
            type="button"
            onClick={() => void handleSend(draft)}
            disabled={!draft.trim() || busy}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-tool-accent px-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* Resize handle (bottom-right corner). The panel grows up + right. */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        aria-label="Resize"
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%)",
        }}
      />

      <style jsx global>{`
        @keyframes agent-chat-in {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes agent-chat-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-secondary"
      style={{
        animation: "agent-chat-bounce 1.1s infinite ease-in-out",
        animationDelay: `${delay}s`,
      }}
    />
  );
}
