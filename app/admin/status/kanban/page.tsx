import Link from "next/link";

import StatusShell from "../_components/Shell";
import ItemRow from "../_components/ItemRow";
import {
  CHECKLIST,
  PHASES,
  PHASE_CLASSES,
  PHASE_LABEL,
  type Item,
  type Phase,
  type Priority,
  type Status,
} from "../_checklist";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch readiness · Kanban · Admin · Space Field",
};

const COLUMNS: { status: Status; label: string; tone: string; explain: string }[] = [
  { status: "missing", label: "Missing", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300", explain: "Not started." },
  { status: "partial", label: "In progress", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300", explain: "Started, not done." },
  { status: "blocked", label: "Blocked", tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300", explain: "Waiting on external." },
  { status: "done", label: "Done", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", explain: "Shipped." },
];

/**
 * Kanban view = 4 columns × all checklist items.
 * Phase filter via ?phase=foundation|hardening|polish|scale|maturity.
 */
export default async function StatusKanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>;
}) {
  const sp = await searchParams;
  const wantPhase = (sp.phase as Phase | undefined) ?? null;

  const visible = wantPhase
    ? CHECKLIST.filter((i) => i.phase === wantPhase)
    : CHECKLIST;

  const priorityWeight: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const sortItems = (xs: Item[]) =>
    [...xs].sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);

  return (
    <StatusShell active="kanban">
      {/* Top description */}
      <section className="rounded-xl border border-app bg-app-elevated px-4 py-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          What&apos;s on the board
        </div>
        <p className="mt-2 text-sm leading-relaxed text-app">
          Four columns: where every item lives right now. Use the phase filter to
          narrow down (e.g. &quot;just show me Hardening items I haven&apos;t finished&quot;).
        </p>
      </section>

      {/* Phase filter */}
      <section className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-faint">Phase:</span>
        <FilterPill label="All" href="/admin/status/kanban" active={!wantPhase} />
        {PHASES.map((p) => (
          <FilterPill
            key={p.id}
            label={PHASE_LABEL[p.id]}
            href={`/admin/status/kanban?phase=${p.id}`}
            active={wantPhase === p.id}
            toneClass={PHASE_CLASSES[p.id]}
          />
        ))}
      </section>

      {/* Board */}
      <section className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = visible.filter((i) => i.status === col.status);
          const sorted = sortItems(items);
          return (
            <div
              key={col.status}
              className="flex flex-col rounded-xl border border-app bg-app-elevated"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-app px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${col.tone}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-secondary">{sorted.length}</span>
                </div>
                <span className="text-[11px] text-faint">{col.explain}</span>
              </div>
              {sorted.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-faint">
                  Nothing here{wantPhase ? ` for ${PHASE_LABEL[wantPhase]}` : ""}.
                </p>
              ) : (
                <ul className="divide-y divide-app">
                  {sorted.map((it) => (
                    <ItemRow key={it.id} item={it} showPhase />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <footer className="rounded-xl border border-app bg-app-elevated px-4 py-3 text-xs text-secondary">
        <p>
          <strong className="text-app">Reading the columns left-to-right is the
          intent.</strong> Items flow Missing → In progress → Done. Anything stuck
          in Blocked needs a decision (vendor reply, legal sign-off, hardware) —
          not more code.
        </p>
      </footer>
    </StatusShell>
  );
}

function FilterPill({
  label,
  href,
  active,
  toneClass,
}: {
  label: string;
  href: string;
  active?: boolean;
  toneClass?: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-2.5 py-1 transition-colors",
        active
          ? toneClass
            ? `border-transparent ${toneClass}`
            : "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app text-secondary hover:border-tool-accent hover:text-app",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
