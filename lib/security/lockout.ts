import "server-only";

/* lib/security/lockout.ts — account-lockout helpers.
 *
 * Called from the sign-in handler. The flow is:
 *
 *   1. Sign-in handler receives email + password.
 *   2. Call `isAccountLocked(email)` first — if true, short-circuit
 *      with a 423-style response and link to /auth/locked. This means
 *      we never even invoke Supabase auth for a locked account, so
 *      attackers can't keep pumping requests to refresh their guesses
 *      against the bcrypt verifier.
 *   3. If unlocked, attempt the sign-in. On failure call
 *      `recordAuthFailure(email, req)` which will lock the account
 *      after N failures in M minutes.
 *
 * Defaults: 6 failures / 10 minutes / 30 minute lock. Tunable via
 * env vars so we can dial them up if a campaign hits us.
 *
 *   AUTH_LOCKOUT_THRESHOLD       (default 6)
 *   AUTH_LOCKOUT_WINDOW_MIN      (default 10)
 *   AUTH_LOCKOUT_DURATION_MIN    (default 30)
 *
 * The RPCs are security-definer; we call them via the service-role
 * admin client because the user is by definition unauthenticated at
 * this point.
 */

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const LOCKOUT_DEFAULTS = {
  threshold: 6,
  windowMinutes: 10,
  durationMinutes: 30,
} as const;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function lockoutConfig() {
  return {
    threshold: readInt("AUTH_LOCKOUT_THRESHOLD", LOCKOUT_DEFAULTS.threshold),
    windowMinutes: readInt(
      "AUTH_LOCKOUT_WINDOW_MIN",
      LOCKOUT_DEFAULTS.windowMinutes,
    ),
    durationMinutes: readInt(
      "AUTH_LOCKOUT_DURATION_MIN",
      LOCKOUT_DEFAULTS.durationMinutes,
    ),
  };
}

/** Returns true iff the account is currently locked. */
export async function isAccountLocked(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("is_account_locked", {
    p_email: email,
  });
  if (error) {
    // Fail open on unexpected errors so a buggy DB doesn't lock
    // everyone out. The sign-in handler still does its own
    // password check.
    return false;
  }
  return Boolean(data);
}

/** Alias matching the N3-wiring naming convention. Identical to
 *  `isAccountLocked`. */
export const isLockedOut = isAccountLocked;

/** Locked + the `locked_until` ISO timestamp (or null if unlocked).
 *  Used by the sign-in entry points so we can route the user to
 *  `/auth/locked?until=…` and render a human countdown. */
export interface LockoutState {
  locked: boolean;
  until: string | null;
}

export async function getLockoutState(email: string): Promise<LockoutState> {
  if (!email || !email.includes("@")) return { locked: false, until: null };
  const admin = createAdminClient();
  // We hit the table directly (not the RPC) because we want the
  // `locked_until` timestamp too, not just the boolean. `account_lockouts`
  // is service-role-only so this is safe.
  const { data, error } = await admin
    .from("account_lockouts")
    .select("locked_until")
    .eq("email_lower", email.toLowerCase())
    .maybeSingle();
  if (error || !data) return { locked: false, until: null };
  const untilMs = Date.parse(data.locked_until as string);
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    return { locked: false, until: null };
  }
  return { locked: true, until: new Date(untilMs).toISOString() };
}

export interface RecordFailureContext {
  ipHash?: string | null;
  uaHash?: string | null;
}

/** Records a failed sign-in attempt. Returns true if the account just
 *  got locked as a result of this attempt. */
export async function recordAuthFailure(
  email: string,
  ctx: RecordFailureContext = {},
): Promise<boolean> {
  const admin = createAdminClient();
  const cfg = lockoutConfig();
  const { data, error } = await admin.rpc("record_auth_failure", {
    p_email: email,
    p_ip_hash: ctx.ipHash ?? null,
    p_ua_hash: ctx.uaHash ?? null,
    p_threshold: cfg.threshold,
    p_window_min: cfg.windowMinutes,
    p_lock_min: cfg.durationMinutes,
  });
  if (error) return false;
  return Boolean(data);
}

/** Clears any active lockout + failure history. Call after a
 *  successful sign-in or a verified reset-link click. */
export async function clearLockout(email: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("clear_account_lockout", { p_email: email });
}

/** Hash an IP / UA string with a server-side secret so we can store a
 *  fingerprint without keeping the plaintext. Returns the first 16 hex
 *  chars of SHA-256(`${secret}:${value}`).
 *
 *  Uses `AUTH_FINGERPRINT_SECRET` if set; otherwise falls back to
 *  `SUPABASE_SERVICE_ROLE_KEY` (always present in our deploy). Pure
 *  function so the sign-in handler and the suspicious-login scanner
 *  agree on the same fingerprint. */
export function hashFingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  const secret =
    process.env.AUTH_FINGERPRINT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!secret) return null;
  return createHash("sha256")
    .update(`${secret}:${value}`)
    .digest("hex")
    .slice(0, 16);
}
