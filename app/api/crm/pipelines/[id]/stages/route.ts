import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, requireUser } from "../../../_helpers";
import { stageCreate } from "../../../_schemas";

/* GET /api/crm/pipelines/[id]/stages — list stages for a pipeline */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data, error } = await auth.supabase
    .from("crm_pipeline_stages")
    .select("*")
    .eq("pipeline_id", id)
    .order("position", { ascending: true });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

/* POST /api/crm/pipelines/[id]/stages — create a new stage in a pipeline */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = stageCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_pipeline_stages")
    .insert({ ...parsed.data, pipeline_id: id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
