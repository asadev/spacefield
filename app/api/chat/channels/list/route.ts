import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/chat/channels/list?workspace_id=<uuid>
 *   Returns: { channels: ChannelRow[] } where each row has
 *   { id, workspace_id, name, kind, created_by, created_at }.
 *
 * RLS already restricts visibility to members.
 */

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  created_by: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing workspace_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, workspace_id, name, kind, created_by, created_at")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channels: (data ?? []) as ChannelRow[] });
}
