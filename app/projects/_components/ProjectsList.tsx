import Link from "next/link";

import type { ProjectRow } from "@/lib/tasks/types";

interface Props {
  projects: ProjectRow[];
  taskCounts: Map<string, number>;
}

export default function ProjectsList({ projects, taskCounts }: Props) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-8 text-center text-sm text-muted">
        No projects yet. Click <span className="text-app">+ New project</span> to create one.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.id}`}
          className="rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-faint">
            <span>{p.status}</span>
            <span>{taskCounts.get(p.id) ?? 0} tasks</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-app">{p.name}</div>
          {p.description && (
            <div className="mt-1 line-clamp-2 text-xs text-muted">
              {p.description}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {p.status_schema.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded-full bg-app px-2 py-0.5 text-[10px] text-secondary"
              >
                {s}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
