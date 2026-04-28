/* PATCH/DELETE /api/crm/boards/[id]/columns/[colId]
 * DELETE soft-deletes the column (sets archived_at) so existing record
 * data isn't lost — un-archiving in a future admin UI restores it.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../../_helpers";
import { columnUpdate } from "../../../_schemas";
import type { CrmBoardColumn } from "@/app/tools/crm/_boards/types";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; colId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, colId } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = columnUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_board_columns")
    .update(parsed.data)
    .eq("id", colId)
    .eq("board_id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ column: data as CrmBoardColumn });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; colId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, colId } = await ctx.params;

  const { error } = await auth.supabase
    .from("crm_board_columns")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", colId)
    .eq("board_id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
