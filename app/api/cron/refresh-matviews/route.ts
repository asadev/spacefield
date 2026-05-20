import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/cron/refresh-matviews
 *
 * Wired in vercel.json to run daily (06:30 UTC, between audit-purge and
 * slow-queries-snapshot). Refreshes the two scalability materialised
 * views via the public.refresh_scale_matviews() RPC, which itself uses
 * REFRESH MATERIALIZED VIEW CONCURRENTLY so readers are never blocked.
 *
 * Matviews refreshed:
 *   - public.ai_cost_daily      (per workspace x day x model)
 *   - public.api_latency_hourly (per source x hour with p50/p95/p99)
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron (timing-safe
 * Bearer / ?token= against CRON_SECRET; hard-fails when unset).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const startedAt = Date.now();
  const { error } = await admin.rpc("refresh_scale_matviews");

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

  return NextResponse.json({
    ok: true,
    refreshed: ["ai_cost_daily", "api_latency_hourly"],
    duration_ms: Date.now() - startedAt,
  });
}
