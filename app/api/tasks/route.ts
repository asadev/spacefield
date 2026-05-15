import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  createTask,
  getAuthUserId,
  listTasks,
  resolveWorkspaceId,
} from "@/lib/tasks/server";
import { TaskCreateSchema } from "@/lib/tasks/validation";
import type { TaskFilter, TaskPriority } from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

/**
 * GET  /api/tasks  — list tasks in the caller's workspace.
 * POST /api/tasks  — create a task.
 */

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const url = req.nextUrl;
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }

    const wantedWs = url.searchParams.get("workspace");
    const workspaceId = await resolveWorkspaceId(wantedWs);
    if (!workspaceId) {
      return NextResponse.json({ tasks: [] });
    }

    const filter: TaskFilter = {
      workspace_id: workspaceId,
      project: url.searchParams.get("project") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      assignee: url.searchParams.get("assignee") ?? undefined,
      priority:
        (url.searchParams.get("priority") as TaskPriority | null) ?? undefined,
      due_before: url.searchParams.get("due_before") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      open_only: url.searchParams.get("open_only") === "1",
      limit: Number(url.searchParams.get("limit") ?? 100),
    };
    const rows = await listTasks(filter, userId);
    return NextResponse.json({ tasks: rows });
  },
  { source: "tasks.list", rateLimit: { count: 120, window_sec: 60 } }
);

export const POST = withApiHandler(
  async (req: NextRequest) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = TaskCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;
    // Use the lib helper so the row gets indexed into search_documents.
    try {
      // Zod parses priority as a string; createTask's signature expects
      // the narrow TaskPriority union. The schema constrains the value
      // server-side, so an `as` cast here is safe.
      const task = await createTask({
        ...body,
        priority: body.priority as TaskPriority | undefined,
        created_by: userId,
      });
      return NextResponse.json({ task }, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }
  },
  { source: "tasks.create", rateLimit: { count: 60, window_sec: 60 } }
);
