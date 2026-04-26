import type { Metadata } from "next";
import HomeGate from "./_components/HomeGate";

export const metadata: Metadata = {
  title: "Space Field — Your Workspace",
  description:
    "A multi-workspace desktop with native apps for real estate, finance, marketing, sales, and everything in between. Create workspaces, install tools, run them like apps.",
};

/* spacefield.co serves two faces from one URL:
 *   - First-time, signed-out visitors → marketing Landing.
 *   - Returning users (local workspace OR signed in) → Desktop OS.
 * HomeGate decides which to render based on localStorage + Supabase session. */
export default function SpaceFieldHome() {
  return <HomeGate />;
}
