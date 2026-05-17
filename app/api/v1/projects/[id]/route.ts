import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  authenticateV1,
  v1AdminClient,
} from "../../_lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const COLUMNS =
  "id, workspace_id, name, slug, description, status, color, icon, " +
  "created_by, archived_at, created_at";

export const GET = withApiHandler<Params>(
  async (req, ctxRoute) => {
    const auth = await authenticateV1(req, "read:projects");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { id } = await ctxRoute.params;
    const admin = v1AdminClient();
    const { data, error } = await admin
      .from("projects")
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
  { source: "v1.projects.get", rateLimit: { count: 600, window_sec: 60 } }
);
