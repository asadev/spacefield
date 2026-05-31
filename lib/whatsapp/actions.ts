import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "./client";
import { recordMessageOnConversation } from "./conversations";
import { isSuppressed } from "./consent";
import {
  canSendToContact,
  flagSoftBan,
  isInstanceSoftBanned,
  looksLikeSoftBan,
} from "./throttle";
import { personalizeForContact, type PersonalizeContact } from "./personalize";
import type { WhatsAppInstanceRow } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Shared WhatsApp action executor (built ONCE for EPIC-09 automation, reused
 * by Wave-4 macros + Wave-5 workflows). A single vocabulary of actions runs
 * against a conversation; every outbound action routes through the throttle
 * AND respects opt-out (isSuppressed), and a block signal trips the soft-ban.
 *
 * Action shape (stored in JSONB on automation_rules.actions / macros.actions):
 *   { "type": "send_text",   "params": { "text": "Hi {{contact.firstName}}" } }
 *   { "type": "send_canned", "params": { "short_code": "price" } }
 *   { "type": "send_media",  "params": { "url": "...", "caption": "...", "media_type": "image" } }
 *   { "type": "send_menu",   "params": { "header": "...", "options": ["Prices","Hours","Human"], "footer": "..." } }
 *   { "type": "add_label",   "params": { "label_id": "uuid" } }
 *   { "type": "set_status",  "params": { "status": 0|1|2|3 } }
 *   { "type": "set_priority","params": { "priority": 0..4 } }
 *   { "type": "assign",      "params": { "user_id": "uuid" } }
 */

export interface WhatsAppAction {
  type: string;
  params?: Record<string, unknown>;
}

export interface ActionContext {
  workspaceId: string;
  instance: WhatsAppInstanceRow;
  conversationId: string;
  /** The remote phone (digits) or group JID to send to. */
  toNumber: string;
  /** CRM contact for personalization + suppression (null for raw/group). */
  contactId: string | null;
  contact: PersonalizeContact | null;
  /** Optional actor user id (who ran a macro); null for automation. */
  actorUserId?: string | null;
}

export interface ActionResult {
  type: string;
  ok: boolean;
  skipped?: string; // reason if skipped (e.g. suppressed, cooldown)
  error?: string;
}

const STATUS_VALUES = new Set([0, 1, 2, 3]);

function p(params: Record<string, unknown> | undefined, key: string): string {
  const v = params?.[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Render a numbered text menu. NO native buttons/lists (unreliable over
 * Baileys) — a numbered text menu is the portable router primitive.
 *   header
 *   1. Prices
 *   2. Hours
 *   3. Human
 *   footer
 */
export function renderMenu(
  header: string,
  options: string[],
  footer?: string,
): string {
  const lines: string[] = [];
  if (header) lines.push(header.trim());
  options.forEach((opt, i) => lines.push(`${i + 1}. ${String(opt).trim()}`));
  if (footer) lines.push("", footer.trim());
  return lines.join("\n");
}

/**
 * Send an outbound message as part of an action. Centralizes the guardrails:
 *   1. soft-ban paused?  → skip (whole instance is cooling down)
 *   2. isSuppressed?     → skip (contact opted out)
 *   3. throttle cap/cooldown? → skip
 * then sends, records the message + conversation activity, and trips the
 * soft-ban on a block-signature failure. Returns ok/skip/error.
 */
async function sendOutbound(
  admin: Admin,
  ctx: ActionContext,
  body: string,
  media?: { url: string; type?: "image" | "video" | "audio" | "document"; caption?: string },
): Promise<ActionResult> {
  const client = getEvolutionClient();

  if (await isInstanceSoftBanned(ctx.instance.id)) {
    return { type: media ? "send_media" : "send_text", ok: false, skipped: "soft_ban_paused" };
  }
  // Opt-out gate (skipped for group sends / raw numbers with no contact link).
  if (ctx.contactId && (await isSuppressed(admin, ctx.workspaceId, ctx.contactId))) {
    return { type: media ? "send_media" : "send_text", ok: false, skipped: "suppressed" };
  }
  // Throttle: cap + per-contact cooldown. Individual chats only — group JIDs
  // aren't phone numbers, so the per-number cooldown doesn't apply.
  const isGroup = ctx.toNumber.includes("@") || ctx.toNumber.length > 15;
  if (!isGroup) {
    const guard = await canSendToContact(ctx.instance.id, ctx.toNumber);
    if (!guard.ok) {
      return { type: media ? "send_media" : "send_text", ok: false, skipped: guard.reason };
    }
  }

  try {
    const res = media
      ? await client.sendMedia(
          ctx.instance.evolution_instance_name,
          ctx.toNumber,
          media.url,
          media.caption ?? body,
          media.type,
        )
      : await client.sendText(ctx.instance.evolution_instance_name, ctx.toNumber, body);

    const now = new Date().toISOString();
    await admin.from("whatsapp_messages").insert({
      workspace_id: ctx.workspaceId,
      instance_id: ctx.instance.id,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      direction: "outbound",
      to_number: ctx.toNumber,
      body: media ? (media.caption ?? body) : body,
      media_url: media?.url ?? null,
      media_type: media?.type ?? null,
      status: "sent",
      evolution_message_id: res.messageId || null,
      sent_at: now,
    });
    await admin.from("whatsapp_send_log").insert({
      workspace_id: ctx.workspaceId,
      job_id: null,
      instance_id: ctx.instance.id,
      contact_id: ctx.contactId,
      to_number: ctx.toNumber,
      body: media ? (media.caption ?? body) : body,
      status: "sent",
      evolution_message_id: res.messageId || null,
    });
    await recordMessageOnConversation(admin, {
      conversationId: ctx.conversationId,
      direction: "outbound",
      body: media ? (media.caption ?? body) : body,
      mediaType: media?.type ?? null,
      createdAt: now,
    });
    return { type: media ? "send_media" : "send_text", ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "send_failed";
    if (looksLikeSoftBan(errMsg)) {
      await flagSoftBan(ctx.instance.id, `automation send: ${errMsg}`);
    }
    return { type: media ? "send_media" : "send_text", ok: false, error: errMsg };
  }
}

/** Execute a single action. */
async function runAction(
  admin: Admin,
  ctx: ActionContext,
  action: WhatsAppAction,
): Promise<ActionResult> {
  const params = action.params ?? {};
  switch (action.type) {
    case "send_text": {
      const text = personalizeForContact(p(params, "text"), ctx.contact);
      if (!text.trim()) return { type: action.type, ok: false, skipped: "empty" };
      return sendOutbound(admin, ctx, text);
    }
    case "send_canned": {
      const short = p(params, "short_code").replace(/^\//, "");
      const { data: canned } = await admin
        .from("whatsapp_canned_responses")
        .select("content")
        .eq("workspace_id", ctx.workspaceId)
        .eq("short_code", short)
        .maybeSingle();
      const content = (canned as { content: string } | null)?.content ?? "";
      if (!content) return { type: action.type, ok: false, skipped: "canned_not_found" };
      return sendOutbound(admin, ctx, personalizeForContact(content, ctx.contact));
    }
    case "send_media": {
      const url = p(params, "url");
      if (!url) return { type: action.type, ok: false, skipped: "no_url" };
      const mt = p(params, "media_type");
      const type = (["image", "video", "audio", "document"].includes(mt) ? mt : "image") as
        | "image"
        | "video"
        | "audio"
        | "document";
      const caption = personalizeForContact(p(params, "caption"), ctx.contact);
      return sendOutbound(admin, ctx, caption, { url, type, caption });
    }
    case "send_menu": {
      const options = Array.isArray(params.options)
        ? (params.options as unknown[]).map(String)
        : [];
      if (options.length === 0) return { type: action.type, ok: false, skipped: "no_options" };
      const body = renderMenu(
        personalizeForContact(p(params, "header"), ctx.contact),
        options,
        personalizeForContact(p(params, "footer"), ctx.contact),
      );
      return sendOutbound(admin, ctx, body);
    }
    case "add_label": {
      const labelId = p(params, "label_id");
      if (!labelId) return { type: action.type, ok: false, skipped: "no_label" };
      const { error } = await admin.from("whatsapp_taggings").upsert(
        {
          workspace_id: ctx.workspaceId,
          label_id: labelId,
          taggable_type: "conversation",
          taggable_id: ctx.conversationId,
          created_by: ctx.actorUserId ?? null,
        },
        { onConflict: "label_id,taggable_type,taggable_id" },
      );
      return error
        ? { type: action.type, ok: false, error: error.message }
        : { type: action.type, ok: true };
    }
    case "set_status": {
      const status = Number(params.status);
      if (!STATUS_VALUES.has(status)) return { type: action.type, ok: false, skipped: "bad_status" };
      const { error } = await admin.rpc("whatsapp_set_status", {
        p_conversation_id: ctx.conversationId,
        p_status: status,
        p_snoozed_until: null,
      });
      return error
        ? { type: action.type, ok: false, error: error.message }
        : { type: action.type, ok: true };
    }
    case "set_priority": {
      const priority = Number(params.priority);
      if (!(priority >= 0 && priority <= 4))
        return { type: action.type, ok: false, skipped: "bad_priority" };
      const { error } = await admin
        .from("whatsapp_conversations")
        .update({ priority })
        .eq("id", ctx.conversationId);
      return error
        ? { type: action.type, ok: false, error: error.message }
        : { type: action.type, ok: true };
    }
    case "assign": {
      const userId = p(params, "user_id") || null;
      const { error } = await admin
        .from("whatsapp_conversations")
        .update({ assignee_id: userId })
        .eq("id", ctx.conversationId);
      if (!error && userId) {
        await admin.from("whatsapp_conversation_participants").upsert(
          { workspace_id: ctx.workspaceId, conversation_id: ctx.conversationId, user_id: userId },
          { onConflict: "conversation_id,user_id" },
        );
      }
      return error
        ? { type: action.type, ok: false, error: error.message }
        : { type: action.type, ok: true };
    }
    default:
      return { type: action.type, ok: false, skipped: "unknown_action" };
  }
}

/**
 * Execute an ordered list of actions against a conversation. Stops sending
 * the moment a soft-ban pause is detected (returns the partial results) but
 * otherwise runs each action best-effort. Returns one result per action.
 */
export async function executeActions(
  admin: Admin,
  ctx: ActionContext,
  actions: WhatsAppAction[],
): Promise<ActionResult[]> {
  const out: ActionResult[] = [];
  for (const action of actions) {
    const r = await runAction(admin, ctx, action);
    out.push(r);
    if (r.skipped === "soft_ban_paused") break;
  }
  return out;
}
