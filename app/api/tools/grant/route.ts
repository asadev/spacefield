import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/app/admin/_lib";

/**
 * POST /api/tools/grant
 *   body: { workspaceId: string, slug: string, granted: boolean }
 *
 * Admin-only. Upserts a per-workspace override row. `granted=true`
 * forces the tool to be installable in this workspace (overrides tier
 * lock); `granted=false` blocks it (overrides tier allow). Either way,
 * the global kill switch in tool_settings still wins.
 */
export async function POST(req: NextRequest) {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { workspaceId?: string; slug?: string; granted?: boolean };
  try {
    body = (await req.json()) as {
      workspaceId?: string;
      slug?: string;
      granted?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const granted = body.granted === true;
  if (!workspaceId || !slug) {
    return NextResponse.json(
      { error: "missing workspaceId or slug" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_tool_grants")
    .upsert(
      {
        workspace_id: workspaceId,
        slug,
        granted,
        granted_by: auth.userId,
      },
      { onConflict: "workspace_id,slug" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/tools/grant
 *   body: { workspaceId: string, slug: string }
 *
 * Admin-only. Removes the per-workspace override; the workspace falls
 * back to its tier's default allow-list.
 */
export async function DELETE(req: NextRequest) {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { workspaceId?: string; slug?: string };
  try {
    body = (await req.json()) as { workspaceId?: string; slug?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!workspaceId || !slug) {
    return NextResponse.json(
      { error: "missing workspaceId or slug" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_tool_grants")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
