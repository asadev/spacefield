import "server-only";

import { cookies } from "next/headers";

/**
 * Server-side helpers for the cookie consent banner.
 *
 * The banner is the source of truth on the client (localStorage), but we
 * also mirror the choice into an HTTP-only cookie so SSR can render the
 * page consistently on the first paint (no banner flash for users who
 * already accepted).
 *
 * Storage key: `spacefield-cookie-consent`
 * Possible values: `"all"`, `"essential"`, or null (no decision yet).
 */

export type CookieConsentValue = "all" | "essential";

const COOKIE_NAME = "spacefield-cookie-consent";
// 12 months — covers a typical product cycle without forcing re-consent.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Read the current consent choice from the request cookies. Returns null
 * when the user has not made a choice yet — caller should render the
 * banner.
 */
export async function getConsentCookie(): Promise<CookieConsentValue | null> {
  const store = await cookies();
  const v = store.get(COOKIE_NAME)?.value;
  return v === "all" || v === "essential" ? v : null;
}

/**
 * Write the choice into the response cookies. Server Action / Route
 * Handler usage:
 *
 *   import { setConsentCookie } from "@/lib/cookie-consent";
 *   await setConsentCookie("all");
 */
export async function setConsentCookie(value: CookieConsentValue): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: false, // client banner needs to read it too
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
