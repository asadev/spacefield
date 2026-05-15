import Link from "next/link";

import type { ProjectRow, TaskRow } from "@/lib/tasks/types";

import {
  PRIORITY_LABEL,
  PRIORITY_PILL_CLASS,
  dueClassname,
  fmtDate,
} from "./shared";

interface Props {
  tasks: TaskRow[];
  projects: ProjectRow[];
}

/**
 * Server-rendered list. Columns: title, project, assignees, due, priority,
 * status. Click row → /tasks/[id]. Empty state nudges the user to create
 * one via the toolbar above.
 */
export default function TasksListView({ tasks, projects }: Props) {
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-8 text-center text-sm text-muted">
        No tasks match this view. Click <span className="text-app">+ New task</span> to add one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            <th className="px-3 py-2 text-left font-normal">Task</th>
            <th className="px-3 py-2 text-left font-normal">Project</th>
            <th className="px-3 py-2 text-left font-normal">Assignees</th>
            <th className="px-3 py-2 text-left font-normal">Due</th>
            <th className="px-3 py-2 text-left font-normal">Priority</th>
            <th className="px-3 py-2 text-left font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const proj = t.project_id ? projectsById.get(t.project_id) : null;
            return (
              <tr
                key={t.id}
                className="border-b border-app last:border-b-0 hover:bg-app/40"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/tasks/${t.id}`}
                    className="text-app hover:text-tool-accent"
                  >
                    <div className="font-medium">{t.title}</div>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-1 truncate text-[11px] text-muted">
                        {t.description}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-secondary">
                  {proj ? proj.name : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {t.assignee_ids.length === 0 ? (
                    <span className="text-faint">Unassigned</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {t.assignee_ids.slice(0, 3).map((id) => (
                        <span
                          key={id}
                          className="inline-flex h-5 items-center rounded-full bg-app px-2 font-mono text-[10px] text-secondary"
                          title={id}
                        >
                          {id.slice(0, 4)}
                        </span>
                      ))}
                      {t.assignee_ids.length > 3 && (
                        <span className="text-[11px] text-muted">
                          +{t.assignee_ids.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td
                  className={`px-3 py-2 font-mono text-xs tabular-nums ${dueClassname(
                    t.due_at,
                    t.completed_at
                  )}`}
                >
                  {fmtDate(t.due_at)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      PRIORITY_PILL_CLASS[t.priority]
                    }`}
                  >
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="inline-flex items-center rounded-md border border-app bg-app px-2 py-0.5 text-secondary">
                    {t.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
