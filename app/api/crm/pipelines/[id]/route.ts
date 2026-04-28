import { NextResponse, type NextRequest } from "next/server";
import type { CrmPipeline, CrmPipelineStage } from "@/app/tools/crm/types";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { pipelineUpdate } from "../../_schemas";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data: pipeline } = await auth.supabase
    .from("crm_pipelines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) return jsonError("not_found", 404);

  const { data: stages } = await auth.supabase
    .from("crm_pipeline_stages")
    .select("*")
    .eq("pipeline_id", id)
    .order("position", { ascending: true });

  return NextResponse.json({
    item: {
      ...(pipeline as CrmPipeline),
      stages: (stages as CrmPipelineStage[]) ?? [],
    },
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
  const parsed = pipelineUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_pipelines")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const { error } = await auth.supabase
    .from("crm_pipelines")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
