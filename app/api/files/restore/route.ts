import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/files/restore
 *   body: { fileId }
 *   returns: { file }
 *
 * Reverses /api/files/trash by clearing deleted_at. Auth + self-heal
 * same as trash.
 */
export async function POST(req: NextRequest) {
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
    .select("id, workspace_id, user_id")
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

  const { data: updated, error: updErr } = await admin
    .from("workspace_files")
    .update({ deleted_at: null })
    .eq("id", fileId)
    .select(
      "id, name, size_bytes, content_type, created_at, user_id, workspace_id, deleted_at, tags"
    )
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  return NextResponse.json({ file: updated });
}
