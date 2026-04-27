import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/chat/channels/create
 *   body: { workspace_id, name, kind? }
 *   returns: { channel }
 *
 * Admin/owner only — RLS on chat_channels already enforces this for
 * inserts, but we return a clean error rather than letting RLS silently
 * fail.
 */

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    workspace_id?: string;
    name?: string;
    kind?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { workspace_id: workspaceId, name, kind } = body;
  if (!workspaceId || !name) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const cleanName = name.trim().toLowerCase();
  if (!NAME_RE.test(cleanName)) {
    return NextResponse.json(
      { error: "invalid name (lowercase, digits, dashes; max 31 chars)" },
      { status: 400 }
    );
  }

  // Confirm caller is owner/admin via RPC. Cheaper than a server-side
  // membership lookup and avoids drift with the RLS policy.
  const { data: roleRow, error: roleErr } = await supabase.rpc(
    "workspace_role_of",
    { ws_id: workspaceId }
  );
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }
  const role = typeof roleRow === "string" ? roleRow : null;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "owner or admin only" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("chat_channels")
    .insert({
      workspace_id: workspaceId,
      name: cleanName,
      kind: kind === "general" ? "topic" : (kind ?? "topic"),
      created_by: user.id,
    })
    .select("id, workspace_id, name, kind, created_by, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "channel name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel: data });
}
