import { NextResponse, type NextRequest } from "next/server";
import { indexDeal } from "@/lib/crm/search-index";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { dealMove } from "../../_schemas";

/* POST /api/crm/deals/move
 *   body: { id, stage_id, position }
 *   Moves a deal to another stage and/or reorders inside a stage. The
 *   stage's `kind` flips deal `status` (won/lost/open) so deal lifecycle
 *   math stays in sync with the kanban.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = dealMove.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // Look up the destination stage to learn its kind.
  const { data: stage, error: stageErr } = await auth.supabase
    .from("crm_pipeline_stages")
    .select("id, pipeline_id, kind")
    .eq("id", parsed.data.stage_id)
    .maybeSingle();
  if (stageErr) return jsonError(stageErr.message, 500);
  if (!stage) return jsonError("stage_not_found", 404);

  const status =
    stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open";
  const closedAt =
    status === "open" ? null : new Date().toISOString();

  const { data, error } = await auth.supabase
    .from("crm_deals")
    .update({
      stage_id: parsed.data.stage_id,
      pipeline_id: stage.pipeline_id,
      position: parsed.data.position,
      status,
      closed_at: closedAt,
    })
    .eq("id", parsed.data.id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  await indexDeal(data);
  return NextResponse.json({ item: data });
}
