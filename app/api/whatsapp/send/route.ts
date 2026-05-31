import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  recordMessageOnConversation,
  resolveConversation,
} from "@/lib/whatsapp/conversations";
import {
  canSendToContact,
  variateTemplate,
} from "@/lib/whatsapp/throttle";
import { emitOutboundResponseEvents } from "@/lib/whatsapp/reporting";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type {
  SendRequestBody,
  WhatsAppInstanceRow,
} from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Single-contact path hits Evolution synchronously; list/group enqueue
// returns fast. 60 is conservative headroom.
export const maxDuration = 60;

function normalisePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

/**
 * POST /api/whatsapp/send
 *
 * Single-contact body:
 *   { workspace_id, target_type: 'contact', target_id: <crm_contact_id|phone>,
 *     message, media_url?, template_variants?[] }
 *
 * Group body (target_id = group JID or whatsapp_groups.id):
 *   { workspace_id, target_type: 'group', target_id, message, ... }
 *
 * List body (target_id = whatsapp_lists.id):
 *   { workspace_id, target_type: 'list', target_id, message, ... }
 *
 * Single-contact + single-group sends synchronously and returns the
 * Evolution message id. List sends enqueue a row in whatsapp_send_jobs
 * and the cron runner (/api/cron/whatsapp-send-runner) drains it under
 * throttle.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<SendRequestBody>(req);
  if (!body.ok) return body.response;

  const {
    workspace_id: workspaceId,
    target_type: targetType,
    target_id: targetId,
    message,
    media_url: mediaUrl,
    template_variants: templateVariants,
    quoted_message_id: quotedId,
  } = body.body;

  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!targetType || !["contact", "group", "list"].includes(targetType)) {
    return jsonError("target_type must be 'contact'|'group'|'list'", 400);
  }
  if (!targetId) return jsonError("target_id required", 400);
  if (!message?.trim()) return jsonError("message required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!instRow) {
    return jsonError("no_connected_instance", 409);
  }
  const inst = instRow as WhatsAppInstanceRow;

  // ── list-target → enqueue ─────────────────────────────────────────
  if (targetType === "list") {
    const { data: list, error: listErr } = await admin
      .from("whatsapp_lists")
      .select("id, contact_ids")
      .eq("id", targetId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (listErr) return jsonError(listErr.message, 500);
    if (!list) return jsonError("list_not_found", 404);

    const total = Array.isArray((list as { contact_ids?: string[] }).contact_ids)
      ? (list as { contact_ids: string[] }).contact_ids.length
      : 0;

    const { data: job, error: jobErr } = await admin
      .from("whatsapp_send_jobs")
      .insert({
        workspace_id: workspaceId,
        instance_id: inst.id,
        target_type: "list",
        target_id: targetId,
        message_template: message,
        template_variants: templateVariants ?? [],
        media: mediaUrl ? { url: mediaUrl } : {},
        status: "queued",
        total_contacts: total,
        created_by: auth.user.id,
      })
      .select("id, status, total_contacts")
      .single();
    if (jobErr) return jsonError(jobErr.message, 500);

    return NextResponse.json({
      enqueued: true,
      job_id: (job as { id: string }).id,
      total_contacts: total,
    });
  }

  // ── group-target → send immediately to the JID ────────────────────
  if (targetType === "group") {
    // target_id may be a whatsapp_groups row id OR the raw evolution JID.
    let groupJid = targetId;
    if (!targetId.includes("@")) {
      const { data: grpRow } = await admin
        .from("whatsapp_groups")
        .select("evolution_group_id")
        .eq("id", targetId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (!grpRow) return jsonError("group_not_found", 404);
      groupJid = (grpRow as { evolution_group_id: string }).evolution_group_id;
    }

    const final = templateVariants?.length
      ? variateTemplate(templateVariants, `group:${groupJid}`)
      : message;

    try {
      const client = getEvolutionClient();
      const sent = mediaUrl
        ? await client.sendMedia(
            inst.evolution_instance_name,
            groupJid,
            mediaUrl,
            final,
            "image",
            quotedId ? { quotedId } : undefined,
          )
        : await client.sendText(
            inst.evolution_instance_name,
            groupJid,
            final,
            quotedId ? { quotedId } : undefined,
          );
      const evolutionMessageId = sent.messageId || null;
      const nowISO = new Date().toISOString();
      await admin.from("whatsapp_send_log").insert({
        workspace_id: workspaceId,
        instance_id: inst.id,
        to_number: groupJid,
        body: final,
        status: "sent",
        evolution_message_id: evolutionMessageId,
      });
      // Resolve the group conversation so the inbox thread + list update.
      const conv = await resolveConversation(admin, {
        workspaceId,
        instanceId: inst.id,
        sourceId: groupJid.replace(/@g\.us$/, ""),
        sourceJid: groupJid,
        chatType: "group",
      });
      await admin.from("whatsapp_messages").insert({
        workspace_id: workspaceId,
        instance_id: inst.id,
        conversation_id: conv?.id ?? null,
        direction: "outbound",
        to_number: groupJid,
        body: final,
        media_url: mediaUrl ?? null,
        status: "sent",
        evolution_message_id: evolutionMessageId,
        reply_to_message_id: quotedId ?? null,
        sent_at: nowISO,
      });
      if (conv) {
        try {
          await recordMessageOnConversation(admin, {
            conversationId: conv.id,
            direction: "outbound",
            body: final,
            createdAt: nowISO,
          });
        } catch {
          // best-effort — send already succeeded
        }
      }
      return NextResponse.json({
        ok: true,
        evolution_message_id: evolutionMessageId,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "send_failed";
      return jsonError(errMsg, 502);
    }
  }

  // ── contact-target ────────────────────────────────────────────────
  let toNumber = "";
  let contactId: string | null = null;

  if (/^\+?[0-9\s\-()]+$/.test(targetId)) {
    // Raw phone number.
    toNumber = normalisePhone(targetId);
    // Best-effort lookup so the message attaches to the right CRM row.
    const { data: matched } = await admin
      .from("crm_contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", toNumber)
      .limit(1)
      .maybeSingle();
    if (matched) contactId = (matched as { id: string }).id;
  } else {
    // CRM contact id.
    const { data: contact } = await admin
      .from("crm_contacts")
      .select("id, phone")
      .eq("id", targetId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!contact) return jsonError("contact_not_found", 404);
    const c = contact as { id: string; phone: string | null };
    toNumber = normalisePhone(c.phone);
    contactId = c.id;
  }

  if (!toNumber) {
    return jsonError("contact_missing_phone", 422);
  }

  const guard = await canSendToContact(inst.id, toNumber);
  if (!guard.ok) {
    return NextResponse.json(
      { error: "throttled", reason: guard.reason },
      { status: 429 },
    );
  }

  const final = templateVariants?.length
    ? variateTemplate(templateVariants, `contact:${toNumber}`)
    : message;

  try {
    const client = getEvolutionClient();
    const sent = mediaUrl
      ? await client.sendMedia(
          inst.evolution_instance_name,
          toNumber,
          mediaUrl,
          final,
          "image",
          quotedId ? { quotedId } : undefined,
        )
      : await client.sendText(
          inst.evolution_instance_name,
          toNumber,
          final,
          quotedId ? { quotedId } : undefined,
        );

    const evolutionMessageId = sent.messageId || null;
    const sentAt = new Date().toISOString();

    await admin.from("whatsapp_send_log").insert({
      workspace_id: workspaceId,
      instance_id: inst.id,
      contact_id: contactId,
      to_number: toNumber,
      body: final,
      status: "sent",
      evolution_message_id: evolutionMessageId,
    });

    // Resolve the conversation so the inbox thread + list update (v2 inbox
    // reads messages by conversation_id). source_id is the digits-only number;
    // source_jid is the full WhatsApp JID.
    const conv = await resolveConversation(admin, {
      workspaceId,
      instanceId: inst.id,
      sourceId: toNumber,
      sourceJid: `${toNumber}@s.whatsapp.net`,
      chatType: "individual",
      contactId,
    });

    await admin.from("whatsapp_messages").insert({
      workspace_id: workspaceId,
      instance_id: inst.id,
      contact_id: contactId,
      conversation_id: conv?.id ?? null,
      direction: "outbound",
      to_number: toNumber,
      body: final,
      media_url: mediaUrl ?? null,
      status: "sent",
      evolution_message_id: evolutionMessageId,
      reply_to_message_id: quotedId ?? null,
      sent_at: sentAt,
    });

    if (conv) {
      try {
        await recordMessageOnConversation(admin, {
          conversationId: conv.id,
          direction: "outbound",
          body: final,
          createdAt: sentAt,
        });
      } catch {
        // best-effort — send already succeeded
      }
      // EPIC-15: emit first_response / reply_time reporting events for the
      // operator's reply. Best-effort; never blocks the response.
      await emitOutboundResponseEvents(admin, {
        workspaceId,
        conversationId: conv.id,
        contactId,
        instanceId: inst.id,
        userId: auth.user.id,
        sentAt,
      });
    }

    return NextResponse.json({
      ok: true,
      evolution_message_id: evolutionMessageId,
      contact_id: contactId,
      conversation_id: conv?.id ?? null,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "send_failed";
    return jsonError(errMsg, 502);
  }
}
