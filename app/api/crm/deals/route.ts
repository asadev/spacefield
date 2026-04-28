import { NextResponse, type NextRequest } from "next/server";
import { getDefaultPipeline, listDeals } from "@/app/tools/crm/_data";
import type { CrmDealStatus } from "@/app/tools/crm/types";
import { DEAL_STATUS_VALUES } from "@/app/tools/crm/types";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { dealCreate } from "../_schemas";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const statusParam = sp.get("status");
  const status = statusParam
    ? (DEAL_STATUS_VALUES as readonly string[]).includes(statusParam)
      ? (statusParam as CrmDealStatus)
      : undefined
    : undefined;

  try {
    const items = await listDeals(workspaceId, {
      pipelineId: sp.get("pipeline_id") ?? undefined,
      stageId: sp.get("stage_id") ?? undefined,
      ownerId: sp.get("owner_id") ?? undefined,
      status,
      search: sp.get("search") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor") ?? undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = dealCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  // Resolve pipeline + stage when caller didn't specify — default pipeline,
  // first stage. Phase 2 UIs can call /api/crm/pipelines for explicit choice.
  let pipelineId = parsed.data.pipeline_id ?? null;
  let stageId = parsed.data.stage_id ?? null;
  if (!pipelineId || !stageId) {
    const def = await getDefaultPipeline(parsed.data.workspace_id);
    if (!def || def.stages.length === 0) {
      return jsonError("no pipeline configured", 409);
    }
    pipelineId = pipelineId ?? def.id;
    stageId = stageId ?? def.stages[0].id;
  }

  const { data, error } = await auth.supabase
    .from("crm_deals")
    .insert({
      ...parsed.data,
      pipeline_id: pipelineId,
      stage_id: stageId,
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
