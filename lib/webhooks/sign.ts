/* Generic HMAC-SHA256 webhook signer for `webhook_endpoints`.
 *
 * Mirrors lib/share/webhook-sign.ts at a higher level — workspace-agnostic,
 * usable by any caller that wants to sign and POST a payload. Returns a
 * structured result so callers can log to webhook_deliveries_v2 themselves
 * (the admin /test endpoint does this) instead of being forced through a
 * specific log-row shape.
 *
 * Headers emitted (mirroring the Share pattern, but generic):
 *   X-Signature:   sha256=<hex>     // HMAC-SHA256(secret, raw-body)
 *   X-Timestamp:   <unix-seconds>   // for replay-window enforcement on receivers
 *   X-Event:       <event-name>     // e.g. form.submitted
 *
 * Receivers verify by recomputing HMAC over the exact raw body and
 * comparing hex strings.
 */

import "server-only";

const TIMEOUT_MS = 5_000;

export type WebhookSignStatus =
  | "success"
  | "timeout"
  | "network_error"
  | "non_2xx"
  | "signing_skipped";

export interface SignedSendInput {
  url: string;
  event: string;
  body: Record<string, unknown>;
  /** If null/empty the request still goes out, but `signed=false`. */
  secret: string | null;
}

export interface SignedSendResult {
  status: WebhookSignStatus;
  httpStatus: number | null;
  responseExcerpt: string | null;
  durationMs: number;
  signed: boolean;
  /** The exact JSON string that was signed and sent — handy for logging. */
  bodyText: string;
}

/** Compute hex HMAC-SHA256 using Web Crypto (Edge & Node both support it). */
export async function hmacSha256Hex(
  secret: string,
  body: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a 48-char hex secret (matches the DB default shape). */
export function generateWebhookSecret(): string {
  // 24 random bytes → 48 hex chars; DB default uses md5, this is stronger.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* Sign + POST with a 5-second hard timeout. Never throws — returns a
 * result object the caller logs. */
export async function sendSigned(
  input: SignedSendInput
): Promise<SignedSendResult> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyText = JSON.stringify({
    event: input.event,
    timestamp: new Date().toISOString(),
    ...input.body,
  });

  const signed = Boolean(input.secret);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "spacefield-webhook/1.0",
    "X-Event": input.event,
    "X-Timestamp": timestamp,
  };
  if (signed && input.secret) {
    const signature = await hmacSha256Hex(input.secret, bodyText);
    headers["X-Signature"] = `sha256=${signature}`;
  }

  const startedAt = Date.now();
  let status: WebhookSignStatus = signed ? "non_2xx" : "signing_skipped";
  let httpStatus: number | null = null;
  let responseExcerpt: string | null = null;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(input.url, {
      method: "POST",
      headers,
      body: bodyText,
      signal: ac.signal,
    });
    clearTimeout(timer);
    httpStatus = res.status;
    status = res.ok ? "success" : "non_2xx";
    try {
      const text = await res.text();
      responseExcerpt = text.slice(0, 500);
    } catch {
      // Body might already be consumed or unreadable; non-fatal.
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      status = "timeout";
    } else {
      status = "network_error";
      responseExcerpt = err instanceof Error ? err.message.slice(0, 500) : null;
    }
  }

  return {
    status,
    httpStatus,
    responseExcerpt,
    durationMs: Date.now() - startedAt,
    signed,
    bodyText,
  };
}
