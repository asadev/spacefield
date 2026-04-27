import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/chat/unread?workspace_id=<uuid>
 *   returns: { counts: { [channel_id]: number }, total: number }
 *
 * Backed by the chat_unread_counts(ws_id) RPC. Used by the chat app
 * sidebar (per-channel dots) and by useDockBadges (aggregated total
 * across the active workspace).
 */

interface UnreadRow {
  channel_id: string;
  unread: number | string | null;
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

  const { data, error } = await supabase.rpc("chat_unread_counts", {
    ws_id: workspaceId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UnreadRow[];
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.unread ?? 0);
    counts[r.channel_id] = n;
    total += n;
  }
  return NextResponse.json({ counts, total });
}
