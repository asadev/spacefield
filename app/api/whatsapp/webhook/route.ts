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
import { detectConsentKeyword, recordOptOut, recordOptIn } from "@/lib/whatsapp/consent";
import { runInboundAutomation } from "@/lib/whatsapp/automation";
import { autoAssignConversation } from "@/lib/whatsapp/assign";
import {
  emitConversationCreated,
  emitConversationReopened,
} from "@/lib/whatsapp/reporting";
import { notifyConversationNewMessage } from "@/lib/whatsapp/wa-notifications";
import type { PersonalizeContact } from "@/lib/whatsapp/personalize";
import type {
  ParsedEvolutionEvent,
  ParsedWhatsAppMessage,
  WhatsAppInstanceRow,
  WhatsAppMessageDirection,
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

      // ── Reporting events (EPIC-15) + new-message notifications (EPIC-16) ──
      // Emit + notify post-response so the 200 ack is never delayed. All
      // best-effort. conversation_created fires once on a brand-new thread;
      // conversation_reopened when an inbound lands on a resolved/snoozed convo
      // (status 1 or 3 BEFORE this message reopened it via the RPC).
      if (conv) {
        const wasClosed = conv.status === 1 || conv.status === 3;
        scheduleReportingAndNotify(inst, conv.id, conv.isNew, wasClosed, {
          direction,
          isGroup,
          contactId,
          title: isGroup ? msg.pushName : null,
          fallbackTitle: msg.remoteNumber,
          preview: msg.body || (msg.mediaType ? `[${msg.mediaType}]` : ""),
        });
      }

      // ── Auto-assignment (EPIC-20) ──
      // Brand-new INDIVIDUAL conversation + instance has auto-assign on → pick
      // an available agent (round-robin/capacity/presence). Default off; no-op
      // otherwise. Manual single-assignee (Wave 2) stays the baseline.
      if (conv?.isNew && direction === "inbound" && !isGroup) {
        await autoAssignConversation(admin, {
          conversationId: conv.id,
          instanceId: inst.id,
        });
      }

      // ── Consent + automation (EPIC-12 + EPIC-09) ──
      // Only for inbound INDIVIDUAL messages (groups + our own sends excluded).
      // STOP/START handling runs FIRST (the guardrail), then the automation
      // engine answers first-timers / keywords / business-hours — all
      // post-response so the 200 ack is never delayed.
      if (
        direction === "inbound" &&
        !isGroup &&
        conv &&
        contactId &&
        msg.remoteNumber
      ) {
        scheduleConsentAndAutomation(inst, conv.id, contactId, msg);
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
 * Post-response reporting events (EPIC-15) + new-message notifications
 * (EPIC-16). Runs after the 200 ack via `after()`. Best-effort throughout.
 *   - conversation_created  : once, on a brand-new conversation row.
 *   - conversation_reopened : an inbound landing on a resolved/snoozed convo.
 *   - new-message bell      : notify the assignee + watchers on inbound.
 */
function scheduleReportingAndNotify(
  inst: WhatsAppInstanceRow,
  conversationId: string,
  isNew: boolean,
  wasClosed: boolean,
  msg: {
    direction: WhatsAppMessageDirection;
    isGroup: boolean;
    contactId: string | null;
    title: string | null;
    fallbackTitle: string;
    preview: string;
  },
): void {
  const run = async (): Promise<void> => {
    const admin = createAdminClient();
    try {
      if (isNew) {
        await emitConversationCreated(admin, {
          workspaceId: inst.workspace_id,
          conversationId,
          contactId: msg.contactId,
          instanceId: inst.id,
        });
      }
      if (msg.direction === "inbound") {
        if (wasClosed && !isNew) {
          await emitConversationReopened(admin, {
            workspaceId: inst.workspace_id,
            conversationId,
            contactId: msg.contactId,
            instanceId: inst.id,
          });
        }
        // Notify assignee + watchers (de-duped on unread per conversation).
        await notifyConversationNewMessage(admin, {
          workspaceId: inst.workspace_id,
          conversationId,
          title: msg.title || msg.fallbackTitle,
          preview: msg.preview,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp.webhook] reporting/notify failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  };
  try {
    after(run());
  } catch {
    void run();
  }
}

/**
 * Post-response consent (EPIC-12) + automation (EPIC-09) for an inbound
 * individual message. Runs after the 200 ack via `after()`:
 *   1. STOP keyword → record opt-out + suppress future broadcasts.
 *      START keyword → re-subscribe. (No auto-reply to consent messages.)
 *   2. Otherwise → run the automation engine (welcome / away / keyword /
 *      menu) which itself respects opt-out + throttle on every send.
 * Best-effort throughout — a failure here must never break ingestion.
 */
function scheduleConsentAndAutomation(
  inst: WhatsAppInstanceRow,
  conversationId: string,
  contactId: string,
  msg: ParsedWhatsAppMessage,
): void {
  const run = async (): Promise<void> => {
    const admin = createAdminClient();
    try {
      // 1. Consent keywords (STOP / START).
      const consent = detectConsentKeyword(msg.body);
      if (consent.signal === "opt_out") {
        await recordOptOut(admin, {
          workspaceId: inst.workspace_id,
          contactId,
          source: "stop_keyword",
          reason: `matched "${consent.keyword}"`,
        });
        return; // never auto-reply to a STOP
      }
      if (consent.signal === "opt_in") {
        await recordOptIn(admin, {
          workspaceId: inst.workspace_id,
          contactId,
          source: "start_keyword",
          reason: `matched "${consent.keyword}"`,
          grantConsent: true,
        });
        return; // re-subscribe; don't run keyword automation on the same msg
      }

      // 2. Is this the conversation's first INBOUND message? (welcome gate)
      //    The just-upserted row is already counted, so "first" = exactly 1
      //    inbound message exists for the conversation.
      const { count } = await admin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound");
      const isFirstInbound = (count ?? 0) <= 1;

      // 3. CRM contact for personalization.
      let contact: PersonalizeContact | null = null;
      const { data: ct } = await admin
        .from("crm_contacts")
        .select("first_name, last_name, phone, email, custom")
        .eq("id", contactId)
        .eq("workspace_id", inst.workspace_id)
        .maybeSingle();
      if (ct) {
        const row = ct as PersonalizeContact;
        contact = {
          first_name: row.first_name,
          last_name: row.last_name,
          phone: row.phone,
          email: row.email,
          custom: row.custom,
        };
      }

      await runInboundAutomation({
        admin,
        instance: inst,
        workspaceId: inst.workspace_id,
        conversationId,
        contactId,
        contact,
        toNumber: msg.remoteNumber,
        body: msg.body ?? "",
        isFirstInbound,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp.webhook] consent/automation failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
  };
  try {
    after(run());
  } catch {
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
