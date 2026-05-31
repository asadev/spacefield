import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { EvolutionClient, EvolutionMessageKey } from "./client";
import type { ParsedWhatsAppMessage } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif",
  "video/mp4":"mp4","video/3gpp":"3gp","video/quicktime":"mov",
  "audio/ogg":"ogg","audio/ogg; codecs=opus":"ogg","audio/opus":"ogg","audio/mpeg":"mp3","audio/mp4":"m4a","audio/aac":"aac","audio/amr":"amr",
  "application/pdf":"pdf","application/zip":"zip",
};

export function extFromMime(mime: string | null | undefined): string {
  if (!mime) return "bin";
  const norm = mime.toLowerCase().trim();
  if (EXT_BY_MIME[norm]) return EXT_BY_MIME[norm];
  const base = norm.split(";")[0]?.trim() ?? "";
  if (EXT_BY_MIME[base]) return EXT_BY_MIME[base];
  const sub = base.split("/")[1] ?? "bin";
  return sub.replace(/[^a-z0-9]/gi, "") || "bin";
}

export async function uploadMediaBuffer(
  admin: Admin, params: { workspaceId: string; messageRowId: string; buffer: Buffer; mime: string; },
): Promise<string | null> {
  const path = `${params.workspaceId}/${params.messageRowId}.${extFromMime(params.mime)}`;
  const { error } = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).upload(path, params.buffer, {
    contentType: params.mime || "application/octet-stream", upsert: true,
  });
  if (error) { console.warn("[whatsapp.media] upload failed:", error.message); return null; }
  return path;
}

export async function rehostInboundMedia(
  admin: Admin, client: EvolutionClient,
  params: { instanceName: string; message: ParsedWhatsAppMessage; workspaceId: string; messageRowId: string; },
): Promise<{ storagePath: string; mime: string } | null> {
  const { message } = params;
  if (!message.mediaType) return null;
  const key: EvolutionMessageKey = {
    id: message.evolutionMessageId, remoteJid: message.remoteJid, fromMe: message.fromMe,
    ...(message.participant ? { participant: message.participant } : {}),
  };
  const media = await client.getBase64FromMedia(params.instanceName, key);
  if (!media?.base64) return null;
  const mime = message.mimetype ?? media.mimetype ?? "application/octet-stream";
  let buffer: Buffer;
  try { buffer = Buffer.from(media.base64, "base64"); } catch { return null; }
  if (buffer.length === 0) return null;
  const storagePath = await uploadMediaBuffer(admin, { workspaceId: params.workspaceId, messageRowId: params.messageRowId, buffer, mime });
  return storagePath ? { storagePath, mime } : null;
}

export async function signedMediaUrl(admin: Admin, path: string, ttlSeconds = 600): Promise<string | null> {
  const { data, error } = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
