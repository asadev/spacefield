import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeActions,
  type ActionContext,
} from "@/lib/whatsapp/actions";
import type { PersonalizeContact } from "@/lib/whatsapp/personalize";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/whatsapp/conversations/[id]/send-product   (EPIC-18 product picker)
 * Body: { workspace_id, product_id }
 *
 * Sends a catalog product card (image + caption + price + order link) into the
 * open conversation through the SHARED action executor (send_product action) —
 * so it routes through the throttle + isSuppressed() exactly like every send.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */
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

  const parsed = await readJson<{ workspace_id?: string; product_id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, product_id: productId } = parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!productId) return jsonError("product_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Conversation send context (+ ownership).
  const { data: convRow } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, instance_id, contact_id, source_id, source_jid, chat_type")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convRow) return jsonError("not_found", 404);
  const conv = convRow as {
    id: string;
    workspace_id: string;
    instance_id: string;
    contact_id: string | null;
    source_id: string;
    source_jid: string | null;
    chat_type: "individual" | "group";
  };
  if (conv.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", conv.instance_id)
    .maybeSingle();
  if (!instRow) return jsonError("no_instance", 409);
  const instance = instRow as WhatsAppInstanceRow;

  let contact: PersonalizeContact | null = null;
  if (conv.contact_id) {
    const { data: ct } = await admin
      .from("crm_contacts")
      .select("first_name, last_name, phone, email, custom")
      .eq("id", conv.contact_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (ct) contact = ct as PersonalizeContact;
  }

  const toNumber =
    conv.chat_type === "group" ? conv.source_jid ?? conv.source_id : conv.source_id;

  const actionCtx: ActionContext = {
    workspaceId,
    instance,
    conversationId: conv.id,
    toNumber,
    contactId: conv.contact_id,
    contact,
    actorUserId: auth.user.id,
  };

  const results = await executeActions(admin, actionCtx, [
    { type: "send_product", params: { product_id: productId } },
  ]);
  const r = results[0];
  if (!r?.ok) {
    return jsonError(r?.error ?? r?.skipped ?? "send_failed", 502);
  }
  return NextResponse.json({ ok: true, results });
}
