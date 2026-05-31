import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  recordMessageOnConversation,
  resolveConversation,
} from "@/lib/whatsapp/conversations";
import { uploadMediaBuffer } from "@/lib/whatsapp/media";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MediaKind = "image" | "video" | "document" | "audio";

/**
 * POST /api/whatsapp/send/media
 *
 * Body: {
 *   workspace_id,
 *   conversation_id?,            // preferred thread key
 *   to? | phone?,                // fallback recipient (phone or remoteJid)
 *   media: { base64, mime, fileName?, kind: image|video|document|audio },
 *   caption?,
 *   quoted_message_id?,
 * }
 *
 * Sends an outbound media (or voice) message:
 *   1. resolve the connected instance + the conversation
 *   2. send via Evolution (audio → sendWhatsAppAudio, else sendMedia w/ base64)
 *   3. insert a whatsapp_messages row (direction outbound, status sent)
 *   4. re-host the bytes into the private bucket → media_storage_path
 *   5. bump the conversation preview (recordMessageOnConversation)
 *
 * Best-effort/transactional-ish: the Evolution send is the hard step; row
 * persistence + upload are wrapped so a storage hiccup doesn't lose the sent
 * message. Returns the created row id + evolution message id. Never throws raw
 * on Evolution failure — returns a clear status the UI can surface.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  let body: {
    workspace_id?: string;
    conversation_id?: string;
    to?: string;
    phone?: string;
    caption?: string;
    quoted_message_id?: string;
    media?: { base64?: string; mime?: string; fileName?: string; kind?: MediaKind };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError("invalid json", 400);
  }

  const workspaceId = body.workspace_id;
  const media = body.media;
  const caption = body.caption ?? "";
  const quotedId = body.quoted_message_id;

  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!media?.base64 || !media.mime || !media.kind) {
    return jsonError("media.base64, media.mime and media.kind required", 400);
  }
  const kind = media.kind;
  if (!["image", "video", "document", "audio"].includes(kind)) {
    return jsonError("invalid media.kind", 400);
  }

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Resolve the connected Evolution instance for this workspace.
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow) return jsonError("no_connected_instance", 409);
  const inst = instRow as WhatsAppInstanceRow;
  const instanceName = inst.evolution_instance_name;

  // Resolve the conversation: by id, or by recipient phone/jid.
  let conv: {
    id: string;
    source_id: string;
    source_jid: string | null;
    phone: string | null;
  } | null = null;

  if (body.conversation_id) {
    const { data } = await admin
      .from("whatsapp_conversations")
      .select("id, source_id, source_jid, chat_type")
      .eq("id", body.conversation_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data) return jsonError("conversation_not_found", 404);
    const row = data as {
      id: string;
      source_id: string;
      source_jid: string | null;
    };
    conv = {
      id: row.id,
      source_id: row.source_id,
      source_jid: row.source_jid,
      phone: row.source_id,
    };
  } else {
    const recipient = (body.to || body.phone || "").trim();
    if (!recipient) return jsonError("recipient required", 400);
    const isJid = recipient.includes("@");
    const sourceJid = isJid
      ? recipient
      : `${recipient.replace(/\D/g, "")}@s.whatsapp.net`;
    const sourceId = recipient.replace(/\D/g, "") || recipient;
    const isGroup = sourceJid.endsWith("@g.us");
    const resolved = await resolveConversation(admin, {
      workspaceId,
      instanceId: inst.id,
      sourceId,
      sourceJid,
      chatType: isGroup ? "group" : "individual",
    });
    if (!resolved) return jsonError("conversation_resolve_failed", 422);
    conv = {
      id: resolved.id,
      source_id: sourceId,
      source_jid: sourceJid,
      phone: sourceId,
    };
  }

  // Evolution send target — prefer the full remoteJid when known.
  const target = conv.source_jid || conv.source_id || conv.phone || "";
  if (!target) return jsonError("recipient required", 400);

  // ── send via Evolution ───────────────────────────────────────────────────
  let evolutionMessageId: string | null = null;
  try {
    const client = getEvolutionClient();
    if (kind === "audio") {
      const sent = await client.sendWhatsAppAudio(
        instanceName,
        target,
        media.base64,
        quotedId ? { quotedId } : undefined,
      );
      evolutionMessageId = sent.messageId || null;
    } else {
      const sent = await client.sendMedia(
        instanceName,
        target,
        media.base64,
        caption || undefined,
        kind,
        {
          ...(quotedId ? { quotedId } : {}),
          ...(media.fileName ? { fileName: media.fileName } : {}),
          mimetype: media.mime,
        },
      );
      evolutionMessageId = sent.messageId || null;
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : "evolution_send_failed";
    return jsonError(detail, 502);
  }

  const nowISO = new Date().toISOString();

  // ── persist the outbound message row ──────────────────────────────────────
  let rowId: string | null = null;
  try {
    const { data: inserted } = await admin
      .from("whatsapp_messages")
      .insert({
        workspace_id: workspaceId,
        instance_id: inst.id,
        conversation_id: conv.id,
        direction: "outbound",
        to_number: conv.phone ?? null,
        body: caption || null,
        status: "sent",
        media_type: kind,
        media_mime: media.mime,
        evolution_message_id: evolutionMessageId,
        reply_to_message_id: quotedId ?? null,
        sent_at: nowISO,
      })
      .select("id")
      .maybeSingle();
    rowId = (inserted as { id: string } | null)?.id ?? null;
  } catch {
    // best-effort — the send already succeeded
  }

  // ── re-host the bytes into the private bucket ─────────────────────────────
  if (rowId) {
    try {
      const buffer = Buffer.from(media.base64, "base64");
      const path = await uploadMediaBuffer(admin, {
        workspaceId,
        messageRowId: rowId,
        buffer,
        mime: media.mime,
      });
      if (path) {
        await admin
          .from("whatsapp_messages")
          .update({ media_storage_path: path })
          .eq("id", rowId);
      }
    } catch {
      // best-effort — the message is still sent + persisted
    }
  }

  // ── bump the conversation preview ─────────────────────────────────────────
  try {
    await recordMessageOnConversation(admin, {
      conversationId: conv.id,
      direction: "outbound",
      body: caption || null,
      mediaType: kind,
      createdAt: nowISO,
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({
    ok: true,
    id: rowId,
    message_id: evolutionMessageId,
    conversation_id: conv.id,
  });
}
