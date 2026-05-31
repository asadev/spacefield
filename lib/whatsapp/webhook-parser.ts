import "server-only";

import type {
  EvolutionWebhookEventType,
  ParsedEvolutionEvent,
  ParsedWhatsAppMessage,
  WhatsAppInstanceStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from "./types";

/**
 * Evolution sends every WebSocket event as JSON to the configured
 * webhook URL. The envelope shape changes between event types, but
 * common fields are:
 *
 *   {
 *     event:     "MESSAGES_UPSERT" | "MESSAGES_UPDATE" | ...,
 *     instance:  "<instanceName>",
 *     data:      { ... event-specific ... },
 *     date_time: "2026-05-27T..."
 *   }
 *
 * We never trust the inbound JSON — every field passes through narrowing
 * helpers before becoming part of the parsed result. Unknown event
 * types resolve to { type: 'UNKNOWN' } so the webhook handler can ack
 * 200 and move on instead of crashing.
 */

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function jidToNumber(jid: string | null | undefined): string {
  if (!jid) return "";
  const base = jid.split("@")[0] ?? jid;
  // Group JIDs: keep the local part VERBATIM. WhatsApp has two group shapes
  // and digit-stripping corrupts one of them:
  //   - modern:            "120363026...@g.us"          -> "120363026..."
  //   - legacy phone-style: "971552704745-1460373952@g.us"
  //                          -> "971552704745-1460373952"
  // Stripping non-digits would glue the legacy "<creator>-<timestamp>" halves
  // into one bogus number (e.g. 9715527047451460373952), so the thread keys on
  // the wrong id and renders as a bare 22-digit number (AUD-03-ingest).
  if (jid.endsWith("@g.us")) return base;
  // Individual JIDs ("...@s.whatsapp.net" / "...@c.us"): bare phone number.
  return base.replace(/\D/g, "");
}

function asEventType(v: unknown): EvolutionWebhookEventType {
  const s = asString(v);
  if (!s) return "UNKNOWN";
  const upper = s.toUpperCase().replace(/[.-]/g, "_");
  switch (upper) {
    case "MESSAGES_UPSERT":
    case "MESSAGE_UPSERT":
      return "MESSAGES_UPSERT";
    case "MESSAGES_UPDATE":
    case "MESSAGE_UPDATE":
      return "MESSAGES_UPDATE";
    case "CONNECTION_UPDATE":
      return "CONNECTION_UPDATE";
    case "QRCODE_UPDATED":
    case "QR_CODE_UPDATED":
    case "QRCODEUPDATED":
      return "QRCODE_UPDATED";
    case "SEND_MESSAGE":
      return "SEND_MESSAGE";
    default:
      return "UNKNOWN";
  }
}

function statusToInternal(v: string | null): WhatsAppMessageStatus {
  if (!v) return "sent";
  const lower = v.toLowerCase();
  if (
    ["pending", "queue", "queued", "server_ack"].includes(lower) ||
    lower.includes("pending")
  ) {
    return "queued";
  }
  if (lower.includes("read")) return "read";
  if (lower.includes("delivered") || lower.includes("delivery")) {
    return "delivered";
  }
  if (
    lower.includes("fail") ||
    lower.includes("error") ||
    lower.includes("undelivered")
  ) {
    return "failed";
  }
  return "sent";
}

function connectionStateToInternal(v: string | null): WhatsAppInstanceStatus {
  if (!v) return "pending";
  const lower = v.toLowerCase();
  if (lower === "open" || lower === "connected") return "connected";
  if (lower === "close" || lower === "disconnected") return "disconnected";
  if (lower === "connecting" || lower === "qr") return "qr_pending";
  if (lower === "banned") return "banned";
  if (lower === "error") return "error";
  return "pending";
}

/** Pull a quoted-message id out of a node's Baileys contextInfo, if any. */
function ctxReplyId(node: Record<string, unknown> | null): string | null {
  if (!node) return null;
  const ctx = asObj(node.contextInfo);
  return ctx ? asString(ctx.stanzaId) : null;
}

function extractBodyAndMedia(message: Record<string, unknown>): {
  body: string; mediaUrl: string | null; mediaType: string | null;
  mimetype: string | null; fileName: string | null; replyToId: string | null;
} {
  const empty = { body: "", mediaUrl: null, mediaType: null, mimetype: null, fileName: null, replyToId: null };
  const conv = asString(message.conversation);
  if (conv) return { ...empty, body: conv };
  const ext = asObj(message.extendedTextMessage);
  if (ext) return { ...empty, body: asString(ext.text) ?? "", replyToId: ctxReplyId(ext) };
  for (const variant of ["imageMessage","videoMessage","documentMessage","audioMessage","stickerMessage"] as const) {
    const m = asObj(message[variant]);
    if (m) {
      return {
        body: asString(m.caption) ?? "",
        mediaUrl: asString(m.url) ?? asString(m.directPath) ?? null,
        mediaType: variant.replace("Message", ""),
        mimetype: asString(m.mimetype),
        fileName: asString(m.fileName) ?? asString(m.title),
        replyToId: ctxReplyId(m),
      };
    }
  }
  return empty;
}

function extractReaction(message: Record<string, unknown>): { emoji: string; targetId: string } | null {
  const r = asObj(message.reactionMessage);
  if (!r) return null;
  const key = asObj(r.key);
  const targetId = asString(key?.id);
  if (!targetId) return null;
  return { emoji: asString(r.text) ?? "", targetId };
}

function parseMessageEntry(entry: Record<string, unknown>): ParsedWhatsAppMessage | null {
  const key = asObj(entry.key);
  if (!key) return null;
  const evolutionMessageId = asString(key.id);
  if (!evolutionMessageId) return null;
  const remoteJid = asString(key.remoteJid) ?? "";
  const fromMe = key.fromMe === true;
  const participant = asString(key.participant);
  const pushName = asString(entry.pushName);
  const messageRoot = asObj(entry.message) ?? {};
  const reaction = extractReaction(messageRoot);
  const { body, mediaUrl, mediaType, mimetype, fileName, replyToId } = extractBodyAndMedia(messageRoot);
  const tsRaw = asNumber(entry.messageTimestamp);
  const timestamp = tsRaw ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString();
  return {
    evolutionMessageId, fromMe, remoteJid, remoteNumber: jidToNumber(remoteJid),
    body, mediaUrl, mediaType, mimetype, fileName, pushName, participant,
    replyToId, reactionEmoji: reaction?.emoji ?? null, reactionTargetId: reaction?.targetId ?? null,
    timestamp,
  };
}

/** Top-level Evolution webhook parser. */
export function parseEvolutionEvent(payload: unknown): ParsedEvolutionEvent {
  const env = asObj(payload);
  if (!env) {
    return { type: "UNKNOWN", instanceName: null, raw: payload };
  }

  const eventType = asEventType(env.event);
  const instanceName =
    asString(env.instance) ??
    asString(env.instanceName) ??
    asString((asObj(env.instance) ?? {}).instanceName);

  switch (eventType) {
    case "MESSAGES_UPSERT": {
      const data = asObj(env.data) ?? {};
      // data may be a single entry OR { messages: [...] } depending on
      // Evolution build — handle both.
      let entry: Record<string, unknown> | null = null;
      if (data.key) {
        entry = data;
      } else {
        const arr = data.messages;
        if (Array.isArray(arr) && arr.length > 0) {
          const first = asObj(arr[0]);
          if (first) entry = first;
        }
      }
      if (!entry) {
        return { type: "UNKNOWN", instanceName, raw: payload };
      }
      const message = parseMessageEntry(entry);
      if (!message) {
        return { type: "UNKNOWN", instanceName, raw: payload };
      }
      const direction: WhatsAppMessageDirection = message.fromMe
        ? "outbound"
        : "inbound";
      return {
        type: "MESSAGES_UPSERT",
        instanceName: instanceName ?? "",
        message,
        direction,
      };
    }
    case "MESSAGES_UPDATE": {
      const data = asObj(env.data) ?? {};
      const updates = Array.isArray(data.updates) ? data.updates : [data];
      const first = asObj(updates[0]);
      if (!first) {
        return { type: "UNKNOWN", instanceName, raw: payload };
      }
      const key = asObj(first.key) ?? asObj(data.key);
      const evolutionMessageId =
        asString(key?.id) ??
        asString(first.messageId) ??
        asString(data.messageId);
      if (!evolutionMessageId) {
        return { type: "UNKNOWN", instanceName, raw: payload };
      }
      const status = statusToInternal(
        asString(first.status) ?? asString(data.status),
      );
      return {
        type: "MESSAGES_UPDATE",
        instanceName: instanceName ?? "",
        evolutionMessageId,
        status,
      };
    }
    case "CONNECTION_UPDATE": {
      const data = asObj(env.data) ?? {};
      const stateRaw =
        asString(data.state) ??
        asString(data.status) ??
        asString(data.connection);
      const status = connectionStateToInternal(stateRaw);
      const ownerJid =
        asString(data.ownerJid) ??
        asString(data.wuid) ??
        asString(data.id);
      const phoneNumber = ownerJid ? jidToNumber(ownerJid) || null : null;
      return {
        type: "CONNECTION_UPDATE",
        instanceName: instanceName ?? "",
        status,
        phoneNumber,
      };
    }
    case "QRCODE_UPDATED": {
      const data = asObj(env.data) ?? {};
      const qrCode =
        asString(data.base64) ??
        asString(data.code) ??
        asString(data.qrcode) ??
        "";
      return {
        type: "QRCODE_UPDATED",
        instanceName: instanceName ?? "",
        qrCode,
      };
    }
    default:
      return { type: "UNKNOWN", instanceName, raw: payload };
  }
}
