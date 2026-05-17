import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/paddle-retention
 *
 * SA-005 — daily prune of `paddle_webhook_events` rows older than 90
 * days that have `processed_at IS NOT NULL`. Unprocessed rows stay so
 * a rerun can still pick them up; only confirmed-processed history is
 * thrown away.
 *
 * Wired in vercel.json to run daily at 05:00 UTC. Same auth pattern as
 * /api/cron/audit-purge:
 *   - `Authorization: Bearer <CRON_SECRET>` (manual / staging)
 *   - `vercel-cron/1.0` user-agent (Vercel scheduled invocation)
 *   - `x-vercel-cron` header set
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
  const { data, error } = await admin.rpc("purge_old_paddle_events", {
    p_older_than_days: RETENTION_DAYS,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, retention_days: RETENTION_DAYS },
      { status: 500 },
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
