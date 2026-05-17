import "server-only";

/**
 * Single-flight wrapper — coalesces concurrent callers for the same
 * cache key into one in-flight Promise.
 *
 * Use this in front of hot DB reads that show up on admin dashboards,
 * SSR layout helpers, or any code path that can be hit by many concurrent
 * requests at once (e.g., a viral landing page slamming a workspace-stats
 * RPC; an admin page that has 6 widgets all calling the same RPC).
 *
 * What it solves:
 *   - Cache stampede / dogpile: when a cached value expires and N
 *     requests arrive simultaneously, all N would otherwise fire the
 *     expensive backend call. With single-flight, the first caller
 *     fires, and the rest await the same Promise.
 *
 * What it doesn't:
 *   - Cross-instance coordination. This is per-Node-worker only. For
 *     cross-instance coalescing you'd need Redis-backed locks; we
 *     deliberately don't add that dependency. The per-worker scope
 *     is good enough because Vercel's serverless function pool keeps
 *     warm instances small and reuses them across requests within a
 *     short window.
 *   - Caching the result. The wrapper does not retain the value past
 *     resolution — pair it with `unstable_cache` or a Map-with-TTL
 *     (see `lib/runtime-banner.ts`, `lib/runtime-brand.ts`) if you
 *     want post-resolution reuse. The single-flight protects the
 *     "I'm computing this right now" window.
 *
 * Failure semantics:
 *   - If the producer throws, every awaiter gets the same rejection.
 *     The in-flight slot is cleared in `finally` so the next caller
 *     retries fresh — we do NOT cache failures.
 *
 * Memory: O(unique-keys-with-in-flight-work). Keys are evicted on
 * settlement, so steady-state size is bounded by concurrency.
 */

type Producer<T> = () => Promise<T>;

interface InFlightEntry<T> {
  promise: Promise<T>;
}

const inFlight = new Map<string, InFlightEntry<unknown>>();

/**
 * Wrap an async producer so concurrent callers for `key` share the
 * in-flight Promise. Returns the value (or rethrows the producer's
 * error).
 *
 * Example:
 *   const stats = await singleFlight(`workspace-stats:${wsId}`, () =>
 *     supabase.rpc("workspace_stats", { ws_id: wsId })
 *   );
 */
export async function singleFlight<T>(
  key: string,
  producer: Producer<T>,
): Promise<T> {
  const existing = inFlight.get(key) as InFlightEntry<T> | undefined;
  if (existing) {
    return existing.promise;
  }
  const promise = (async () => {
    try {
      return await producer();
    } finally {
      // Clear the slot whether we resolved or rejected. We never cache
      // errors — let the next caller retry from scratch.
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, { promise } as InFlightEntry<unknown>);
  return promise;
}

/**
 * For diagnostics / tests — current number of in-flight keys. Useful in
 * a healthcheck endpoint if we ever want to surface "we're under heavy
 * stampede pressure right now."
 */
export function inFlightSize(): number {
  return inFlight.size;
}

/* ────────────────── Cache-tag constants ──────────────────
 *
 * Centralizes the tag names used with `updateTag()` /
 * `revalidateTag()` and with `unstable_cache(..., [...keys],
 * { tags: [...] })` consumers.
 *
 * Why keep these here:
 *   - Admin server actions need to call `revalidateTag(CACHE_TAGS.X)`.
 *   - Future read paths can wrap their DB reads in `unstable_cache`
 *     with the same tag, and writes will invalidate automatically.
 *   - One file = one source of truth. Misspelled tags silently break
 *     invalidation, so we want everyone importing the constant.
 *
 * Conventions:
 *   - Lowercase, dot-separated namespace (`banners`, `brand.global`).
 *   - Keep scope tight: `brand.global` invalidates only the
 *     global-brand cache, not every workspace's. If you cache
 *     per-workspace brand, build the tag inline as
 *     `${CACHE_TAGS.brandWorkspace}:${wsId}` and revalidate the same.
 */
export const CACHE_TAGS = {
  banners: "banners",
  brandGlobal: "brand.global",
  brandWorkspace: "brand.workspace", // suffix with `:${wsId}` when used
  featureFlags: "feature-flags",
  maintenance: "maintenance",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
