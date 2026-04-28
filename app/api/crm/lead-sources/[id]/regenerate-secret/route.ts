/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/crm/lead-sources/[id]/regenerate-secret
 *
 * Rotate the signing secret. Owner/admin only (RLS enforces). Returns
 * the new secret in the response — the admin UI shows it once and
 * tells the user to copy it before navigating away.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireUser } from "../../../_helpers";
import { generateSecret } from "@/lib/crm/lead-sources/ingest";
import type { CrmLeadSource } from "@/lib/crm/lead-sources/types";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const newSecret = generateSecret();
  const { data, error } = await auth.supabase
    .from("crm_lead_sources")
    .update({ secret: newSecret })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data as CrmLeadSource });
}
