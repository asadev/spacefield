import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/workspaces/archive
 *   body: { workspaceId, archived: boolean }
 *
 * Owner-only. Sets workspaces.archived_at and logs an activity event.
 * Archiving doesn't delete data — clients filter archived workspaces
 * out of the active list.
 */

interface Body {
  workspaceId?: string;
  archived?: boolean;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { workspaceId, archived } = body;
  if (!workspaceId || typeof archived !== "boolean") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Confirm caller is owner.
  const { data: role, error: rErr } = await supabase.rpc(
    "workspace_role_of",
    { ws_id: workspaceId }
  );
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 400 });
  }
  if (role !== "owner") {
    return NextResponse.json(
      { error: "only the workspace owner can archive" },
      { status: 403 }
    );
  }

  const archivedAt = archived ? new Date().toISOString() : null;
  const { error: upErr } = await supabase
    .from("workspaces")
    .update({ archived_at: archivedAt })
    .eq("id", workspaceId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  await supabase.rpc("log_workspace_activity", {
    ws_id: workspaceId,
    k: archived ? "archived" : "unarchived",
    body: {},
  });

  return NextResponse.json({ ok: true, archived });
}
