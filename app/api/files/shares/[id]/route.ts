import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* /api/files/shares/[id]
 *
 *   PATCH  body { permission?, message? }
 *          Source-workspace-member-only — RLS enforces. Use to flip a
 *          share between view/edit or update its message.
 *
 *   DELETE Source-workspace-member-only — RLS enforces. Revokes the
 *          share. The target workspace will lose access immediately.
 */

interface PatchBody {
  permission?: unknown;
  message?: unknown;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: { permission?: "view" | "edit"; message?: string | null } = {};
  if (body.permission === "view" || body.permission === "edit") {
    update.permission = body.permission;
  }
  if (typeof body.message === "string") {
    const trimmed = body.message.trim();
    update.message = trimmed.length > 0 ? trimmed.slice(0, 200) : null;
  } else if (body.message === null) {
    update.message = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "nothing to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("workspace_file_shares")
    .update(update)
    .eq("id", id)
    .select(
      "id, file_id, source_workspace_id, target_workspace_id, shared_by, permission, message, created_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    // RLS-blocked or no row — same shape as a 404 either way.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ share: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_file_shares")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
