import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/partition-rotator
 *
 * Wired in vercel.json to run daily (06:50 UTC). Calls
 * public.create_next_month_partitions() which materialises next
 * month's partition on every partitioned scaffold introduced in
 * 20260518e_db_scale.sql:
 *
 *   - api_latency_partitioned
 *   - ai_calls_partitioned
 *   - login_events_partitioned
 *   - auth_failures_partitioned
 *
 * The RPC is idempotent (create table if not exists) so running it
 * daily costs nothing once next month's partition exists.
 *
 * NOTE: the scaffolds are not yet authoritative — the legacy tables
 * still receive all production writes. Once Asad runs the swap
 * documented at the top of 20260518e_db_scale.sql, the rotator
 * automatically keeps the live tables ahead by one month.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CreatedRow = {
  parent_table: string;
  month_added: string;
};

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const startedAt = Date.now();
  const { data, error } = await admin.rpc("create_next_month_partitions");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }

  const rows: CreatedRow[] = Array.isArray(data) ? (data as CreatedRow[]) : [];

  return NextResponse.json({
    ok: true,
    created: rows,
    count: rows.length,
    duration_ms: Date.now() - startedAt,
  });
}
