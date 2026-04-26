// Pro tier feature gates.
//
// The product stays free. "Pro" is earned by referring 3 friends (see
// lib/referrals/server.ts). It unlocks light power-user bonuses — nothing
// that materially breaks the free experience.
//
// Gating philosophy:
//   - Soft. If a free user hits a limit, show an inline nudge ("Refer 2 more
//     friends to unlock") rather than blocking the action.
//   - Non-blocking. If the Pro status can't be fetched (logged out, network
//     error), default to the free limits and allow the action.

import { createClient } from "@/lib/supabase/server";

// ─── Limits ───────────────────────────────────────────────────────────────
export const LIMITS = {
  // /app/solutions/_lib/scenarios.ts — localStorage-backed scenario saves.
  scenarios: { free: 5, pro: 50 },

  // CSV / JSON / Markdown exports. Counter is localStorage-only (see
  // components/dashboard/ReferralWidget for why we don't server-track this).
  exportsPerDay: { free: 5, pro: Infinity },

  // Saved searches / alerts — tie-in with the retention agent's work.
  savedSearches: { free: 3, pro: Infinity },
} as const;

export type LimitKey = keyof typeof LIMITS;

export function limitFor(key: LimitKey, isPro: boolean): number {
  return isPro ? LIMITS[key].pro : LIMITS[key].free;
}

// ─── isPro (server) ───────────────────────────────────────────────────────
// Cheap, cacheable-ish lookup. Returns false on any error so callers never
// need null-check.
export async function isPro(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_pro")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.is_pro;
}

// ─── Copy ─────────────────────────────────────────────────────────────────
// Shared upgrade-nudge text so every gated spot speaks with one voice.
export function upgradeNudge(convertedCount: number, threshold = 3): string {
  const remaining = Math.max(0, threshold - convertedCount);
  if (remaining <= 0) return "Pro unlocked. Enjoy.";
  if (remaining === 1) return "Refer 1 more friend to unlock Pro.";
  return `Refer ${remaining} more friends to unlock Pro.`;
}
