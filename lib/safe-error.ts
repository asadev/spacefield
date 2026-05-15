import "server-only";

import { logError } from "@/lib/error-log";

/**
 * Production-safe error message for client responses.
 *
 * SC-003 — Raw DB error messages and stack traces were echoed back to
 * clients in ~30 API routes. Surfaces like "duplicate key value violates
 * unique constraint \"foo_pkey\"" leak schema details to anyone with
 * curl. This helper centralises the redaction:
 *
 *   - In dev / preview: return `err.message` (so we can debug locally
 *     + in Vercel preview deploys).
 *   - In production: return a generic string keyed by `source`.
 *     Defaults to `"internal_error"`; callers may pass a custom
 *     `fallback` (e.g. "create_failed", "update_failed").
 *
 * The full error is ALWAYS logged via lib/error-log.ts so we still get
 * the detail in `/admin/errors`. Logging is fire-and-forget; we never
 * await it because the caller is on the response hot path.
 *
 * Usage from API routes:
 *
 *   try { ... }
 *   catch (e) {
 *     return NextResponse.json(
 *       { error: safeErrorMessage(e, { source: "comments.update" }) },
 *       { status: 400 }
 *     );
 *   }
 */
export interface SafeErrorOpts {
  /** Tag for error_events.source — keeps redacted client responses
   * tied to the full server-side log. */
  source?: string;
  /** Optional user id for error_events.user_id. */
  userId?: string | null;
  /** Override the generic production fallback. Default "internal_error". */
  fallback?: string;
}

export function safeErrorMessage(
  err: unknown,
  opts?: SafeErrorOpts,
): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const stack = err instanceof Error ? (err.stack ?? null) : null;

  // Fire-and-forget — must never throw on the response hot path.
  void logError({
    message: message || "(empty error)",
    source: opts?.source ?? null,
    level: "error",
    user_id: opts?.userId ?? null,
    stack,
  }).catch(() => {
    /* swallow — logger already swallows internally, this is belt-and-braces */
  });

  // In dev / preview, return the raw message so we can debug. The
  // `VERCEL_ENV` check covers Vercel preview deploys (which set it to
  // "preview"); local dev has no VERCEL_ENV at all so we fall back to
  // NODE_ENV.
  const isProd =
    process.env.VERCEL_ENV === "production" ||
    (process.env.VERCEL_ENV == null &&
      process.env.NODE_ENV === "production");

  if (!isProd) {
    return message || (opts?.fallback ?? "internal_error");
  }
  return opts?.fallback ?? "internal_error";
}
