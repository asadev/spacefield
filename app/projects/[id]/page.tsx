import Link from "next/link";
import { notFound } from "next/navigation";

import { getProjectById, listTasks } from "@/lib/tasks/server";

import TasksListView from "../../tasks/_components/TasksListView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Project detail. Lists tasks scoped to this project, with quick links
 * to the kanban view filtered by the same project.
 */
export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return notFound();

  const tasks = await listTasks(
    { workspace_id: project.workspace_id, project: project.id, limit: 250 },
    null
  ).catch(() => []);

  const totals: Record<string, number> = {};
  for (const t of tasks) {
    totals[t.status] = (totals[t.status] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between text-xs">
        <Link href="/projects" className="text-secondary hover:text-tool-accent">
          ← All projects
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/tasks?project=${project.id}&view=kanban`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            Open Kanban
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          {project.status}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">{project.name}</h1>
        {project.description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{project.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {project.status_schema.map((s) => (
            <span
              key={s}
              className="rounded-full bg-app-elevated px-2.5 py-0.5 text-secondary"
            >
              {s} <span className="font-mono text-faint">{totals[s] ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      <TasksListView tasks={tasks} projects={[project]} />
    </div>
  );
}
