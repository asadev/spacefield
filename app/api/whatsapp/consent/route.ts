import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordOptIn, recordOptOut } from "@/lib/whatsapp/consent";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp consent / opt-out management (EPIC-12).
 *
 * GET  /api/whatsapp/consent?workspace_id=                 → { items: state rows } + recent log
 *      /api/whatsapp/consent?workspace_id=&contact_id=     → single contact's state
 * POST /api/whatsapp/consent   { workspace_id, contact_id, action: 'opt_out'|'opt_in'|'grant_consent'|'revoke_consent', reason? }
 *
 * The inbound webhook auto-records STOP/START; this route is the manual
 * operator control + the audit-list backing for the Consent settings tab.
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
  const contactId = sp.get("contact_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  if (contactId) {
    const { data } = await admin
      .from("whatsapp_contact_state")
      .select("contact_id, marketing_consent, opted_out_at, opt_out_source, opted_in_at")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .maybeSingle();
    return NextResponse.json({ state: data ?? null });
  }

  // Opted-out contacts (the suppression list) + recent audit, joined to names.
  const { data: states, error } = await admin
    .from("whatsapp_contact_state")
    .select("contact_id, marketing_consent, opted_out_at, opt_out_source, opted_in_at, updated_at")
    .eq("workspace_id", workspaceId)
    .not("opted_out_at", "is", null)
    .order("opted_out_at", { ascending: false })
    .limit(500);
  if (error) return jsonError(error.message, 500);

  const ids = (states ?? []).map((s) => (s as { contact_id: string }).contact_id);
  const nameById = new Map<string, { name: string; phone: string | null }>();
  if (ids.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name, phone")
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    for (const c of contacts ?? []) {
      const row = c as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      };
      const name =
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        row.phone ||
        row.id.slice(0, 8);
      nameById.set(row.id, { name, phone: row.phone });
    }
  }

  const items = (states ?? []).map((s) => {
    const row = s as {
      contact_id: string;
      marketing_consent: boolean;
      opted_out_at: string | null;
      opt_out_source: string | null;
      opted_in_at: string | null;
    };
    const meta = nameById.get(row.contact_id);
    return {
      ...row,
      name: meta?.name ?? row.contact_id.slice(0, 8),
      phone: meta?.phone ?? null,
    };
  });

  const { count } = await admin
    .from("whatsapp_contact_state")
    .select("contact_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .not("opted_out_at", "is", null);

  return NextResponse.json({ items, opted_out_count: count ?? items.length });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<{
    workspace_id?: string;
    contact_id?: string;
    action?: string;
    reason?: string;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id: workspaceId, contact_id: contactId, action, reason } =
    parsed.body;
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!contactId) return jsonError("contact_id required", 400);
  if (!action) return jsonError("action required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  // Verify the contact belongs to this workspace (ownership).
  const admin = createAdminClient();
  const { data: ct } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!ct) return jsonError("contact_not_found", 404);

  const reasonText = reason?.trim() || `manual by ${auth.user.id.slice(0, 8)}`;

  switch (action) {
    case "opt_out":
      await recordOptOut(admin, {
        workspaceId,
        contactId,
        source: "manual",
        reason: reasonText,
      });
      break;
    case "opt_in":
      await recordOptIn(admin, {
        workspaceId,
        contactId,
        source: "manual",
        reason: reasonText,
      });
      break;
    case "grant_consent":
      await recordOptIn(admin, {
        workspaceId,
        contactId,
        source: "manual",
        reason: reasonText,
        grantConsent: true,
      });
      break;
    case "revoke_consent":
      await admin
        .from("whatsapp_contact_state")
        .upsert(
          {
            workspace_id: workspaceId,
            contact_id: contactId,
            marketing_consent: false,
          },
          { onConflict: "workspace_id,contact_id" },
        );
      await admin.from("whatsapp_opt_out_log").insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        action: "consent_revoked",
        reason: reasonText,
      });
      break;
    default:
      return jsonError("invalid action", 400);
  }

  return NextResponse.json({ ok: true });
}
