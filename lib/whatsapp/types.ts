import "server-only";

/**
 * Strongly-typed WhatsApp + Evolution API shapes.
 *
 * We only model the fields we actually consume — Evolution's responses
 * are nested and over-broad. Anything we don't touch stays loosely
 * typed as `unknown`.
 */

export type WhatsAppInstanceStatus =
  | "pending"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "banned"
  | "error";

export type WhatsAppMessageDirection = "inbound" | "outbound";

export type WhatsAppMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type WhatsAppSendTargetType = "contact" | "group" | "list";

export type WhatsAppSendJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** Internal row shape — mirrors the DB. */
export interface WhatsAppInstanceRow {
  id: string;
  workspace_id: string;
  evolution_instance_name: string;
  phone_number: string | null;
  status: WhatsAppInstanceStatus;
  qr_code: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EvolutionInstance {
  instanceName: string;
  status: string;
  serverUrl?: string;
  apikey?: string;
  ownerJid?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
}

export interface EvolutionGroup {
  id: string;
  subject: string;
  size: number;
  creation?: number;
  owner?: string;
  participants?: Array<{ id: string; admin?: string | null }>;
}

export interface EvolutionSendResult {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  messageTimestamp?: number;
  status?: string;
  /** Evolution sometimes returns the messageId on the root. */
  messageId?: string;
}

export interface EvolutionConnectResponse {
  /** Base64 PNG, or a `pairingCode`, depending on instance state. */
  base64?: string;
  pairingCode?: string;
  code?: string;
  count?: number;
  /** Some Evolution builds return the QR under `qrcode`. */
  qrcode?: {
    base64?: string;
    code?: string;
    pairingCode?: string;
  };
  /** state-only response when already connected. */
  instance?: { instanceName: string; state: string };
}

/** Webhook event-type discriminator. */
export type EvolutionWebhookEventType =
  | "MESSAGES_UPSERT"
  | "MESSAGES_UPDATE"
  | "CONNECTION_UPDATE"
  | "QRCODE_UPDATED"
  | "SEND_MESSAGE"
  | "UNKNOWN";

export type WhatsAppChatType = "individual" | "group";

/** Single parsed-message representation, shared across upsert + update. */
export interface ParsedWhatsAppMessage {
  evolutionMessageId: string;
  fromMe: boolean;
  remoteJid: string;
  /** E164 number extracted from `remoteJid` (digits only). */
  remoteNumber: string;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mimetype: string | null;
  fileName: string | null;
  pushName: string | null;
  participant: string | null;
  replyToId: string | null;
  reactionEmoji: string | null;
  reactionTargetId: string | null;
  timestamp: string;
}

export interface EvolutionMediaBase64 {
  base64: string;
  mimetype: string;
  fileName: string | null;
}

/** Webhook → parsed payload union. */
export type ParsedEvolutionEvent =
  | {
      type: "MESSAGES_UPSERT";
      instanceName: string;
      message: ParsedWhatsAppMessage;
      direction: WhatsAppMessageDirection;
    }
  | {
      type: "MESSAGES_UPDATE";
      instanceName: string;
      evolutionMessageId: string;
      status: WhatsAppMessageStatus;
    }
  | {
      type: "CONNECTION_UPDATE";
      instanceName: string;
      status: WhatsAppInstanceStatus;
      phoneNumber: string | null;
    }
  | {
      type: "QRCODE_UPDATED";
      instanceName: string;
      qrCode: string;
    }
  | {
      type: "UNKNOWN";
      instanceName: string | null;
      raw: unknown;
    };

/** Throttle config bag stored on whatsapp_send_jobs.throttle_config. */
export interface ThrottleConfig {
  min_delay_ms?: number;
  max_delay_ms?: number;
  max_per_hour?: number;
  max_per_day?: number;
}

/** Single contact-target payload for /api/whatsapp/send. */
export interface SendRequestBody {
  workspace_id: string;
  target_type: WhatsAppSendTargetType;
  target_id: string;
  message: string;
  media_url?: string;
  template_variants?: string[];
}

/** Outbound media payload (job + immediate). */
export interface SendMediaPayload {
  url: string;
  caption?: string;
  /** Optional Evolution media type — defaults to "image". */
  type?: "image" | "video" | "audio" | "document";
}
