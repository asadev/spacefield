import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  createProject,
  getAuthUserId,
  listProjects,
  resolveWorkspaceId,
} from "@/lib/tasks/server";
import { ProjectCreateSchema } from "@/lib/tasks/validation";
import {
  DEFAULT_PROJECT_STATUSES,
  type ProjectStatus,
} from "@/lib/tasks/types";

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
    try {
      // Zod's enum widens to string; createProject expects ProjectStatus.
      // The schema already validates the value, so casting is safe.
      const project = await createProject({
        workspace_id: body.workspace_id,
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        status: (body.status ?? "active") as ProjectStatus,
        status_schema:
          body.status_schema ??
          (DEFAULT_PROJECT_STATUSES as unknown as string[]),
        color: body.color ?? null,
        icon: body.icon ?? null,
        created_by: userId,
      });
      return NextResponse.json({ project }, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }
  },
  { source: "projects.create", rateLimit: { count: 30, window_sec: 60 } }
);
