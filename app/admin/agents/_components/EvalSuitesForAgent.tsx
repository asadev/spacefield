import Link from "next/link";

import { formatDateTime } from "../../_lib";
import type { EvalSuiteRow } from "../../_types";

/**
 * Lists `eval_suites` rows where `target_kind='agent'` and
 * `target_id=this.id`. Each row links to `/admin/eval/[id]`
 * (Agent Q's route).
 *
 * Server component — pure render.
 */
export default function EvalSuitesForAgent({
  suites,
}: {
  suites: EvalSuiteRow[];
}) {
  if (suites.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
        No eval suites target this agent. Create one in{" "}
        <Link
          href="/admin/eval"
          className="text-secondary underline hover:text-app"
        >
          /admin/eval
        </Link>{" "}
        with target_kind=agent.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-app overflow-hidden rounded-lg border border-app bg-app">
      {suites.map((s) => {
        const cases = Array.isArray(s.cases) ? s.cases.length : 0;
        return (
          <li key={s.id}>
            <Link
              href={`/admin/eval/${encodeURIComponent(s.id)}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-app-elevated"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-app">{s.display_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      s.enabled
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-app-elevated text-faint"
                    }`}
                  >
                    {s.enabled ? "enabled" : "disabled"}
                  </span>
                  <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {s.scoring_method}
                  </span>
                </div>
                {s.description && (
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {s.description}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-faint">
                <span>{cases} case{cases === 1 ? "" : "s"}</span>
                <span>updated {formatDateTime(s.updated_at)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
