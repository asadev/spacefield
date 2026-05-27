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
 * GET /api/whatsapp/jobs/[id]/log?workspace_id=...
 *
 * Per-contact delivery log for a single send job. Returns up to 500 rows
 * ordered by most recent attempt. Used by the Jobs drawer to render the
 * live progress of an in-flight bulk send.
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

  const { id: jobId } = await ctx.params;
  if (!jobId) return jsonError("id required", 400);

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Verify the job belongs to this workspace before exposing log rows.
  const { data: jobRow, error: jobErr } = await admin
    .from("whatsapp_send_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (jobErr) return jsonError(jobErr.message, 500);
  if (!jobRow) return jsonError("not_found", 404);

  const { data: logsRaw, error: logsErr } = await admin
    .from("whatsapp_send_log")
    .select("id, contact_id, to_number, status, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
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

  // Hydrate contact names in a single round-trip.
  const cids = logs
    .map((l) => l.contact_id)
    .filter((id): id is string => !!id);
  const namesById = new Map<string, string>();
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
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
        r.phone ||
        "";
      namesById.set(r.id, name);
    }
  }

  const items = logs.map((l) => ({
    id: l.id,
    contact_id: l.contact_id,
    contact_name: l.contact_id ? namesById.get(l.contact_id) ?? null : null,
    contact_phone: l.to_number,
    status: l.status,
    error_message: null,
    sent_at: l.sent_at,
  }));

  return NextResponse.json({ items });
}
