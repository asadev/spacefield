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
//
// 2026-05-27 (Agent H walkthrough): the original implementation read
// `profiles.is_pro` — but that column was never created in the schema
// (see supabase/migrations/20260427_profiles.sql — only user_id,
// username, full_name, designation, bio, avatar_url, socials,
// created_at, updated_at, is_admin exist). So every Pro-gated route
// returned 402 even for paid users — including the brand-new WhatsApp
// app's instance/connect API and the AI inventory-caption endpoint.
//
// The source of truth for tier is `public.subscriptions` (managed by
// the Paddle webhook + manual admin grants — see the maintainer's row
// `tier_id='pro'` granted via metadata.granted_by='manual_admin_grant').
// We read tier_id there with a `status='active'` filter so cancelled /
// past-due subs don't keep granting Pro.
export async function isPro(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();

  // Platform admins (profiles.is_admin = true) auto-pass every Pro gate.
  // the maintainer / staff shouldn't have to pay themselves to test or operate the
  // platform. Single round-trip in parallel with the subscription check.
  const [{ data: prof }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("tier_id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (prof?.is_admin === true) return true;

  if (!sub) return false;
  const tier = sub.tier_id;
  // Any paid tier counts as "pro" for the gate (pro, team, enterprise).
  return tier === "pro" || tier === "team" || tier === "enterprise";
}

// ─── Copy ─────────────────────────────────────────────────────────────────
// Shared upgrade-nudge text so every gated spot speaks with one voice.
export function upgradeNudge(convertedCount: number, threshold = 3): string {
  const remaining = Math.max(0, threshold - convertedCount);
  if (remaining <= 0) return "Pro unlocked. Enjoy.";
  if (remaining === 1) return "Refer 1 more friend to unlock Pro.";
  return `Refer ${remaining} more friends to unlock Pro.`;
}
