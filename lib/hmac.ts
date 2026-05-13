/**
 * lib/hmac.ts — HMAC-SHA256 sign + constant-time verify on Web Crypto.
 *
 * Edge-safe: uses only `globalThis.crypto.subtle`. No Node deps.
 *
 * Use for:
 *   - Signing outgoing webhooks from /admin/webhooks dispatcher.
 *   - Any "shared-secret over HTTP" handshake where you control both ends.
 *
 * For incoming third-party webhooks with a specific signature format
 * (e.g. Paddle's `Paddle-Signature: ts=...;h1=...`) use the format-
 * specific verifier (lib/paddle-verify.ts) which delegates here.
 */

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function bytesToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Sign `body` with `secret` using HMAC-SHA256. Returns lowercase hex.
 *
 * Pass the raw request body (string). Callers serializing JSON should
 * `JSON.stringify` once and sign + send that exact same string — the
 * receiver re-hashes the bytes it received, not its own re-serialization.
 */
export async function signHmacSha256(
  secret: string,
  body: string,
): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(sig);
}

/**
 * Verify `signature` (lowercase hex) against HMAC-SHA256(secret, body).
 *
 * Constant-time-ish compare: we XOR-sum across the full longer-of-the-two
 * length and never short-circuit on byte mismatch. If the lengths differ
 * we still iterate the full longer length (treating the shorter side as
 * out-of-range = 0) to keep the timing profile roughly flat, then return
 * false at the end. This is not a cryptographically perfect constant-time
 * comparator on JS (engines, gc, JIT all leak some signal), but it
 * removes the obvious early-out timing oracle.
 *
 * Caller is responsible for casing — we normalize the expected hex to
 * lowercase before compare, since signHmacSha256 emits lowercase.
 */
export async function verifyHmacSha256(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const expected = await signHmacSha256(secret, body);
  const provided = (signature ?? "").toLowerCase();

  const len = Math.max(expected.length, provided.length);
  let mismatch = 0;
  for (let i = 0; i < len; i++) {
    const a = i < expected.length ? expected.charCodeAt(i) : 0;
    const b = i < provided.length ? provided.charCodeAt(i) : 0;
    // OR the diffs together — `mismatch` is non-zero iff any byte differed.
    mismatch |= a ^ b;
  }

  // Length mismatch is a hard fail even if mismatch happens to be 0
  // (e.g. provided is all-NUL of a different length).
  if (expected.length !== provided.length) {
    return false;
  }
  return mismatch === 0;
}
