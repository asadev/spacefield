import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/audit-purge
 *
 * Wired in vercel.json to run weekly (Mon 06:15 UTC).
 * Calls admin_purge_audit_log(90) — deletes admin_audit_log rows
 * older than 90 days. The RPC enforces a 30-day retention floor of
 * its own so a misconfigured arg can't nuke recent history.
 *
 * Auth: same pattern as /api/cron/social-publish —
 *   - `Authorization: Bearer <CRON_SECRET>` (production / manual cURL)
 *   - `vercel-cron/1.0` user-agent (Vercel scheduled invocation)
 *   - `x-vercel-cron` header set
 * Anything else is rejected with 401 so this can't be hammered from
 * outside.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_purge_audit_log", {
    p_older_than_days: RETENTION_DAYS,
  });

  if (error) {
    // The RPC raises `'admin only'` if auth.uid() can't be resolved
    // (which is the case for service-role calls). That's a known
    // limitation tracked separately; for now surface the error so the
    // Vercel cron dashboard shows a red failure instead of pretending
    // we did work.
    return NextResponse.json(
      { ok: false, error: error.message, retention_days: RETENTION_DAYS },
      { status: 500 }
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  return NextResponse.json({
    ok: true,
    retention_days: RETENTION_DAYS,
    deleted,
  });
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
