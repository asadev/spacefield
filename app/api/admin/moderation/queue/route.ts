import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/moderation/queue?status=pending&source=...&rule_id=...&sev_min=1&sev_max=5
 *
 * Admin-only JSON read of `moderation_queue`. Mirrors the filters on the
 * `/admin/moderation/queue` page.
 */
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const source = sp.get("source");
  const ruleId = sp.get("rule_id");
  const sevMinRaw = sp.get("sev_min");
  const sevMaxRaw = sp.get("sev_max");
  const limitRaw = sp.get("limit");

  const sevMin = clampInt(sevMinRaw, 1, 5, 1);
  const sevMax = clampInt(sevMaxRaw, 1, 5, 5);
  const limit = Math.min(500, Math.max(1, Number(limitRaw) || 100));

  const admin = createAdminClient();
  let query = admin
    .from("moderation_queue")
    .select("*")
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (ruleId) query = query.eq("rule_id", ruleId);
  query = query.gte("severity", sevMin).lte("severity", sevMax);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
