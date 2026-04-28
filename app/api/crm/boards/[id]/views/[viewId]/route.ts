/* PATCH/DELETE /api/crm/boards/[id]/views/[viewId] */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../../_helpers";
import { viewUpdate } from "../../../_schemas";
import type { CrmBoardView } from "@/app/tools/crm/_boards/types";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; viewId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, viewId } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = viewUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_board_views")
    .update(parsed.data)
    .eq("id", viewId)
    .eq("board_id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ view: data as CrmBoardView });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; viewId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, viewId } = await ctx.params;

  const { error } = await auth.supabase
    .from("crm_board_views")
    .delete()
    .eq("id", viewId)
    .eq("board_id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
