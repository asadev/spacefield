/* GET /api/agent/permissions?workspace_id=…
 *
 * Returns the full skill catalog with the effective mode per row, including
 * the workspace shape (personal vs team) so the Settings UI can render
 * tier-aware defaults inline.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_SKILLS } from "@/lib/agent/skills";
import {
  defaultModeFor,
  loadPermissions,
} from "@/lib/agent/runtime/permissions";

interface SkillRow {
  skill_id: string;
  label: string;
  description: string;
  mode: "allow" | "confirm" | "deny";
  is_default: boolean;
  has_writes: boolean;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  const { data: mem } = await createAdminClient()
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const snapshot = await loadPermissions(supabase, workspaceId);

  const rows: SkillRow[] = ALL_SKILLS.map((s) => {
    const hasWrites = s.tools.some((t) => !t.read_only);
    const explicit = snapshot.overrides[s.id];
    const effective =
      explicit ?? defaultModeFor(snapshot.shape, !hasWrites);
    return {
      skill_id: s.id,
      label: s.label,
      description: s.description,
      mode: effective,
      is_default: !explicit,
      has_writes: hasWrites,
    };
  });

  return NextResponse.json({
    workspace_shape: snapshot.shape,
    skills: rows,
  });
}
