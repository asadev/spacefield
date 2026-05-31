import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import type { EvolutionMessageKey } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/whatsapp/messages/[id]/react
 *
 * Body: { workspace_id, emoji }   (empty emoji removes our reaction)
 *
 * Sends a WhatsApp reaction for message [id] and records it on the row's
 * `reactions` jsonb array as { emoji, fromMe:true, actor:"self" } (matching the
 * webhook's own reaction shape). Best-effort on the Evolution call — the local
 * row still updates so the UI stays consistent.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const { id } = await ctx.params;
  if (!id) return jsonError("message_id required", 400);

  let body: { workspace_id?: string; emoji?: string } | null;
  try {
    body = (await req.json()) as { workspace_id?: string; emoji?: string };
  } catch {
    return jsonError("invalid json", 400);
  }
  const workspaceId = body?.workspace_id;
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Load the message (scoped to workspace).
  const { data: msg } = await admin
    .from("whatsapp_messages")
    .select(
      "id, conversation_id, instance_id, direction, evolution_message_id, reactions, workspace_id",
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!msg) return jsonError("message_not_found", 404);
  const m = msg as {
    id: string;
    conversation_id: string | null;
    instance_id: string | null;
    direction: "inbound" | "outbound";
    evolution_message_id: string | null;
    reactions: Array<{ emoji: string; fromMe: boolean; actor: string }> | null;
  };

  // Resolve the conversation's remoteJid for the reaction key.
  let remoteJid: string | null = null;
  if (m.conversation_id) {
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("source_jid, source_id")
      .eq("id", m.conversation_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const c = conv as { source_jid: string | null; source_id: string | null } | null;
    remoteJid = c?.source_jid ?? c?.source_id ?? null;
  }

  // Best-effort send via Evolution — local row update still proceeds on failure.
  let sendWarning: string | null = null;
  if (m.evolution_message_id && remoteJid && m.instance_id) {
    try {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("evolution_instance_name")
        .eq("id", m.instance_id)
        .maybeSingle();
      const instanceName = (inst as { evolution_instance_name?: string } | null)
        ?.evolution_instance_name;
      if (instanceName) {
        const key: EvolutionMessageKey = {
          id: m.evolution_message_id,
          remoteJid,
          fromMe: m.direction === "outbound",
        };
        await getEvolutionClient().sendReaction(instanceName, key, emoji);
      }
    } catch (e) {
      sendWarning = e instanceof Error ? e.message : "reaction_send_failed";
    }
  }

  // Update the row's reactions jsonb. Empty emoji removes our ("self") reaction.
  const existing = Array.isArray(m.reactions) ? m.reactions : [];
  const withoutMine = existing.filter((r) => r.actor !== "self");
  const nextReactions = emoji
    ? [...withoutMine, { emoji, fromMe: true, actor: "self" }]
    : withoutMine;

  await admin
    .from("whatsapp_messages")
    .update({ reactions: nextReactions })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({
    ok: true,
    reactions: nextReactions,
    ...(sendWarning ? { send_warning: sendWarning } : {}),
  });
}
