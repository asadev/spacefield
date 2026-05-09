import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { checkIsAdmin } from "@/app/admin/_lib";
import type { SurveyRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/surveys
 *   Optional query params:
 *     status=live|draft|archived
 *     limit=100 (default 200, max 500)
 *
 * Returns: { rows: SurveyRow[] }
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

  const admin = createAdminClient();
  let q = admin
    .from("surveys")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status === "live" || status === "draft" || status === "archived") {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: (data ?? []) as SurveyRow[] });
}
