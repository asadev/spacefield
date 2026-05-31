import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/collab/notifications";
import { parseMentions } from "@/lib/whatsapp/inbox";
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
 * POST /api/whatsapp/conversations/[id]/notes  (EPIC-04)
 *
 * Posts an INTERNAL note: a whatsapp_messages row with is_private=true.
 * NEVER sent to WhatsApp (no Evolution call). Rendered distinctly in the
 * thread. @mentions in the body notify the mentioned workspace member and
 * add them as a conversation participant.
 *
 * Body: { workspace_id, body, mentions?: string[] }
 *   - mentions[] is an optional explicit list of workspace user ids the
 *     composer resolved (preferred). We also parse @handle / @[uuid] from
 *     the body as a fallback.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 * Response: { ok: true, message_id, notified: string[] }
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

  const parsed = await readJson<{
    workspace_id?: string;
    body?: string;
    mentions?: string[];
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, body: noteBody } = parsed.body;
  const explicitMentions = Array.isArray(parsed.body.mentions)
    ? parsed.body.mentions.filter((x) => typeof x === "string")
    : [];
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!noteBody?.trim()) return jsonError("body required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Ownership + instance for the row.
  const { data: conv, error: convErr } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, instance_id, title, source_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return jsonError(convErr.message, 500);
  if (!conv) return jsonError("not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    instance_id: string;
    title: string | null;
    source_id: string;
  };
  if (c.workspace_id !== workspaceId) return jsonError("forbidden", 403);

  const nowIso = new Date().toISOString();

  // Insert the private note. is_private=true → webhook/send never touches it,
  // the messages route returns it, the UI renders it distinctly.
  const { data: inserted, error: insErr } = await admin
    .from("whatsapp_messages")
    .insert({
      workspace_id: workspaceId,
      instance_id: c.instance_id,
      conversation_id: conversationId,
      direction: "outbound",
      body: noteBody.trim(),
      status: "sent",
      is_private: true,
      sender_name: null,
      created_at: nowIso,
    })
    .select("id")
    .single();
  if (insErr) return jsonError(insErr.message, 500);
  const messageId = (inserted as { id: string }).id;

  // ── resolve @mentions → workspace user ids ──
  const wantUserIds = new Set<string>(explicitMentions);
  const { userIds: bodyIds, handles } = parseMentions(noteBody);
  for (const id of bodyIds) wantUserIds.add(id);

  // Resolve bare @handles against workspace members' profile name/email.
  if (handles.length > 0) {
    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId);
    const memberIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
    if (memberIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", memberIds);
      for (const p of (profiles ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        username: string | null;
      }>) {
        const nameToken = (p.full_name ?? "").toLowerCase().replace(/\s+/g, "");
        const usernameToken = (p.username ?? "").toLowerCase();
        const firstToken = (p.full_name ?? "").split(/\s+/)[0]?.toLowerCase() ?? "";
        for (const h of handles) {
          if (h === nameToken || h === usernameToken || h === firstToken) {
            wantUserIds.add(p.user_id);
          }
        }
      }
    }
  }

  // Only notify users who are actually members of this workspace, never self.
  const notified: string[] = [];
  if (wantUserIds.size > 0) {
    const ids = Array.from(wantUserIds);
    const { data: validMembers } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .in("user_id", ids);
    const validIds = new Set(
      (validMembers ?? []).map((m) => (m as { user_id: string }).user_id),
    );
    for (const uid of ids) {
      if (!validIds.has(uid) || uid === auth.user.id) continue;
      // add as participant (idempotent)
      try {
        await admin
          .from("whatsapp_conversation_participants")
          .upsert(
            { workspace_id: workspaceId, conversation_id: conversationId, user_id: uid },
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
          );
      } catch {
        // non-fatal
      }
      try {
        await createNotification({
          recipientUserId: uid,
          workspaceId,
          kind: "whatsapp.conversation_mention",
          sourceEntityType: "whatsapp_conversation",
          sourceEntityId: conversationId,
          actorUserId: auth.user.id,
          title: "You were mentioned in a WhatsApp note",
          body: `${c.title ?? c.source_id}: ${noteBody.trim().slice(0, 120)}`,
          href: `/tools/whatsapp?conversation=${conversationId}`,
        });
        notified.push(uid);
      } catch {
        // non-fatal — note already saved
      }
    }
  }

  return NextResponse.json({ ok: true, message_id: messageId, notified });
}
