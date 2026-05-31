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
 * GET /api/whatsapp/search?workspace_id=&q=&limit=  (EPIC-13)
 *
 * Server-side full-text search over whatsapp_messages.body across ALL history
 * (backed by the pg_trgm GIN index added in migration 20260531e), grouped by
 * conversation. Also matches conversation titles + contact names so searching
 * a person surfaces their thread even if the term isn't in a message body.
 * Private notes + tombstoned messages are excluded (the trgm index is partial
 * on is_private=false AND deleted_at IS NULL).
 *
 * Response:
 *   { groups: [{ conversation_id, title, phone, chat_type, match_count,
 *                messages: [{ id, direction, body, created_at }] }] }
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const MAX_MESSAGE_HITS = 100;

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

  const q = (sp.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ groups: [], q });
  }
  const safe = q.replace(/[%,()]/g, " ");

  const admin = createAdminClient();

  // ── 1. message-body hits (trgm-indexed ILIKE) ──
  const { data: msgRows, error: msgErr } = await admin
    .from("whatsapp_messages")
    .select("id, conversation_id, direction, body, created_at")
    .eq("workspace_id", workspaceId)
    .eq("is_private", false)
    .is("deleted_at", null)
    .not("conversation_id", "is", null)
    .ilike("body", `%${safe}%`)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGE_HITS);
  if (msgErr) return jsonError(msgErr.message, 500);

  type MsgHit = {
    id: string;
    conversation_id: string;
    direction: "inbound" | "outbound";
    body: string | null;
    created_at: string;
  };
  const hits = (msgRows ?? []) as MsgHit[];

  // Group message hits by conversation.
  const byConv = new Map<string, MsgHit[]>();
  for (const m of hits) {
    const arr = byConv.get(m.conversation_id) ?? [];
    arr.push(m);
    byConv.set(m.conversation_id, arr);
  }

  // ── 2. conversation-title / contact-name hits ──
  // Title matches.
  const { data: titleRows } = await admin
    .from("whatsapp_conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("title", `%${safe}%`)
    .limit(50);
  for (const t of (titleRows ?? []) as Array<{ id: string }>) {
    if (!byConv.has(t.id)) byConv.set(t.id, []);
  }
  // Contact-name matches → their conversations.
  const { data: contactRows } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .limit(50);
  const contactIds = (contactRows ?? []).map((c) => (c as { id: string }).id);
  if (contactIds.length > 0) {
    const { data: convForContacts } = await admin
      .from("whatsapp_conversations")
      .select("id, contact_id")
      .eq("workspace_id", workspaceId)
      .in("contact_id", contactIds)
      .limit(50);
    for (const c of (convForContacts ?? []) as Array<{ id: string }>) {
      if (!byConv.has(c.id)) byConv.set(c.id, []);
    }
  }

  const convIds = Array.from(byConv.keys());
  if (convIds.length === 0) {
    return NextResponse.json({ groups: [], q });
  }

  // ── 3. hydrate conversation headers ──
  const { data: convRows } = await admin
    .from("whatsapp_conversations")
    .select(
      "id, contact_id, source_id, title, chat_type, last_message_at, last_message_preview",
    )
    .eq("workspace_id", workspaceId)
    .in("id", convIds);
  type ConvRow = {
    id: string;
    contact_id: string | null;
    source_id: string;
    title: string | null;
    chat_type: "individual" | "group";
    last_message_at: string | null;
    last_message_preview: string | null;
  };
  const convs = (convRows ?? []) as ConvRow[];

  // Resolve display names for individual threads with no title.
  const needNameContactIds = Array.from(
    new Set(
      convs
        .filter((c) => !c.title && c.chat_type === "individual" && c.contact_id)
        .map((c) => c.contact_id as string),
    ),
  );
  const nameByContact = new Map<string, string>();
  if (needNameContactIds.length > 0) {
    const { data: cts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name")
      .in("id", needNameContactIds);
    for (const c of (cts ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      if (n) nameByContact.set(c.id, n);
    }
  }

  const convById = new Map(convs.map((c) => [c.id, c]));
  const groups = convIds
    .map((cid) => {
      const c = convById.get(cid);
      if (!c) return null;
      const msgs = (byConv.get(cid) ?? []).slice(0, 5).map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        created_at: m.created_at,
      }));
      return {
        conversation_id: cid,
        title:
          c.title ??
          (c.contact_id ? nameByContact.get(c.contact_id) ?? null : null) ??
          c.source_id,
        phone: c.source_id,
        chat_type: c.chat_type,
        last_message_at: c.last_message_at,
        match_count: (byConv.get(cid) ?? []).length,
        messages: msgs,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null)
    // Conversations with actual message hits first, then by recency.
    .sort((a, b) => {
      if (b.match_count !== a.match_count) return b.match_count - a.match_count;
      const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bt - at;
    });

  return NextResponse.json({ groups, q });
}
