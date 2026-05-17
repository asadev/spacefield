import type { Metadata } from "next";
import HomeGate from "./_components/HomeGate";

export const metadata: Metadata = {
  title: "Space Field — Your Workspace",
  description:
    "A multi-workspace desktop with native apps for real estate, finance, marketing, sales, and everything in between. Create workspaces, install tools, run them like apps.",
};

// ISR: regenerate the static shell every 60s. The shell rendered here
// is a tiny client-gated wrapper (HomeGate) — the heavy lifting (auth
// detection, landing vs desktop) happens client-side, so a 60s stale
// window on the HTML is harmless. Note: the root layout currently opts
// the tree into dynamic rendering via `await headers()` in
// lib/runtime-brand.ts; this constant only takes effect when that
// reader is wrapped in unstable_cache. See docs/perf/CACHING.md.
export const revalidate = 60;

/* spacefield.co serves two faces from one URL:
 *   - First-time, signed-out visitors → marketing Landing.
 *   - Returning users (local workspace OR signed in) → Desktop OS.
 * HomeGate decides which to render based on localStorage + Supabase session. */
export default function SpaceFieldHome() {
  return <HomeGate />;
}
