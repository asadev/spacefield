import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/audit-purge
 *
 * Wired in vercel.json to run weekly (Mon 06:15 UTC).
 * Calls admin_purge_audit_log(90) — deletes admin_audit_log rows
 * older than 90 days. The RPC enforces a 30-day retention floor of
 * its own so a misconfigured arg can't nuke recent history.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

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
