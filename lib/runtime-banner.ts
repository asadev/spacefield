import "server-only";

import { headers } from "next/headers";

import type { SiteBannerRow } from "@/app/admin/_types";

/* Active site banners.
 *
 * Renders on every page via app/layout.tsx. The hard requirement is
 * that banner toggles in /admin/banners reach the public surface
 * within ~30s without redeploying.
 *
 * Render-mode contract — IMPORTANT:
 *   - The root layout is consumed by every route. If any route is
 *     statically prerendered (which most marketing pages are), this
 *     function is invoked ONCE at build time, the result is frozen
 *     into the prerendered HTML, and admin banner toggles never
 *     reach those routes until the next deploy.
 *   - Verified empirically against spacefield.co: home was served
 *     as `x-vercel-cache: HIT` + `x-nextjs-prerender: 1` and a
 *     freshly-inserted banner did not appear.
 *   - The fix: `await headers()` is a request-scoped dynamic API.
 *     Calling it from a server-component-data lib opts the calling
 *     tree out of static prerendering (Next 16 semantics). The
 *     result is unused; only the side-effect of "this code reads
 *     request context" matters to the static-analysis pass.
 *   - Trade-off: every page using the layout becomes dynamic-rendered.
 *     That's the correct posture for a runtime-toggleable banner.
 *     The in-memory `TTL_MS` cache below bounds RPC pressure to one
 *     fetch per ~30s per Node worker.
 *
 * Why direct `fetch()` instead of `createAdminClient()`:
 *   - `fetch()` is the standard way to call PostgREST from server
 *     code in Next 16; supabase-js adds a layer that's not needed
 *     here (no auth refresh, no realtime).
 *   - We use `cache: "no-store"` so each fetch reflects current DB
 *     state without Next's stale-while-revalidate semantics getting
 *     in the way. The per-worker Map cache (TTL_MS) provides the
 *     throttling — Next's data cache would either be stale (bad UX)
 *     or no-op (already throttled by our Map cache).
 *
 * Failure mode: missing env / RPC error / RLS denial → return [].
 * The banner stack is additive UI; "no banner" is the right
 * degradation. */

const TTL_MS = 30_000;

interface BannerCacheEntry {
  rows: SiteBannerRow[];
  fetchedAt: number;
}

const cache = new Map<string, BannerCacheEntry>();

function cacheKey(uid?: string, tier?: string): string {
  return `${uid ?? "__anon__"}|${tier ?? "__none__"}`;
}

export async function getActiveBanners(
  uid?: string,
  tier?: string,
): Promise<SiteBannerRow[]> {
  // Touch a request-scoped API to opt the caller out of static
  // prerendering. See the dynamic-render contract in the file
  // header. The result is unused.
  try { await headers(); } catch { /* outside request scope (e.g. build probe) */ }

  const key = cacheKey(uid, tier);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return hit.rows;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return [];

  let rows: SiteBannerRow[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/active_banners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ uid: uid ?? null, tier: tier ?? null }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) rows = data as SiteBannerRow[];
  } catch {
    return [];
  }

  cache.set(key, { rows, fetchedAt: now });
  return rows;
}
