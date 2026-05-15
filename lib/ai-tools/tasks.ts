/* AI tools — tasks + projects.
 *
 * Surfaces the Tasks module to the agent runtime as a SkillDefinition.
 * Mirrors the shape of `lib/agent/skills/*` so it can drop into
 * ALL_SKILLS without any adapter:
 *
 *   import { tasksSkill } from "@/lib/ai-tools/tasks";
 *   ALL_SKILLS.push(tasksSkill);
 *
 * All tool implementations use `ctx.supabase` (RLS-scoped) so the same
 * workspace-member + tier checks the rest of the app relies on apply
 * here too. The `task_complete` RPC is used for status=Done so
 * notifications + activity fan-out match the manual UI path.
 */

import "server-only";

import { clampList, toolError, toolOk } from "@/lib/agent/skills/_helpers";
import type {
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";
import type { TaskRow } from "@/lib/tasks/types";

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

const TASK_SELECT =
  "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at";

/* ──────────────────── tools ──────────────────── */

const list_tasks: ToolDefinition = {
  name: "list_tasks",
  description:
    "List up to 20 tasks in the current workspace. Optional filters: status, assignee ('me' or a user id), project (project id), due_before (ISO timestamp), priority, open_only.",
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
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const f = ((input as { filter?: Record<string, unknown> })?.filter ?? {}) as Record<
      string,
      unknown
    >;
    let q = ctx.supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const status = asString(f.status);
    const project = asString(f.project);
    const priority = asString(f.priority);
    const due_before = asString(f.due_before);
    const assignee = asString(f.assignee);
    const openOnly = Boolean(f.open_only);

    if (status) q = q.eq("status", status);
    if (project) q = q.eq("project_id", project);
    if (priority) q = q.eq("priority", priority);
    if (due_before) q = q.lte("due_at", due_before);
    if (openOnly) q = q.is("completed_at", null);
    if (assignee) {
      const uid = assignee === "me" ? ctx.userId : assignee;
      if (uid) q = q.contains("assignee_ids", [uid]);
    }

    const { data, error } = await q;
    if (error) return toolError(error.message);
    return toolOk({
      tasks: clampList((data ?? []) as TaskRow[], 20).map(projectionLite),
    });
  },
};

const create_task: ToolDefinition = {
  name: "create_task",
  description:
    "Create a new task in the current workspace. Requires title; description, project_id, assignee_ids, due_at (ISO), priority (urgent|high|normal|low), status are optional.",
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
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const title = asString(i.title);
    if (!title) return toolError("title is required");
    const insertPayload = {
      workspace_id: ctx.workspaceId,
      title,
      description: asString(i.description) ?? null,
      project_id: asString(i.project_id) ?? null,
      assignee_ids: asStringArray(i.assignee_ids) ?? [],
      due_at: asString(i.due_at) ?? null,
      priority: (asString(i.priority) as TaskRow["priority"]) ?? "normal",
      status: asString(i.status) ?? "Todo",
      created_by: ctx.userId,
    };
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert(insertPayload)
      .select(
        "id, workspace_id, project_id, title, status, priority, assignee_ids, due_at"
      )
      .single();
    if (error) return toolError(error.message);
    return toolOk({ task: data });
  },
};

const update_task_status: ToolDefinition = {
  name: "update_task_status",
  description:
    "Move a task to a new status. If status is 'Done', invokes the task_complete RPC (which also notifies assignees and emits activity).",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      status: { type: "string" },
    },
    required: ["task_id", "status"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const taskId = asString(i.task_id);
    const status = asString(i.status);
    if (!taskId || !status) {
      return toolError("task_id and status required");
    }
    if (status === "Done") {
      const { data, error } = await ctx.supabase.rpc("task_complete", {
        p_task_id: taskId,
      });
      if (error) return toolError(error.message);
      return toolOk({ task_id: (data as string) ?? taskId, status: "Done" });
    }
    const { data, error } = await ctx.supabase
      .from("tasks")
      .update({ status, completed_at: null })
      .eq("id", taskId)
      .select("id, status")
      .single();
    if (error) return toolError(error.message);
    return toolOk({ task: data });
  },
};

const search_tasks: ToolDefinition = {
  name: "search_tasks",
  description:
    "Search tasks by free-text query against title and description in the current workspace. Returns up to `limit` rows (default 20, max 50).",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const query = asString(i.query);
    if (!query) return toolError("query is required");
    const limit =
      typeof i.limit === "number"
        ? Math.min(Math.max(i.limit, 1), 50)
        : 20;
    const term = query.replace(/[,()]/g, " ").trim();
    let q = ctx.supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (term) {
      q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
    const { data, error } = await q;
    if (error) return toolError(error.message);
    return toolOk({
      tasks: clampList((data ?? []) as TaskRow[], limit).map(projectionLite),
    });
  },
};

const summarize_task: ToolDefinition = {
  name: "summarize_task",
  description:
    "Return a structured summary of a task — its fields, comments, and recent activity — formatted for use as LLM context.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
    },
    required: ["task_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const taskId = asString(i.task_id);
    if (!taskId) return toolError("task_id is required");

    const taskRes = await ctx.supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (taskRes.error) return toolError(taskRes.error.message);
    const task = taskRes.data as TaskRow | null;
    if (!task) return toolError("task not found");

    const [commentsRes, activitiesRes] = await Promise.all([
      ctx.supabase
        .from("comments")
        .select("id, author_user_id, body, created_at, edited_at")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100),
      ctx.supabase
        .from("activities")
        .select("id, actor_user_id, verb, payload, created_at")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (commentsRes.error) return toolError(commentsRes.error.message);
    if (activitiesRes.error) return toolError(activitiesRes.error.message);

    return toolOk({
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
    });
  },
};

export const tasksSkill: SkillDefinition = {
  id: "tasks",
  label: "Tasks & Projects",
  description:
    "List, create, update, search, and summarise tasks in the current workspace; status changes that complete a task fan out notifications and activity.",
  systemFragment:
    "Tasks are workspace-scoped. Use list_tasks with filters (status, assignee='me', project, priority, due_before, open_only) to answer 'what's on my plate'. Use create_task to add a task — only title is required; priority defaults to 'normal', status to 'Todo'. Use update_task_status to move a task; status='Done' triggers completion fan-out. Use search_tasks for free-text. Use summarize_task to fetch a task + its comments + recent activity for context.",
  tools: [
    list_tasks,
    create_task,
    update_task_status,
    search_tasks,
    summarize_task,
  ],
};

export default tasksSkill;
