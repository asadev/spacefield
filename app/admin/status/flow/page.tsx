import StatusShell from "../_components/Shell";
import ItemRow from "../_components/ItemRow";
import {
  CATEGORIES,
  CHECKLIST,
  PHASES,
  PHASE_CLASSES,
  PHASE_LABEL,
  byPhase,
  completion,
  tally,
  type Item,
  type Priority,
  type Status,
} from "../_checklist";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch readiness · Flow · Admin · Space Field",
};

/**
 * Flow view = the path to launch as a vertical timeline.
 *
 * Phases stack top-to-bottom in launch order: Foundation → Hardening
 * → Polish → Scale → Maturity. Each phase shows progress, plain-English
 * description, and the open items grouped by category.
 *
 * The story this view tells: "you finish Foundation first, then Hardening,
 * then Polish — that's the public launch. Scale and Maturity are post-launch."
 */
export default function StatusFlowPage() {
  return (
    <StatusShell active="flow">
      {/* Top banner explaining the flow */}
      <section className="rounded-xl border border-app bg-app-elevated px-4 py-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          The path to public launch
        </div>
        <p className="mt-2 text-sm leading-relaxed text-app">
          Five phases, in order. Foundation is the bones, Hardening is what makes
          it production-safe, Polish is what makes the launch feel great. Scale and
          Maturity happen <em>after</em> you flip the switch — don&apos;t block on
          them.
        </p>
        <p className="mt-2 text-xs text-secondary">
          Read it top-to-bottom. The further down you go, the further out the work
          sits. Open items inside each phase are sorted by priority + smallest
          effort first.
        </p>
      </section>

      {/* Horizontal phase strip — quick visual */}
      <section className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-2">
          {PHASES.map((p, idx) => {
            const items = byPhase(p.id);
            const pct = completion(items);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="w-56 rounded-xl border border-app bg-app-elevated px-3 py-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PHASE_CLASSES[p.id]}`}>
                      {PHASE_LABEL[p.id]}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-app">{pct}%</span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-app">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-secondary line-clamp-3">{p.asad}</p>
                </div>
                {idx < PHASES.length - 1 ? (
                  <span aria-hidden="true" className="text-faint">
                    →
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Phases stacked vertically with their items */}
      <div className="space-y-12">
        {PHASES.map((p, idx) => (
          <PhaseSection key={p.id} phase={p} index={idx} />
        ))}
      </div>
    </StatusShell>
  );
}

function PhaseSection({
  phase,
  index,
}: {
  phase: (typeof PHASES)[number];
  index: number;
}) {
  const items = byPhase(phase.id);
  const t = tally(items);
  const pct = completion(items);

  // Group items in this phase by category, drop empty categories.
  const grouped = CATEGORIES.map((c) => ({
    cat: c,
    items: items.filter((i) => i.category === c.id),
  })).filter((g) => g.items.length > 0);

  const priorityWeight: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const statusWeight: Record<Status, number> = { missing: 0, partial: 1, blocked: 2, done: 3, na: 4 };
  const sortItems = (xs: Item[]) =>
    [...xs].sort((a, b) => {
      const p = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (p !== 0) return p;
      return statusWeight[a.status] - statusWeight[b.status];
    });

  return (
    <section id={`phase-${phase.id}`} className="scroll-mt-32">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-app pb-2">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PHASE_CLASSES[phase.id]}`}
          >
            Phase {index + 1}
          </span>
          <h2 className="text-xl font-semibold text-app">{phase.label}</h2>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div className="font-mono tabular-nums text-app">{pct}%</div>
          <div className="text-faint">
            {t.done}/{t.total} · {t.missing} missing
          </div>
        </div>
      </div>

      <p className="mb-4 max-w-3xl text-sm text-secondary">{phase.asad}</p>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-app-elevated">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${(t.done / Math.max(1, t.total)) * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="space-y-5">
        {grouped.map((g) => (
          <div key={g.cat.id}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <h3 className="text-sm font-medium text-app">{g.cat.label}</h3>
              <span className="text-[11px] text-faint">{g.items.length} items</span>
            </div>
            <ul className="divide-y divide-app overflow-hidden rounded-xl border border-app bg-app-elevated">
              {sortItems(g.items).map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
