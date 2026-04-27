import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2";

/* DELETE /api/files/permanently-delete
 *   body: { fileId }
 *
 * Hard-deletes a workspace_files row + its R2 object. Caller must be a
 * member of the file's workspace. There is no undo. Used by the Trash
 * view's "Delete forever" action.
 *
 * R2 delete is best-effort: if it fails we still drop the DB row (a
 * tiny orphan in R2 is preferable to a stuck row that re-counts against
 * the workspace quota forever). The sweeper endpoint can clean orphans.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fileId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { fileId } = body;
  if (!fileId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: file, error: fileErr } = await admin
    .from("workspace_files")
    .select("id, workspace_id, user_id, r2_key")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }

  const { data: ws } = await admin
    .from("workspaces")
    .select("id, user_id")
    .eq("id", file.workspace_id)
    .maybeSingle();

  let allowed = false;
  if (ws?.user_id === user.id) {
    allowed = true;
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

  // R2 first — if this fails we'll still delete the row (best-effort).
  try {
    await deleteR2Object(file.r2_key);
  } catch (err) {
    console.warn(
      "[files/permanently-delete] r2 delete failed (orphan):",
      err
    );
  }

  const { error: delErr } = await admin
    .from("workspace_files")
    .delete()
    .eq("id", fileId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
