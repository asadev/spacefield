import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/workspaces/storage-stats?workspaceId=<uuid>
 *
 * Aggregates the workspace storage analytics into one round-trip:
 *   - workspace_storage           (cap + used)
 *   - workspace_storage_addons    (current add-on row)
 *   - workspace_storage_by_kind   (file-kind histogram)
 *   - workspace_storage_by_user   (top contributors, joined w/ profiles)
 *   - workspace_top_files         (top 10 largest)
 *   - workspace_trash_summary     (trash size + oldest deleted_at)
 *   - workspace_upload_trend_30d  (daily byte volume, last 30 days)
 *
 * All RPCs are RLS-gated through is_workspace_member, so a non-member
 * caller will get back empty arrays instead of an error.
 */

interface CapRow {
  cap_bytes: number;
  used_bytes: number;
}
interface KindRow {
  kind: string;
  file_count: number;
  total_bytes: number;
}
interface UserAggRow {
  user_id: string;
  file_count: number;
  total_bytes: number;
}
interface TopFileRow {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  user_id: string;
  created_at: string;
}
interface TrashRow {
  file_count: number;
  total_bytes: number;
  oldest_at: string | null;
}
interface TrendRow {
  day: string;
  file_count: number;
  total_bytes: number;
}
interface AddonRow {
  workspace_id: string;
  addon_gb: number;
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

  const [cap, byKind, byUser, top, trash, trend, addon] = await Promise.all([
    supabase.rpc("workspace_storage", { ws_id: workspaceId }),
    supabase.rpc("workspace_storage_by_kind", { ws_id: workspaceId }),
    supabase.rpc("workspace_storage_by_user", { ws_id: workspaceId }),
    supabase.rpc("workspace_top_files", { ws_id: workspaceId, top_n: 10 }),
    supabase.rpc("workspace_trash_summary", { ws_id: workspaceId }),
    supabase.rpc("workspace_upload_trend_30d", { ws_id: workspaceId }),
    supabase
      .from("workspace_storage_addons")
      .select("workspace_id, addon_gb")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const capRow = ((cap.data ?? []) as CapRow[])[0] ?? {
    cap_bytes: 0,
    used_bytes: 0,
  };
  const trashRow =
    ((trash.data ?? []) as TrashRow[])[0] ?? {
      file_count: 0,
      total_bytes: 0,
      oldest_at: null,
    };
  const byUserRows = (byUser.data ?? []) as UserAggRow[];
  const topRows = (top.data ?? []) as TopFileRow[];
  const trendRows = (trend.data ?? []) as TrendRow[];
  const kindRows = (byKind.data ?? []) as KindRow[];
  const addonRow = addon.data as AddonRow | null;

  // Decorate the per-user aggregate with profile info (best-effort —
  // if a uid no longer has a profile row we just leave it null).
  const uniqueUserIds = Array.from(
    new Set([
      ...byUserRows.map((r) => r.user_id),
      ...topRows.map((r) => r.user_id),
    ])
  );
  let profilesById = new Map<string, ProfileRow>();
  if (uniqueUserIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, avatar_url")
      .in("user_id", uniqueUserIds);
    profilesById = new Map(
      ((profs ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
    );
  }

  return NextResponse.json({
    cap: Number(capRow.cap_bytes),
    used: Number(capRow.used_bytes),
    addon: addonRow ? Number(addonRow.addon_gb) : 0,
    by_kind: kindRows.map((r) => ({
      kind: r.kind,
      file_count: Number(r.file_count),
      total_bytes: Number(r.total_bytes),
    })),
    by_user: byUserRows.map((r) => {
      const p = profilesById.get(r.user_id);
      return {
        user_id: r.user_id,
        file_count: Number(r.file_count),
        total_bytes: Number(r.total_bytes),
        full_name: p?.full_name ?? null,
        username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    }),
    top_files: topRows.map((r) => {
      const p = profilesById.get(r.user_id);
      return {
        id: r.id,
        name: r.name,
        size_bytes: Number(r.size_bytes),
        content_type: r.content_type,
        user_id: r.user_id,
        created_at: r.created_at,
        uploader_name: p?.full_name ?? p?.username ?? null,
      };
    }),
    trash: {
      file_count: Number(trashRow.file_count),
      total_bytes: Number(trashRow.total_bytes),
      oldest_at: trashRow.oldest_at,
    },
    trend: trendRows.map((r) => ({
      day: r.day,
      file_count: Number(r.file_count),
      total_bytes: Number(r.total_bytes),
    })),
  });
}
