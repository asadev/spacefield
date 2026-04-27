import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/workspaces/transfer-ownership
 *   body: { workspaceId, newOwnerUserId }
 *
 * Thin wrapper around the transfer_workspace_ownership RPC. The RPC
 * itself enforces caller-must-be-owner, target-must-be-member, and
 * logs a 'transferred' activity event.
 */

interface Body {
  workspaceId?: string;
  newOwnerUserId?: string;
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

  const { workspaceId, newOwnerUserId } = body;
  if (!workspaceId || !newOwnerUserId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { error } = await supabase.rpc("transfer_workspace_ownership", {
    ws_id: workspaceId,
    new_user: newOwnerUserId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
