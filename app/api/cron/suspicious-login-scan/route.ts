import { NextResponse, type NextRequest } from "next/server";

import { scanAndNotify } from "@/lib/security/suspicious-login";

/* GET /api/cron/suspicious-login-scan
 *
 * Reads `login_events` rows that record_login already flagged as new
 * device/IP (alerted = true) and emits in-app notifications for the
 * ones we haven't notified about yet. Runs every 15 minutes — slow
 * enough not to spam, fast enough that the user gets an alert
 * minutes after the sign-in.
 *
 * Same auth pattern as /api/cron/audit-purge:
 *   - `Authorization: Bearer <CRON_SECRET>` (manual / staging)
 *   - `vercel-cron/1.0` user-agent
 *   - `x-vercel-cron` header set
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanAndNotify();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
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
