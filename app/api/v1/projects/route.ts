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
 * GET /api/v1/projects — list projects in the token's workspace.
 *
 * Query: limit, cursor, status. Returns `{ data, next_cursor }`.
 */

const COLUMNS =
  "id, workspace_id, name, slug, description, status, color, icon, " +
  "created_by, archived_at, created_at";

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const auth = await authenticateV1(req, "read:projects");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { limit, cursor } = parseListParams(req);
    const status = req.nextUrl.searchParams.get("status");

    const admin = v1AdminClient();
    let q = admin
      .from("projects")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(limit + 1);

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
  { source: "v1.projects", rateLimit: { count: 600, window_sec: 60 } }
);
