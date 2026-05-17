import { NextResponse, type NextRequest } from "next/server";
import { listPipelines } from "@/app/tools/crm/_data";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { pipelineCreate } from "../_schemas";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  try {
    const items = await listPipelines(workspaceId);
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(
      safeErrorMessage(e, {
        source: "crm.pipelines.list",
        userId: auth.user.id,
        fallback: "list_failed",
      }),
      500
    );
  }
}

/* POST /api/crm/pipelines — admin/owner only (gated by RLS). */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = pipelineCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_pipelines")
    .insert(parsed.data)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
