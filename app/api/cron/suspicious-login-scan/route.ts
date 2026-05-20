import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { safeErrorMessage } from "@/lib/safe-error";
import { scanAndNotify } from "@/lib/security/suspicious-login";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { suspiciousLoginEmail } from "@/lib/email/templates/suspicious-login";
import { log } from "@/lib/log";

/* GET /api/cron/suspicious-login-scan
 *
 * Reads `login_events` rows that record_login already flagged as new
 * device/IP (alerted = true) and emits in-app notifications for the
 * ones we haven't notified about yet. Runs every 15 minutes — slow
 * enough not to spam, fast enough that the user gets an alert
 * minutes after the sign-in.
 *
 * Two passes:
 *   1. `scanAndNotify()` (lib/security/suspicious-login) creates the
 *      in-app notification and marks `notified_at`.
 *   2. `emailAlertedLogins()` (below, owned by this route) picks up
 *      rows where the in-app pass succeeded but the email pass
 *      hasn't fired, checks the user's email-channel pref, and calls
 *      `sendEmail()`. Then marks `email_sent_at` so the next tick
 *      skips it.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://spacefield.co";
/** Cap per tick — same rationale as MAX_PER_RUN in scanAndNotify. */
const EMAIL_MAX_PER_RUN = 200;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const inApp = await scanAndNotify();
    const email = await emailAlertedLogins();
    return NextResponse.json({
      ok: true,
      // Preserve the existing top-level shape for any callers that
      // assert on `scanned`/`notified`/`errors`.
      ...inApp,
      email,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.suspicious_login_scan",
          fallback: "scan_failed",
        }),
      },
      { status: 500 },
    );
  }
}

/* ─────────────────────── email pass ─────────────────────── */

interface PendingEmail {
  id: number;
  user_id: string;
  ip_hash: string | null;
  ua_hash: string | null;
  occurred_at: string;
}

interface EmailPassResult {
  scanned: number;
  sent: number;
  skipped_no_pref: number;
  skipped_no_email: number;
  errors: number;
}

async function emailAlertedLogins(): Promise<EmailPassResult> {
  const admin = createAdminClient();
  const result: EmailPassResult = {
    scanned: 0,
    sent: 0,
    skipped_no_pref: 0,
    skipped_no_email: 0,
    errors: 0,
  };

  const { data, error } = await admin
    .from("login_events")
    .select("id, user_id, ip_hash, ua_hash, occurred_at")
    .eq("alerted", true)
    .not("notified_at", "is", null)
    .is("email_sent_at", null)
    .order("occurred_at", { ascending: true })
    .limit(EMAIL_MAX_PER_RUN);

  if (error) {
    throw new Error(`suspicious-login email pass: ${error.message}`);
  }

  const pending = (data ?? []) as PendingEmail[];
  result.scanned = pending.length;

  for (const ev of pending) {
    try {
      // 1. Email-channel preference. Default is ON (true) when there's
      //    no row — see notification_prefs column default.
      const prefRes = await admin
        .from("notification_prefs")
        .select("email_suspicious_login")
        .eq("user_id", ev.user_id)
        .maybeSingle();
      const allowEmail =
        (prefRes.data?.email_suspicious_login as boolean | null | undefined) ??
        true;

      if (!allowEmail) {
        result.skipped_no_pref += 1;
        await markEmailSent(admin, ev.id);
        continue;
      }

      // 2. Resolve recipient email. Service-role can read auth.users.
      const userRes = await admin.auth.admin.getUserById(ev.user_id);
      const toAddr = userRes.data?.user?.email ?? null;
      const displayName =
        (userRes.data?.user?.user_metadata?.full_name as
          | string
          | undefined) ?? null;

      if (!toAddr) {
        result.skipped_no_email += 1;
        await markEmailSent(admin, ev.id);
        continue;
      }

      // 3. Build + send.
      const fingerprint = (ev.ip_hash ?? ev.ua_hash ?? "").slice(0, 10);
      const { subject, html, text } = suspiciousLoginEmail({
        name: displayName,
        occurredAt: ev.occurred_at,
        fingerprint,
        securityUrl: `${SITE_ORIGIN}/account/security`,
      });

      const sendRes = await sendEmail({
        to: toAddr,
        subject,
        html,
        text,
        kind: "suspicious-login",
      });

      if (sendRes.ok) {
        result.sent += 1;
        await markEmailSent(admin, ev.id);
      } else {
        // Outbox already has a row from sendEmail's failure path; log
        // and leave email_sent_at null so a future retry can pick it
        // up if/when we wire one.
        result.errors += 1;
        log.warn("suspicious_login.email_send_failed", {
          login_event_id: ev.id,
          provider: sendRes.provider,
          error: sendRes.error,
        });
      }
    } catch (e) {
      result.errors += 1;
      log.error(
        "suspicious_login.email_pass_exception",
        { login_event_id: ev.id },
        e,
      );
    }
  }

  return result;
}

async function markEmailSent(
  admin: ReturnType<typeof createAdminClient>,
  id: number,
): Promise<void> {
  const { error } = await admin
    .from("login_events")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    log.warn("suspicious_login.mark_email_sent_failed", {
      login_event_id: id,
      msg: error.message,
    });
  }
}

