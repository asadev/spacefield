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
 * GET /api/whatsapp/contacts?workspace_id=&q=&has_phone=1&limit=
 *
 * EPIC-10 fix: the create-group contact picker (GroupsTab) and the client's
 * fetchSendableContacts() both call this route — but it never existed in the
 * tree, so the contact search silently returned nothing. This thin adapter
 * returns workspace CRM contacts (optionally filtered to those WITH a phone,
 * which is the only kind pickable for a WhatsApp group / send) in BOTH the
 * shapes the two callers expect:
 *   - items[].label  (GroupsTab picker — "First Last (+phone)")
 *   - items[].{id,first_name,last_name,phone,email,workspace_id}  (api.ts)
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */
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

  const q = (sp.get("q") ?? sp.get("search") ?? "").trim();
  const hasPhone = sp.get("has_phone") === "1";
  const limitRaw = Number.parseInt(sp.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 200)
    : 50;

  const admin = createAdminClient();
  let query = admin
    .from("crm_contacts")
    .select("id, workspace_id, first_name, last_name, phone, email")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("first_name", { ascending: true })
    .limit(limit);

  if (hasPhone) {
    query = query.not("phone", "is", null).neq("phone", "");
  }
  if (q) {
    // Search across name / phone / email. PostgREST `or` with ilike wildcards.
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  const rows = (data ?? []) as Array<{
    id: string;
    workspace_id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  }>;

  const items = rows.map((c) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    const label =
      (name || c.phone || c.email || "Unknown") +
      (c.phone ? ` (${c.phone})` : "");
    return {
      id: c.id,
      workspace_id: c.workspace_id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      email: c.email,
      name: name || null,
      label,
    };
  });

  return NextResponse.json({ items });
}
