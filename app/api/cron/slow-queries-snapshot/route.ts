import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/slow-queries-snapshot
 *
 * Wired in vercel.json to run weekly (Mon 06:45 UTC).
 * Reads the top 50 slow queries via admin_slow_queries(50) and
 * persists every row to public.slow_query_snapshots so we keep a
 * longitudinal history that survives pg_stat_statements_reset().
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAMPLE_LIMIT = 50;

type SlowQueryRow = {
  query: string;
  calls: number | null;
  mean_exec_time: number | null;
  total_exec_time: number | null;
  rows: number | null;
};

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_slow_queries", {
    limit_n: SAMPLE_LIMIT,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, sample_limit: SAMPLE_LIMIT },
      { status: 500 }
    );
  }

  const rows: SlowQueryRow[] = Array.isArray(data) ? (data as SlowQueryRow[]) : [];
  if (rows.length === 0) {
    // Either pg_stat_statements isn't loaded or the gating denied us.
    // Both are recorded as a zero-row snapshot so the cron history
    // doesn't show a gap.
    return NextResponse.json({ ok: true, captured: 0, reason: "no_rows" });
  }

  const capturedAt = new Date().toISOString();
  const payload = rows.map((r) => ({
    query: r.query,
    calls: r.calls,
    mean_exec_time: r.mean_exec_time,
    total_exec_time: r.total_exec_time,
    rows: r.rows,
    captured_at: capturedAt,
  }));

  const { error: insertError } = await admin
    .from("slow_query_snapshots")
    .insert(payload);

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message, captured: 0 },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    captured: payload.length,
    captured_at: capturedAt,
  });
}
