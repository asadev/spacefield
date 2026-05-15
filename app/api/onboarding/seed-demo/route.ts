import { NextResponse, type NextRequest } from "next/server";

import { seedDemoData, wipeDemoData } from "@/lib/onboarding/seed-demo";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace onboarding — sample demo-data seeder.
 *
 *   POST   /api/onboarding/seed-demo { workspace_id }
 *      → inserts ~30 demo rows tagged with `__demo__`
 *
 *   DELETE /api/onboarding/seed-demo { workspace_id }
 *      → removes everything tagged `__demo__` and drops the tag
 *
 * Gated to workspace admin/owner so a curious member can't randomly
 * dump demo rows into a real workspace.
 */

async function assertWorkspaceAdmin(
  workspaceId: string
): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  if (member.role !== "admin" && member.role !== "owner") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  return null;
}

interface SeedBody {
  workspace_id?: string;
}

export async function POST(req: NextRequest) {
  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.workspace_id) {
    return NextResponse.json(
      { error: "missing_workspace_id" },
      { status: 400 }
    );
  }
  const guard = await assertWorkspaceAdmin(body.workspace_id);
  if (guard) return guard;

  const result = await seedDemoData(body.workspace_id);
  return NextResponse.json({
    ok: result.ok,
    counts: result.counts,
    errors: result.errors,
  });
}

export async function DELETE(req: NextRequest) {
  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    body = {};
  }
  const { searchParams } = new URL(req.url);
  const workspaceId =
    body.workspace_id ?? searchParams.get("workspace_id") ?? null;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing_workspace_id" },
      { status: 400 }
    );
  }
  const guard = await assertWorkspaceAdmin(workspaceId);
  if (guard) return guard;

  const result = await wipeDemoData(workspaceId);
  return NextResponse.json({
    ok: result.ok,
    deleted: result.deleted,
    errors: result.errors,
  });
}
