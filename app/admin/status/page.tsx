import Link from "next/link";

import StatusShell from "./_components/Shell";
import ItemRow from "./_components/ItemRow";
import {
  CATEGORIES,
  CHECKLIST,
  PHASES,
  PHASE_CLASSES,
  PHASE_LABEL,
  byCategory,
  byPhase,
  completion,
  nextUp,
  plainSummary,
  tally,
} from "./_checklist";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch readiness · Admin · Space Field",
};

export default function StatusOverview() {
  const overall = tally(CHECKLIST);
  const p0Items = CHECKLIST.filter((i) => i.priority === "P0");
  const p0Open = p0Items.filter(
    (i) => i.status === "missing" || i.status === "partial",
  ).length;
  const next = nextUp(10);

  return (
    <StatusShell active="overview">
      {/* Plain-English verdict */}
      <section className="rounded-xl border border-app bg-app-elevated px-4 py-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Where we stand (plain English)
        </div>
        <p className="mt-2 text-sm leading-relaxed text-app">{plainSummary()}</p>
      </section>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard label="Done" value={overall.done} tone="emerald" />
        <StatCard label="In progress" value={overall.partial} tone="amber" />
        <StatCard label="Missing" value={overall.missing} tone="rose" />
        <StatCard
          label="P0 open"
          value={p0Open}
          tone="rose"
          sub={`${p0Items.length} P0 total`}
        />
        <StatCard label="Categories" value={CATEGORIES.length} tone="slate" />
      </section>

      {/* Phase progress strip — the 5-stage path to launch */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-app">The path to launch</h2>
          <Link
            href="/admin/status/flow"
            className="text-xs text-tool-accent hover:underline"
          >
            See the flow view →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {PHASES.map((p) => {
            const items = byPhase(p.id);
            const pct = completion(items);
            const t = tally(items);
            return (
              <div
                key={p.id}
                className="rounded-xl border border-app bg-app-elevated px-3 py-3"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PHASE_CLASSES[p.id]}`}
                  >
                    {PHASE_LABEL[p.id]}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-app">
                    {pct}%
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-app">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(t.done / Math.max(1, t.total)) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-secondary">
                  {p.asad}
                </p>
                <p className="mt-1 text-[10px] text-faint">
                  {t.done}/{t.total} · {t.missing} missing
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* What to do next */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Do these next ({next.length})
            </h2>
            <p className="text-xs text-secondary">
              P0 and P1 items, sorted by urgency then by smallest effort. Knock these
              down in order and the launch percentage climbs fastest.
            </p>
          </div>
          <Link
            href="/admin/status/list?status=missing"
            className="text-xs text-tool-accent hover:underline"
          >
            See all missing →
          </Link>
        </div>
        <ul className="divide-y divide-app overflow-hidden rounded-xl border border-app bg-app-elevated">
          {next.map((it) => (
            <ItemRow key={it.id} item={it} showPhase />
          ))}
        </ul>
      </section>

      {/* Category snapshot */}
      <section>
        <div className="mb-2">
          <h2 className="text-sm font-semibold text-app">Category snapshot</h2>
          <p className="text-xs text-secondary">
            One line per category. Click to jump into the detailed list.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const items = byCategory(c.id);
            const t = tally(items);
            const pct = completion(items);
            return (
              <Link
                key={c.id}
                href={`/admin/status/list#cat-${c.id}`}
                className="group rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-app">{c.label}</span>
                  <span className="font-mono text-xs tabular-nums text-secondary group-hover:text-tool-accent">
                    {pct}%
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-secondary">
                  {c.asad}
                </p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-app">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(t.done / Math.max(1, t.total)) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-[10px] text-faint">
                  {t.done} done · {t.partial} in progress · {t.missing} missing
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Footer guidance */}
      <footer className="rounded-xl border border-app bg-app-elevated px-4 py-3 text-xs text-secondary">
        <p>
          <strong className="text-app">How to use this dashboard.</strong> Four
          views, same data: <em>Overview</em> for the headline, <em>List</em> for
          the full detail, <em>Flow</em> for the order of operations, <em>Kanban</em>{" "}
          for the &quot;what&apos;s in flight&quot; mental model. When you ship
          something, flip its status in{" "}
          <code className="rounded bg-app px-1 py-0.5">_checklist.ts</code> and
          commit. The percentages and the &quot;do these next&quot; list above
          recompute automatically.
        </p>
        <p className="mt-2">
          The public uptime page on <strong>status.spacefield.co</strong> is a
          separate thing — polls health endpoints, shows incidents. This page is
          internal and never shown to users.
        </p>
      </footer>
    </StatusShell>
  );
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose" | "slate";
  sub?: string;
}) {
  const toneClass = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    slate: "text-app",
  }[tone];
  return (
    <div className="rounded-xl border border-app bg-app-elevated px-3 py-3">
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}
