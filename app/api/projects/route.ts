import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthUserId,
  listProjects,
  resolveWorkspaceId,
} from "@/lib/tasks/server";
import { ProjectCreateSchema } from "@/lib/tasks/validation";
import { DEFAULT_PROJECT_STATUSES } from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

/**
 * GET  /api/projects   — list projects in the caller's workspace
 * POST /api/projects   — create a project
 */

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const wantedWs = req.nextUrl.searchParams.get("workspace");
    const workspaceId = await resolveWorkspaceId(wantedWs);
    if (!workspaceId) return NextResponse.json({ projects: [] });
    const rows = await listProjects(workspaceId);
    return NextResponse.json({ projects: rows });
  },
  { source: "projects.list", rateLimit: { count: 120, window_sec: 60 } }
);

export const POST = withApiHandler(
  async (req: NextRequest) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = ProjectCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const supabase = await createClient();
    const insertPayload = {
      workspace_id: body.workspace_id,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      status: body.status ?? "active",
      status_schema:
        body.status_schema ?? (DEFAULT_PROJECT_STATUSES as unknown as string[]),
      color: body.color ?? null,
      icon: body.icon ?? null,
      created_by: userId,
    };
    const { data, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ project: data }, { status: 201 });
  },
  { source: "projects.create", rateLimit: { count: 30, window_sec: 60 } }
);
