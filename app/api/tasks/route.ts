import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import {
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
    const supabase = await createClient();
    const insertPayload = {
      workspace_id: body.workspace_id,
      title: body.title,
      description: body.description ?? null,
      project_id: body.project_id ?? null,
      parent_task_id: body.parent_task_id ?? null,
      status: body.status ?? "Todo",
      priority: body.priority ?? "normal",
      assignee_ids: body.assignee_ids ?? [],
      due_at: body.due_at ?? null,
      start_at: body.start_at ?? null,
      estimate_min: body.estimate_min ?? null,
      created_by: userId,
    };
    const { data, error } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ task: data }, { status: 201 });
  },
  { source: "tasks.create", rateLimit: { count: 60, window_sec: 60 } }
);
