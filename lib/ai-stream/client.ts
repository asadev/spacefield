"use client";

/* lib/ai-stream/client.ts — `useAIStream` hook for client components.
 *
 * Counterpart to `lib/ai-stream/server.ts`. Posts a JSON body to an SSE
 * endpoint, parses the response stream incrementally, and exposes
 *
 *     const { state, start, stop } = useAIStream();
 *
 * where `state.status` is one of:
 *   - "idle"      — no request yet, or last request fully reset
 *   - "streaming" — fetch in flight, deltas arriving
 *   - "done"      — server emitted `event: done`
 *   - "aborted"   — user clicked the stop button (AbortController.abort)
 *   - "error"     — server emitted `event: error` OR network failure
 *
 * `state.text` accumulates every `event: delta` payload in order.
 *
 * Abort: `stop()` calls `AbortController.abort()`. fetch() rejects with
 * an AbortError which we catch and translate into status=aborted. The
 * server side sees `req.signal` aborted and stops its upstream loop.
 *
 * Why we parse SSE manually rather than using EventSource: EventSource
 * doesn't let us POST, doesn't let us send a JSON body, and doesn't
 * expose AbortController. Hand-rolling on top of fetch + ReadableStream
 * is ~30 lines and gives us all three.
 */

import { useCallback, useRef, useState } from "react";

export type AIStreamStatus = "idle" | "streaming" | "done" | "aborted" | "error";

export interface AIStreamState {
  status: AIStreamStatus;
  /** Concatenation of every `delta` payload received so far. */
  text: string;
  /** Set when the server emitted `event: error` or the network failed. */
  error?: string;
}

export interface UseAIStreamReturn {
  state: AIStreamState;
  /** Start a new streaming request. If a previous one is in flight it
   *  is aborted first; you don't have to call `stop()` yourself. */
  start: (url: string, body: unknown) => Promise<void>;
  /** Abort the in-flight request (no-op if not streaming). */
  stop: () => void;
  /** Reset state back to idle (e.g. when navigating away). */
  reset: () => void;
  /** True iff a request is currently in flight. Convenience getter for
   *  components that want to disable an input. */
  isStreaming: boolean;
}

interface ParsedEvent {
  event: string;
  data: string;
}

/** Pull complete SSE events out of `buffer` and return them. The
 *  remainder (an incomplete event still being assembled) is returned as
 *  the new buffer. */
function drainEvents(buffer: string): { events: ParsedEvent[]; rest: string } {
  // Per the SSE spec, events are separated by a blank line. We accept
  // both `\n\n` (our own server) and `\r\n\r\n` (some intermediaries
  // CRLF-canonicalise the stream).
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  const events: ParsedEvent[] = [];
  for (const block of parts) {
    if (!block) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        // Per SSE: strip one leading space if present, keep the rest.
        const value = line.slice(5);
        dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
      }
      // `id:` and `retry:` are ignored — we don't yet support resumable
      // streams.
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export function useAIStream(): UseAIStreamReturn {
  const [state, setState] = useState<AIStreamState>({
    status: "idle",
    text: "",
  });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle", text: "" });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async (url: string, body: unknown) => {
    // If a request is already in flight, abort it first. This keeps the
    // semantics simple — only one stream per hook instance.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: "streaming", text: "" });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `stream_failed_${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = drainEvents(buf);
        buf = rest;
        for (const e of events) {
          if (e.event === "delta") {
            setState((s) => ({ ...s, text: s.text + e.data }));
          } else if (e.event === "done") {
            setState((s) => ({ ...s, status: "done" }));
          } else if (e.event === "error") {
            setState((s) => ({
              ...s,
              status: "error",
              error: e.data || "stream_error",
            }));
          }
          // Unknown event types are ignored — forward compatibility.
        }
      }
      // Flush any trailing event left in `buf` once the body closes.
      const tail = drainEvents(buf + "\n\n");
      for (const e of tail.events) {
        if (e.event === "delta") {
          setState((s) => ({ ...s, text: s.text + e.data }));
        } else if (e.event === "done") {
          setState((s) => ({ ...s, status: "done" }));
        } else if (e.event === "error") {
          setState((s) => ({
            ...s,
            status: "error",
            error: e.data || "stream_error",
          }));
        }
      }
      // If the server closed the connection without an explicit `done`
      // (rare — most often a proxy timeout) and we're still showing
      // "streaming", upgrade to "done" so the UI doesn't hang.
      setState((s) => (s.status === "streaming" ? { ...s, status: "done" } : s));
    } catch (err) {
      const e = err as Error;
      if (e?.name === "AbortError") {
        setState((s) => ({ ...s, status: "aborted" }));
      } else {
        setState((s) => ({ ...s, status: "error", error: e?.message ?? "stream_error" }));
      }
    } finally {
      // Only clear if this is still the active controller — a newer
      // start() might already have replaced it.
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  return {
    state,
    start,
    stop,
    reset,
    isStreaming: state.status === "streaming",
  };
}
