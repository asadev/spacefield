import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import {
  buildEffectiveTools,
  loadAgentToolOverrides,
  loadSkillsForAgent,
} from "@/app/admin/agents/_data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agents/[id]/tools
 *
 * Returns the agent's *effective* tool list — the union of every tool
 * exposed by skills in `allowed_skills`, with per-agent overrides
 * (`agent_tool_overrides`) applied. The same join is what the runtime
 * uses to decide what tools to advertise to a model turn, so this
 * endpoint is the canonical source for "what can this agent do today?".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: agent, error: agentErr } = await admin
    .from("ai_agents")
    .select("id, allowed_skills")
    .eq("id", id)
    .maybeSingle();

  if (agentErr) {
    return NextResponse.json({ error: agentErr.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json(
      { error: `agent "${id}" not found` },
      { status: 404 }
    );
  }

  const allowedSkills = Array.isArray(
    (agent as { allowed_skills?: unknown }).allowed_skills
  )
    ? ((agent as { allowed_skills: string[] }).allowed_skills)
    : [];

  const [skills, overrides] = await Promise.all([
    loadSkillsForAgent(allowedSkills),
    loadAgentToolOverrides(id),
  ]);

  const effective = buildEffectiveTools(skills, overrides);

  return NextResponse.json({
    ok: true,
    agent_id: id,
    tools: effective,
    counts: {
      skills: skills.length,
      tools: effective.length,
      overrides: overrides.length,
      disabled: effective.filter((t) => !t.enabled).length,
    },
  });
}
