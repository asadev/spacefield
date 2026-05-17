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

import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/collab/notifications";

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
