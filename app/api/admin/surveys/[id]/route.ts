import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { checkIsAdmin } from "@/app/admin/_lib";
import type { SurveyResponseRow, SurveyRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/surveys/[id]
 *   Optional query params:
 *     limit=50 (default 50, max 500) — number of responses to return
 *
 * Returns: { survey: SurveyRow, responses: SurveyResponseRow[] }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));

  const admin = createAdminClient();
  const [{ data: survey }, { data: responses }] = await Promise.all([
    admin.from("surveys").select("*").eq("id", id).maybeSingle(),
    admin
      .from("survey_responses")
      .select("*")
      .eq("survey_id", id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (!survey) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    survey: survey as SurveyRow,
    responses: (responses ?? []) as SurveyResponseRow[],
  });
}
