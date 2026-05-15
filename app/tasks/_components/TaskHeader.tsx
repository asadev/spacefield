"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { TaskPriority, TaskRow } from "@/lib/tasks/types";

interface Props {
  task: TaskRow;
  statuses: string[];
}

/**
 * Inline-editable header for /tasks/[id]. Title, status, priority all
 * round-trip via PATCH /api/tasks/:id.
 */
export default function TaskHeader({ task, statuses }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
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
      } catch {
        // swallow — UI keeps previous state
      }
    });
  }

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== task.title) patch({ title });
        }}
        className="w-full bg-transparent text-2xl font-semibold text-app outline-none focus:ring-0"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1">
          <span className="text-faint">Status</span>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              setStatus(v);
              patch({ status: v });
            }}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 text-app outline-none"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!statuses.includes(status) && (
              <option value={status}>{status}</option>
            )}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          <span className="text-faint">Priority</span>
          <select
            value={priority}
            onChange={(e) => {
              const v = e.target.value as TaskPriority;
              setPriority(v);
              patch({ priority: v });
            }}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 text-app outline-none"
          >
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        {pending && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}
