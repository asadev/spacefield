/* Workspace Share config endpoint.
 *
 * GET  ?workspaceId=X           → { subdomain, brandColor, webhookSecret }
 *                                 (webhookSecret only returned to admin/owner)
 * POST { workspaceId, subdomain }                → claim subdomain
 * POST { workspaceId, brandColor }               → set brand color
 * POST { workspaceId, rotateWebhookSecret: true }→ rotate secret
 *      (pass nulls on subdomain/brandColor to clear the respective field)
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
    .select("share_subdomain, share_brand_color, share_webhook_secret")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Only surface the webhook secret to admins/owners (RLS already hides
  // the row from non-members; this gates display from regular members).
  let webhookSecret: string | null = null;
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (mem && (mem.role === "owner" || mem.role === "admin")) {
      webhookSecret = (data?.share_webhook_secret as string | null) ?? null;
    }
  }
  return NextResponse.json({
    subdomain: data?.share_subdomain ?? null,
    brandColor: data?.share_brand_color ?? null,
    webhookSecret,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const supabase = await createClient();

  // Rotate webhook secret path
  if (body.rotateWebhookSecret === true) {
    const { data, error } = await supabase.rpc("share_rotate_webhook_secret", {
      p_workspace_id: body.workspaceId,
    });
    if (error) {
      const status = error.message.includes("only owners") ? 403 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ webhookSecret: data });
  }

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
      .update({ share_brand_color: brandColor })
      .eq("id", body.workspaceId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    return NextResponse.json({ brandColor });
  }

  // Subdomain update path
  const subdomain = typeof body.subdomain === "string" ? body.subdomain : null;
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
