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
 * GET /api/whatsapp/history/[id]?workspace_id=...
 *
 * Per-row delivery breakdown. The list endpoint emits two kinds of ids:
 *   - `job:<uuid>`  → return every whatsapp_send_log row for that job.
 *   - `log:<uuid>`  → return the single log row (single send).
 *
 * Anything else returns 400. Workspace ownership is verified on every
 * fetch (defence-in-depth — RLS already covers reads).
 *
 * Response shape (UI unwraps `items`):
 *   { items: WaJobLogEntry[] }
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const { id: rawId } = await ctx.params;
  if (!rawId) return jsonError("id required", 400);

  const colon = rawId.indexOf(":");
  const kind = colon === -1 ? "" : rawId.slice(0, colon);
  const id = colon === -1 ? rawId : rawId.slice(colon + 1);
  if (kind !== "job" && kind !== "log") {
    return jsonError("invalid_id_kind", 400);
  }

  const admin = createAdminClient();

  if (kind === "log") {
    const { data: row, error } = await admin
      .from("whatsapp_send_log")
      .select(
        "id, contact_id, to_number, status, sent_at",
      )
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!row) return jsonError("not_found", 404);
    const r = row as {
      id: string;
      contact_id: string | null;
      to_number: string | null;
      status: string;
      sent_at: string;
    };
    return NextResponse.json({
      items: [
        {
          id: r.id,
          contact_id: r.contact_id,
          contact_name: null,
          contact_phone: r.to_number,
          status: r.status,
          error_message: null,
          sent_at: r.sent_at,
        },
      ],
    });
  }

  // kind === 'job'
  const { data: job, error: jobErr } = await admin
    .from("whatsapp_send_jobs")
    .select("id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (jobErr) return jsonError(jobErr.message, 500);
  if (!job) return jsonError("not_found", 404);

  const { data: logsRaw, error: logsErr } = await admin
    .from("whatsapp_send_log")
    .select("id, contact_id, to_number, status, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("job_id", id)
    .order("sent_at", { ascending: false })
    .limit(500);
  if (logsErr) return jsonError(logsErr.message, 500);

  type Row = {
    id: string;
    contact_id: string | null;
    to_number: string | null;
    status: string;
    sent_at: string;
  };
  const logs = (logsRaw ?? []) as Row[];

  // Single contact-name hydration pass.
  const cids = logs
    .map((l) => l.contact_id)
    .filter((id): id is string => !!id);
  const contactsMap = new Map<string, string>();
  if (cids.length > 0) {
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, first_name, last_name, phone")
      .in("id", cids);
    for (const c of contacts ?? []) {
      const r = c as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      };
      const n =
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
        r.phone ||
        "";
      contactsMap.set(r.id, n);
    }
  }

  const items = logs.map((l) => ({
    id: l.id,
    contact_id: l.contact_id,
    contact_name: l.contact_id ? contactsMap.get(l.contact_id) ?? null : null,
    contact_phone: l.to_number,
    status: l.status,
    error_message: null,
    sent_at: l.sent_at,
  }));

  return NextResponse.json({ items });
}
