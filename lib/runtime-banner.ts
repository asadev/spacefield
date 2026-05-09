import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SiteBannerRow } from "@/app/admin/_types";

/* In-memory TTL cache for active banners. 30s matches maintenance state.
 * Cache key includes uid + tier because the RPC filters on those. */

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
  const key = cacheKey(uid, tier);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < TTL_MS) {
    return hit.rows;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }

  const { data, error } = await admin.rpc("active_banners", {
    uid: uid ?? null,
    tier: tier ?? null,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  const rows = data as SiteBannerRow[];
  cache.set(key, { rows, fetchedAt: now });
  return rows;
}
