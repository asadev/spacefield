import { NextResponse, type NextRequest } from "next/server";

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
 * Auth: matches /api/cron/audit-purge — CRON_SECRET bearer, vercel-cron
 * UA, or x-vercel-cron header. Anything else 401s.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
