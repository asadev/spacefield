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
 * GET /api/whatsapp/conversations?workspace_id=...&cursor=<ISO>&limit=<n>
 *
 * Pages the `whatsapp_conversations` table (WhatsApp inbox v2). One row per
 * thread, ordered newest-activity first. Replaces the old in-memory fold over
 * the latest 2000 messages — names + previews now live on the conversation
 * row (backfilled + maintained by the webhook), so there are NO per-row
 * Evolution calls here.
 *
 * Cursor pagination keys on last_message_at (descending):
 *   - `cursor` = the ISO last_message_at of the last item from the prior page
 *   - `limit`  = page size (default 30, max 100)
 *
 * Response shape (UI unwraps `items`):
 *   {
 *     items: [{
 *       id, contact_id, source_id, phone, name, chat_type, is_group,
 *       unread_count, last_message_at, last_message_preview, last_direction,
 *       status, assignee_id
 *     }, ...],
 *     next_cursor: <ISO last_message_at | null>
 *   }
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const cursor = sp.get("cursor");
  const limitParamRaw = sp.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParamRaw) {
    const parsed = Number.parseInt(limitParamRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const admin = createAdminClient();

  let query = admin
    .from("whatsapp_conversations")
    .select(
      "id, contact_id, source_id, source_jid, title, chat_type, unread_count, last_message_at, last_message_preview, last_direction, status, assignee_id",
    )
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (cursor) {
    query = query.lt("last_message_at", cursor);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  type Row = {
    id: string;
    contact_id: string | null;
    source_id: string;
    source_jid: string | null;
    title: string | null;
    chat_type: "individual" | "group";
    unread_count: number | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_direction: "inbound" | "outbound" | null;
    status: number | null;
    assignee_id: string | null;
  };
  const rows = (data ?? []) as Row[];

  // Hydrate display name for individual threads whose title is null, in a
  // SINGLE batched contacts query. Groups keep their title (already
  // backfilled). No per-row Evolution lookups.
  const contactIds = Array.from(
    new Set(
      rows
        .filter((r) => !r.title && r.chat_type === "individual" && r.contact_id)
        .map((r) => r.contact_id as string),
    ),
  );
  const nameByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name")
      .in("id", contactIds);
    for (const c of contacts ?? []) {
      const r = c as {
        id: string;
        first_name: string | null;
        last_name: string | null;
      };
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      if (name) nameByContactId.set(r.id, name);
    }
  }

  const items = rows.map((r) => {
    const name =
      r.title ??
      (r.contact_id ? nameByContactId.get(r.contact_id) ?? null : null);
    return {
      id: r.id,
      contact_id: r.contact_id,
      source_id: r.source_id,
      phone: r.source_id,
      name,
      chat_type: r.chat_type,
      is_group: r.chat_type === "group",
      unread_count: r.unread_count ?? 0,
      last_message_at: r.last_message_at,
      last_message_preview: r.last_message_preview,
      last_direction: r.last_direction,
      status: r.status ?? 0,
      assignee_id: r.assignee_id,
    };
  });

  const last = rows[rows.length - 1] ?? null;
  const next_cursor =
    rows.length === limit && last ? last.last_message_at : null;

  return NextResponse.json({ items, next_cursor });
}
