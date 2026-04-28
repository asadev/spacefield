/* PATCH/DELETE /api/crm/boards/[id]/records/[recId]
 * PATCH partial-merges into the `data` jsonb so a cell-edit only sends
 * the changed key/value. Server-side merge means concurrent edits to
 * different cells don't clobber each other.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../../_helpers";
import { recordUpdate } from "../../../_schemas";
import type { CrmBoardRecord } from "@/app/tools/crm/_boards/types";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; recId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, recId } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = recordUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // Read existing data so we can merge. RLS gates the read.
  const { data: existing, error: readErr } = await auth.supabase
    .from("crm_board_records")
    .select("data")
    .eq("id", recId)
    .eq("board_id", id)
    .maybeSingle();
  if (readErr) return jsonError(readErr.message, 500);
  if (!existing) return jsonError("not_found", 404);

  const merged: Record<string, unknown> = {
    ...((existing.data as Record<string, unknown>) ?? {}),
    ...(parsed.data.data ?? {}),
  };
  // Strip explicit-null keys so the JSON stays compact when the editor
  // sends `{ field: null }` to clear a cell — null is preserved but the
  // alternative would be to delete; v1 keeps null for filterable presence.

  const update: Record<string, unknown> = {};
  if (parsed.data.data !== undefined) update.data = merged;
  if (parsed.data.position !== undefined) update.position = parsed.data.position;
  if (parsed.data.parent_id !== undefined) update.parent_id = parsed.data.parent_id;
  if (parsed.data.assignee_ids !== undefined)
    update.assignee_ids = parsed.data.assignee_ids;

  if (Object.keys(update).length === 0) {
    return jsonError("no fields to update", 400);
  }

  const { data, error } = await auth.supabase
    .from("crm_board_records")
    .update(update)
    .eq("id", recId)
    .eq("board_id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ record: data as CrmBoardRecord });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; recId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, recId } = await ctx.params;

  const { error } = await auth.supabase
    .from("crm_board_records")
    .delete()
    .eq("id", recId)
    .eq("board_id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
