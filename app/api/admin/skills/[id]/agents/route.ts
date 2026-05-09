import { NextResponse } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/skills/[id]/agents
 *
 * Admin-only. Returns the agents that have this skill in their
 * `allowed_skills` list. Sorted by status then display name so the live
 * ones float to the top.
 */
export async function GET(
  _req: Request,
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_agents")
    .select(
      "id, display_name, kind, model, status, allowed_skills, sort_order, updated_at"
    )
    .filter("allowed_skills", "cs", JSON.stringify([skillId]))
    .order("status", { ascending: true })
    .order("display_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ skill_id: skillId, agents: data ?? [] });
}
