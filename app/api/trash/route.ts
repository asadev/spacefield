import { NextResponse, type NextRequest } from "next/server";

import { listTrash, purgeEntity, restoreEntity } from "@/lib/trash";
import { createClient } from "@/lib/supabase/server";

/**
 * Universal recycle bin API.
 *
 *   GET    /api/trash?workspace_id=…&entity_type=…  → list soft-deleted rows
 *   POST   /api/trash  { action:"restore", entity_type, entity_id }
 *   DELETE /api/trash  { entity_type, entity_id }    → purge (admin/owner only)
 */

async function getUserAndRole(
  workspaceId: string
): Promise<
  | { user: { id: string; email: string | null }; role: string | null }
  | null
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return {
    user: { id: userData.user.id, email: userData.user.email ?? null },
    role: (member?.role as string | undefined) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspace_id");
  const entityType = searchParams.get("entity_type");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing_workspace_id" },
      { status: 400 }
    );
  }
  const ctx = await getUserAndRole(workspaceId);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!ctx.role) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  const items = await listTrash({
    workspaceId,
    entityType: entityType ?? null,
  });
  return NextResponse.json({ items });
}

interface TrashPostBody {
  action?: "restore";
  entity_type?: string;
  entity_id?: string;
  workspace_id?: string;
}

export async function POST(req: NextRequest) {
  let body: TrashPostBody;
  try {
    body = (await req.json()) as TrashPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.workspace_id || !body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const ctx = await getUserAndRole(body.workspace_id);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!ctx.role) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  const res = await restoreEntity({
    entityType: body.entity_type,
    entityId: body.entity_id,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

interface TrashDeleteBody {
  entity_type?: string;
  entity_id?: string;
  workspace_id?: string;
}

export async function DELETE(req: NextRequest) {
  let body: TrashDeleteBody;
  try {
    body = (await req.json()) as TrashDeleteBody;
  } catch {
    body = {};
  }
  const { searchParams } = new URL(req.url);
  const workspaceId = body.workspace_id ?? searchParams.get("workspace_id");
  const entityType = body.entity_type ?? searchParams.get("entity_type");
  const entityId = body.entity_id ?? searchParams.get("entity_id");
  if (!workspaceId || !entityType || !entityId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const ctx = await getUserAndRole(workspaceId);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Purge is destructive — gate to admin/owner. Members can restore
  // but not permanently delete.
  if (ctx.role !== "admin" && ctx.role !== "owner") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  const res = await purgeEntity({ entityType, entityId });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
