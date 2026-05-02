/* Workspace custom-subdomain claim endpoint.
 *
 * GET  ?workspaceId=X           → returns the current subdomain (or null)
 * POST { workspaceId, subdomain }  → claim. Pass subdomain: null to release.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("share_subdomain")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ subdomain: data?.share_subdomain ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const subdomain = typeof body.subdomain === "string" ? body.subdomain : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_claim_subdomain", {
    p_workspace_id: body.workspaceId,
    p_subdomain: subdomain,
  });
  if (error) {
    const status = error.message.includes("already taken") ? 409 :
      error.message.includes("invalid subdomain") ? 400 :
      error.message.includes("not a member") || error.message.includes("only owners") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ subdomain: data ?? null });
}
