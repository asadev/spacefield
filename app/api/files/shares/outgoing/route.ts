import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* GET /api/files/shares/outgoing?workspace_id=&file_id=&limit=
 *
 * Files this workspace has shared OUT to other workspaces. Used by:
 *   - The Files Manager share dialog's "Existing shares" section
 *     (passes file_id to scope to one row per target).
 *   - A future "outgoing shares" screen — without file_id we return
 *     every share row from this workspace.
 *
 * Caller must be a member of the source workspace (RLS enforces).
 */

interface ShareJoinRow {
  id: string;
  file_id: string;
  source_workspace_id: string;
  target_workspace_id: string;
  shared_by: string | null;
  permission: "view" | "edit";
  message: string | null;
  created_at: string;
  workspace_files: {
    id: string;
    name: string;
    size_bytes: number | null;
    content_type: string | null;
    created_at: string;
    deleted_at: string | null;
  } | null;
}

export interface OutgoingShareItem {
  id: string;
  file_id: string;
  file_name: string;
  size_bytes: number;
  content_type: string | null;
  target_workspace_id: string;
  target_workspace_name: string | null;
  shared_by: string | null;
  shared_by_email: string | null;
  shared_by_name: string | null;
  permission: "view" | "edit";
  message: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  const fileId = req.nextUrl.searchParams.get("file_id");
  const limitParam = req.nextUrl.searchParams.get("limit");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing workspace_id" },
      { status: 400 }
    );
  }
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "60", 10) || 60, 1),
    200
  );

  let query = supabase
    .from("workspace_file_shares")
    .select(
      "id, file_id, source_workspace_id, target_workspace_id, shared_by, permission, message, created_at, workspace_files!inner(id, name, size_bytes, content_type, created_at, deleted_at)"
    )
    .eq("source_workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fileId) query = query.eq("file_id", fileId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ items: [] });
  }

  const rows = (data ?? []) as unknown as ShareJoinRow[];

  const sharerIds = Array.from(
    new Set(rows.map((r) => r.shared_by).filter((v): v is string => Boolean(v)))
  );
  const targetWsIds = Array.from(
    new Set(rows.map((r) => r.target_workspace_id))
  );

  const admin = createAdminClient();
  const [usersRes, profilesRes, wsRes] = await Promise.all([
    sharerIds.length > 0
      ? admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      : Promise.resolve({ data: { users: [] }, error: null } as const),
    sharerIds.length > 0
      ? admin
          .from("profiles")
          .select("user_id, full_name, username")
          .in("user_id", sharerIds)
      : Promise.resolve({ data: [], error: null } as const),
    targetWsIds.length > 0
      ? admin
          .from("workspaces")
          .select("id, name")
          .in("id", targetWsIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const emailById = new Map<string, string>();
  if ("data" in usersRes && usersRes.data && "users" in usersRes.data) {
    const sharerSet = new Set(sharerIds);
    for (const u of usersRes.data.users) {
      if (u.id && sharerSet.has(u.id) && u.email) {
        emailById.set(u.id, u.email);
      }
    }
  }
  const nameById = new Map<string, string>();
  if (Array.isArray(profilesRes.data)) {
    for (const p of profilesRes.data as Array<{
      user_id: string;
      full_name: string | null;
      username: string | null;
    }>) {
      const n = p.full_name ?? p.username ?? null;
      if (n) nameById.set(p.user_id, n);
    }
  }
  const wsNameById = new Map<string, string>();
  if (Array.isArray(wsRes.data)) {
    for (const w of wsRes.data as Array<{ id: string; name: string }>) {
      wsNameById.set(w.id, w.name);
    }
  }

  const items: OutgoingShareItem[] = rows.map((r) => {
    const f = r.workspace_files;
    return {
      id: r.id,
      file_id: r.file_id,
      file_name: f?.name ?? "",
      size_bytes: Number(f?.size_bytes ?? 0),
      content_type: f?.content_type ?? null,
      target_workspace_id: r.target_workspace_id,
      target_workspace_name: wsNameById.get(r.target_workspace_id) ?? null,
      shared_by: r.shared_by,
      shared_by_email: r.shared_by ? emailById.get(r.shared_by) ?? null : null,
      shared_by_name: r.shared_by ? nameById.get(r.shared_by) ?? null : null,
      permission: r.permission,
      message: r.message,
      created_at: r.created_at,
    };
  });

  return NextResponse.json({ items });
}
