/**
 * lib/etag.ts — weak ETag + 304 helper for JSON API responses.
 *
 * Edge-safe: uses only Web APIs (no Node crypto). Hash is a non-crypto
 * FNV-1a 32-bit on the UTF-8 bytes of `JSON.stringify(data)`. Good
 * enough for cache-validation; NOT a security primitive.
 *
 * Usage in a route handler:
 *
 *   import { respondWithEtag } from "@/lib/etag";
 *   return respondWithEtag(req, { items, total });
 *
 * If the client sent `If-None-Match` matching the computed etag, the
 * response is a 304 with no body. Otherwise it's a 200 (or whatever
 * `init.status` is set to) with the JSON body and an `ETag` header.
 *
 * `init.headers` is honored — pass `Cache-Control`, `Vary`, etc. and
 * we'll merge `ETag` and (for 200 responses) `Content-Type: application/json`.
 */

/** FNV-1a 32-bit hash of a UTF-8 string. Returns 8 lowercase hex chars. */
function fnv1a32(input: string): string {
  // FNV offset basis (32-bit) = 0x811c9dc5
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime = 0x01000193 — use Math.imul to keep it 32-bit
    hash = Math.imul(hash, 0x01000193);
  }
  // force into unsigned 32-bit before hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compute a weak ETag for arbitrary serializable data.
 *
 * The `W/` prefix marks it "weak" per RFC 7232 §2.3 — clients/CDNs
 * treat it as semantically equivalent rather than byte-identical,
 * which matches our use-case (whitespace-insensitive JSON content).
 */
export function weakEtag(data: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(data) ?? "null";
  } catch {
    // unstringifiable input (cycles, BigInt, etc.) — fall back to a
    // type-tagged sentinel so we at least produce a stable string and
    // don't crash the response path.
    serialized = `__nonserializable__:${typeof data}`;
  }
  return `W/"${fnv1a32(serialized)}"`;
}

/**
 * Build a Response, honoring If-None-Match for 304 short-circuit.
 *
 * - Compares the request's `If-None-Match` (case-insensitive header
 *   lookup; value matched verbatim including the `W/` prefix and quotes).
 * - On match: 304 with the ETag header (no body, no Content-Type — per
 *   HTTP semantics 304 must not carry an entity body).
 * - On miss: 200 (or `init.status`) JSON body with ETag + Content-Type.
 */
export function respondWithEtag(
  req: Request,
  data: unknown,
  init: ResponseInit = {},
): Response {
  const etag = weakEtag(data);
  const ifNoneMatch = req.headers.get("if-none-match");

  // Build a fresh Headers we can mutate without disturbing the caller's init.
  const headers = new Headers(init.headers);

  if (ifNoneMatch && ifNoneMatch === etag) {
    // 304 wins regardless of init.status — the client already has the body.
    headers.set("ETag", etag);
    // Strip any content-type the caller passed; 304 carries no body.
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }

  headers.set("ETag", etag);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers,
  });
}
