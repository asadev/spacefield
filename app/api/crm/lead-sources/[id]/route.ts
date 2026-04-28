/* ─────────────────────────────────────────────────────────────────────────
 * GET    /api/crm/lead-sources/[id]   — single source (for admin UI prefill)
 * PATCH  /api/crm/lead-sources/[id]   — update name / config / active
 * DELETE /api/crm/lead-sources/[id]   — soft-delete first, then hard-delete
 *
 * Soft delete = set `active=false`. Calling DELETE again on an already
 * inactive row hard-deletes (cascade clears events). Two-step gives
 * users a one-click rollback before destruction.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readJson, requireUser } from "../../_helpers";
import type { CrmLeadSource } from "@/lib/crm/lead-sources/types";

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_lead_sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ item: data as CrmLeadSource });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = updateBody.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_lead_sources")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data as CrmLeadSource });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  // Step 1: read current state so we can decide soft vs hard delete.
  const { data: existing, error: readErr } = await auth.supabase
    .from("crm_lead_sources")
    .select("active")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return jsonError(readErr.message, 500);
  if (!existing) return jsonError("not_found", 404);

  const isActive = (existing as { active: boolean }).active;
  if (isActive) {
    const { error } = await auth.supabase
      .from("crm_lead_sources")
      .update({ active: false })
      .eq("id", id);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, deleted: false, deactivated: true });
  }

  const { error } = await auth.supabase
    .from("crm_lead_sources")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, deleted: true, deactivated: false });
}
