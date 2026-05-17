import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/tools/availability
 *   body: { workspaceId: string, slugs: string[] }
 *
 * Returns the per-slug availability for the calling user inside the
 * named workspace. Each value is one of:
 *   'allowed'           — install permitted
 *   'disabled'          — global kill switch is on
 *   'tier_locked'       — tier doesn't include this tool, no override
 *   'workspace_blocked' — admin explicitly blocked it for this workspace
 *
 * The check delegates entirely to the public.tool_availability(uuid, text)
 * Postgres function so client-server logic stays in lockstep with the
 * database (and the same RPC is the pre-flight inside the install path).
 *
 * The request runs through the user-scoped Supabase server client so
 * auth.uid() inside SECURITY DEFINER resolves correctly. We loop the
 * RPC across slugs; for the typical AppStore call (~150 slugs) this is
 * still a single round-trip from the perspective of the client (the
 * server batches them in parallel via Promise.all).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { workspaceId?: string; slugs?: unknown };
  try {
    body = (await req.json()) as { workspaceId?: string; slugs?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing workspaceId" },
      { status: 400 }
    );
  }
  const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
  const slugs: string[] = [];
  for (const s of rawSlugs) {
    if (typeof s === "string" && s.length > 0 && s.length < 200) {
      slugs.push(s);
    }
  }
  // Cap to keep the round-trip bounded.
  const trimmed = Array.from(new Set(slugs)).slice(0, 500);

  // N+1 fix — was looping per-slug `rpc("tool_availability")` (one round
  // trip per slug, ~80 slugs per Launchpad render). Now three parallel
  // batch queries pull every input the SECURITY-DEFINER RPC reads, and
  // we evaluate the same decision tree in JS.
  const availability: Record<string, ToolAvailability> = {};

  if (trimmed.length > 0) {
    type ToolSettingRow = { slug: string; disabled: boolean };
    type GrantRow = { slug: string; granted: boolean };
    type WorkspaceRow = {
      id: string;
      user_id: string;
      subscriptions?: { tier_id: string | null }[] | null;
    };
    type TierRow = { tier_id: string; allowed_tool_slugs: unknown };

    // Need an admin check separately. The original RPC short-circuits to
    // "allowed" for admins; replicate that with a single profile read.
    const [
      { data: profileRow },
      { data: settingsRows },
      { data: grantRows },
      { data: workspaceRow },
    ] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
      supabase
        .from("tool_settings")
        .select("slug, disabled")
        .in("slug", trimmed),
      supabase
        .from("workspace_tool_grants")
        .select("slug, granted")
        .eq("workspace_id", workspaceId)
        .in("slug", trimmed),
      supabase
        .from("workspaces")
        .select("id, user_id, subscriptions(tier_id)")
        .eq("id", workspaceId)
        .maybeSingle(),
    ]);

    const isAdmin = Boolean(
      (profileRow as { is_admin?: boolean } | null)?.is_admin
    );
    const disabledSlugs = new Set(
      ((settingsRows ?? []) as ToolSettingRow[])
        .filter((r) => r.disabled)
        .map((r) => r.slug)
    );
    const grantBySlug = new Map<string, boolean>();
    for (const g of (grantRows ?? []) as GrantRow[]) {
      grantBySlug.set(g.slug, g.granted);
    }

    // Resolve tier allow-list once.
    const ws = workspaceRow as WorkspaceRow | null;
    const tierId =
      (ws?.subscriptions && ws.subscriptions[0]?.tier_id) || "free";
    const { data: tierRow } = await supabase
      .from("subscription_tiers")
      .select("tier_id, allowed_tool_slugs")
      .eq("tier_id", tierId)
      .maybeSingle();
    const allowedSlugs = (() => {
      const raw = (tierRow as TierRow | null)?.allowed_tool_slugs;
      if (!Array.isArray(raw)) return null;
      // Empty list = allow everything (compat default matching the RPC).
      if (raw.length === 0) return null;
      const out = new Set<string>();
      for (const v of raw) {
        if (typeof v === "string") out.add(v);
      }
      return out;
    })();

    for (const slug of trimmed) {
      if (disabledSlugs.has(slug)) {
        availability[slug] = "disabled";
        continue;
      }
      if (isAdmin) {
        availability[slug] = "allowed";
        continue;
      }
      const override = grantBySlug.get(slug);
      if (override !== undefined) {
        availability[slug] = override ? "allowed" : "workspace_blocked";
        continue;
      }
      if (allowedSlugs === null || allowedSlugs.has(slug)) {
        availability[slug] = "allowed";
      } else {
        availability[slug] = "tier_locked";
      }
    }
  }

  return NextResponse.json({ availability });
}

export type ToolAvailability =
  | "allowed"
  | "disabled"
  | "tier_locked"
  | "workspace_blocked";
