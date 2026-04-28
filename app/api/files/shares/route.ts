import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* /api/files/shares
 *
 *   POST  body { file_id, source_workspace_id, target_workspace_id,
 *                permission?, message? }
 *         → Insert a share row. Caller must be a member of the source
 *           workspace (RLS enforces). Idempotent on
 *           (file_id, target_workspace_id) — re-posting just returns the
 *           existing row.
 *
 * GET handlers for incoming/outgoing live in their own subroutes so the
 * cache keys stay tidy:
 *   - /api/files/shares/incoming
 *   - /api/files/shares/outgoing
 *
 * RLS does the auth. We don't paste any service-role bypass here — every
 * read/write goes through the user's session client.
 */

interface PostBody {
  file_id?: unknown;
  source_workspace_id?: unknown;
  target_workspace_id?: unknown;
  permission?: unknown;
  message?: unknown;
}

interface ShareRow {
  id: string;
  file_id: string;
  source_workspace_id: string;
  target_workspace_id: string;
  shared_by: string | null;
  permission: "view" | "edit";
  message: string | null;
  created_at: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: PostBody;
  try {
    raw = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const fileId = typeof raw.file_id === "string" ? raw.file_id : "";
  const sourceWs =
    typeof raw.source_workspace_id === "string" ? raw.source_workspace_id : "";
  const targetWs =
    typeof raw.target_workspace_id === "string" ? raw.target_workspace_id : "";
  if (!fileId || !sourceWs || !targetWs) {
    return NextResponse.json(
      {
        error:
          "missing file_id, source_workspace_id, or target_workspace_id",
      },
      { status: 400 }
    );
  }
  if (sourceWs === targetWs) {
    return NextResponse.json(
      { error: "cannot share a workspace with itself" },
      { status: 400 }
    );
  }
  const permission: "view" | "edit" =
    raw.permission === "edit" ? "edit" : "view";
  let message: string | null = null;
  if (typeof raw.message === "string") {
    const trimmed = raw.message.trim();
    if (trimmed.length > 0) message = trimmed.slice(0, 200);
  }

  // Idempotent insert. The unique (file_id, target_workspace_id) key
  // means a re-post for the same target just no-ops; we then re-select
  // so the caller gets the canonical row either way.
  const insertRes = await supabase
    .from("workspace_file_shares")
    .insert({
      file_id: fileId,
      source_workspace_id: sourceWs,
      target_workspace_id: targetWs,
      shared_by: user.id,
      permission,
      message,
    })
    .select(
      "id, file_id, source_workspace_id, target_workspace_id, shared_by, permission, message, created_at"
    )
    .maybeSingle();

  if (insertRes.error) {
    // Unique violation — fetch the existing row.
    const isUnique = insertRes.error.code === "23505";
    if (isUnique) {
      const existing = await supabase
        .from("workspace_file_shares")
        .select(
          "id, file_id, source_workspace_id, target_workspace_id, shared_by, permission, message, created_at"
        )
        .eq("file_id", fileId)
        .eq("target_workspace_id", targetWs)
        .maybeSingle();
      if (existing.data) {
        return NextResponse.json({ share: existing.data as ShareRow });
      }
    }
    return NextResponse.json(
      { error: insertRes.error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ share: insertRes.data as ShareRow });
}
