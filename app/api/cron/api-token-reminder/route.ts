/* /api/cron/api-token-reminder — daily.
 *
 * Finds API tokens with `expires_at` in the next 14 days that have
 * not already been reminded (or whose previous reminder is older than
 * 16 days, allowing a second nudge as the deadline closes). For each
 * eligible token, look up the owner's email and send a one-shot
 * "your token expires on <date>" message. Stamp
 * `api_tokens.expiry_reminder_sent_at = now()` so the next run
 * doesn't spam.
 *
 * Auth: same pattern as /api/cron/stuck-jobs-detect (CRON_SECRET
 * bearer, vercel-cron UA, or x-vercel-cron header).
 *
 * Why daily + idempotent stamping: a 14-day window with a daily
 * scan means each token gets at most two reminders — one when it
 * first enters the window and one final reminder ~16+ days later
 * if the user hasn't acted. That's enough of a nudge without
 * becoming an inbox-clogging cron loop.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { log } from "@/lib/log";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_DAYS = 14;
const REMINDER_COOLDOWN_DAYS = 16;
const MAX_PER_RUN = 200;

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  expires_at: string;
  expiry_reminder_sent_at: string | null;
  workspace_id: string | null;
}

interface UserSlim {
  id: string;
  email: string | null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
    const cooldownCutoff = new Date(
      now.getTime() - REMINDER_COOLDOWN_DAYS * 86_400_000
    );

    // Tokens about to expire — service-role read bypasses RLS.
    // Filter:
    //   - not revoked
    //   - expires_at in [now, now + WINDOW_DAYS]
    //   - never reminded OR last reminder >COOLDOWN_DAYS ago
    const { data, error } = await admin
      .from("api_tokens")
      .select(
        "id, user_id, name, prefix, expires_at, expiry_reminder_sent_at, workspace_id"
      )
      .is("revoked_at", null)
      .not("expires_at", "is", null)
      .gte("expires_at", now.toISOString())
      .lte("expires_at", windowEnd.toISOString())
      .order("expires_at", { ascending: true })
      .limit(MAX_PER_RUN);

    if (error) {
      log.error("cron.api_token_reminder.query_failed", {
        error: error.message,
      });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as TokenRow[];
    const eligible = rows.filter((r) => {
      if (!r.expiry_reminder_sent_at) return true;
      return new Date(r.expiry_reminder_sent_at).getTime() <= cooldownCutoff.getTime();
    });

    if (eligible.length === 0) {
      return NextResponse.json({
        ok: true,
        considered: rows.length,
        emailed: 0,
        skipped_cooldown: rows.length,
      });
    }

    // Resolve emails in one call via the auth admin API. We grab the
    // distinct user ids and look each up — there's no admin bulk-by-id
    // endpoint, so we do it serially. Eligible counts are typically
    // small (a handful per day at platform scale) so this is fine.
    const userIds = Array.from(new Set(eligible.map((r) => r.user_id)));
    const userMap = await fetchAuthUsers(userIds);

    let emailed = 0;
    const stampedIds: string[] = [];

    for (const row of eligible) {
      const user = userMap.get(row.user_id);
      if (!user?.email) {
        // No email = can't notify. Stamp anyway so we don't re-check.
        stampedIds.push(row.id);
        continue;
      }
      const daysLeft = Math.max(
        0,
        Math.ceil(
          (new Date(row.expires_at).getTime() - now.getTime()) / 86_400_000
        )
      );
      const result = await sendEmail({
        to: user.email,
        subject: `Your Space Field API token "${row.name}" expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        html: renderHtml({
          tokenName: row.name,
          prefix: row.prefix,
          daysLeft,
          expiresAt: row.expires_at,
        }),
        text: renderText({
          tokenName: row.name,
          prefix: row.prefix,
          daysLeft,
          expiresAt: row.expires_at,
        }),
        kind: "api-token-expiry",
        user_id: row.user_id,
        workspace_id: row.workspace_id,
      });
      if (result.ok) {
        emailed += 1;
        stampedIds.push(row.id);
      } else {
        log.warn("cron.api_token_reminder.send_failed", {
          token_id: row.id,
          provider: result.provider,
          error: result.error,
        });
      }
    }

    if (stampedIds.length > 0) {
      const { error: stampErr } = await admin
        .from("api_tokens")
        .update({ expiry_reminder_sent_at: new Date().toISOString() })
        .in("id", stampedIds);
      if (stampErr) {
        log.warn("cron.api_token_reminder.stamp_failed", {
          error: stampErr.message,
          count: stampedIds.length,
        });
      }
    }

    log.info("cron.api_token_reminder.run", {
      considered: rows.length,
      eligible: eligible.length,
      emailed,
      stamped: stampedIds.length,
    });

    return NextResponse.json({
      ok: true,
      considered: rows.length,
      eligible: eligible.length,
      emailed,
      stamped: stampedIds.length,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "cron.api_token_reminder",
          fallback: "scan_failed",
        }),
      },
      { status: 500 }
    );
  }
}

/* ─────────────────────── helpers ─────────────────────── */

async function fetchAuthUsers(
  userIds: string[]
): Promise<Map<string, UserSlim>> {
  const map = new Map<string, UserSlim>();
  if (userIds.length === 0) return map;
  const admin = createAdminClient();
  for (const id of userIds) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) continue;
      map.set(id, { id: data.user.id, email: data.user.email ?? null });
    } catch {
      // skip on lookup error — we'll just not email this one
    }
  }
  return map;
}

interface RenderArgs {
  tokenName: string;
  prefix: string;
  daysLeft: number;
  expiresAt: string;
}

function renderHtml(a: RenderArgs): string {
  const human = new Date(a.expiresAt).toUTCString();
  return `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 12px;">API token expiring soon</h2>
  <p>Your Space Field API token <strong>${escapeHtml(a.tokenName)}</strong> (prefix <code>${escapeHtml(a.prefix)}</code>) will expire in <strong>${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}</strong>.</p>
  <p>Expires at: <code>${human}</code></p>
  <p>If you still need this token, mint a fresh one from your account settings and update any client that uses the old token. The old token will stop working at the expiry timestamp above.</p>
  <p style="color:#666; font-size: 13px; margin-top: 28px;">— Space Field</p>
</body></html>`.trim();
}

function renderText(a: RenderArgs): string {
  const human = new Date(a.expiresAt).toUTCString();
  return [
    `Your Space Field API token "${a.tokenName}" (prefix ${a.prefix}) expires in ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}.`,
    ``,
    `Expires at: ${human}`,
    ``,
    `If you still need this token, mint a fresh one and update your clients. The old token will stop working at the expiry timestamp above.`,
    ``,
    `— Space Field`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAuthorizedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("vercel-cron")) return true;
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}
