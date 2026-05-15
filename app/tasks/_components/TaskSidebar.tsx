"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ProjectRow, TaskRow } from "@/lib/tasks/types";

interface Props {
  task: TaskRow;
  projects: ProjectRow[];
}

/**
 * Right-hand sidebar on /tasks/[id]. Due date, project picker, assignees
 * (comma-separated uuids — minimal MVP; a user picker would live in a
 * separate islanded component later).
 */
export default function TaskSidebar({ task, projects }: Props) {
  const router = useRouter();
  const [due, setDue] = useState(task.due_at?.slice(0, 16) ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [assignees, setAssignees] = useState(task.assignee_ids.join(", "));
  const [pending, startTransition] = useTransition();

  function patch(body: Record<string, unknown>) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) router.refresh();
      } catch {}
    });
  }

  return (
    <aside className="space-y-3 text-xs">
      <div>
        <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Due
        </div>
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onBlur={() => {
            const iso = due ? new Date(due).toISOString() : null;
            patch({ due_at: iso });
          }}
          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-app outline-none"
        />
      </div>

      <div>
        <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Project
        </div>
        <select
          value={projectId}
          onChange={(e) => {
            const v = e.target.value;
            setProjectId(v);
            patch({ project_id: v || null });
          }}
          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-app outline-none"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Assignees (uuids, comma-sep)
        </div>
        <textarea
          rows={2}
          value={assignees}
          onChange={(e) => setAssignees(e.target.value)}
          onBlur={() => {
            const ids = assignees
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            patch({ assignee_ids: ids });
          }}
          className="w-full resize-y rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[11px] text-app outline-none"
        />
      </div>

      {task.parent_task_id && (
        <div>
          <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Parent
          </div>
          <a
            href={`/tasks/${task.parent_task_id}`}
            className="font-mono text-[11px] text-secondary hover:text-tool-accent"
          >
            {task.parent_task_id.slice(0, 8)}…
          </a>
        </div>
      )}

      <div className="font-mono text-[10px] text-faint">
        Created {new Date(task.created_at).toISOString().slice(0, 10)} · Updated {new Date(task.updated_at).toISOString().slice(0, 10)}
        {pending ? " · saving…" : ""}
      </div>
    </aside>
  );
}
