/**
 * Shared types for the Tasks + Projects module.
 *
 * Row types mirror the DB columns from
 * supabase/migrations/20260514d_tasks.sql. Keep them in sync if you edit
 * either side.
 */

export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type ProjectStatus = "active" | "archived" | "on_hold";

export interface TaskRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriority;
  assignee_ids: string[];
  due_at: string | null;
  start_at: string | null;
  completed_at: string | null;
  estimate_min: number | null;
  actual_min: number | null;
  custom: Record<string, unknown>;
  created_by: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  status_schema: string[];
  color: string | null;
  icon: string | null;
  created_by: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export const DEFAULT_PROJECT_STATUSES: readonly string[] = [
  "Todo",
  "In Progress",
  "Done",
];

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "archived",
  "on_hold",
];

export interface TaskFilter {
  /** Project id. */
  project?: string;
  /** Status string (must match project.status_schema). */
  status?: string;
  /** 'me' resolves to ctx.userId; otherwise interpreted as a user uuid. */
  assignee?: string;
  /** Filter to a single priority. */
  priority?: TaskPriority;
  /** ISO timestamp; tasks with due_at <= due_before only. */
  due_before?: string;
  /** Substring against title or description (ilike). */
  search?: string;
  /** Hide completed tasks. */
  open_only?: boolean;
  /** Workspace scope (server-side default = caller's workspace). */
  workspace_id?: string;
  limit?: number;
}
