import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/workspaces/activity?workspaceId=<uuid>&limit=20
 *
 * Returns the most recent activity events for a workspace, joined with
 * profile data so the UI can render "<actor> did <kind>" rows directly.
 *
 * RLS on workspace_activity restricts SELECTs to workspace members, so
 * a non-member caller gets an empty list.
 */

interface ActivityRow {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing workspaceId" },
      { status: 400 }
    );
  }
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
    : 20;

  const { data, error } = await supabase
    .from("workspace_activity")
    .select("id, workspace_id, actor_id, kind, payload, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as ActivityRow[];
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))
  );
  let profilesById = new Map<string, ProfileRow>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, avatar_url")
      .in("user_id", actorIds);
    profilesById = new Map(
      ((profs ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
    );
  }

  return NextResponse.json({
    events: rows.map((r) => {
      const p = r.actor_id ? profilesById.get(r.actor_id) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        created_at: r.created_at,
        actor_id: r.actor_id,
        actor_name: p?.full_name ?? p?.username ?? null,
        actor_avatar: p?.avatar_url ?? null,
      };
    }),
  });
}
