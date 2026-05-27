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
 * GET /api/whatsapp/messages?workspace_id=...&contact_id=...&phone=...&before=ISO
 *
 * Returns the per-conversation message log. Filter is either a CRM
 * contact_id (preferred — survives phone changes) or a raw phone number
 * (used when the contact isn't in CRM yet, e.g. an inbound from a stranger
 * that landed before a CRM row was created).
 *
 * `before` is an ISO timestamp cursor for paging older history. When
 * absent we return the newest MESSAGES_PAGE_LIMIT rows.
 *
 * Response shape (UI unwraps `items`):
 *   { items: WaMessage[], next_cursor: ISO|null }
 *
 * Newest-first ordering — the UI re-sorts for display since the bubble
 * stream wants ascending order at the bottom of the chat.
 */

const MESSAGES_PAGE_LIMIT = 200;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const contactId = sp.get("contact_id");
  const phoneRaw = sp.get("phone");
  const before = sp.get("before");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!contactId && !phoneRaw) {
    return jsonError("contact_id or phone required", 400);
  }

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  let query = admin
    .from("whatsapp_messages")
    .select(
      "id, workspace_id, contact_id, direction, from_number, to_number, body, media_url, status, sent_at, received_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_PAGE_LIMIT);

  if (contactId) {
    query = query.eq("contact_id", contactId);
  } else if (phoneRaw) {
    // No CRM contact — match by phone on either direction. Postgres
    // doesn't let us put OR with .or() AND .eq() chained naturally, so we
    // build the filter string manually. Normalise digits only so the
    // filter matches what the webhook persists.
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
    workspace_id: string;
    contact_id: string | null;
    direction: "inbound" | "outbound";
    from_number: string | null;
    to_number: string | null;
    body: string | null;
    media_url: string | null;
    status: string;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  // Project to the UI shape — fold from_number/to_number into a single
  // `contact_phone` so the client treats every message uniformly.
  const items = rows.map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    contact_id: r.contact_id,
    contact_phone:
      (r.direction === "inbound" ? r.from_number : r.to_number) ?? "",
    direction: r.direction,
    body: r.body,
    media_url: r.media_url,
    status: r.status,
    created_at: r.created_at,
  }));

  const last = rows[rows.length - 1] ?? null;
  return NextResponse.json({
    items,
    next_cursor:
      rows.length === MESSAGES_PAGE_LIMIT && last ? last.created_at : null,
  });
}
