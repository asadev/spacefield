import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppChatType, WhatsAppMessageDirection } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export interface ResolveConversationInput {
  workspaceId: string;
  instanceId: string;
  sourceId: string;
  sourceJid?: string | null;
  chatType: WhatsAppChatType;
  contactId?: string | null;
  title?: string | null;
}

export interface ResolvedConversation { id: string; status: number; isNew: boolean; }

export async function resolveConversation(
  admin: Admin, input: ResolveConversationInput,
): Promise<ResolvedConversation | null> {
  const { instanceId, sourceId } = input;
  if (!sourceId) return null;
  const { data: existing } = await admin
    .from("whatsapp_conversations")
    .select("id, status, contact_id, source_jid, title")
    .eq("instance_id", instanceId).eq("source_id", sourceId).maybeSingle();
  if (existing) {
    const row = existing as { id: string; status: number; contact_id: string | null; source_jid: string | null; title: string | null; };
    const patch: Record<string, unknown> = {};
    if (input.contactId && !row.contact_id) patch.contact_id = input.contactId;
    if (input.sourceJid && !row.source_jid) patch.source_jid = input.sourceJid;
    if (input.title && !row.title) patch.title = input.title;
    if (Object.keys(patch).length > 0) await admin.from("whatsapp_conversations").update(patch).eq("id", row.id);
    return { id: row.id, status: row.status, isNew: false };
  }
  const { data: created, error } = await admin
    .from("whatsapp_conversations")
    .insert({
      workspace_id: input.workspaceId, instance_id: instanceId, contact_id: input.contactId ?? null,
      source_id: sourceId, source_jid: input.sourceJid ?? null, chat_type: input.chatType, title: input.title ?? null,
    }).select("id, status").single();
  if (!error && created) return { id: (created as { id: string }).id, status: (created as { status: number }).status, isNew: true };
  const { data: raced } = await admin
    .from("whatsapp_conversations").select("id, status")
    .eq("instance_id", instanceId).eq("source_id", sourceId).maybeSingle();
  if (raced) return { id: (raced as { id: string }).id, status: (raced as { status: number }).status, isNew: false };
  return null;
}

export interface RecordMessageInput {
  conversationId: string;
  direction: WhatsAppMessageDirection;
  body: string | null;
  mediaType?: string | null;
  createdAt: string;
  isRead?: boolean;
}

function previewFor(body: string | null, mediaType?: string | null): string {
  const text = (body ?? "").trim();
  if (text) return text.slice(0, 180);
  switch (mediaType) {
    case "image": return "📷 Photo";
    case "video": return "🎬 Video";
    case "audio": return "🎤 Voice message";
    case "document": return "📄 Document";
    case "sticker": return "🌟 Sticker";
    default: return "";
  }
}

export async function recordMessageOnConversation(admin: Admin, input: RecordMessageInput): Promise<void> {
  const preview = previewFor(input.body, input.mediaType);
  if (input.direction === "inbound") {
    await admin.rpc("whatsapp_record_inbound", {
      p_conversation_id: input.conversationId, p_preview: preview, p_created_at: input.createdAt, p_is_read: input.isRead ?? false,
    });
  } else {
    await admin.rpc("whatsapp_record_outbound", {
      p_conversation_id: input.conversationId, p_preview: preview, p_created_at: input.createdAt,
    });
  }
}

export async function markConversationRead(admin: Admin, conversationId: string, readAt: string): Promise<void> {
  await admin.from("whatsapp_conversations").update({ unread_count: 0, read_cursor_at: readAt }).eq("id", conversationId);
  await admin.from("whatsapp_messages").update({ status: "read" })
    .eq("conversation_id", conversationId).eq("direction", "inbound").neq("status", "read");
}
