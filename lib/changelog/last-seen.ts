/**
 * Server-side helper for the "last-seen what's-new version" cookie.
 *
 * We track the last what's-new version each user has acknowledged so
 * the modal only fires when something genuinely new shipped since their
 * previous session. The cookie is `spacefield-whatsnew-seen` and its
 * value is a `YYYY.MM.DD` string matching `lib/changelog/entries.ts`.
 *
 * We intentionally use a cookie (not the DB) so:
 *   - logged-out marketing visitors can dismiss it without an account,
 *   - it survives across devices for the same browser without a roundtrip,
 *   - it never blocks page render waiting on Supabase.
 *
 * The reciprocal client write happens inside `<WhatsNew />` via
 * `document.cookie`. Server-side we only read the cookie on render —
 * a separate Server Action could also be added later.
 */

import "server-only";
import { cookies } from "next/headers";

import { WHATS_NEW_COOKIE } from "./cookie";

/** Read the cookie. Returns `null` if absent. */
export async function getLastSeenVersion(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(WHATS_NEW_COOKIE)?.value;
    return value ?? null;
  } catch {
    // `cookies()` can throw in static-prerender contexts.
    return null;
  }
}

// Re-export for callers that previously imported these from this file.
// New client-side imports should target `./cookie` directly.
export { WHATS_NEW_COOKIE, WHATS_NEW_MAX_AGE_SECONDS } from "./cookie";
