import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/messages?workspace_id=...&conversation_id=...&before=ISO&limit=n
 *
 * Returns the per-thread message log (WhatsApp inbox v2). Preferred filter is
 * `conversation_id` (the v2 thread key). Backward-compatible filters remain:
 *   - `contact_id` — CRM contact id
 *   - `phone`      — raw phone (matches from_number/to_number)
 *
 * `before` is an ISO timestamp cursor for paging older history; default page
 * size is 50 (max 200).
 *
 * Response shape (UI unwraps `items`):
 *   { items: WaMessage[], next_cursor: ISO|null, has_more: boolean }
 *
 * Newest-first ordering — the UI re-sorts for display since the bubble stream
 * wants ascending order at the bottom of the chat.
 *
 * Media: we expose `media_storage_path` (the re-hosted, decryptable object),
 * NOT the raw `media_url` (an undecryptable `.enc` blob). The UI fetches the
 * actual bytes via /api/whatsapp/media/[id].
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const conversationId = sp.get("conversation_id");
  const contactId = sp.get("contact_id");
  const phoneRaw = sp.get("phone");
  const before = sp.get("before");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!conversationId && !contactId && !phoneRaw) {
    return jsonError("conversation_id, contact_id or phone required", 400);
  }

  let limit = DEFAULT_LIMIT;
  const limitParamRaw = sp.get("limit");
  if (limitParamRaw) {
    const parsed = Number.parseInt(limitParamRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  let query = admin
    .from("whatsapp_messages")
    .select(
      "id, direction, body, status, created_at, media_type, media_mime, media_storage_path, reactions, reply_to_message_id, sender_name, is_private, evolution_message_id",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (conversationId) {
    query = query.eq("conversation_id", conversationId);
  } else if (contactId) {
    query = query.eq("contact_id", contactId);
  } else if (phoneRaw) {
    // No CRM contact / conversation — match by phone on either direction.
    const phoneDigits = phoneRaw.replace(/\D/g, "");
    if (!phoneDigits) return jsonError("invalid_phone", 400);
    query = query.or(
      `from_number.eq.${phoneDigits},to_number.eq.${phoneDigits}`,
    );
  }
  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  type Row = {
    id: string;
    direction: "inbound" | "outbound";
    body: string | null;
    status: string;
    created_at: string;
    media_type: string | null;
    media_mime: string | null;
    media_storage_path: string | null;
    reactions: unknown;
    reply_to_message_id: string | null;
    sender_name: string | null;
    is_private: boolean | null;
    evolution_message_id: string | null;
  };
  const rows = (data ?? []) as Row[];

  const items = rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    body: r.body,
    status: r.status,
    created_at: r.created_at,
    media_type: r.media_type,
    media_mime: r.media_mime,
    media_storage_path: r.media_storage_path,
    reactions: Array.isArray(r.reactions) ? r.reactions : [],
    reply_to_message_id: r.reply_to_message_id,
    sender_name: r.sender_name,
    is_private: r.is_private ?? false,
    evolution_message_id: r.evolution_message_id,
  }));

  const last = rows[rows.length - 1] ?? null;
  const has_more = rows.length === limit;
  return NextResponse.json({
    items,
    next_cursor: has_more && last ? last.created_at : null,
    has_more,
  });
}
