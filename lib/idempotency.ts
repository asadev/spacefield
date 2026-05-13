/**
 * lib/idempotency.ts — Stripe-style idempotency-key wrapper.
 *
 * Pattern (Stripe / GitHub / Square all do variants of this):
 *   - Client generates a UUID per logical operation.
 *   - Sends it as `Idempotency-Key: <uuid>` on a POST.
 *   - First time we see the key: execute the work, store
 *     status + body in `idempotency_keys`, return the result.
 *   - Subsequent retries with the same key: return the cached result
 *     without re-executing the side effect.
 *
 * Edge-safe: only `fetch` + Web APIs. No Node deps.
 *
 * Table shape (PostgREST-accessible, created by a later migration):
 *
 *   create table public.idempotency_keys (
 *     key            text primary key,
 *     response_status int  not null,
 *     response_body  jsonb not null,
 *     expires_at     timestamptz not null default (now() + interval '24 hours')
 *   );
 *
 * The migration is NOT shipped in this batch. Until it lands, this
 * helper degrades gracefully: it detects the missing-table error from
 * PostgREST (status 404 + code `PGRST205`, or HTTP 404 on the path) and
 * just runs `fn()` directly, with a single `console.warn` so we know it
 * happened. This means callers can be wired in *now* and start
 * benefiting the moment the table exists, with zero code change.
 */

const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24 hours

export interface WithIdempotencyOpts {
  /** Client-supplied unique key (UUIDv4 or any stable token). Required. */
  key: string;
  /** Seconds until the cached response expires. Default 24h. */
  ttl_sec?: number;
  /** Supabase project credentials for the REST call. */
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
}

interface CachedRow {
  key: string;
  response_status: number;
  response_body: unknown;
  expires_at: string;
}

/** Whether to log the "table missing — degrading" warning at most once. */
let warnedMissingTable = false;

function tableMissing(status: number, bodyText: string): boolean {
  // PostgREST returns 404 with `{"code":"PGRST205", ...}` when a table
  // is absent from its schema cache. Some Supabase setups also surface
  // a bare 404 on the path. Treat both as "table missing".
  if (status !== 404) return false;
  if (!bodyText) return true;
  return bodyText.includes("PGRST205") || bodyText.includes("does not exist");
}

/**
 * Wrap a side-effectful operation behind an idempotency key.
 *
 * Returns the parsed `response_body` of the cached row when the key has
 * been seen before. On first hit, runs `fn`, stores the JSON-serialized
 * result, and returns it.
 *
 * Notes:
 *   - We only cache the *successful* return value. If `fn` throws, no
 *     row is written — the next retry with the same key gets a fresh
 *     attempt. (Stripe writes errors too; we don't, to keep the helper
 *     simple. Callers that want error-caching can do it themselves.)
 *   - `expires_at` is `now() + ttl_sec` computed client-side. A nightly
 *     cleanup job (out of scope here) should `DELETE WHERE expires_at < now()`.
 */
export async function withIdempotency<T>(
  opts: WithIdempotencyOpts,
  fn: () => Promise<T>,
): Promise<T> {
  const { key, supabase } = opts;
  const ttl = opts.ttl_sec ?? DEFAULT_TTL_SEC;

  if (!key) {
    // No key → caller didn't actually want idempotency, just run.
    return fn();
  }

  // 1. Lookup: GET /rest/v1/idempotency_keys?key=eq.<key>&select=*
  const lookupUrl = `${supabase.url}/rest/v1/idempotency_keys?key=eq.${encodeURIComponent(
    key,
  )}&select=key,response_status,response_body,expires_at`;
  const lookupRes = await fetch(lookupUrl, {
    method: "GET",
    headers: {
      apikey: supabase.serviceRoleKey,
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (!lookupRes.ok) {
    const text = await lookupRes.text();
    if (tableMissing(lookupRes.status, text)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "[idempotency] idempotency_keys table not found — running without caching. Apply the migration to enable.",
        );
      }
      return fn();
    }
    // Any other error: don't block the caller — log and proceed.
    console.warn(
      `[idempotency] lookup failed (status=${lookupRes.status}); proceeding without cache.`,
    );
    return fn();
  }

  const rows = (await lookupRes.json()) as CachedRow[];
  const hit = rows[0];
  if (hit) {
    // Cached row exists. Honor expiry on the read path even if cleanup
    // hasn't pruned it yet.
    const expiresMs = Date.parse(hit.expires_at);
    if (!Number.isFinite(expiresMs) || expiresMs > Date.now()) {
      return hit.response_body as T;
    }
    // Expired — fall through and overwrite below.
  }

  // 2. Execute the real work.
  const result = await fn();

  // 3. Insert (or upsert if expired) the result.
  //    `Prefer: resolution=ignore-duplicates` makes the insert atomic:
  //    if a concurrent request beat us to the punch we silently no-op
  //    and the next read will see their row. We don't read back here —
  //    we already have `result` and that's what we return to the caller.
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const insertUrl = `${supabase.url}/rest/v1/idempotency_keys?on_conflict=key`;
  const insertRes = await fetch(insertUrl, {
    method: "POST",
    headers: {
      apikey: supabase.serviceRoleKey,
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      key,
      response_status: 200,
      response_body: result,
      expires_at: expiresAt,
    }),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text();
    if (tableMissing(insertRes.status, text)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "[idempotency] idempotency_keys table not found on insert — returning result without caching.",
        );
      }
      // Already executed `fn`; return its value either way.
      return result;
    }
    console.warn(
      `[idempotency] insert failed (status=${insertRes.status}); returning result uncached.`,
    );
  }

  return result;
}
