import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  adminListTasks,
  getTaskById,
  listTasks,
} from "@/lib/tasks/server";
import type { TaskFilter, TaskRow } from "@/lib/tasks/types";

/**
 * AI tools for the Tasks module.
 *
 * Each tool runs server-side with the caller's auth context. The
 * runtime calls the handler with `{ userId, workspaceId }` resolved
 * from the session. RLS does the heavy lifting; the handlers here only
 * shape input and trim output to be LLM-friendly.
 */

export interface AITool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (
    input: Record<string, unknown>,
    ctx: { userId: string; workspaceId: string }
  ) => Promise<unknown>;
}

/* ──────────────────── helpers ──────────────────── */

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function projectionLite(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project_id: t.project_id,
    assignee_ids: t.assignee_ids,
    due_at: t.due_at,
    completed_at: t.completed_at,
  };
}

/* ──────────────────── tools ──────────────────── */

const listTool: AITool = {
  name: "list_tasks",
  description:
    "List up to 20 tasks in the current workspace. Optional filters: status, assignee ('me' or a user id), project (project id), due_before (ISO timestamp).",
  input_schema: {
    type: "object",
    properties: {
      filter: {
        type: "object",
        properties: {
          status: { type: "string" },
          assignee: { type: "string" },
          project: { type: "string" },
          due_before: { type: "string" },
          priority: { type: "string" },
          open_only: { type: "boolean" },
        },
      },
    },
  },
  handler: async (input, ctx) => {
    const f = (input.filter ?? {}) as Record<string, unknown>;
    const filter: TaskFilter = {
      workspace_id: ctx.workspaceId,
      status: asString(f.status),
      assignee: asString(f.assignee),
      project: asString(f.project),
      due_before: asString(f.due_before),
      priority: asString(f.priority) as TaskFilter["priority"],
      open_only: Boolean(f.open_only),
      limit: 20,
    };
    const rows = await listTasks(filter, ctx.userId);
    return { tasks: rows.map(projectionLite) };
  },
};

const createTool: AITool = {
  name: "create_task",
  description:
    "Create a new task in the current workspace. Requires title; description, project_id, assignee_ids, due_at (ISO), priority (urgent|high|normal|low) are optional.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      project_id: { type: "string" },
      assignee_ids: { type: "array", items: { type: "string" } },
      due_at: { type: "string" },
      priority: { type: "string" },
      status: { type: "string" },
    },
    required: ["title"],
  },
  handler: async (input, ctx) => {
    const title = asString(input.title);
    if (!title) throw new Error("title is required");
    const supabase = await createClient();
    const insertPayload = {
      workspace_id: ctx.workspaceId,
      title,
      description: asString(input.description) ?? null,
      project_id: asString(input.project_id) ?? null,
      assignee_ids: asStringArray(input.assignee_ids) ?? [],
      due_at: asString(input.due_at) ?? null,
      priority: (asString(input.priority) as TaskRow["priority"]) ?? "normal",
      status: asString(input.status) ?? "Todo",
      created_by: ctx.userId,
    };
    const { data, error } = await supabase
      .from("tasks")
      .insert(insertPayload)
      .select(
        "id, workspace_id, project_id, title, status, priority, assignee_ids, due_at"
      )
      .single();
    if (error) throw new Error(error.message);
    return { task: data };
  },
};

const updateStatusTool: AITool = {
  name: "update_task_status",
  description:
    "Move a task to a new status. If status is 'Done', invokes task_complete (which also notifies assignees and emits activity).",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      status: { type: "string" },
    },
    required: ["task_id", "status"],
  },
  handler: async (input) => {
    const taskId = asString(input.task_id);
    const status = asString(input.status);
    if (!taskId || !status) throw new Error("task_id and status required");
    const supabase = await createClient();
    if (status === "Done") {
      const { data, error } = await supabase.rpc("task_complete", {
        p_task_id: taskId,
      });
      if (error) throw new Error(error.message);
      return { task_id: data ?? taskId, status: "Done" };
    }
    const { data, error } = await supabase
      .from("tasks")
      .update({ status, completed_at: null })
      .eq("id", taskId)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return { task: data };
  },
};

const searchTool: AITool = {
  name: "search_tasks",
  description:
    "Search tasks by free-text query against title and description in the current workspace. Returns up to `limit` rows (default 20).",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  handler: async (input, ctx) => {
    const query = asString(input.query);
    if (!query) throw new Error("query is required");
    const limit =
      typeof input.limit === "number"
        ? Math.min(Math.max(input.limit, 1), 50)
        : 20;
    const rows = await listTasks(
      { workspace_id: ctx.workspaceId, search: query, limit },
      ctx.userId
    );
    return { tasks: rows.map(projectionLite) };
  },
};

const summarizeTool: AITool = {
  name: "summarize_task",
  description:
    "Return a structured summary of a task — its fields, comments, and recent activity — formatted for use as LLM context.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
    },
    required: ["task_id"],
  },
  handler: async (input) => {
    const taskId = asString(input.task_id);
    if (!taskId) throw new Error("task_id is required");
    const task = await getTaskById(taskId);
    if (!task) throw new Error("task not found");

    const supabase = await createClient();
    const [commentsRes, activitiesRes] = await Promise.all([
      supabase
        .from("comments")
        .select("id, author_user_id, body, created_at, edited_at")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("activities")
        .select("id, actor_user_id, verb, payload, created_at")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee_ids: task.assignee_ids,
        project_id: task.project_id,
        due_at: task.due_at,
        completed_at: task.completed_at,
        created_at: task.created_at,
      },
      comments: commentsRes.data ?? [],
      activity: activitiesRes.data ?? [],
    };
  },
};

/* ──────────────────── admin helper (server-only consumption) ────── */

/**
 * Convenience for the admin sweep view: an LLM can ask for any tasks
 * matching a workspace filter regardless of membership.
 */
export async function adminSweep(opts: {
  workspaceId?: string;
  search?: string;
  limit?: number;
}) {
  const rows = await adminListTasks(opts);
  return { tasks: rows.map(projectionLite) };
}

export const TOOLS: AITool[] = [
  listTool,
  createTool,
  updateStatusTool,
  searchTool,
  summarizeTool,
];

export default TOOLS;
