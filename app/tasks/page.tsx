import Link from "next/link";

import {
  getAuthUserId,
  listProjects,
  listTasks,
  resolveWorkspaceId,
} from "@/lib/tasks/server";
import {
  DEFAULT_PROJECT_STATUSES,
  type TaskFilter,
  type TaskPriority,
} from "@/lib/tasks/types";

import TasksKanbanView from "./_components/TasksKanbanView";
import TasksListView from "./_components/TasksListView";
import TasksToolbar from "./_components/TasksToolbar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const userId = await getAuthUserId();

  if (!userId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-app">Sign in to see tasks</h1>
          <p className="mt-2 text-sm text-muted">
            Tasks live inside a workspace, which requires an account.
          </p>
          <Link
            href="/signin"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  const workspaceId = await resolveWorkspaceId(single(sp.workspace) ?? null);
  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-app">No workspace</h1>
          <p className="mt-2 text-sm text-muted">
            You aren&apos;t a member of any workspace yet — create one in
            Workspaces to start tracking work.
          </p>
        </div>
      </div>
    );
  }

  const view =
    single(sp.view) === "kanban"
      ? "kanban"
      : single(sp.view) === "calendar"
        ? "calendar"
        : "list";

  const filter: TaskFilter = {
    workspace_id: workspaceId,
    project: single(sp.project) ?? undefined,
    status: single(sp.status) ?? undefined,
    assignee: single(sp.assignee) ?? undefined,
    priority: (single(sp.priority) as TaskPriority | undefined) ?? undefined,
    due_before: single(sp.due_before) ?? undefined,
    open_only: single(sp.open_only) === "1",
    limit: 250,
  };

  const [tasks, projects] = await Promise.all([
    listTasks(filter, userId).catch(() => []),
    listProjects(workspaceId).catch(() => []),
  ]);

  const activeProject = filter.project
    ? projects.find((p) => p.id === filter.project)
    : null;
  const statuses =
    activeProject?.status_schema ??
    (DEFAULT_PROJECT_STATUSES as readonly string[] as string[]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Work
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Tasks</h1>
        <p className="mt-0.5 text-xs text-muted">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} in this view
          {activeProject ? ` · ${activeProject.name}` : ""}.
        </p>
      </div>

      <TasksToolbar
        projects={projects}
        workspaceId={workspaceId}
        activeView={view}
      />

      {view === "kanban" ? (
        <TasksKanbanView
          initialTasks={tasks}
          projects={projects}
          statuses={[...statuses]}
        />
      ) : view === "calendar" ? (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
          Calendar view — coming soon. Use the list or kanban for now.
        </div>
      ) : (
        <TasksListView tasks={tasks} projects={projects} />
      )}
    </div>
  );
}
