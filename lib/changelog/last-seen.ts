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

import { cookies } from "next/headers";

const COOKIE = "spacefield-whatsnew-seen";

/** Read the cookie. Returns `null` if absent. */
export async function getLastSeenVersion(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(COOKIE)?.value;
    return value ?? null;
  } catch {
    // `cookies()` can throw in static-prerender contexts.
    return null;
  }
}

/**
 * Cookie name + a year-long max-age + lax + path=/ — exposed as a
 * single string the client can set via `document.cookie`. Server-only
 * helpers can't write cookies from RSC, so we keep this as a constant
 * the client can use.
 */
export const WHATS_NEW_COOKIE = COOKIE;
export const WHATS_NEW_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
