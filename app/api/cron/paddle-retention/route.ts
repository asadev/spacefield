import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/paddle-retention
 *
 * SA-005 — daily prune of `paddle_webhook_events` rows older than 90
 * days that have `processed_at IS NOT NULL`. Unprocessed rows stay so
 * a rerun can still pick them up; only confirmed-processed history is
 * thrown away.
 *
 * Wired in vercel.json to run daily at 05:00 UTC. Auth: see
 * lib/cron/_check_enabled.ts → requireCron (timing-safe Bearer /
 * ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

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
