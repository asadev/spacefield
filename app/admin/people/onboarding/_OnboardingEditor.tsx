"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createOnboardingTemplate } from "@/lib/people/actions";
import type { OnboardingTaskTemplate } from "@/lib/people/types";

import { buttonClass, inputClass } from "../../_lib";

const STARTER_TASKS: OnboardingTaskTemplate[] = [
  { title: "Sign offer letter & contract", due_day_offset: -3 },
  { title: "Submit Emirates ID / visa documents", due_day_offset: 0 },
  { title: "Provision laptop + accounts", due_day_offset: 1 },
  { title: "Team intro lunch", due_day_offset: 3 },
  { title: "30-day check-in", due_day_offset: 30 },
];

/**
 * Compact builder: name + textarea of tasks (one per line) → create.
 * Each task line can include "+Nd" suffix for due offset.
 */
export default function OnboardingEditor({
  workspaces,
}: {
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <h2 className="text-sm font-semibold text-app">New template</h2>
      <form
        className="mt-3 grid grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          const workspace_id = String(fd.get("workspace_id") ?? "");
          const name = String(fd.get("name") ?? "");
          const tasksRaw = String(fd.get("tasks") ?? "");
          if (!workspace_id) return setError("Pick a workspace.");
          if (!name) return setError("Template name required.");

          const tasks: OnboardingTaskTemplate[] = tasksRaw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              // Parse trailing "+Nd" or "-Nd" offset, otherwise leave undefined.
              const m = line.match(/\s+([+-]?\d+)d\s*$/);
              if (m) {
                return {
                  title: line.slice(0, m.index).trim(),
                  due_day_offset: Number(m[1]),
                };
              }
              return { title: line };
            });
          if (tasks.length === 0) return setError("At least one task required.");

          start(async () => {
            const res = await createOnboardingTemplate({
              workspace_id,
              name,
              tasks,
            });
            if (!res.ok) setError(res.error);
            else {
              (e.target as HTMLFormElement).reset();
              router.refresh();
            }
          });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <select name="workspace_id" defaultValue="" className={`${inputClass} h-9`}>
            <option value="" disabled>
              Workspace…
            </option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            name="name"
            placeholder="Standard new-hire onboarding"
            className={`${inputClass} h-9`}
          />
        </div>
        <textarea
          name="tasks"
          rows={8}
          defaultValue={STARTER_TASKS.map(
            (t) =>
              `${t.title}${
                t.due_day_offset !== undefined ? ` ${t.due_day_offset >= 0 ? "+" : ""}${t.due_day_offset}d` : ""
              }`
          ).join("\n")}
          placeholder={"One task per line. Suffix with +5d or -3d for due offset."}
          className={inputClass}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-faint">
            Tip: end each line with <code className="text-app">+5d</code> to set a
            due-date offset from the run start.
          </p>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Saving…" : "Create template"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </form>
    </section>
  );
}
