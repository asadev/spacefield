import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2";

/* POST /api/files/empty-trash-older-than
 *   body: { workspaceId, days?: number }
 *     days = 0  → empty entire trash for that workspace (the
 *                  user-facing "Empty Trash" button)
 *     days > 0  → only purge entries trashed more than N days ago
 *                  (used for a future cron sweeper)
 *
 *   returns: { deleted: number, errors: number }
 *
 * Hard-deletes every matching trashed file: R2 object + DB row. Caller
 * must be a member of the workspace.
 *
 * Manual-call sweeper for v1 — wire up a cron later.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { workspaceId?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { workspaceId } = body;
  const days =
    typeof body.days === "number" && Number.isFinite(body.days) && body.days >= 0
      ? body.days
      : 0;
  if (!workspaceId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Membership check
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }

  let allowed = false;
  if (ws.user_id === user.id) {
    allowed = true;
    await admin.from("workspace_members").upsert(
      {
        workspace_id: workspaceId,
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
      .eq("workspace_id", workspaceId)
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

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("workspace_files")
    .select("id, r2_key, deleted_at")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null);
  if (days > 0) {
    query = query.lt("deleted_at", cutoff);
  }
  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const trashed = (rows ?? []) as Array<{
    id: string;
    r2_key: string;
    deleted_at: string;
  }>;

  let deleted = 0;
  let errors = 0;
  for (const row of trashed) {
    try {
      await deleteR2Object(row.r2_key);
    } catch {
      // best-effort — keep going so the DB row still gets dropped
      errors += 1;
    }
    const { error: delErr } = await admin
      .from("workspace_files")
      .delete()
      .eq("id", row.id);
    if (delErr) {
      errors += 1;
    } else {
      deleted += 1;
    }
  }

  return NextResponse.json({ deleted, errors });
}
