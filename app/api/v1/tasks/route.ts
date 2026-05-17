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
 * GET /api/v1/tasks — list tasks for the token's workspace.
 *
 * Query params:
 *   - limit  (default 50, max 100)
 *   - cursor (id-based, exclusive)
 *   - project_id  (optional)
 *   - status      (optional)
 *
 * Returns `{ data: Task[], next_cursor: string | null }`.
 */

const COLUMNS =
  "id, workspace_id, project_id, parent_task_id, title, description, " +
  "status, priority, assignee_ids, due_at, start_at, completed_at, " +
  "estimate_min, actual_min, created_at, updated_at";

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const auth = await authenticateV1(req, "read:tasks");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { limit, cursor } = parseListParams(req);
    const url = req.nextUrl;
    const projectId = url.searchParams.get("project_id");
    const status = url.searchParams.get("status");

    const admin = v1AdminClient();
    let q = admin
      .from("tasks")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      // over-fetch by 1 to detect a next page
      .limit(limit + 1);

    if (projectId) q = q.eq("project_id", projectId);
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
  { source: "v1.tasks", rateLimit: { count: 600, window_sec: 60 } }
);
