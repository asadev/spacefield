import "server-only";

/* lib/ai-stream/server.ts — SSE streaming helper for route handlers.
 *
 * Why: before this file, the only AI route in the codebase (`/api/agent/dispatch`)
 * waited for the full completion and returned JSON. Any new AI surface that
 * wants progressive output had to roll its own SSE encoder + abort plumbing.
 * That's how you end up with three subtly-different SSE dialects across the
 * app. So we centralise the wire format here.
 *
 * Wire shape — text/event-stream framing per the SSE spec:
 *
 *     event: delta
 *     data: <chunk text — may span multiple `data:` lines>
 *
 *     event: done
 *     data:
 *
 *     event: error
 *     data: <message>
 *
 * Each event is terminated by a blank line (`\n\n`) so a client buffer-split on
 * `\n\n` works deterministically. Multi-line data is encoded as one `data:` line
 * per source line (per the SSE spec). JSON payloads are stringified.
 *
 * Abort plumbing: pass `req.signal` from the route handler into `streamToSSE`
 * and the async iterator will break the next time it yields. The stream then
 * emits a final `done` and closes — so the client's `useAIStream` sees
 * status=done rather than status=error after an abort. (`useAIStream` upgrades
 * that to `aborted` on the client side via the AbortController.)
 */

export interface SSEEvent {
  /** Event name. Defaults to "message" when omitted. We always set one of
   *  {"delta","done","error"}. */
  event?: string;
  /** Payload — string is encoded as-is (preserving newlines as multi-line
   *  `data:` frames), anything else gets `JSON.stringify`-ed. */
  data: unknown;
  /** Optional SSE id field — unused today but kept on the type so a future
   *  resumable-stream client can read `Last-Event-ID`. */
  id?: string;
}

/** Standard SSE response headers. `X-Accel-Buffering: no` keeps nginx /
 *  Vercel's edge buffer from holding the stream until completion. */
export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };
}

/** Encode one SSE event. The output ends with `\n\n` so the next event
 *  appended to the same stream is correctly framed. */
export function formatSSE(e: SSEEvent): string {
  const parts: string[] = [];
  if (e.id) parts.push(`id: ${e.id}`);
  if (e.event) parts.push(`event: ${e.event}`);
  const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
  // Per SSE: each `data:` line is concatenated by the client with `\n`,
  // so multi-line strings get split-and-prefixed here.
  for (const line of data.split("\n")) parts.push(`data: ${line}`);
  return parts.join("\n") + "\n\n";
}

/**
 * Convert any async iterable of `T` into an SSE `ReadableStream` suitable
 * for `new Response(stream, { headers: sseHeaders() })`.
 *
 * `toEvent` decides the event name + payload per chunk; for plain text
 * deltas you'd typically return `{ event: "delta", data: chunkText }`.
 *
 * If `signal` aborts mid-stream we stop pulling from the source, emit
 * the terminal `done` frame, and close the controller cleanly. Errors
 * surface as a final `error` frame so the client can show them in-place.
 */
export function streamToSSE<T>(
  source: AsyncIterable<T>,
  toEvent: (chunk: T) => SSEEvent | null,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of source) {
          if (signal?.aborted) break;
          const event = toEvent(chunk);
          if (event) controller.enqueue(enc.encode(formatSSE(event)));
        }
        controller.enqueue(
          enc.encode(formatSSE({ event: "done", data: "" }))
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err ?? "stream_error");
        controller.enqueue(
          enc.encode(formatSSE({ event: "error", data: message }))
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The fetch client disconnected. The `signal` plumbed through the
      // route handler will already be aborted, so the for-await loop
      // above will exit on its next iteration. Nothing to do here.
    },
  });
}

/**
 * Convenience: build a fully-formed SSE `Response` from an async iterable.
 * Use this in route handlers so you don't have to remember the headers.
 *
 *     export async function POST(req: NextRequest) {
 *       const tokens = streamAnthropicTokens(...);
 *       return sseResponse(tokens, (t) => ({ event: "delta", data: t }), req.signal);
 *     }
 */
export function sseResponse<T>(
  source: AsyncIterable<T>,
  toEvent: (chunk: T) => SSEEvent | null,
  signal?: AbortSignal
): Response {
  return new Response(streamToSSE(source, toEvent, signal), {
    headers: sseHeaders(),
  });
}
