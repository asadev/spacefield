/**
 * lib/paddle-verify.ts — verify a Paddle webhook request signature.
 *
 * Paddle's webhook signature header:
 *
 *   Paddle-Signature: ts=1700000000;h1=abcdef...hex
 *
 * Signed payload = `${ts}:${rawBody}` (literal colon between, no padding).
 * Algorithm = HMAC-SHA256, secret = the Paddle webhook secret from the
 * notification destination settings.
 *
 * Reference: https://developer.paddle.com/webhooks/signature-verification
 *
 * Replay protection: reject when `ts` is more than 5 minutes old.
 * (Paddle suggests 5 minutes as the standard tolerance window.)
 *
 * Body handling: this function calls `await request.text()` once. If
 * the caller still needs the body afterward they MUST pass a cloned
 * Request (`request.clone()`), since a Request body is single-use.
 */

import { verifyHmacSha256 } from "@/lib/hmac";

/** Max age of the signature timestamp before we treat it as a replay. */
const REPLAY_WINDOW_SEC = 5 * 60;

export type PaddleVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing-signature-header"
        | "malformed-signature"
        | "timestamp-out-of-window"
        | "signature-mismatch";
    };

/**
 * Parse the `Paddle-Signature` header into its `ts` and `h1` parts.
 *
 * Robust to:
 *   - segment order swapped (`h1=...;ts=...`)
 *   - extra whitespace around `;` or `=`
 *   - unknown segments (Paddle may add `h2=` etc. later)
 *   - missing segments → returned as undefined
 */
function parseSignatureHeader(header: string): { ts?: string; h1?: string } {
  const out: { ts?: string; h1?: string } = {};
  // Split on `;` — Paddle spec uses literal semicolons, not URL-encoded.
  for (const segment of header.split(";")) {
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (!key || !value) continue;
    if (key === "ts") out.ts = value;
    else if (key === "h1") out.h1 = value;
  }
  return out;
}

/**
 * Verify a Paddle webhook request against the shared secret.
 *
 * Consumes the request body. Caller must clone first if they want to
 * read it again after this call.
 */
export async function verifyPaddleSignature(
  request: Request,
  secret: string,
): Promise<PaddleVerifyResult> {
  const header = request.headers.get("paddle-signature");
  if (!header) {
    return { ok: false, reason: "missing-signature-header" };
  }

  const { ts, h1 } = parseSignatureHeader(header);
  if (!ts || !h1) {
    return { ok: false, reason: "malformed-signature" };
  }

  // ts is unix seconds — must be a positive integer.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0 || !Number.isInteger(tsNum)) {
    return { ok: false, reason: "malformed-signature" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // Reject stale signatures. Also reject implausibly-future timestamps
  // (clock skew tolerance same as the replay window in the other direction).
  if (Math.abs(nowSec - tsNum) > REPLAY_WINDOW_SEC) {
    return { ok: false, reason: "timestamp-out-of-window" };
  }

  // Body must be read exactly as Paddle sent it — no JSON re-serialization,
  // since whitespace differences would break the HMAC.
  const rawBody = await request.text();
  const signed = `${ts}:${rawBody}`;

  const ok = await verifyHmacSha256(secret, signed, h1);
  if (!ok) {
    return { ok: false, reason: "signature-mismatch" };
  }
  return { ok: true };
}
