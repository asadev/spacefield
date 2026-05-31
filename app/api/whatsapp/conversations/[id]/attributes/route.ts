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
 * PATCH /api/whatsapp/conversations/[id]/attributes  (EPIC-07)
 *
 * Sets custom field VALUES (and the single-select lifecycle_stage) into the
 * conversation's custom_attributes jsonb. Merges over the existing object —
 * pass null for a key to clear it.
 *
 * Body: { workspace_id, attributes: { <key>: value|null, ... },
 *         lifecycle_stage?: string|null }
 *
 * lifecycle_stage is just a reserved key inside custom_attributes, handled
 * here so the sidebar has a stable single-select field.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 * Response: { ok: true, custom_attributes }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id: conversationId } = await ctx.params;
  if (!conversationId) return jsonError("id required", 400);

  const parsed = await readJson<{
    workspace_id?: string;
    attributes?: Record<string, unknown>;
    lifecycle_stage?: string | null;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const incoming: Record<string, unknown> = {
    ...(parsed.body.attributes && typeof parsed.body.attributes === "object"
      ? parsed.body.attributes
      : {}),
  };
  if (parsed.body.lifecycle_stage !== undefined) {
    incoming.lifecycle_stage = parsed.body.lifecycle_stage;
  }
  if (Object.keys(incoming).length === 0) return jsonError("no attributes provided", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: conv, error: convErr } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, custom_attributes")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return jsonError(convErr.message, 500);
  if (!conv) return jsonError("not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    custom_attributes: Record<string, unknown> | null;
  };
  if (c.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const merged: Record<string, unknown> = {
    ...(c.custom_attributes && typeof c.custom_attributes === "object"
      ? c.custom_attributes
      : {}),
  };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }

  const { error } = await admin
    .from("whatsapp_conversations")
    .update({ custom_attributes: merged })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, custom_attributes: merged });
}
