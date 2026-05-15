import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getProjectById,
  getTaskById,
  listProjects,
} from "@/lib/tasks/server";
import { DEFAULT_PROJECT_STATUSES } from "@/lib/tasks/types";

import TaskActivity from "../_components/TaskActivity";
import TaskComments from "../_components/TaskComments";
import TaskDescription from "../_components/TaskDescription";
import TaskHeader from "../_components/TaskHeader";
import TaskSidebar from "../_components/TaskSidebar";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getTaskById(id);
  if (!task) return notFound();

  const [project, projects] = await Promise.all([
    task.project_id ? getProjectById(task.project_id) : Promise.resolve(null),
    listProjects(task.workspace_id).catch(() => []),
  ]);
  const statuses =
    project?.status_schema ??
    (DEFAULT_PROJECT_STATUSES as readonly string[] as string[]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between text-xs">
        <Link
          href="/tasks"
          className="text-secondary hover:text-tool-accent"
        >
          ← All tasks
        </Link>
        <Link
          href={`/chat?context=task:${task.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-medium text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Ask AI about this task
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
        <div className="space-y-6">
          <TaskHeader task={task} statuses={[...statuses]} />
          <TaskDescription taskId={task.id} initial={task.description} />
          <div className="space-y-4 border-t border-app pt-6">
            <TaskComments taskId={task.id} workspaceId={task.workspace_id} />
          </div>
          <div className="space-y-4 border-t border-app pt-6">
            <TaskActivity taskId={task.id} />
          </div>
        </div>
        <TaskSidebar task={task} projects={projects} />
      </div>
    </div>
  );
}
