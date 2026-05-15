import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const term = filter.search.replace(/[,()]/g, " ").trim();
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
    const term = opts.search.replace(/[,()]/g, " ").trim();
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
