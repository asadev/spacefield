/* ─────────────────────────────────────────────────────────────────────────
 * /api/crm/boards/[id]
 *  GET    — full board: row + columns[] + views[].
 *  PATCH  — rename / recolor / reposition / archive.
 *  DELETE — soft-delete (archived_at = now()). Hard-delete is reserved
 *           for owners via a future admin endpoint.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { boardUpdate } from "../_schemas";
import type {
  CrmBoard,
  CrmBoardColumn,
  CrmBoardView,
} from "@/app/tools/crm/_boards/types";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data: board, error: bErr } = await auth.supabase
    .from("crm_boards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (bErr) return jsonError(bErr.message, 500);
  if (!board) return jsonError("not_found", 404);

  const { data: columns, error: cErr } = await auth.supabase
    .from("crm_board_columns")
    .select("*")
    .eq("board_id", id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (cErr) return jsonError(cErr.message, 500);

  const { data: views, error: vErr } = await auth.supabase
    .from("crm_board_views")
    .select("*")
    .eq("board_id", id)
    .order("position", { ascending: true });
  if (vErr) return jsonError(vErr.message, 500);

  return NextResponse.json({
    board: board as CrmBoard,
    columns: (columns ?? []) as CrmBoardColumn[],
    views: (views ?? []) as CrmBoardView[],
  });
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
  const parsed = boardUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_boards")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ board: data as CrmBoard });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { error } = await auth.supabase
    .from("crm_boards")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
