import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/collab/notifications";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * lib/whatsapp/wa-notifications.ts — typed WhatsApp notifications (EPIC-16).
 *
 * Builds on the shared `notifications` table + lib/collab/notifications.ts
 * (do NOT build a parallel system). Wave 2 already inserted
 * `whatsapp.conversation_assignment` and `whatsapp.conversation_mention`.
 * Wave 4 extends the taxonomy with new-message notifications for the assignee
 * and for participants/watchers, wired from the inbound webhook.
 *
 * Taxonomy (kind):
 *   whatsapp.conversation_assignment           (Wave 2)
 *   whatsapp.conversation_mention              (Wave 2)
 *   whatsapp.assigned_conversation_new_message (Wave 4)
 *   whatsapp.participating_new_message         (Wave 4)
 */

export const WA_NOTIFICATION_KINDS = [
  "whatsapp.conversation_assignment",
  "whatsapp.conversation_mention",
  "whatsapp.assigned_conversation_new_message",
  "whatsapp.participating_new_message",
] as const;

export type WaNotificationKind = (typeof WA_NOTIFICATION_KINDS)[number];

/**
 * On a new INBOUND message, notify the assignee (assigned_conversation_new_
 * message) and every other participant/watcher (participating_new_message).
 * Best-effort — never throws (caller is the webhook).
 *
 * De-dupe guard: we only notify if the operator doesn't already have an UNREAD
 * notification of the same kind for this conversation, so a chatty customer
 * doesn't generate one bell-buzz per message.
 */
export async function notifyConversationNewMessage(
  admin: Admin,
  params: {
    workspaceId: string;
    conversationId: string;
    title: string;
    preview: string;
  },
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("whatsapp_conversations")
      .select("assignee_id")
      .eq("id", params.conversationId)
      .maybeSingle();
    const assigneeId =
      (conv as { assignee_id: string | null } | null)?.assignee_id ?? null;

    // Participants/watchers.
    const { data: parts } = await admin
      .from("whatsapp_conversation_participants")
      .select("user_id")
      .eq("workspace_id", params.workspaceId)
      .eq("conversation_id", params.conversationId);
    const participantIds = new Set(
      (parts ?? []).map((p) => (p as { user_id: string }).user_id),
    );
    if (assigneeId) participantIds.delete(assigneeId); // assignee handled separately

    const href = `/tools/whatsapp?conversation=${params.conversationId}`;
    const previewText = params.preview.slice(0, 140);

    if (assigneeId) {
      if (
        !(await hasUnread(
          admin,
          assigneeId,
          "whatsapp.assigned_conversation_new_message",
          params.conversationId,
        ))
      ) {
        await safeCreate({
          recipientUserId: assigneeId,
          workspaceId: params.workspaceId,
          kind: "whatsapp.assigned_conversation_new_message",
          conversationId: params.conversationId,
          title: `New message — ${params.title}`,
          body: previewText,
          href,
        });
      }
    }

    for (const uid of participantIds) {
      if (
        await hasUnread(
          admin,
          uid,
          "whatsapp.participating_new_message",
          params.conversationId,
        )
      ) {
        continue;
      }
      await safeCreate({
        recipientUserId: uid,
        workspaceId: params.workspaceId,
        kind: "whatsapp.participating_new_message",
        conversationId: params.conversationId,
        title: `New message — ${params.title}`,
        body: previewText,
        href,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.notifications] new-message notify failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function hasUnread(
  admin: Admin,
  userId: string,
  kind: string,
  conversationId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .eq("kind", kind)
    .eq("source_entity_id", conversationId)
    .is("read_at", null);
  return (count ?? 0) > 0;
}

async function safeCreate(opts: {
  recipientUserId: string;
  workspaceId: string;
  kind: string;
  conversationId: string;
  title: string;
  body: string;
  href: string;
}): Promise<void> {
  try {
    await createNotification({
      recipientUserId: opts.recipientUserId,
      workspaceId: opts.workspaceId,
      kind: opts.kind,
      sourceEntityType: "whatsapp_conversation",
      sourceEntityId: opts.conversationId,
      title: opts.title,
      body: opts.body,
      href: opts.href,
    });
  } catch {
    // non-fatal
  }
}
