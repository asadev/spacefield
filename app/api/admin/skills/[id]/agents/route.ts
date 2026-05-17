import { NextResponse } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
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
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.skills.agents.auth",
          fallback: "forbidden",
        }),
      },
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
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.skills.agents.list",
          userId: auth.userId,
          fallback: "skill_agents_list_failed",
        }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ skill_id: skillId, agents: data ?? [] });
}
