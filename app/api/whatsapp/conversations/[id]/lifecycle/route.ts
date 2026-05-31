import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/collab/notifications";
import {
  isValidPriority,
  isValidStatus,
} from "@/lib/whatsapp/inbox";
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
 * PATCH /api/whatsapp/conversations/[id]/lifecycle
 *
 * One route for every lifecycle mutation (EPIC-03). Body may carry any
 * subset of:
 *   { workspace_id,
 *     status?: 0|1|2|3,                 // open/resolved/pending/snoozed
 *     priority?: 0|1|2|3|4,             // none..urgent
 *     assignee_id?: string|null,        // workspace user id, null to unassign
 *     snoozed_until?: ISO string }      // required when status=3
 *
 * Status is set via the whatsapp_set_status RPC so snoozed_until +
 * last_activity_at stay consistent. Assignee changes notify the new
 * assignee and add them as a participant.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 * Response: { ok: true, conversation: {...patched fields} }
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
    status?: number;
    priority?: number;
    assignee_id?: string | null;
    snoozed_until?: string | null;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const workspaceId = body.workspace_id;
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Ownership check.
  const { data: conv, error: convErr } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, title, source_id, assignee_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return jsonError(convErr.message, 500);
  if (!conv) return jsonError("not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    title: string | null;
    source_id: string;
    assignee_id: string | null;
  };
  if (c.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const patched: Record<string, unknown> = {};

  // ── status (+ snooze) via RPC ──
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
      return jsonError("status must be 0|1|2|3", 400);
    }
    let snoozedUntil: string | null = null;
    if (body.status === 3) {
      if (!body.snoozed_until) {
        return jsonError("snoozed_until required when status=snoozed", 400);
      }
      const t = new Date(body.snoozed_until);
      if (Number.isNaN(t.getTime())) return jsonError("invalid snoozed_until", 400);
      snoozedUntil = t.toISOString();
    }
    const { error: rpcErr } = await admin.rpc("whatsapp_set_status", {
      p_conversation_id: conversationId,
      p_status: body.status,
      p_snoozed_until: snoozedUntil,
    });
    if (rpcErr) return jsonError(rpcErr.message, 500);
    patched.status = body.status;
    patched.snoozed_until = snoozedUntil;
  }

  // ── priority ──
  if (body.priority !== undefined) {
    if (!isValidPriority(body.priority)) {
      return jsonError("priority must be 0..4", 400);
    }
    const { error } = await admin
      .from("whatsapp_conversations")
      .update({ priority: body.priority })
      .eq("id", conversationId)
      .eq("workspace_id", workspaceId);
    if (error) return jsonError(error.message, 500);
    patched.priority = body.priority;
  }

  // ── assignee ──
  if (body.assignee_id !== undefined) {
    const newAssignee = body.assignee_id;
    if (newAssignee) {
      // Validate the assignee is a member of THIS workspace.
      const { data: mem } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", newAssignee)
        .maybeSingle();
      if (!mem) return jsonError("assignee_not_in_workspace", 422);
    }
    const { error } = await admin
      .from("whatsapp_conversations")
      .update({ assignee_id: newAssignee })
      .eq("id", conversationId)
      .eq("workspace_id", workspaceId);
    if (error) return jsonError(error.message, 500);
    patched.assignee_id = newAssignee;

    // Notify + add participant when assigned to someone other than self.
    if (newAssignee && newAssignee !== c.assignee_id) {
      try {
        await admin
          .from("whatsapp_conversation_participants")
          .upsert(
            {
              workspace_id: workspaceId,
              conversation_id: conversationId,
              user_id: newAssignee,
            },
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
          );
      } catch {
        // non-fatal
      }
      if (newAssignee !== auth.user.id) {
        try {
          await createNotification({
            recipientUserId: newAssignee,
            workspaceId,
            kind: "whatsapp.conversation_assignment",
            sourceEntityType: "whatsapp_conversation",
            sourceEntityId: conversationId,
            actorUserId: auth.user.id,
            title: "Conversation assigned to you",
            body: `${c.title ?? c.source_id}`,
            href: `/tools/whatsapp?conversation=${conversationId}`,
          });
        } catch {
          // non-fatal — assignment already persisted
        }
      }
    }
  }

  if (Object.keys(patched).length === 0) {
    return jsonError("no_changes", 400);
  }

  return NextResponse.json({ ok: true, conversation: patched });
}
