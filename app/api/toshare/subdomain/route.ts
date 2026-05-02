/* Workspace custom-subdomain + brand-color endpoint.
 *
 * GET  ?workspaceId=X           → { subdomain, brandColor }
 * POST { workspaceId, subdomain }                → claim subdomain
 * POST { workspaceId, brandColor }               → set brand color
 *      (pass nulls to clear the respective field)
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
    .select("toshare_subdomain, toshare_brand_color")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    subdomain: data?.toshare_subdomain ?? null,
    brandColor: data?.toshare_brand_color ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const supabase = await createClient();

  // Brand-color update path
  if ("brandColor" in body) {
    const raw = body.brandColor;
    const brandColor =
      raw === null || raw === ""
        ? null
        : typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw)
          ? raw.toLowerCase()
          : undefined;
    if (brandColor === undefined) {
      return NextResponse.json({ error: "brandColor must be #RRGGBB or null" }, { status: 400 });
    }
    // Updates flow through normal RLS — workspace_members policy ensures
    // only members can update; we additionally require admin/owner via
    // a small inline check.
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", body.workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!mem || (mem.role !== "owner" && mem.role !== "admin")) {
      return NextResponse.json({ error: "only owners or admins can change branding" }, { status: 403 });
    }
    const { error: upErr } = await supabase
      .from("workspaces")
      .update({ toshare_brand_color: brandColor })
      .eq("id", body.workspaceId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    return NextResponse.json({ brandColor });
  }

  // Subdomain update path
  const subdomain = typeof body.subdomain === "string" ? body.subdomain : null;
  const { data, error } = await supabase.rpc("toshare_claim_subdomain", {
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
