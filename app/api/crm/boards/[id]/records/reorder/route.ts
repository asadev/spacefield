/* POST /api/crm/boards/[id]/records/reorder
 * Bulk-reorder. Body: `{ ids: string[] }` — the position is set to the
 * index in the array. Two-phase update isn't needed because the unique
 * constraint is only on (board_id, slug); positions can collide
 * transiently but always settle at the requested values.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../../_helpers";
import { recordReorder } from "../../../_schemas";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = recordReorder.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // Issue per-row updates. Postgres supabase-js doesn't support bulk
  // upserts with computed positions in a single roundtrip, so we batch
  // these. Caller capped the array at 2000.
  const updates = parsed.data.ids.map((recId, position) =>
    auth.supabase
      .from("crm_board_records")
      .update({ position })
      .eq("id", recId)
      .eq("board_id", id)
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return jsonError(firstErr.error.message, 500);
  return NextResponse.json({ ok: true, count: parsed.data.ids.length });
}
