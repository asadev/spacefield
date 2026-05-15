"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { toggleOnboardingTask } from "@/lib/people/actions";
import type { OnboardingRun, OnboardingTaskState } from "@/lib/people/types";

/**
 * Renders the onboarding tasks for an active run. Each row has a check-
 * box that flips the done flag via a server action; the page re-fetches
 * on completion.
 */
export default function OnboardingTaskList({ run }: { run: OnboardingRun }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const tasks = run.tasks_state ?? [];
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <header className="flex items-center justify-between border-b border-app px-4 py-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Onboarding
          </div>
          <h3 className="text-sm font-semibold text-app">
            {doneCount} / {tasks.length} complete
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-faint">
          started {new Date(run.started_at).toLocaleDateString()}
        </span>
      </header>
      <ol>
        {tasks.map((t: OnboardingTaskState, idx) => (
          <li
            key={`${idx}-${t.title}`}
            className="flex items-start gap-3 border-b border-app px-4 py-3 last:border-b-0"
          >
            <input
              type="checkbox"
              checked={t.done}
              disabled={pending && busyIdx === idx}
              onChange={(e) => {
                setBusyIdx(idx);
                start(async () => {
                  await toggleOnboardingTask({
                    run_id: run.id,
                    index: idx,
                    done: e.target.checked,
                  });
                  router.refresh();
                });
              }}
              className="mt-0.5 h-4 w-4 rounded border-app text-tool-accent focus:ring-tool-accent"
            />
            <div className="min-w-0 flex-1">
              <div
                className={[
                  "text-sm",
                  t.done ? "text-faint line-through" : "text-app",
                ].join(" ")}
              >
                {t.title}
              </div>
              {t.description && (
                <div className="mt-0.5 text-xs text-muted">{t.description}</div>
              )}
              {t.due_at && !t.done && (
                <div className="mt-1 text-[10px] uppercase tracking-wide text-faint">
                  due {t.due_at}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
