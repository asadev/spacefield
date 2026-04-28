/* ─────────────────────────────────────────────────────────────────────────
 * GET /api/crm/lead-sources/[id]/events?limit=100
 *
 * Recent events for the admin debug pane. RLS gates SELECT to workspace
 * members; we still call requireUser() to enforce auth.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireUser } from "../../../_helpers";
import type { CrmLeadSourceEvent } from "@/lib/crm/lead-sources/types";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(
    1,
    Math.min(500, limitParam ? Number(limitParam) || 100 : 100)
  );

  const { data, error } = await auth.supabase
    .from("crm_lead_source_events")
    .select("*")
    .eq("source_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: (data as CrmLeadSourceEvent[]) ?? [] });
}
