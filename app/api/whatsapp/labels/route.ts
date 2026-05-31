import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp labels (EPIC-04). Workspace-scoped, polymorphic tagging of
 * conversations or contacts via whatsapp_taggings.
 *
 * GET    /api/whatsapp/labels?workspace_id=         → { items: Label[] }
 * POST   /api/whatsapp/labels                       create {title,color?,show_on_sidebar?}
 * PATCH  /api/whatsapp/labels                       update {id,title?,color?,show_on_sidebar?}
 * DELETE /api/whatsapp/labels?workspace_id=&id=     delete
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface Label {
  id: string;
  workspace_id: string;
  title: string;
  color: string;
  show_on_sidebar: boolean;
  created_at: string;
}

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
  const { data, error } = await admin
    .from("whatsapp_labels")
    .select("id, workspace_id, title, color, show_on_sidebar, created_at")
    .eq("workspace_id", workspaceId)
    .order("title", { ascending: true });
  if (error) return jsonError(error.message, 500);

  // Attach usage counts for conversations so the sidebar can show them.
  const labels = (data ?? []) as Label[];
  const countByLabel = new Map<string, number>();
  if (labels.length > 0) {
    const { data: tags } = await admin
      .from("whatsapp_taggings")
      .select("label_id")
      .eq("workspace_id", workspaceId)
      .eq("taggable_type", "conversation")
      .in(
        "label_id",
        labels.map((l) => l.id),
      );
    for (const t of (tags ?? []) as Array<{ label_id: string }>) {
      countByLabel.set(t.label_id, (countByLabel.get(t.label_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    items: labels.map((l) => ({ ...l, conversation_count: countByLabel.get(l.id) ?? 0 })),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    title?: string;
    color?: string;
    show_on_sidebar?: boolean;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, title, color, show_on_sidebar } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!title?.trim()) return jsonError("title required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_labels")
    .insert({
      workspace_id: workspaceId,
      title: title.trim(),
      color: color?.trim() || "#64748b",
      show_on_sidebar: show_on_sidebar ?? true,
      created_by: auth.user.id,
    })
    .select("id, workspace_id, title, color, show_on_sidebar, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return jsonError("label_exists", 409);
    return jsonError(error.message, 500);
  }
  return NextResponse.json({ label: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    id?: string;
    title?: string;
    color?: string;
    show_on_sidebar?: boolean;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, id, title, color, show_on_sidebar } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = {};
  if (title !== undefined) {
    if (!title.trim()) return jsonError("title cannot be empty", 400);
    patch.title = title.trim();
  }
  if (color !== undefined) patch.color = color.trim() || "#64748b";
  if (show_on_sidebar !== undefined) patch.show_on_sidebar = show_on_sidebar;
  if (Object.keys(patch).length === 0) return jsonError("no_changes", 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_labels")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id, workspace_id, title, color, show_on_sidebar, created_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return jsonError("label_exists", 409);
    return jsonError(error.message, 500);
  }
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ label: data });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const id = sp.get("id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  // taggings cascade via FK on delete cascade.
  const { error } = await admin
    .from("whatsapp_labels")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
