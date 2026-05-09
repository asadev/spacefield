import { NextResponse } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/skills/[id]/runs?limit=50
 *
 * Admin-only. Returns the most recent ai_agent_runs that mention this
 * skill — best-effort match on metadata->>'skill_id' and on the input
 * excerpt. Returns a flat list (newest first) plus a per-day grouping
 * with a success rate, ready for the admin panel's runs section.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const skillId = decodeURIComponent(id);

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const admin = createAdminClient();

  // Two strategies, OR'd in JS:
  //   1. metadata->>'skill_id' = '<id>'   — preferred when the runtime tags
  //   2. input_excerpt ILIKE '%<id>%'     — fallback substring match
  const sanitized = skillId.replace(/[%_\\]/g, "\\$&");
  const { data: tagged, error: tagErr } = await admin
    .from("ai_agent_runs")
    .select(
      "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, model, duration_ms, created_at"
    )
    .filter("metadata->>skill_id", "eq", skillId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (tagErr) {
    return NextResponse.json({ error: tagErr.message }, { status: 500 });
  }

  let rows = tagged ?? [];
  if (rows.length < limit) {
    const remaining = limit - rows.length;
    const { data: substring } = await admin
      .from("ai_agent_runs")
      .select(
        "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, model, duration_ms, created_at"
      )
      .ilike("input_excerpt", `%${sanitized}%`)
      .order("created_at", { ascending: false })
      .limit(remaining * 2); // pull extra to dedupe against tagged
    if (substring) {
      const seen = new Set(rows.map((r) => r.id));
      for (const r of substring) {
        if (seen.has(r.id)) continue;
        rows.push(r);
        seen.add(r.id);
        if (rows.length >= limit) break;
      }
      // Re-sort: tagged hits should still be ordered by recency, mixed with substring hits.
      rows = rows
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);
    }
  }

  // Group by day (UTC) and compute success rate per group.
  type Row = (typeof rows)[number];
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const day = String(r.created_at).slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(r);
    byDay.set(day, list);
  }
  const days = Array.from(byDay.entries())
    .map(([day, list]) => {
      const ok = list.filter((r) => r.status === "success").length;
      return {
        day,
        total: list.length,
        ok,
        success_rate: list.length === 0 ? 0 : ok / list.length,
      };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  const successTotal = rows.filter((r) => r.status === "success").length;

  return NextResponse.json({
    skill_id: skillId,
    total: rows.length,
    success: successTotal,
    success_rate: rows.length === 0 ? 0 : successTotal / rows.length,
    days,
    runs: rows,
  });
}
