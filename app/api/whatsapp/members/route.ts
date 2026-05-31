import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/members?workspace_id=...
 *
 * Lists workspace members for the assignee picker + @mention resolution.
 * Returns id, name (profile full_name → username → short id), username.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 * Response: { items: [{ id, name, username, role }] }
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);

  const rows = (members ?? []) as Array<{ user_id: string; role: string }>;
  const ids = rows.map((r) => r.user_id);
  const roleById = new Map(rows.map((r) => [r.user_id, r.role]));

  const nameById = new Map<string, string>();
  const usernameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name, username")
      .in("user_id", ids);
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      username: string | null;
    }>) {
      nameById.set(
        p.user_id,
        p.full_name?.trim() || p.username?.trim() || p.user_id.slice(0, 8),
      );
      if (p.username) usernameById.set(p.user_id, p.username);
    }
  }

  const items = ids.map((id) => ({
    id,
    name: nameById.get(id) ?? id.slice(0, 8),
    username: usernameById.get(id) ?? null,
    role: roleById.get(id) ?? "member",
  }));

  return NextResponse.json({ items });
}
