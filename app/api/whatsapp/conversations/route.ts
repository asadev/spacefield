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
 * GET /api/whatsapp/conversations?workspace_id=...
 *
 * Groups public.whatsapp_messages by the resolved "thread key" (CRM contact
 * if linked, otherwise the raw phone number) and returns one row per
 * conversation with the latest-message preview + unread count.
 *
 * Response shape (UI unwraps `items`):
 *   { items: [{ contact_id, phone, name, unread_count, last_message_at,
 *               last_message_preview, last_direction }, ...] }
 *
 * Why we aggregate in the route (not via a Postgres VIEW): the WhatsApp
 * tables are still young (added 2026-05-27); we keep migrations small and
 * push the join into the route. Volume is bounded by one row per contact
 * per workspace — a few thousand at worst — and a single ordered scan over
 * (workspace_id, created_at desc) is fast enough.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Pull the most-recent N messages for the workspace. We aggregate
  // client-side so the unread count + last preview are derived from one
  // ordered scan. N=2000 caps memory + keeps the route under maxDuration.
  const { data: rowsRaw, error } = await admin
    .from("whatsapp_messages")
    .select(
      "id, contact_id, direction, from_number, to_number, body, status, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return jsonError(error.message, 500);

  type Row = {
    id: string;
    contact_id: string | null;
    direction: "inbound" | "outbound";
    from_number: string | null;
    to_number: string | null;
    body: string | null;
    status: string;
    created_at: string;
  };
  const rows = (rowsRaw ?? []) as Row[];

  type Acc = {
    contact_id: string | null;
    phone: string;
    name: string | null;
    unread_count: number;
    last_message_at: string;
    last_message_preview: string;
    last_direction: "inbound" | "outbound";
  };

  // Bucket by the resolved thread key. Prefer contact_id when present
  // (avoids splitting threads when a contact has multiple normalised
  // representations of the same phone).
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    const phone =
      (r.direction === "inbound" ? r.from_number : r.to_number) ?? "";
    const key = r.contact_id ?? `phone:${phone}`;
    const preview = (r.body ?? "").slice(0, 140);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        contact_id: r.contact_id,
        phone,
        name: null,
        // status='read' is the marker the webhook flips when the customer's
        // device reports it read — we count anything else inbound that is
        // newer than the user's last seen as "unread".
        unread_count:
          r.direction === "inbound" && r.status !== "read" ? 1 : 0,
        last_message_at: r.created_at,
        last_message_preview: preview,
        last_direction: r.direction,
      });
    } else if (r.direction === "inbound" && r.status !== "read") {
      existing.unread_count += 1;
    }
  }

  // Hydrate contact names in a single round-trip.
  const contactIds = Array.from(byKey.values())
    .map((v) => v.contact_id)
    .filter((id): id is string => !!id);
  if (contactIds.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name, phone")
      .in("id", contactIds);
    const byId = new Map(
      (contacts ?? []).map((c) => [
        (c as { id: string }).id,
        c as { id: string; first_name: string | null; last_name: string | null; phone: string | null },
      ]),
    );
    for (const v of byKey.values()) {
      if (!v.contact_id) continue;
      const c = byId.get(v.contact_id);
      if (!c) continue;
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      v.name = name || null;
      if (!v.phone && c.phone) v.phone = c.phone;
    }
  }

  const items = Array.from(byKey.values()).sort(
    (a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at),
  );

  return NextResponse.json({ items });
}
