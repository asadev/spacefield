"use client";

/* Tiny stale-while-revalidate cache + prefetch helpers shared by every
 * client-side GET in the app (CRM views, Files Manager, workspace
 * settings, etc.). Goals:
 *
 *   - Section switches show the previous data instantly, then refresh.
 *   - Repeated visits to the same endpoint coalesce into a single
 *     in-flight request even when fired from multiple components.
 *   - Hover-prefetch on nav items pre-warms the cache so the click
 *     feels instantaneous.
 *
 * Non-goals: this is NOT a full SWR / TanStack Query replacement. It's
 * a 60-line cache that solves "hot endpoints feel laggy" without
 * adding a dependency. Mutations still go through plain fetch and
 * call invalidate() to bust the relevant key.
 *
 * Cache key: the URL string. Any query params or workspace id should
 * be encoded into the URL by the caller (already true for our REST
 * endpoints under /api/crm, /api/files, etc.).
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface CacheEntry<T> {
  data: T | null;
  error: Error | null;
  ts: number;
  inFlight: Promise<T> | null;
}

const cache = new Map<string, CacheEntry<unknown>>();
const STALE_AFTER_MS = 30_000;

function getEntry<T>(key: string): CacheEntry<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing) return existing;
  const fresh: CacheEntry<T> = {
    data: null,
    error: null,
    ts: 0,
    inFlight: null,
  };
  cache.set(key, fresh as CacheEntry<unknown>);
  return fresh;
}

async function fetchAndStore<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const entry = getEntry<T>(url);
  if (entry.inFlight) return entry.inFlight;
  const p = (async () => {
    try {
      const r = await fetch(url, init);
      if (!r.ok) {
        throw new Error(
          `${r.status} ${r.statusText || "request failed"}: ${url}`
        );
      }
      const data = (await r.json()) as T;
      entry.data = data;
      entry.error = null;
      entry.ts = Date.now();
      return data;
    } catch (err) {
      entry.error = err instanceof Error ? err : new Error(String(err));
      entry.ts = Date.now();
      throw entry.error;
    } finally {
      entry.inFlight = null;
    }
  })();
  entry.inFlight = p;
  return p;
}

/* Imperative read with cache fallthrough. Returns cached data
 * instantly when fresh; otherwise fetches and caches. Use this from
 * existing useEffect-driven loading code to keep the data flow
 * unchanged while gaining the cache. Always returns a promise that
 * resolves to the typed JSON body (or throws on transport / non-2xx). */
export async function cachedFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const entry = getEntry<T>(url);
  const fresh = entry.data && Date.now() - entry.ts < STALE_AFTER_MS;
  if (fresh) {
    // Background revalidate when past the half-life so the next
    // caller after this gets a recently-refreshed copy.
    if (Date.now() - entry.ts > STALE_AFTER_MS / 2) {
      void fetchAndStore<T>(url, init).catch(() => {
        /* swallow — caller has fresh data already */
      });
    }
    return entry.data as T;
  }
  return fetchAndStore<T>(url, init);
}

/* Imperative prefetch — fire a GET, store the response, return nothing.
 * Safe to call on hover; if the user doesn't click, the cached value
 * just sits there until the TTL expires (or someone calls invalidate). */
export function prefetch(url: string, init?: RequestInit): void {
  const entry = getEntry(url);
  if (entry.inFlight) return;
  if (entry.data && Date.now() - entry.ts < STALE_AFTER_MS) return;
  void fetchAndStore(url, init).catch(() => {
    /* swallow — prefetch is best-effort */
  });
}

/* Bust an exact URL from the cache. Useful after a mutation that
 * affects a known endpoint. Pass `prefix` if you want to invalidate
 * every key that starts with a string (e.g. all CRM endpoints for a
 * workspace). */
export function invalidate(matcher: string | { prefix: string }): void {
  if (typeof matcher === "string") {
    cache.delete(matcher);
    return;
  }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(matcher.prefix)) cache.delete(k);
  }
}

/* Drop everything. Cheap escape hatch for "user signed out / workspace
 * switched, throw away anything stale." */
export function clearCache(): void {
  cache.clear();
}

/* Hook variant: returns { data, loading, error, refetch }. On mount,
 * if a cached entry exists and isn't stale, returns it instantly
 * without a fetch. Otherwise fetches; in either case, a stale-cache
 * hit triggers a background revalidation. */
export function useCachedFetch<T>(
  url: string | null,
  init?: RequestInit
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [, force] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!url) return;
    try {
      await fetchAndStore<T>(url, init);
    } catch {
      /* error is already in the entry */
    } finally {
      if (!cancelledRef.current) force((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const entry = getEntry<T>(url);
    const fresh = entry.data && Date.now() - entry.ts < STALE_AFTER_MS;
    if (!fresh) {
      void refetch();
    } else if (Date.now() - entry.ts > STALE_AFTER_MS / 2) {
      // Background revalidate when getting close to staleness.
      void refetch();
    }
  }, [url, refetch]);

  if (!url) {
    return {
      data: null,
      loading: false,
      error: null,
      refetch,
    };
  }
  const entry = getEntry<T>(url);
  return {
    data: entry.data,
    loading: !!entry.inFlight && entry.data === null,
    error: entry.error,
    refetch,
  };
}
