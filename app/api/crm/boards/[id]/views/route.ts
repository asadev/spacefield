/* POST /api/crm/boards/[id]/views — create a view. */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../_helpers";
import { viewCreate } from "../../_schemas";
import type { CrmBoardView } from "@/app/tools/crm/_boards/types";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = viewCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  let position = parsed.data.position;
  if (position === undefined) {
    const { data: posRows } = await auth.supabase
      .from("crm_board_views")
      .select("position")
      .eq("board_id", id)
      .order("position", { ascending: false })
      .limit(1);
    position = posRows && posRows.length > 0
      ? (posRows[0].position as number) + 1
      : 0;
  }

  const { data, error } = await auth.supabase
    .from("crm_board_views")
    .insert({
      board_id: id,
      name: parsed.data.name,
      view_type: parsed.data.view_type,
      config: parsed.data.config ?? {},
      is_default: parsed.data.is_default ?? false,
      position,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ view: data as CrmBoardView });
}
