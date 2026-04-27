import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/files/rename
 *   body: { fileId, name }
 *
 * Renames a workspace_files row. The R2 object key intentionally stays
 * unchanged — the key embeds <workspaceId>/<fileId>/<safeName> for path
 * scoping, but presigned download URLs use ResponseContentDisposition
 * with the row's `name` field, so updating the DB column is enough for
 * the user-visible filename to follow.
 *
 * Auth: caller must be a member of the file's workspace (owner self-
 * heal applied like everywhere else). Membership lookup via service-
 * role client to dodge RLS visibility quirks.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fileId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { fileId } = body;
  const trimmed = (body.name ?? "").toString().trim().slice(0, 200);
  if (!fileId || !trimmed) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the file row + verify caller membership.
  const { data: file, error: fileErr } = await admin
    .from("workspace_files")
    .select("id, workspace_id, user_id")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  // Membership check — owner of the workspace OR explicit member row.
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, user_id")
    .eq("id", file.workspace_id)
    .maybeSingle();

  let allowed = false;
  if (ws?.user_id === user.id) {
    allowed = true;
    // Self-heal owner membership in case it's missing.
    await admin.from("workspace_members").upsert(
      {
        workspace_id: file.workspace_id,
        user_id: user.id,
        role: "owner",
        invited_by: user.id,
      },
      { onConflict: "workspace_id,user_id", ignoreDuplicates: false }
    );
  } else {
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", file.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member) allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "not a member of that workspace" },
      { status: 403 }
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("workspace_files")
    .update({ name: trimmed })
    .eq("id", fileId)
    .select(
      "id, name, size_bytes, content_type, created_at, user_id, workspace_id"
    )
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  return NextResponse.json({ file: updated });
}
