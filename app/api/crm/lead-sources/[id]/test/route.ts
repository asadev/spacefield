/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/crm/lead-sources/[id]/test
 *
 * Fires a sample payload through `ingestWebhookPayload` so the admin UI
 * can prove end-to-end that a configured source actually creates a lead
 * + an event log row. Workspace member auth required so this can't be
 * abused as an unauthenticated lead-injection vector.
 *
 * NOTE: this calls the same ingestion path as the public endpoint, so
 * it counts toward `event_count` and `last_event_at` on the source.
 * That's intentional — testing should look identical to a real call.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireUser } from "../../../_helpers";
import {
  ingestWebhookPayload,
  loadLeadSourceById,
} from "@/lib/crm/lead-sources/ingest";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const source = await loadLeadSourceById(id);
  if (!source) return jsonError("not_found", 404);

  // Membership check — admin client bypasses RLS so we have to verify here.
  const { data: member, error: mErr } = await auth.supabase.rpc(
    "is_workspace_member",
    { ws_id: source.workspace_id }
  );
  if (mErr) return jsonError(mErr.message, 500);
  if (member !== true) return jsonError("forbidden", 403);

  const samplePayload = {
    first_name: "Sample",
    last_name: "Lead",
    email: `sample+${Date.now()}@spacefield.test`,
    phone: "+15555550100",
    notes: "Test payload from the admin UI.",
    test: true,
  };
  const result = await ingestWebhookPayload(id, samplePayload, {
    ip: null,
    userAgent: "spacefield-admin-test",
  });
  return NextResponse.json({ ok: true, result, samplePayload });
}
