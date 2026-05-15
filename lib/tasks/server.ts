import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeForLike, escapeForOr } from "@/lib/escape-helpers";
import { log } from "@/lib/log";
import { indexDocument, unindexDocument } from "@/lib/search/indexer";

import type { ProjectRow, TaskFilter, TaskRow } from "./types";

/**
 * Server-side data helpers for the Tasks module.
 *
 * Reads honour RLS (user-scoped supabase client). Writes that need to
 * touch activities/notifications go through the SECURITY DEFINER RPCs
 * defined in 20260514d_tasks.sql (which take care of the cross-table
 * fanout under a single auth.uid()).
 */

/* ──────────────────── auth ──────────────────── */

export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Resolve the workspace to operate in. URL ?workspace=... wins, then
 * the user's first workspace. Returns null if the user has none or
 * isn't signed in.
 */
export async function resolveWorkspaceId(
  preferred?: string | null
): Promise<string | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  if (preferred) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userData.user.id)
      .eq("workspace_id", preferred)
      .maybeSingle();
    if (!error && data?.workspace_id) return data.workspace_id as string;
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as { workspace_id: string }).workspace_id;
}

/* ──────────────────── tasks ──────────────────── */

export async function listTasks(
  filter: TaskFilter,
  userId: string | null
): Promise<TaskRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tasks")
    .select(
      "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filter.workspace_id) q = q.eq("workspace_id", filter.workspace_id);
  if (filter.project) q = q.eq("project_id", filter.project);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.priority) q = q.eq("priority", filter.priority);
  if (filter.due_before) q = q.lte("due_at", filter.due_before);
  if (filter.open_only) q = q.is("completed_at", null);
  if (filter.assignee) {
    const uid = filter.assignee === "me" && userId ? userId : filter.assignee;
    if (uid) {
      // contains-array; supabase-js encodes as `cs.{uid}`
      q = q.contains("assignee_ids", [uid]);
    }
  }
  if (filter.search) {
    const term = escapeForOr(escapeForLike(filter.search.trim()));
    if (term) {
      q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
  }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRow[];
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TaskRow) ?? null;
}

export async function listProjects(
  workspaceId: string
): Promise<ProjectRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, workspace_id, name, slug, description, status, status_schema, color, icon, created_by, archived_at, deleted_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectRow[];
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, workspace_id, name, slug, description, status, status_schema, color, icon, created_by, archived_at, deleted_at, created_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProjectRow) ?? null;
}

/* ──────────────────── search-index helpers ──────────────────── */

/**
 * Re-index a single task row into `search_documents`. Wrapped in
 * try/catch so a failed index write never blocks the source write —
 * search-staleness is preferable to a 500 on `POST /api/tasks`.
 *
 * Callers: any path that creates or mutates a task row should call this
 * after the DB write succeeds. Soft-delete should call
 * `unindexTaskRow(id)` instead.
 */
export async function indexTaskRow(task: TaskRow): Promise<void> {
  try {
    const dueBit = task.due_at ? `Due ${task.due_at.slice(0, 10)}` : null;
    const assigneeBit =
      task.assignee_ids && task.assignee_ids.length > 0
        ? `${task.assignee_ids.length} assignee${task.assignee_ids.length === 1 ? "" : "s"}`
        : null;
    const priorityBit = task.priority ? `${task.priority} priority` : null;
    const subtitle =
      [dueBit, assigneeBit, priorityBit].filter(Boolean).join(" · ") || null;
    await indexDocument({
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: task.id,
      title: task.title,
      subtitle,
      body: task.description,
      href: `/tasks/${task.id}`,
      icon: "check-square",
    });
  } catch (err) {
    log.warn("search.index.task_failed", {
      task_id: task.id,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

export async function unindexTaskRow(taskId: string): Promise<void> {
  try {
    await unindexDocument({ entityType: "task", entityId: taskId });
  } catch (err) {
    log.warn("search.unindex.task_failed", {
      task_id: taskId,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

/**
 * Re-index a single project row. Same try/catch contract as
 * `indexTaskRow`.
 */
export async function indexProjectRow(project: ProjectRow): Promise<void> {
  try {
    const subtitle = project.status ? `${project.status} project` : null;
    await indexDocument({
      workspaceId: project.workspace_id,
      entityType: "project",
      entityId: project.id,
      title: project.name,
      subtitle,
      body: project.description,
      href: `/projects/${project.id}`,
      icon: "folder",
    });
  } catch (err) {
    log.warn("search.index.project_failed", {
      project_id: project.id,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

export async function unindexProjectRow(projectId: string): Promise<void> {
  try {
    await unindexDocument({ entityType: "project", entityId: projectId });
  } catch (err) {
    log.warn("search.unindex.project_failed", {
      project_id: projectId,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

/* ──────────────────── write helpers (indexed) ──────────────────── */

/**
 * Insert a task and index it. Centralises the create-task path so HTTP
 * routes, AI tools, and seeders can share one indexing pipeline. The
 * caller is expected to have already authorised the workspace.
 *
 * Returns the inserted row, or throws on DB error.
 */
export async function createTask(input: {
  workspace_id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  status?: string;
  priority?: TaskRow["priority"];
  assignee_ids?: string[];
  due_at?: string | null;
  start_at?: string | null;
  estimate_min?: number | null;
  created_by: string;
}): Promise<TaskRow> {
  const supabase = await createClient();
  const payload = {
    workspace_id: input.workspace_id,
    title: input.title,
    description: input.description ?? null,
    project_id: input.project_id ?? null,
    parent_task_id: input.parent_task_id ?? null,
    status: input.status ?? "Todo",
    priority: input.priority ?? "normal",
    assignee_ids: input.assignee_ids ?? [],
    due_at: input.due_at ?? null,
    start_at: input.start_at ?? null,
    estimate_min: input.estimate_min ?? null,
    created_by: input.created_by,
  };
  const { data, error } = await supabase
    .from("tasks")
    .insert(payload)
    .select(
      "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "insert_failed");
  }
  const row = data as TaskRow;
  await indexTaskRow(row);
  return row;
}

/**
 * Patch a task and re-index it. The caller passes only the fields they
 * want to change. We re-read the full row after the update so the search
 * index reflects the post-update state.
 */
export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    status: string;
    priority: TaskRow["priority"];
    assignee_ids: string[];
    due_at: string | null;
    start_at: string | null;
    completed_at: string | null;
    estimate_min: number | null;
    actual_min: number | null;
    project_id: string | null;
    parent_task_id: string | null;
    custom: Record<string, unknown>;
  }>
): Promise<TaskRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select(
      "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "update_failed");
  }
  const row = data as TaskRow;
  // If the task was just soft-deleted via this update path, drop it
  // from the index. Otherwise keep the index fresh.
  if (row.deleted_at) {
    await unindexTaskRow(row.id);
  } else {
    await indexTaskRow(row);
  }
  return row;
}

/**
 * Soft-delete a task (sets `deleted_at`) and remove it from the search
 * index. Does NOT hard-delete — restore is handled by `lib/trash`.
 */
export async function softDeleteTask(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await unindexTaskRow(id);
}

/**
 * Mark a task complete via the SECURITY DEFINER `task_complete` RPC (it
 * also emits an activity row and notifies assignees). Re-indexes after
 * so the searchable subtitle reflects the new state.
 */
export async function completeTask(id: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_complete", { p_task_id: id });
  if (error) throw new Error(error.message);
  const row = await getTaskById(id);
  if (row) await indexTaskRow(row);
  return row;
}

/**
 * Insert a project and index it.
 */
export async function createProject(input: {
  workspace_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status?: ProjectRow["status"];
  status_schema?: string[];
  color?: string | null;
  icon?: string | null;
  created_by: string;
}): Promise<ProjectRow> {
  const supabase = await createClient();
  const payload = {
    workspace_id: input.workspace_id,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    status: input.status ?? "active",
    status_schema: input.status_schema ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    created_by: input.created_by,
  };
  const { data, error } = await supabase
    .from("projects")
    .insert(payload)
    .select(
      "id, workspace_id, name, slug, description, status, status_schema, color, icon, created_by, archived_at, deleted_at, created_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "insert_failed");
  }
  const row = data as ProjectRow;
  await indexProjectRow(row);
  return row;
}

export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    slug: string;
    description: string | null;
    status: ProjectRow["status"];
    status_schema: string[];
    color: string | null;
    icon: string | null;
  }>
): Promise<ProjectRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(
      "id, workspace_id, name, slug, description, status, status_schema, color, icon, created_by, archived_at, deleted_at, created_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "update_failed");
  }
  const row = data as ProjectRow;
  if (row.deleted_at) {
    await unindexProjectRow(row.id);
  } else {
    await indexProjectRow(row);
  }
  return row;
}

export async function softDeleteProject(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await unindexProjectRow(id);
}

/* ──────────────────── admin helpers ──────────────────── */

/**
 * Service-role task list (admin oversight). Bypasses RLS so /admin/tasks
 * can show every workspace's tasks.
 */
export async function adminListTasks(opts: {
  workspaceId?: string;
  status?: string;
  priority?: string;
  search?: string;
  limit?: number;
}): Promise<TaskRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from("tasks")
    .select(
      "id, workspace_id, project_id, parent_task_id, title, description, status, priority, assignee_ids, due_at, start_at, completed_at, estimate_min, actual_min, custom, created_by, archived_at, deleted_at, created_at, updated_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (opts.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.priority) q = q.eq("priority", opts.priority);
  if (opts.search) {
    const term = escapeForOr(escapeForLike(opts.search.trim()));
    if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  q = q.limit(Math.min(Math.max(opts.limit ?? 200, 1), 1000));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskRow[];
}

export async function adminListWorkspacesForFilter(): Promise<
  { id: string; name: string }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) return [];
  return (data ?? []) as { id: string; name: string }[];
}
