/* POST /api/crm/boards/[id]/columns — add a column. */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../_helpers";
import { columnCreate } from "../../_schemas";
import type { CrmBoardColumn } from "@/app/tools/crm/_boards/types";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = columnCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // Pick next position when caller didn't specify.
  let position = parsed.data.position;
  if (position === undefined) {
    const { data: posRows } = await auth.supabase
      .from("crm_board_columns")
      .select("position")
      .eq("board_id", id)
      .order("position", { ascending: false })
      .limit(1);
    position = posRows && posRows.length > 0
      ? (posRows[0].position as number) + 1
      : 0;
  }

  const { data, error } = await auth.supabase
    .from("crm_board_columns")
    .insert({
      board_id: id,
      field_key: parsed.data.field_key,
      label: parsed.data.label,
      field_type: parsed.data.field_type,
      config: parsed.data.config ?? {},
      required: parsed.data.required ?? false,
      width: parsed.data.width ?? 180,
      position,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ column: data as CrmBoardColumn });
}
