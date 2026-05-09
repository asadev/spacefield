import { NextResponse } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { readCodeSkillTools, readSkillSource } from "@/lib/agent/skills/_inspector";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/skills/[id]/source
 *
 * Admin-only. Returns the on-disk TypeScript source for a code-defined
 * skill, plus a snapshot of the tool definitions exported by the skill
 * registry. Used by the admin panel's source-code panel and the
 * overrides UI.
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
  const { data: row, error } = await admin
    .from("ai_skills")
    .select("id, kind, handler_module, display_name")
    .eq("id", skillId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }

  const source = await readSkillSource(skillId, row.handler_module ?? null);
  const tools = await readCodeSkillTools(skillId);

  return NextResponse.json({
    skill_id: skillId,
    kind: row.kind,
    handler_module: row.handler_module,
    found: !!source,
    path: source?.relPath ?? null,
    source: source?.source ?? null,
    registry: tools, // null when not statically wired
  });
}
