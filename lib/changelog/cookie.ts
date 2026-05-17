/**
 * Shared cookie-name + max-age constants for the what's-new modal.
 * Split out of `last-seen.ts` so client components can import them
 * without dragging in `next/headers` (server-only).
 */
export const WHATS_NEW_COOKIE = "spacefield-whatsnew-seen";
export const WHATS_NEW_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
