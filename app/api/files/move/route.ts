import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/files/move
 *   body: { fileId, destinationWorkspaceId }
 *   returns: { file }
 *
 * Re-parents a workspace_files row from one workspace to another. The
 * R2 key intentionally stays put — copying the object would be slow and
 * the key is internal. The caller must be a member of BOTH the source
 * and destination workspaces. Quota recheck on the destination so a
 * moved file can't bust its new home's storage cap.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fileId?: string; destinationWorkspaceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { fileId, destinationWorkspaceId } = body;
  if (!fileId || !destinationWorkspaceId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: file, error: fileErr } = await admin
    .from("workspace_files")
    .select("id, workspace_id, user_id, size_bytes")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }
  if (file.workspace_id === destinationWorkspaceId) {
    return NextResponse.json({ ok: true, noop: true });
  }

  // Membership in both workspaces
  for (const wsId of [file.workspace_id, destinationWorkspaceId]) {
    const { data: ws } = await admin
      .from("workspaces")
      .select("id, user_id")
      .eq("id", wsId)
      .maybeSingle();
    if (!ws) {
      return NextResponse.json(
        { error: "workspace_not_found", id: wsId },
        { status: 404 }
      );
    }
    let allowed = false;
    if (ws.user_id === user.id) {
      allowed = true;
    } else {
      const { data: member } = await admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", wsId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (member) allowed = true;
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "not a member of that workspace", id: wsId },
        { status: 403 }
      );
    }
  }

  // Quota check on destination
  const { data: storage } = await supabase.rpc("workspace_storage", {
    ws_id: destinationWorkspaceId,
  });
  const cap = Number(storage?.[0]?.cap_bytes ?? 0);
  const used = Number(storage?.[0]?.used_bytes ?? 0);
  if (used + Number(file.size_bytes ?? 0) > cap) {
    return NextResponse.json(
      {
        error: "storage_quota_exceeded",
        cap_bytes: cap,
        used_bytes: used,
        attempted_bytes: Number(file.size_bytes ?? 0),
      },
      { status: 413 }
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("workspace_files")
    .update({ workspace_id: destinationWorkspaceId })
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
