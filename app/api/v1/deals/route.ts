import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  authenticateV1,
  buildListResponse,
  parseListParams,
  v1AdminClient,
} from "../_lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/deals — list CRM deals in the token's workspace.
 *
 * Query: limit, cursor, pipeline_id, stage_id, status (open|won|lost).
 */

const COLUMNS =
  "id, workspace_id, pipeline_id, stage_id, name, amount, currency, " +
  "close_date, primary_contact_id, company_id, assignee_ids, position, " +
  "visibility, owner_id, status, created_at, updated_at, closed_at";

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const auth = await authenticateV1(req, "read:deals");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { limit, cursor } = parseListParams(req);
    const url = req.nextUrl;
    const pipelineId = url.searchParams.get("pipeline_id");
    const stageId = url.searchParams.get("stage_id");
    const status = url.searchParams.get("status");

    const admin = v1AdminClient();
    let q = admin
      .from("crm_deals")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .order("id", { ascending: true })
      .limit(limit + 1);

    if (pipelineId) q = q.eq("pipeline_id", pipelineId);
    if (stageId) q = q.eq("stage_id", stageId);
    if (status) q = q.eq("status", status);
    if (cursor) q = q.gt("id", cursor);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { error: "query_failed", detail: error.message },
        { status: 500 }
      );
    }
    return buildListResponse(
      (data ?? []) as unknown as { id: string }[],
      limit
    );
  },
  { source: "v1.deals", rateLimit: { count: 600, window_sec: 60 } }
);
