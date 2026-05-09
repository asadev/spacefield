import "server-only";

import { headers } from "next/headers";

import type { BrandConfigRow } from "@/app/admin/_types";

/* Active brand config — workspace overrides global.
 *
 * Renders on every page via app/layout.tsx. Same constraint as
 * runtime-banner: admin updates to brand_configs must reach the
 * public surface without redeploying.
 *
 * Render-mode contract — IMPORTANT:
 *   - The root layout reads brand vars on every render. If a route
 *     is statically prerendered, the brand vars are frozen at build
 *     time. Verified empirically against spacefield.co: a `#ff0000`
 *     primary_color update never reached `/`'s injected <style>.
 *   - Fix: `await headers()` opts the calling tree out of static
 *     prerendering. See the file-header comment in
 *     lib/runtime-banner.ts for the full rationale; both libs
 *     share the same constraint and resolution.
 *
 * Why direct `fetch()` + `cache: "no-store"`:
 *   `fetch()` is the standard server-side PostgREST call; supabase-js
 *   isn't needed here. `cache: "no-store"` means each fetch reflects
 *   current DB state — Next's revalidate-based caching would yield
 *   stale-while-revalidate which served stale brand vars after
 *   admin updates. The per-worker Map cache (TTL_MS) below provides
 *   the throttling, so RPC pressure stays at one fetch per ~60s per
 *   Node worker. */

const TTL_MS = 60_000;

interface BrandCacheEntry {
  row: BrandConfigRow | null;
  fetchedAt: number;
}

const cache = new Map<string, BrandCacheEntry>();

function cacheKey(workspaceId?: string | null): string {
  return workspaceId ?? "__global__";
}

export async function getActiveBrand(
  workspaceId?: string | null,
): Promise<BrandConfigRow | null> {
  // Touch a request-scoped API to opt the caller out of static
  // prerendering. See dynamic-render contract in
  // lib/runtime-banner.ts.
  try { await headers(); } catch { /* outside request scope */ }

  const key = cacheKey(workspaceId);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return hit.row;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;

  let row: BrandConfigRow | null = null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/active_brand`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ ws_id: workspaceId ?? null }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    // active_brand returns a single brand_configs row (or null when
    // neither workspace override nor global default exists). PostgREST
    // can return either an object or an array depending on the
    // function shape; defensive about both.
    if (Array.isArray(data)) {
      row = (data[0] as BrandConfigRow | undefined) ?? null;
    } else if (data && typeof data === "object") {
      row = data as BrandConfigRow;
    }
  } catch {
    return null;
  }

  cache.set(key, { row, fetchedAt: now });
  return row;
}

/* Build a CSS-vars object suitable for inlining into a <style> tag.
 * Only emits keys whose underlying value is non-empty so missing colors
 * fall back to the site's default tokens instead of blanking them. */
export function brandToCssVars(
  brand: BrandConfigRow | null,
): Record<string, string> {
  if (!brand) return {};
  const out: Record<string, string> = {};
  if (brand.primary_color) out["--brand-primary"] = brand.primary_color;
  if (brand.accent_color) out["--brand-accent"] = brand.accent_color;
  if (brand.font_family) out["--brand-font"] = brand.font_family;
  return out;
}

/* Helper for inlining the CSS vars into a <style> tag body. Caller wraps
 * the return value in `:root { ... }`. */
export function brandCssVarsBlock(brand: BrandConfigRow | null): string {
  const vars = brandToCssVars(brand);
  const entries = Object.entries(vars);
  if (entries.length === 0) return "";
  const body = entries
    .map(([k, v]) => `${k}: ${escapeCssValue(v)};`)
    .join(" ");
  return `:root { ${body} }`;
}

/* Strip characters that would break out of the CSS string context. We
 * inject these into a <style> tag so the only thing we really need to
 * keep out is `<` and `>`; we also drop semicolons + braces because the
 * value should be a single CSS token (color, font name, etc.). */
function escapeCssValue(input: string): string {
  return input.replace(/[<>{};]/g, "");
}
