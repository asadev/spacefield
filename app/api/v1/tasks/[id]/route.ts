import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  authenticateV1,
  v1AdminClient,
} from "../../_lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tasks/:id — fetch one task. 404 if it's not in the
 * caller's workspace.
 */

type Params = { params: Promise<{ id: string }> };

const COLUMNS =
  "id, workspace_id, project_id, parent_task_id, title, description, " +
  "status, priority, assignee_ids, due_at, start_at, completed_at, " +
  "estimate_min, actual_min, created_at, updated_at";

export const GET = withApiHandler<Params>(
  async (req, ctxRoute) => {
    const auth = await authenticateV1(req, "read:tasks");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { id } = await ctxRoute.params;
    const admin = v1AdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "query_failed", detail: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  },
  { source: "v1.tasks.get", rateLimit: { count: 600, window_sec: 60 } }
);
