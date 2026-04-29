/* PUT /api/agent/permissions/[skillId]
 *
 * Body: { workspace_id, mode: 'allow'|'confirm'|'deny' }
 *
 * Upserts the per-skill permission row. Admin/owner only — RLS enforces,
 * we 403 here for cleaner messaging. DELETE removes the explicit row,
 * letting the runtime fall back to its tier-aware default.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALL_SKILLS } from "@/lib/agent/skills";

interface PutBody {
  workspace_id?: string;
  mode?: string;
}

async function authAndRole(req: NextRequest, workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      role: null as null | string,
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const { data: mem } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (mem?.role as string | undefined) ?? null;
  if (role !== "owner" && role !== "admin") {
    return {
      supabase,
      user,
      role,
      error: NextResponse.json({ error: "admin_only" }, { status: 403 }),
    };
  }
  return { supabase, user, role, error: null };
}

function validSkill(skillId: string): boolean {
  return ALL_SKILLS.some((s) => s.id === skillId);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { skillId } = await params;
  if (!validSkill(skillId)) {
    return NextResponse.json({ error: "unknown_skill" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as PutBody;
  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  const mode = body.mode;
  if (mode !== "allow" && mode !== "confirm" && mode !== "deny") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }
  const auth = await authAndRole(req, workspaceId);
  if (auth.error || !auth.user) return auth.error!;

  const { error } = await auth.supabase.from("agent_permissions").upsert(
    {
      workspace_id: workspaceId,
      skill_id: skillId,
      mode,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,skill_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ skill_id: skillId, mode });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { skillId } = await params;
  if (!validSkill(skillId)) {
    return NextResponse.json({ error: "unknown_skill" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  const auth = await authAndRole(req, workspaceId);
  if (auth.error) return auth.error;

  const { error } = await auth.supabase
    .from("agent_permissions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("skill_id", skillId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, skill_id: skillId });
}
