import "server-only";

/* lib/security/suspicious-login.ts — new-device sign-in detection.
 *
 * The `record_login` RPC (security definer) is called by the sign-in
 * handler. It writes a `login_events` row with `alerted = true` when
 * the (ip_hash, ua_hash) combo has not been seen for that user in the
 * last 60 days. This module is the consumer:
 *
 *   scanAndNotify() — invoked by /api/cron/suspicious-login-scan every
 *   15 minutes. Picks up rows where `alerted = true` AND `notified_at
 *   IS NULL`, emits an in-app notification per row, and (eventually) a
 *   transactional email. The DB row is marked `notified_at = now()` so
 *   the next run skips it.
 *
 * Hashing convention: `ip_hash` / `ua_hash` are short prefixes of a
 * SHA-256 over `${secret}:${value}`, never raw. The sign-in handler is
 * responsible for the hashing — we never see the plaintext.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/collab/notifications";
import { hashFingerprint } from "@/lib/security/lockout";
import { log } from "@/lib/log";

interface PendingAlert {
  id: number;
  user_id: string;
  ip_hash: string | null;
  ua_hash: string | null;
  occurred_at: string;
}

interface ScanResult {
  scanned: number;
  notified: number;
  errors: number;
  emailed: number;
}

/** How many events to process per cron tick. The cron runs every 15
 *  minutes so 200 is plenty under normal load and prevents one
 *  pathological run from holding the function open. */
const MAX_PER_RUN = 200;

export async function scanAndNotify(): Promise<ScanResult> {
  const admin = createAdminClient();
  const result: ScanResult = { scanned: 0, notified: 0, errors: 0, emailed: 0 };

  const { data, error } = await admin
    .from("login_events")
    .select("id, user_id, ip_hash, ua_hash, occurred_at")
    .eq("alerted", true)
    .is("notified_at", null)
    .order("occurred_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    throw new Error(`suspicious-login scan: ${error.message}`);
  }

  const pending = (data ?? []) as PendingAlert[];
  result.scanned = pending.length;

  for (const ev of pending) {
    try {
      await createNotification({
        recipientUserId: ev.user_id,
        kind: "auth.suspicious_login",
        title: "New sign-in detected",
        body: buildBody(ev),
        href: "/settings/security",
        payload: {
          login_event_id: ev.id,
          ip_hash: ev.ip_hash,
          ua_hash: ev.ua_hash,
          occurred_at: ev.occurred_at,
        },
      });
      result.notified += 1;

      // TODO: integrate Resend/Postmark for the email side. The
      // in-app notification + admin/auth-events surface still fires.
      // When wired, increment result.emailed on success.

      const { error: markErr } = await admin.rpc("mark_login_event_notified", {
        p_id: ev.id,
      });
      if (markErr) {
        // We already created the notification; if marking fails we'd
        // re-notify on the next run. Surface as an error but keep
        // going so one stuck row doesn't block the rest.
        result.errors += 1;
      }
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

function buildBody(ev: PendingAlert): string {
  // Hashes are deliberately short and not human-friendly; we show a
  // truncated fingerprint so the user has *something* to compare
  // against without leaking the secret-keyed hash in full.
  const fp = (ev.ip_hash ?? ev.ua_hash ?? "").slice(0, 10) || "unknown";
  const when = formatWhen(ev.occurred_at);
  return `From device ${fp} on ${when}. If this wasn't you, sign out everywhere and reset your password.`;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toUTCString();
  } catch {
    return iso;
  }
}

/* recordLogin — invoked from /auth/callback after a session is
 * established. Hashes the raw IP / UA with the server-side secret,
 * then calls the `record_login` RPC as the authenticated user (which
 * is how the RPC pins the row to auth.uid()).
 *
 * Fire-and-forget by contract: the caller awaits but never branches on
 * the return value — a transient DB error must never block a sign-in
 * redirect. We swallow errors and route them through `log.warn` so
 * they're visible in production logs without breaking the user flow.
 */
export interface RecordLoginArgs {
  /** The supabase user.id of the just-signed-in user. Currently only
   *  used for log correlation — the RPC itself reads `auth.uid()`. */
  user_id: string;
  /** Raw IP. Hashed in this function; never sent to the DB plaintext. */
  ip: string | null | undefined;
  /** Raw User-Agent header. Same hashing treatment as `ip`. */
  ua: string | null | undefined;
  /** A Supabase client with the *user's* cookies attached. Required —
   *  `record_login` is security-definer but checks `auth.uid()`, so we
   *  must call it as the user, not the service role. */
  supabase: SupabaseClient;
}

export async function recordLogin(args: RecordLoginArgs): Promise<void> {
  const { user_id, ip, ua, supabase } = args;
  try {
    const ipHash = hashFingerprint(ip ?? null);
    const uaHash = hashFingerprint(ua ?? null);
    const { error } = await supabase.rpc("record_login", {
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
    });
    if (error) {
      log.warn("auth.record_login_failed", {
        user_id,
        rpc_error: error.message,
      });
    }
  } catch (err) {
    log.warn(
      "auth.record_login_exception",
      { user_id },
    );
    void err;
  }
}
