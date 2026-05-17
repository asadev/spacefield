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
 * GET /api/v1/employees — list employees in the token's workspace.
 *
 * Query: limit, cursor, status (active|inactive|…), department.
 */

const COLUMNS =
  "id, workspace_id, user_id, email, full_name, job_title, department, " +
  "manager_id, location, employment_type, hire_date, termination_date, " +
  "status, archived_at, created_at, updated_at";

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const auth = await authenticateV1(req, "read:employees");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { limit, cursor } = parseListParams(req);
    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const department = url.searchParams.get("department");

    const admin = v1AdminClient();
    let q = admin
      .from("employees")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .order("id", { ascending: true })
      .limit(limit + 1);

    if (status) q = q.eq("status", status);
    if (department) q = q.eq("department", department);
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
  { source: "v1.employees", rateLimit: { count: 600, window_sec: 60 } }
);
