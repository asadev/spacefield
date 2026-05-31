import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { labelIdsByConversation, memberLabels } from "@/lib/whatsapp/inbox";
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
 *   [&status=open|resolved|pending|snoozed|0|1|2|3]
 *   [&view=open_mine|mine|unassigned|all]   (Wave 2 default queue)
 *   [&assignee_id=<uuid>|me|none]
 *   [&label_id=<uuid>]
 *   [&priority=0..4]
 *   [&unread=1]
 *
 * Pages the `whatsapp_conversations` table (WhatsApp inbox v2). One row per
 * thread, ordered newest-activity first. Wave 1 names + previews live on the
 * row (backfilled + maintained by the webhook), so there are NO per-row
 * Evolution calls here.
 *
 * Wave 2 EXTENSIONS (backward-compatible — no filter params == old behaviour):
 *   - filter params: status / view / assignee_id / label_id / priority / unread
 *   - each item now also carries: priority, assignee_name, label_ids[]
 *
 * Cursor pagination keys on last_message_at (descending):
 *   - `cursor` = ISO last_message_at of the last item from the prior page
 *   - `limit`  = page size (default 30, max 100)
 *
 * Response shape (UI unwraps `items`):
 *   { items: [{ id, contact_id, source_id, phone, name, chat_type, is_group,
 *               unread_count, last_message_at, last_message_preview,
 *               last_direction, status, assignee_id, priority, assignee_name,
 *               label_ids }],
 *     next_cursor: <ISO last_message_at | null> }
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const STATUS_BY_NAME: Record<string, number> = {
  open: 0,
  resolved: 1,
  pending: 2,
  snoozed: 3,
};

function parseStatus(raw: string | null): number | null {
  if (!raw) return null;
  if (raw in STATUS_BY_NAME) return STATUS_BY_NAME[raw];
  const n = Number.parseInt(raw, 10);
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : null;
}

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

  // ── filters (Wave 2) ──
  const view = sp.get("view"); // open_mine | mine | unassigned | all
  const statusFilter = parseStatus(sp.get("status"));
  const assigneeParam = sp.get("assignee_id"); // uuid | "me" | "none"
  const labelId = sp.get("label_id");
  const priorityRaw = sp.get("priority");
  const unreadOnly = sp.get("unread") === "1";

  // If a label filter is set, resolve the matching conversation ids up front so
  // we can scope the main query (the join can't be expressed inline cleanly).
  let labelConvIds: string[] | null = null;
  if (labelId) {
    const { data: tagRows, error: tagErr } = await admin
      .from("whatsapp_taggings")
      .select("taggable_id")
      .eq("workspace_id", workspaceId)
      .eq("taggable_type", "conversation")
      .eq("label_id", labelId);
    if (tagErr) return jsonError(tagErr.message, 500);
    labelConvIds = (tagRows ?? []).map((t) => (t as { taggable_id: string }).taggable_id);
    if (labelConvIds.length === 0) {
      return NextResponse.json({ items: [], next_cursor: null });
    }
  }

  let query = admin
    .from("whatsapp_conversations")
    .select(
      "id, contact_id, source_id, source_jid, title, chat_type, unread_count, last_message_at, last_message_preview, last_direction, status, priority, assignee_id",
    )
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  // view presets
  if (view === "open_mine") {
    query = query.eq("status", 0).eq("assignee_id", auth.user.id);
  } else if (view === "mine") {
    query = query.eq("assignee_id", auth.user.id);
  } else if (view === "unassigned") {
    query = query.is("assignee_id", null);
  }
  // explicit status filter overrides/refines
  if (statusFilter !== null) query = query.eq("status", statusFilter);
  // explicit assignee filter
  if (assigneeParam === "me") query = query.eq("assignee_id", auth.user.id);
  else if (assigneeParam === "none") query = query.is("assignee_id", null);
  else if (assigneeParam) query = query.eq("assignee_id", assigneeParam);
  // priority
  if (priorityRaw) {
    const p = Number.parseInt(priorityRaw, 10);
    if (p >= 0 && p <= 4) query = query.eq("priority", p);
  }
  if (unreadOnly) query = query.gt("unread_count", 0);
  if (labelConvIds) query = query.in("id", labelConvIds);
  if (cursor) query = query.lt("last_message_at", cursor);

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
    priority: number | null;
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

  // Wave 2: batch label_ids + assignee display names for the page.
  const convIds = rows.map((r) => r.id);
  const labelMap = await labelIdsByConversation(admin, workspaceId, convIds);
  const assigneeIds = rows
    .map((r) => r.assignee_id)
    .filter((x): x is string => !!x);
  const assigneeNameMap = await memberLabels(admin, assigneeIds);

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
      priority: r.priority ?? 0,
      assignee_name: r.assignee_id
        ? assigneeNameMap.get(r.assignee_id) ?? null
        : null,
      label_ids: labelMap.get(r.id) ?? [],
    };
  });

  const last = rows[rows.length - 1] ?? null;
  const next_cursor =
    rows.length === limit && last ? last.last_message_at : null;

  return NextResponse.json({ items, next_cursor });
}
