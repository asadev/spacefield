import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agents/visibility?id=AGENT&uid=USER&ws_id=WORKSPACE
 *
 * Calls the `agent_visible(id, uid, ws_id)` RPC with the provided
 * arguments and returns the verdict. The RPC returns a JSONB object of
 * the shape:
 *   { visible: boolean, reason: string, tier?: string, role?: string }
 *
 * We keep the raw payload around as `raw` for debugging.
 */
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const uid = url.searchParams.get("uid")?.trim() ?? "";
  const wsId = url.searchParams.get("ws_id")?.trim() ?? "";

  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (!uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });

  const admin = createAdminClient();
  const args: { agent_slug: string; uid: string; ws_id?: string } = {
    agent_slug: id,
    uid,
  };
  if (wsId) args.ws_id = wsId;

  const { data, error } = await admin.rpc("agent_visible", args);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  type Verdict = {
    visible?: boolean;
    reason?: string;
    tier?: string;
    role?: string;
  } | null;
  const verdict = (data ?? null) as Verdict;

  return NextResponse.json({
    ok: true,
    visible: Boolean(verdict?.visible),
    reason: verdict?.reason,
    tier: verdict?.tier,
    role: verdict?.role,
    raw: data,
  });
}
