import { NextResponse, type NextRequest } from "next/server";

import { listActivities } from "@/lib/collab/activity";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";

/* GET /api/activity
 *   ?workspace_id=<uuid>           — workspace-wide feed
 *   ?entity_type=&entity_id=       — per-entity timeline
 *   ?limit=<n>&before=<iso>        — pagination
 *
 * RLS on the `activities` table already restricts rows to workspace
 * members, so a non-member caller naturally sees an empty result. We
 * 401 unauthenticated requests up-front.
 */

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const workspaceId =
    req.nextUrl.searchParams.get("workspace_id") ?? undefined;
  const entityType =
    req.nextUrl.searchParams.get("entity_type") ?? undefined;
  const entityId = req.nextUrl.searchParams.get("entity_id") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), 200))
    : 50;
  const beforeStr = req.nextUrl.searchParams.get("before");
  const before =
    beforeStr && !Number.isNaN(Date.parse(beforeStr))
      ? new Date(beforeStr)
      : undefined;

  if (!workspaceId && !entityId) {
    return NextResponse.json(
      { error: "missing workspace_id or entity_id" },
      { status: 400 }
    );
  }

  try {
    const items = await listActivities({
      workspaceId,
      entityType,
      entityId,
      limit,
      before,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "activity.list",
          userId: user.id,
          fallback: "list_failed",
        }),
      },
      { status: 400 }
    );
  }
}
