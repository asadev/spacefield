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
 * Tag / untag a conversation with a label (EPIC-04). Uses the polymorphic
 * whatsapp_taggings table (taggable_type='conversation').
 *
 * POST   /api/whatsapp/conversations/[id]/labels   body {workspace_id, label_id}  → add
 * DELETE /api/whatsapp/conversations/[id]/labels?workspace_id=&label_id=          → remove
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */

async function verifyOwnership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id")
    .eq("id", conversationId)
    .maybeSingle();
  return !!data && (data as { workspace_id: string }).workspace_id === workspaceId;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: conversationId } = await ctx.params;
  if (!conversationId) return jsonError("id required", 400);

  const parsed = await readJson<{ workspace_id?: string; label_id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, label_id: labelId } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!labelId) return jsonError("label_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  if (!(await verifyOwnership(admin, conversationId, workspaceId))) {
    return jsonError("not_found", 404);
  }
  // Confirm the label belongs to this workspace too.
  const { data: label } = await admin
    .from("whatsapp_labels")
    .select("id")
    .eq("id", labelId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!label) return jsonError("label_not_found", 404);

  const { error } = await admin.from("whatsapp_taggings").upsert(
    {
      workspace_id: workspaceId,
      label_id: labelId,
      taggable_type: "conversation",
      taggable_id: conversationId,
      created_by: auth.user.id,
    },
    { onConflict: "label_id,taggable_type,taggable_id", ignoreDuplicates: true },
  );
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: conversationId } = await ctx.params;
  if (!conversationId) return jsonError("id required", 400);

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const labelId = sp.get("label_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!labelId) return jsonError("label_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  if (!(await verifyOwnership(admin, conversationId, workspaceId))) {
    return jsonError("not_found", 404);
  }
  const { error } = await admin
    .from("whatsapp_taggings")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("label_id", labelId)
    .eq("taggable_type", "conversation")
    .eq("taggable_id", conversationId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
