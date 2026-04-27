import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/files/tag
 *   body: { fileId, tags: Array<{ name: string, color: string }> }
 *   returns: { file }
 *
 * Replaces the entire tags array on a file. Validation:
 *   - max 12 tags per file
 *   - each name 1..32 chars
 *   - color must be one of the predefined swatches
 *
 * Auth: caller must be a member of the file's workspace.
 */

const ALLOWED_COLORS = new Set([
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "slate",
]);

interface IncomingTag {
  name?: unknown;
  color?: unknown;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { fileId?: string; tags?: IncomingTag[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { fileId, tags } = body;
  if (!fileId || !Array.isArray(tags)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (tags.length > 12) {
    return NextResponse.json({ error: "too_many_tags" }, { status: 400 });
  }

  const seen = new Set<string>();
  const normalized: Array<{ name: string; color: string }> = [];
  for (const raw of tags) {
    const name =
      typeof raw?.name === "string" ? raw.name.trim().slice(0, 32) : "";
    const color =
      typeof raw?.color === "string" ? raw.color.trim().toLowerCase() : "";
    if (!name) continue;
    if (!ALLOWED_COLORS.has(color)) {
      return NextResponse.json(
        { error: "invalid_color", color },
        { status: 400 }
      );
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ name, color });
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
    .update({ tags: normalized })
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
