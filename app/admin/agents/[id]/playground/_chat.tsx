"use client";

import { useRef, useState } from "react";

/**
 * Client-side chat panel for the agent playground. Holds local message
 * state, POSTs to /api/admin/playground/agent-run, and renders the
 * conversation. Assistant replies stream in as a single block (the API
 * route awaits the full Anthropic response before returning).
 */

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number;
  error?: string;
}

export interface AgentPlaygroundChatProps {
  agentId: string;
  agentName: string;
  greeting: string | null;
  model: string;
}

export default function AgentPlaygroundChat({
  agentId,
  agentName,
  greeting,
  model,
}: AgentPlaygroundChatProps) {
  const initial: ChatMessage[] = greeting
    ? [{ role: "assistant", content: greeting, model }]
    : [];
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const nextHistory: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextHistory);
    setDraft("");
    setBusy(true);
    setGlobalError(null);

    try {
      const res = await fetch("/api/admin/playground/agent-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          message: text,
          history: nextHistory
            .slice(0, -1) // exclude just-pushed user turn (sent as `message`)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data: {
        ok?: boolean;
        reply?: string;
        error?: string;
        model?: string;
        tokens_in?: number;
        tokens_out?: number;
        duration_ms?: number;
      } = await res.json().catch(() => ({}));

      if (data.error === "no_api_key") {
        setGlobalError(
          "ANTHROPIC_API_KEY is not configured on this server. Set it in env vars to use the playground."
        );
        return;
      }
      if (!data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            error: data.error ?? "request failed",
            model: data.model,
            duration_ms: data.duration_ms,
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "",
          model: data.model,
          tokens_in: data.tokens_in,
          tokens_out: data.tokens_out,
          duration_ms: data.duration_ms,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          error: e instanceof Error ? e.message : "network error",
        },
      ]);
    } finally {
      setBusy(false);
      // Refocus input after the round-trip.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function reset() {
    setMessages(greeting ? [{ role: "assistant", content: greeting, model }] : []);
    setGlobalError(null);
  }

  return (
    <section className="rounded-xl border border-app bg-app-elevated">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-app px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-app">Conversation</h2>
          <p className="mt-0.5 text-xs text-muted">
            Calls <code className="font-mono">/api/admin/playground/agent-run</code> with{" "}
            {agentName}&rsquo;s system prompt + model <code className="font-mono">{model}</code>.
            No tools / skills are dispatched — pure model output.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-app bg-app px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent disabled:opacity-50"
          disabled={busy}
        >
          Reset
        </button>
      </header>

      {globalError && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs text-amber-700 dark:text-amber-400">
          {globalError}
        </div>
      )}

      <div className="max-h-[60vh] min-h-[320px] space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-6 text-center text-[11px] text-faint">
            No messages yet. Send something below.
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} m={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-tool-accent" />
            Waiting for response…
          </div>
        )}
      </div>

      <div className="border-t border-app px-5 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="Type a message — Cmd/Ctrl+Enter to send"
            disabled={busy}
            className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-faint">
              {messages.length} turn{messages.length === 1 ? "" : "s"} ·{" "}
              {messages.filter((m) => m.role === "user").length} user
            </span>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%] space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              isUser
                ? "bg-tool-accent-soft text-tool-accent"
                : "bg-app-elevated text-secondary"
            }`}
          >
            {isUser ? "You" : "Assistant"}
          </span>
          {m.model && (
            <code className="font-mono text-[10px] text-faint">{m.model}</code>
          )}
          {typeof m.duration_ms === "number" && (
            <span className="text-[10px] text-faint">
              {(m.duration_ms / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        {m.error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
            error: {m.error}
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              isUser
                ? "bg-tool-accent text-white"
                : "border border-app bg-app text-app"
            }`}
          >
            {m.content || (
              <span className="text-faint italic">(empty response)</span>
            )}
          </div>
        )}
        {(m.tokens_in || m.tokens_out) && (
          <div className="text-[10px] text-faint">
            {m.tokens_in ?? 0} in · {m.tokens_out ?? 0} out
          </div>
        )}
      </div>
    </div>
  );
}
