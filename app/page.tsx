import type { Metadata } from "next";
import { cookies } from "next/headers";
import HomeGate from "./_components/HomeGate";

export const metadata: Metadata = {
  title: "Space Field — Your Workspace",
  description:
    "A multi-workspace desktop with native apps for real estate, finance, marketing, sales, and everything in between. Create workspaces, install tools, run them like apps.",
};

// Reading cookies opts this route out of ISR (per-request render).
// HomeSsrFallback is tiny (~1 KB) so the cost is negligible, and the
// gain is killing the "Sign in" hero flash for signed-in users.
export const dynamic = "force-dynamic";

/** Cheap server-side hint: are there ANY Supabase auth cookies set for
 *  this visitor? We don't validate the JWT here — that happens in the
 *  client supabase.auth.getUser() call inside HomeGate, which is the
 *  source of truth. This is purely so the SSR fallback skips the
 *  marketing "Sign in" hero (which flashes + bounces signed-in users
 *  through /?signup=1 → / on click). For visitors with no cookies at
 *  all (genuine signed-out / new), we keep showing the marketing hero.
 *
 *  Supabase SSR sets cookies named `sb-<project-ref>-auth-token`,
 *  sometimes split into `.0` / `.1` chunks for large tokens. Any one
 *  of them is enough of a signal that the visitor has likely been
 *  signed in before. */
async function hasSupabaseAuthCookie(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return cookieStore
      .getAll()
      .some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  } catch {
    return false;
  }
}

/* spacefield.co serves two faces from one URL:
 *   - First-time, signed-out visitors → marketing Landing.
 *   - Returning users (local workspace OR signed in) → Desktop OS.
 * HomeGate decides which to render based on localStorage + Supabase session.
 *
 * `likelyAuthed` is a cheap server-side cookie sniff so the SSR fallback
 * paints a neutral skeleton (not the marketing hero) for visitors that
 * are probably signed in — eliminates the "sign in box flashes for half
 * a second then disappears, and clicking it bounces you back" UX bug
 * (caught 2026-05-27 by Asad's screen recording). */
export default async function SpaceFieldHome() {
  const likelyAuthed = await hasSupabaseAuthCookie();
  return <HomeGate likelyAuthed={likelyAuthed} />;
}
