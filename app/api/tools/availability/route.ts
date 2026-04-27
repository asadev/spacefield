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

  const results = await Promise.all(
    trimmed.map(async (slug) => {
      const { data, error } = await supabase.rpc("tool_availability", {
        ws_id: workspaceId,
        tool_slug: slug,
      });
      if (error) {
        return [slug, "tier_locked"] as const;
      }
      const value =
        typeof data === "string" &&
        (data === "allowed" ||
          data === "disabled" ||
          data === "tier_locked" ||
          data === "workspace_blocked")
          ? data
          : "tier_locked";
      return [slug, value] as const;
    })
  );

  const availability: Record<string, ToolAvailability> = {};
  for (const [slug, value] of results) {
    availability[slug] = value as ToolAvailability;
  }
  return NextResponse.json({ availability });
}

export type ToolAvailability =
  | "allowed"
  | "disabled"
  | "tier_locked"
  | "workspace_blocked";
