// Client-side Pro helpers. Keep this separate from lib/pro/features.ts
// which is "use server"-adjacent — Next/Turbopack gets grumpy if a module
// imports both @/lib/supabase/server and is referenced from a client file.

"use client";

import { createClient } from "@/lib/supabase/client";

// Tiny in-memory cache so ProBadge in a feed of 50 posts doesn't fire 50
// round-trips. Keyed by userId; lasts the lifetime of the page.
const cache = new Map<string, Promise<boolean>>();

export function isProClient(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return Promise.resolve(false);

  const hit = cache.get(userId);
  if (hit) return hit;

  const supabase = createClient();
  const p = (async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_pro")
        .eq("id", userId)
        .maybeSingle();
      return !!(data as { is_pro?: boolean } | null)?.is_pro;
    } catch {
      return false;
    }
  })();

  cache.set(userId, p);
  return p;
}

// Call after a known Pro-state change (unlock, etc) to bust stale cache.
export function invalidateProCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
