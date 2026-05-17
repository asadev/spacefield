import "server-only";
import { cookies } from "next/headers";

/* lib/mfa/reauth.ts — "Recent auth" gate for sensitive actions.
 *
 * Pattern lifted from Stripe / GitHub: signing in with a long-lived
 * session is fine for browsing, but destructive operations (account
 * deletion, email change, workspace deletion, MFA enroll/disable,
 * recovery-code regeneration) need a fresh proof-of-presence within
 * the last 10 minutes. The cookie is httpOnly+secure+sameSite=lax and
 * holds the unix-second timestamp of the most recent reauth event.
 *
 * Server actions call `requireRecentAuth(returnTo)` and, if it returns
 * a URL, redirect the user to `/auth/reauth?next=<returnTo>`. That
 * page collects a fresh OTP / TOTP, then calls `setRecentAuthNow()`
 * and redirects back. Callers should never trust this cookie for
 * anything beyond "did the user just prove they're here" — auth.uid()
 * still comes from Supabase's session cookies.
 */

const COOKIE = "spacefield-recent-auth";
export const DEFAULT_MAX_AGE_SEC = 600; // 10 minutes
// Hard cap on the cookie itself so a stale tab doesn't sit at "ready"
// for hours waiting for a click.
const COOKIE_LIFETIME_SEC = 60 * 60;

export async function getRecentAuthAt(): Promise<number | null> {
  try {
    const c = await cookies();
    const v = c.get(COOKIE)?.value;
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function isRecentAuth(maxAgeSec = DEFAULT_MAX_AGE_SEC): Promise<boolean> {
  const at = await getRecentAuthAt();
  if (at === null) return false;
  return Date.now() / 1000 - at < maxAgeSec;
}

/** Returns null if the caller has a recent-auth cookie within
 *  `maxAgeSec`; otherwise returns the URL the caller should redirect
 *  to. The reauth page will bounce back to `returnTo` on success.
 *
 *  `returnTo` MUST start with `/` — anything else is rejected and
 *  replaced with `/`. (Defense in depth against open-redirect.) */
export async function requireRecentAuth(
  returnTo: string,
  maxAgeSec = DEFAULT_MAX_AGE_SEC,
): Promise<string | null> {
  if (await isRecentAuth(maxAgeSec)) return null;
  const safeNext = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/auth/reauth?next=${encodeURIComponent(safeNext)}`;
}

export async function setRecentAuthNow(): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, String(Math.floor(Date.now() / 1000)), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_LIFETIME_SEC,
    path: "/",
  });
}

/** Clear the recent-auth proof, e.g. after the privileged action
 *  completes. Optional — most flows just let the 10-minute window age
 *  out naturally — but useful for "burn after read" interactions like
 *  showing recovery codes. */
export async function clearRecentAuth(): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
