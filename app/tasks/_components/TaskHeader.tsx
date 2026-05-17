"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "@/lib/toast";
import { pushUndo } from "@/lib/undo";
import type { TaskPriority, TaskRow } from "@/lib/tasks/types";
import { firePushPermissionPrompt } from "@/components/PushPermissionPrompt";

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
              // Positive moment: user marked a task done. Nudge for
              // push permission so future task pings can land. The
              // helper no-ops if the user already decided or recently
              // dismissed.
              if (
                /^(done|completed|complete)$/i.test(v) &&
                !/^(done|completed|complete)$/i.test(status)
              ) {
                firePushPermissionPrompt("task-completed", {
                  message:
                    "Nice — want a heads-up when teammates assign or update tasks?",
                });
              }
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
        <button
          type="button"
          onClick={async () => {
            // Skipping a native confirm here — the undo snackbar gives
            // the user 5 seconds to recover. This is the same pattern
            // Gmail/Linear use for non-permanent soft-deletes.
            try {
              const res = await fetch(`/api/tasks/${task.id}`, {
                method: "DELETE",
              });
              if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || "delete_failed");
              }
              toast.info("Task moved to trash.");
              pushUndo("Task deleted.", async () => {
                try {
                  const restoreRes = await fetch("/api/trash", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "restore",
                      entity_type: "task",
                      entity_id: task.id,
                      workspace_id: task.workspace_id,
                    }),
                  });
                  if (!restoreRes.ok) throw new Error("restore_failed");
                  toast.success("Task restored.");
                  router.push(`/tasks/${task.id}`);
                  router.refresh();
                } catch {
                  toast.error("Couldn't restore the task.");
                }
              });
              router.push("/tasks");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Couldn't delete task."
              );
            }
          }}
          className="ms-auto rounded-md border border-rose-400/30 bg-rose-400/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-rose-400 transition-colors hover:bg-rose-400/15"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
