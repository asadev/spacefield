import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandConfigRow } from "@/app/admin/_types";

/* Brand config — workspace overrides global. Cached for 60s; brand changes
 * are infrequent and the layout reads this on every render. */

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
  const key = cacheKey(workspaceId);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return hit.row;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data, error } = await admin.rpc("active_brand", {
    ws_id: workspaceId ?? null,
  });

  if (error) {
    return null;
  }

  // active_brand returns a single row (or null when neither workspace
  // override nor global default exists). Supabase RPC returning a SETOF
  // table can yield either an object or array depending on driver — be
  // defensive.
  let row: BrandConfigRow | null = null;
  if (Array.isArray(data)) {
    row = (data[0] as BrandConfigRow | undefined) ?? null;
  } else if (data && typeof data === "object") {
    row = data as BrandConfigRow;
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
