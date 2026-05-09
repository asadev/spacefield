import Link from "next/link";

import { formatDateTime } from "../../_lib";
import type { AgentWorkflowRow } from "../../_types";

const STATUS_STYLES: Record<AgentWorkflowRow["status"], string> = {
  live: "bg-emerald-500/15 text-emerald-500",
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disabled: "bg-rose-500/15 text-rose-500",
};

/**
 * Lists `agent_workflows` rows whose `steps` jsonb references this
 * agent. Each row links to `/admin/workflows/[id]` (Agent K's route).
 *
 * Server component — pure render.
 */
export default function WorkflowsUsingAgent({
  workflows,
}: {
  workflows: AgentWorkflowRow[];
}) {
  if (workflows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
        No workflows reference this agent. Create one in{" "}
        <Link
          href="/admin/workflows"
          className="text-secondary underline hover:text-app"
        >
          /admin/workflows
        </Link>
        .
      </div>
    );
  }

  return (
    <ul className="divide-y divide-app overflow-hidden rounded-lg border border-app bg-app">
      {workflows.map((w) => {
        const stepCount = Array.isArray(w.steps) ? w.steps.length : 0;
        return (
          <li key={w.id}>
            <Link
              href={`/admin/workflows/${encodeURIComponent(w.id)}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-app-elevated"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-app">{w.display_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      STATUS_STYLES[w.status]
                    }`}
                  >
                    {w.status}
                  </span>
                  <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {w.trigger_kind}
                  </span>
                </div>
                {w.description && (
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {w.description}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-faint">
                <span>{stepCount} step{stepCount === 1 ? "" : "s"}</span>
                <span>updated {formatDateTime(w.updated_at)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
