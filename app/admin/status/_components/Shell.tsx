import Link from "next/link";

import {
  CATEGORIES,
  CHECKLIST,
  completion,
  tally,
} from "../_checklist";

type ViewId = "overview" | "list" | "flow" | "kanban";

const VIEWS: { id: ViewId; label: string; href: string; tooltip: string }[] = [
  { id: "overview", label: "Overview", href: "/admin/status", tooltip: "Plain-English summary + what to do next" },
  { id: "list", label: "List", href: "/admin/status/list", tooltip: "Full checklist grouped by category" },
  { id: "flow", label: "Flow", href: "/admin/status/flow", tooltip: "Timeline of phases — the path to launch" },
  { id: "kanban", label: "Kanban", href: "/admin/status/kanban", tooltip: "Missing / In progress / Blocked / Done board" },
];

/**
 * Shared chrome for every /admin/status/* view:
 *   - tiny title + plain summary
 *   - tab bar to switch between Overview / List / Flow / Kanban
 *   - overall progress strip
 *
 * Each page renders its own body inside this Shell.
 */
export default function StatusShell({
  active,
  children,
}: {
  active: ViewId;
  children: React.ReactNode;
}) {
  const overall = tally(CHECKLIST);
  const pct = completion(CHECKLIST);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Internal · launch readiness
          </div>
          <span className="text-xs text-faint">
            {CHECKLIST.length} items · {CATEGORIES.length} categories · 5 phases
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-app">
          Launch readiness — {pct}% complete
        </h1>

        {/* Tabbed view bar */}
        <nav className="flex flex-wrap gap-1 border-b border-app" aria-label="Status views">
          {VIEWS.map((v) => {
            const isActive = v.id === active;
            return (
              <Link
                key={v.id}
                href={v.href}
                title={v.tooltip}
                className={[
                  "-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-tool-accent text-tool-accent font-medium"
                    : "border-transparent text-secondary hover:text-app",
                ].join(" ")}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>

        {/* Overall strip */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>{overall.total} items</span>
            <span>
              {overall.done} done · {overall.partial} in progress · {overall.missing} missing
              {overall.blocked > 0 ? ` · ${overall.blocked} blocked` : ""}
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-app-elevated">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500"
              style={{ width: `${(overall.done / overall.total) * 100}%` }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-y-0 bg-amber-500/70"
              style={{
                left: `${(overall.done / overall.total) * 100}%`,
                width: `${(overall.partial / overall.total) * 100}%`,
              }}
              aria-hidden="true"
            />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
