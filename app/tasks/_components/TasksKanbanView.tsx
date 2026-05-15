"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import type { ProjectRow, TaskRow } from "@/lib/tasks/types";

import {
  PRIORITY_LABEL,
  PRIORITY_PILL_CLASS,
  dueClassname,
  fmtDate,
} from "./shared";

interface Props {
  initialTasks: TaskRow[];
  projects: ProjectRow[];
  /** Status names to render as columns (top to bottom of each column = newest first). */
  statuses: string[];
}

/**
 * Kanban board with native HTML5 drag-and-drop (no extra deps).
 *
 * Drag a card to another column → optimistic update of `status` +
 * PATCH /api/tasks/:id. On failure, revert the in-memory state. We
 * intentionally do NOT pull in @dnd-kit here even though it's a peer dep
 * for other features — for this surface, plain DnD keeps bundle slim.
 */
export default function TasksKanbanView({
  initialTasks,
  projects,
  statuses,
}: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const byStatus = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const s of statuses) map.set(s, []);
    for (const t of tasks) {
      const arr = map.get(t.status);
      if (arr) arr.push(t);
      else map.set(t.status, [t]); // tasks with statuses outside the schema still show
    }
    return map;
  }, [tasks, statuses]);

  function onDragStart(id: string) {
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  async function onDrop(targetStatus: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    let prev: string | null = null;
    setTasks((arr) =>
      arr.map((t) => {
        if (t.id !== id) return t;
        prev = t.status;
        return { ...t, status: targetStatus };
      })
    );
    if (prev === targetStatus) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        // revert on failure
        setTasks((arr) =>
          arr.map((t) =>
            t.id === id && prev !== null ? { ...t, status: prev } : t
          )
        );
      }
    });
  }

  const columnIds = Array.from(byStatus.keys());

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columnIds.map((status) => {
        const col = byStatus.get(status) ?? [];
        return (
          <div
            key={status}
            onDragOver={onDragOver}
            onDrop={() => onDrop(status)}
            className="flex w-72 shrink-0 flex-col rounded-xl border border-app bg-app-elevated"
          >
            <div className="flex items-center justify-between border-b border-app px-3 py-2">
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                {status}
              </div>
              <div className="rounded-full bg-app px-2 py-0.5 text-[10px] text-secondary">
                {col.length}
              </div>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {col.length === 0 && (
                <div className="rounded-md border border-dashed border-app/60 p-3 text-[11px] text-faint">
                  Drop tasks here
                </div>
              )}
              {col.map((t) => {
                const proj = t.project_id ? projectsById.get(t.project_id) : null;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => onDragStart(t.id)}
                    className="cursor-grab rounded-lg border border-app bg-app p-2 transition-colors hover:border-tool-accent active:cursor-grabbing"
                  >
                    <Link
                      href={`/tasks/${t.id}`}
                      className="block text-sm text-app hover:text-tool-accent"
                    >
                      {t.title}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                          PRIORITY_PILL_CLASS[t.priority]
                        }`}
                      >
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${dueClassname(
                          t.due_at,
                          t.completed_at
                        )}`}
                      >
                        {fmtDate(t.due_at)}
                      </span>
                    </div>
                    {proj && (
                      <div className="mt-1 truncate text-[10px] text-muted">
                        {proj.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
