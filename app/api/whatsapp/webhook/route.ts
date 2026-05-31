import { NextResponse, after, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  recordMessageOnConversation,
  resolveConversation,
} from "@/lib/whatsapp/conversations";
import { rehostInboundMedia } from "@/lib/whatsapp/media";
import { signInstanceWebhook } from "@/lib/whatsapp/instance-manager";
import { parseEvolutionEvent } from "@/lib/whatsapp/webhook-parser";
import type {
  ParsedEvolutionEvent,
  ParsedWhatsAppMessage,
  WhatsAppInstanceRow,
} from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Evolution → Spacefield webhook.
 *
 * URL shape: /api/whatsapp/webhook?instance=<name>&secret=<hex>
 *
 * Auth is by HMAC: `secret = sha256(instanceName, WHATSAPP_WEBHOOK_SECRET)`.
 * That avoids burning a shared secret in plaintext on Evolution while
 * keeping every per-instance webhook URL unique.
 *
 * We always 200 to Evolution so it doesn't pile up retries. Any
 * processing error is logged and swallowed.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const instanceName = sp.get("instance");
  const secret = sp.get("secret");

  if (!instanceName || !secret) {
    return NextResponse.json(
      { error: "instance and secret required" },
      { status: 400 },
    );
  }

  let expected: string;
  try {
    expected = signInstanceWebhook(instanceName);
  } catch (e) {
    // Webhook secret env missing — log loud, deny.
    // eslint-disable-next-line no-console
    console.error("[whatsapp.webhook] signing failed:", e);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!constantTimeEquals(secret, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const parsed = parseEvolutionEvent(payload);
  // Always ack 200; we don't want Evolution retrying.
  try {
    await dispatch(parsed, instanceName);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.webhook] dispatch error",
      parsed.type,
      e instanceof Error ? e.message : String(e),
    );
  }

  return NextResponse.json({ ok: true });
}

/** Process a parsed event against the instance row. */
async function dispatch(
  event: ParsedEvolutionEvent,
  fallbackInstanceName: string,
): Promise<void> {
  const admin = createAdminClient();
  const instanceName = event.instanceName || fallbackInstanceName;

  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("evolution_instance_name", instanceName)
    .maybeSingle();

  if (!instRow) {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp.webhook] no instance row for",
      instanceName,
      "event:",
      event.type,
    );
    return;
  }
  const inst = instRow as WhatsAppInstanceRow;

  switch (event.type) {
    case "MESSAGES_UPSERT": {
      const direction = event.direction;
      const msg = event.message;
      const isGroup = msg.remoteJid.endsWith("@g.us");
      const chatType = isGroup ? "group" : "individual";

      // ── Reactions: never a new bubble. Mutate the target's reactions jsonb. ──
      if (msg.reactionEmoji !== null && msg.reactionTargetId) {
        await applyReaction(admin, inst.workspace_id, msg);
        await admin
          .from("whatsapp_instances")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", inst.id);
        return;
      }

      // Resolve CRM contact. For groups the remoteNumber is the group JID
      // localpart, not a real phone — only link/auto-create contacts for
      // individuals so we don't pollute CRM with group "contacts".
      let contactId: string | null = null;
      if (!isGroup && msg.remoteNumber) {
        if (direction === "inbound") {
          contactId = await findOrCreateContact(
            inst.workspace_id,
            msg.remoteNumber,
          );
        } else {
          const { data: existing } = await admin
            .from("crm_contacts")
            .select("id")
            .eq("workspace_id", inst.workspace_id)
            .eq("phone", msg.remoteNumber)
            .maybeSingle();
          if (existing) contactId = (existing as { id: string }).id;
        }
      }

      // Resolve (or create) the conversation this message belongs to.
      const conv = await resolveConversation(admin, {
        workspaceId: inst.workspace_id,
        instanceId: inst.id,
        sourceId: msg.remoteNumber,
        sourceJid: msg.remoteJid,
        chatType,
        contactId,
        // For groups, the latest sender's pushName is NOT the group subject,
        // so never seed a group title from pushName. Individual titles come
        // from CRM hydration in the list route, so leave null here too.
        title: null,
      });

      // sender_name / sender_jid are only meaningful inside a group thread,
      // where multiple participants speak. For 1:1 chats they're redundant.
      const row = {
        workspace_id: inst.workspace_id,
        instance_id: inst.id,
        contact_id: contactId,
        conversation_id: conv?.id ?? null,
        direction,
        from_number: direction === "inbound" ? msg.remoteNumber : null,
        to_number: direction === "outbound" ? msg.remoteNumber : null,
        body: msg.body,
        media_url: msg.mediaUrl,
        media_type: msg.mediaType,
        media_mime: msg.mimetype,
        reply_to_message_id: msg.replyToId,
        sender_name: isGroup ? msg.pushName : null,
        sender_jid: isGroup ? msg.participant : null,
        status:
          direction === "outbound" ? ("sent" as const) : ("delivered" as const),
        evolution_message_id: msg.evolutionMessageId,
        sent_at: direction === "outbound" ? msg.timestamp : null,
        received_at: direction === "inbound" ? msg.timestamp : null,
      };

      // Upsert by evolution_message_id so retries are idempotent. Return the
      // row id so we can attach media + update conversation activity.
      const { data: upserted, error: upsertErr } = await admin
        .from("whatsapp_messages")
        .upsert(row, { onConflict: "evolution_message_id" })
        .select("id")
        .single();
      if (upsertErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] upsert msg failed:", upsertErr.message);
      }
      const messageRowId = (upserted as { id: string } | null)?.id ?? null;

      // Roll the conversation activity counters atomically (RPC).
      if (conv) {
        try {
          await recordMessageOnConversation(admin, {
            conversationId: conv.id,
            direction,
            body: msg.body,
            mediaType: msg.mediaType,
            createdAt: msg.timestamp,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(
            "[whatsapp.webhook] record activity failed:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      // Re-host inbound media AFTER acking — the raw media_url is an
      // undecryptable .enc blob, so we pull the decrypted bytes from
      // Evolution and stash them in private Storage. Never block the 200.
      if (conv && messageRowId && msg.mediaType) {
        scheduleMediaRehost(inst, msg, messageRowId);
      }

      await admin
        .from("whatsapp_instances")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", inst.id);
      return;
    }

    case "MESSAGES_UPDATE": {
      const { error: updErr } = await admin
        .from("whatsapp_messages")
        .update({ status: event.status })
        .eq("evolution_message_id", event.evolutionMessageId)
        .eq("workspace_id", inst.workspace_id);
      if (updErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] update status failed:", updErr.message);
      }
      return;
    }

    case "CONNECTION_UPDATE": {
      const patch: Record<string, unknown> = { status: event.status };
      if (event.phoneNumber) patch.phone_number = event.phoneNumber;
      if (event.status === "connected" && !inst.paired_at) {
        patch.paired_at = new Date().toISOString();
        patch.qr_code = null;
      }
      patch.last_seen_at = new Date().toISOString();
      const { error: connErr } = await admin
        .from("whatsapp_instances")
        .update(patch)
        .eq("id", inst.id);
      if (connErr) {
        // eslint-disable-next-line no-console
        console.error(
          "[whatsapp.webhook] connection_update failed:",
          connErr.message,
        );
      }
      return;
    }

    case "QRCODE_UPDATED": {
      const { error: qrErr } = await admin
        .from("whatsapp_instances")
        .update({
          qr_code: event.qrCode || null,
          status: event.qrCode ? "qr_pending" : inst.status,
        })
        .eq("id", inst.id);
      if (qrErr) {
        // eslint-disable-next-line no-console
        console.error("[whatsapp.webhook] qr_update failed:", qrErr.message);
      }
      return;
    }

    case "UNKNOWN":
    default:
      // No-op. The event was acked 200 and parsed but we don't model it.
      return;
  }
}

/**
 * Apply a WhatsApp reaction to its target message's `reactions` jsonb.
 * An empty emoji removes that actor's reaction; otherwise it adds/replaces
 * the actor's entry. Reactions are stored as
 *   [{ emoji, fromMe, actor }, ...]
 * keyed by `actor` (the reactor's number). Best-effort — never throws.
 */
async function applyReaction(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  msg: ParsedWhatsAppMessage,
): Promise<void> {
  const targetId = msg.reactionTargetId;
  if (!targetId) return;
  const { data: target, error } = await admin
    .from("whatsapp_messages")
    .select("id, reactions")
    .eq("workspace_id", workspaceId)
    .eq("evolution_message_id", targetId)
    .maybeSingle();
  if (error || !target) return;
  const row = target as {
    id: string;
    reactions: Array<{ emoji: string; fromMe: boolean; actor: string }> | null;
  };
  // The reactor: in a group it's the participant; in a 1:1 it's the peer
  // (remoteNumber) or "self" when fromMe.
  const actor = msg.fromMe
    ? "self"
    : msg.participant
      ? msg.participant.split("@")[0]?.replace(/\D/g, "") || msg.remoteNumber
      : msg.remoteNumber;
  const existing = Array.isArray(row.reactions) ? row.reactions : [];
  const next = existing.filter((r) => r.actor !== actor);
  if (msg.reactionEmoji) {
    next.push({ emoji: msg.reactionEmoji, fromMe: msg.fromMe, actor });
  }
  const { error: updErr } = await admin
    .from("whatsapp_messages")
    .update({ reactions: next })
    .eq("id", row.id);
  if (updErr) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp.webhook] reaction update failed:", updErr.message);
  }
}

/**
 * Re-host inbound media post-response. Uses Next's `after()` so the 200 ack
 * goes out first; on any failure we swallow + log (media is best-effort and
 * must never break ingestion). A fresh admin client is created inside the
 * callback because the request-scoped one may be torn down after the response.
 */
function scheduleMediaRehost(
  inst: WhatsAppInstanceRow,
  msg: ParsedWhatsAppMessage,
  messageRowId: string,
): void {
  const run = async (): Promise<void> => {
    try {
      const admin = createAdminClient();
      const client = getEvolutionClient();
      const result = await rehostInboundMedia(admin, client, {
        instanceName: inst.evolution_instance_name,
        message: msg,
        workspaceId: inst.workspace_id,
        messageRowId,
      });
      if (result) {
        await admin
          .from("whatsapp_messages")
          .update({
            media_storage_path: result.storagePath,
            media_mime: result.mime,
          })
          .eq("id", messageRowId);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp.webhook] media rehost failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  };
  try {
    after(run());
  } catch {
    // `after` unavailable in this context — fall back to fire-and-forget.
    void run();
  }
}

/**
 * Find a CRM contact by phone or auto-create a minimal one.
 * Service-role client is used because the webhook has no session.
 */
async function findOrCreateContact(
  workspaceId: string,
  phone: string,
): Promise<string | null> {
  if (!phone) return null;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error } = await admin
    .from("crm_contacts")
    .insert({
      workspace_id: workspaceId,
      phone,
      first_name: null,
      last_name: null,
      // CRM defaults to public; WhatsApp imports stay public so the
      // shop owner's team can read the thread.
      visibility: "public",
      notes: "Auto-created from inbound WhatsApp message",
    })
    .select("id")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.webhook] auto-create contact failed:",
      error.message,
    );
    return null;
  }

  return (inserted as { id: string }).id;
}
