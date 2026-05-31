import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
} from "@/lib/whatsapp/_route-helpers";
import { WA_NOTIFICATION_KINDS } from "@/lib/whatsapp/wa-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp inbox notifications bell (EPIC-16). Reads the SHARED `notifications`
 * table (lib/collab/notifications.ts) filtered to the WhatsApp kinds, scoped to
 * the current user via RLS (recipient_user_id = auth.uid()). No new table, no
 * parallel system.
 *
 * GET  /api/whatsapp/notifications?unread=1&limit=   → { items, unread_count }
 * POST /api/whatsapp/notifications  { action:'mark_read', id }      → mark one
 * POST /api/whatsapp/notifications  { action:'mark_all_read' }      → mark all WA
 *
 * Auth: requireUser -> requirePro. (User-scoped by RLS; no workspace param
 * needed — a user sees only their own notifications.)
 */

const WA_KINDS = new Set<string>(WA_NOTIFICATION_KINDS);

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const unreadOnly = sp.get("unread") === "1";
  const limitRaw = Number.parseInt(sp.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 30;

  const supabase = await createClient();

  // RLS restricts to the caller's notifications. Filter to WA kinds + not archived.
  let q = supabase
    .from("notifications")
    .select(
      "id, workspace_id, kind, source_entity_type, source_entity_id, actor_user_id, title, body, href, read_at, created_at",
    )
    .eq("recipient_user_id", auth.user.id)
    .in("kind", Array.from(WA_KINDS))
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) return jsonError(error.message, 500);

  // Unread count across all WA kinds (cheap head count).
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", auth.user.id)
    .in("kind", Array.from(WA_KINDS))
    .is("read_at", null)
    .is("archived_at", null);

  return NextResponse.json({ items: data ?? [], unread_count: count ?? 0 });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{ action?: string; id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { action, id } = parsed.body;

  const supabase = await createClient();

  if (action === "mark_read") {
    if (!id) return jsonError("id required", 400);
    // RLS scopes UPDATE to recipient = auth.uid().
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", auth.user.id);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_all_read") {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", auth.user.id)
      .in("kind", Array.from(WA_KINDS))
      .is("read_at", null);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  return jsonError("unknown_action", 400);
}
