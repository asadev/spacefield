"use client";

/* components/AIStreamView.tsx — generic streaming chat surface.
 *
 * Drop this into any client component that wants the standard
 * Spacefield "ask AI" experience:
 *
 *   <AIStreamView
 *     endpoint="/api/chat/stream"
 *     extraBody={{ context_ref: "task:abc123" }}
 *     placeholder="Ask about this task..."
 *   />
 *
 * What it gives you:
 *  - One input box.
 *  - Streaming markdown-ish output area (we render plain text — the
 *    runtime is configured to emit plain text for in-app chat).
 *  - Stop-generation button while a stream is in flight.
 *  - Status/error states.
 *  - Submit on Enter, Shift+Enter for newline.
 *
 * The component is intentionally dumb — it doesn't know about context
 * loading or entity refs. Callers pass an opaque `extraBody` object
 * that's merged into the POST body alongside `message`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import StopGenerationButton from "@/components/StopGenerationButton";
import { useAIStream } from "@/lib/ai-stream/client";

export interface AIStreamViewProps {
  /** SSE endpoint that accepts `{ message, ...extraBody }`. */
  endpoint: string;
  /** Extra JSON fields to merge into the POST body alongside `message`. */
  extraBody?: Record<string, unknown>;
  /** Placeholder for the input box. */
  placeholder?: string;
  /** Optional initial user message — auto-submitted on mount. Useful for
   *  the per-record chat where the URL already implies "tell me about
   *  this task". */
  initialMessage?: string;
  /** Title shown above the conversation. */
  title?: string;
  /** Subtitle / context hint shown beneath the title. */
  subtitle?: string;
  /** Bottom-anchored input — set false for embeddable layouts. */
  stickyInput?: boolean;
  /** Force compact styling (no large empty-state). */
  compact?: boolean;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  /** Live-updating for the active assistant turn; final for older ones. */
  text: string;
  /** Set on the in-flight assistant turn so the StopGenerationButton can
   *  be positioned alongside it. */
  streaming?: boolean;
  /** When the user aborted this turn before it finished, mark it so the
   *  UI can show a "stopped" hint. */
  aborted?: boolean;
  /** Surfaces server-side errors inline. */
  error?: string;
}

export default function AIStreamView({
  endpoint,
  extraBody,
  placeholder = "Ask anything...",
  initialMessage,
  title,
  subtitle,
  stickyInput = true,
  compact = false,
}: AIStreamViewProps) {
  const { state, start, stop, isStreaming } = useAIStream();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Track the id of the assistant turn currently being filled so we can
  // mirror `state.text` into it without losing prior turns.
  const activeAssistantIdRef = useRef<string | null>(null);
  // Guard re-submitting `initialMessage` if the parent re-renders.
  const didAutoSubmitRef = useRef(false);

  // Append the user message + a placeholder assistant turn, then kick
  // off the stream. The placeholder is filled in by the effect below.
  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asstId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      activeAssistantIdRef.current = asstId;
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", text: trimmed },
        { id: asstId, role: "assistant", text: "", streaming: true },
      ]);
      setInput("");
      void start(endpoint, { message: trimmed, ...(extraBody ?? {}) });
    },
    [endpoint, extraBody, isStreaming, start]
  );

  // Mirror `state.text` into the current assistant turn while streaming.
  useEffect(() => {
    const id = activeAssistantIdRef.current;
    if (!id) return;
    setTurns((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              text: state.text,
              streaming: state.status === "streaming",
              aborted: state.status === "aborted" ? true : t.aborted,
              error:
                state.status === "error"
                  ? state.error ?? "stream_error"
                  : t.error,
            }
          : t
      )
    );
    if (state.status !== "streaming") {
      activeAssistantIdRef.current = null;
    }
  }, [state.text, state.status, state.error]);

  // Auto-scroll to the bottom whenever a stream is producing output.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, state.status]);

  // Auto-submit `initialMessage` exactly once.
  useEffect(() => {
    if (didAutoSubmitRef.current) return;
    if (!initialMessage || !initialMessage.trim()) return;
    didAutoSubmitRef.current = true;
    submit(initialMessage);
  }, [initialMessage, submit]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const isEmpty = turns.length === 0;

  return (
    <div className="flex h-full flex-col bg-app text-app">
      {(title || subtitle) && (
        <header className="border-b border-app px-4 py-3">
          {title && <h1 className="text-sm font-semibold">{title}</h1>}
          {subtitle && (
            <p className="mt-0.5 text-xs text-secondary">{subtitle}</p>
          )}
        </header>
      )}

      <div
        ref={scrollerRef}
        className={
          "flex-1 overflow-y-auto px-4 " +
          (compact ? "py-3 space-y-3" : "py-6 space-y-4")
        }
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        {isEmpty && !compact && (
          <div className="mx-auto mt-12 max-w-md text-center">
            <p className="text-sm text-secondary">
              {placeholder}
            </p>
          </div>
        )}
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} />
        ))}
        {state.status === "streaming" && (
          <div className="pt-1">
            <StopGenerationButton onStop={stop} visible={isStreaming} />
          </div>
        )}
      </div>

      <form
        className={
          (stickyInput ? "sticky bottom-0 " : "") +
          "border-t border-app bg-app px-4 py-3"
        }
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-secondary focus:border-tool-accent focus:outline-none"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm font-medium text-app transition-colors hover:border-tool-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-tool-accent/10 px-3 py-2 text-sm text-app">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-app-elevated px-3 py-2 text-sm text-app">
          {turn.text || (turn.streaming ? "..." : "")}
        </div>
        {turn.aborted && (
          <p className="px-1 text-[11px] text-secondary">Stopped.</p>
        )}
        {turn.error && (
          <p className="px-1 text-[11px] text-red-500">{turn.error}</p>
        )}
      </div>
    </div>
  );
}
