import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import type { EvolutionMessageKey } from "@/lib/whatsapp/client";
import { markConversationRead } from "@/lib/whatsapp/conversations";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/conversations/[id]/read
 *
 * Marks a conversation read: zeroes unread_count, sets read_cursor_at, and
 * flips its inbound messages to status='read'. Then best-effort tells
 * Evolution to surface blue ticks for the customer (failure never 500s).
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 * `workspace_id` comes from the JSON body or the `?workspace_id=` query param.
 *
 * Response: { ok: true }
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

  let bodyWorkspaceId: string | null = null;
  try {
    const body = (await req.json()) as { workspace_id?: string } | null;
    bodyWorkspaceId = body?.workspace_id ?? null;
  } catch {
    bodyWorkspaceId = null;
  }
  const workspaceId =
    bodyWorkspaceId ?? req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Verify the conversation belongs to this workspace.
  const { data: conv, error: convErr } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, instance_id, source_jid")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return jsonError(convErr.message, 500);
  if (!conv) return jsonError("not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    instance_id: string;
    source_jid: string | null;
  };
  if (c.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const nowIso = new Date().toISOString();
  await markConversationRead(admin, conversationId, nowIso);

  // Best-effort: tell Evolution to show blue ticks. Gather the most recent
  // inbound evolution_message_ids for this conversation (cap 50). Any failure
  // here must NOT 500 the operator's read action.
  try {
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("evolution_instance_name")
      .eq("id", c.instance_id)
      .maybeSingle();
    const instanceName = (inst as { evolution_instance_name?: string } | null)
      ?.evolution_instance_name;
    if (instanceName && c.source_jid) {
      const { data: msgs } = await admin
        .from("whatsapp_messages")
        .select("evolution_message_id")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(50);
      const keys: EvolutionMessageKey[] = (msgs ?? [])
        .map(
          (m) =>
            (m as { evolution_message_id: string | null }).evolution_message_id,
        )
        .filter((id): id is string => !!id)
        .map((id) => ({ id, remoteJid: c.source_jid as string, fromMe: false }));
      if (keys.length > 0) {
        const client = getEvolutionClient();
        await client.markMessageAsRead(instanceName, keys);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.conversations.read] blue-tick sync failed:",
      e instanceof Error ? e.message : String(e),
    );
  }

  return NextResponse.json({ ok: true });
}
