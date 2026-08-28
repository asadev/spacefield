import Link from "next/link";

import StatusShell from "../_components/Shell";
import ItemRow from "../_components/ItemRow";
import {
  CATEGORIES,
  CHECKLIST,
  STATUS_LABEL,
  byCategory,
  completion,
  tally,
  type Item,
  type Priority,
  type Status,
} from "../_checklist";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch readiness · List · Admin · Space Field",
};

const STATUS_FILTERS: Status[] = ["done", "partial", "missing", "blocked"];
const PRIORITY_FILTERS: Priority[] = ["P0", "P1", "P2", "P3"];

export default async function StatusListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const wantStatus = (sp.status as Status | undefined) ?? null;
  const wantPriority = (sp.priority as Priority | undefined) ?? null;

  const visible = CHECKLIST.filter((it) => {
    if (wantStatus && it.status !== wantStatus) return false;
    if (wantPriority && it.priority !== wantPriority) return false;
    return true;
  });

  const overall = tally(CHECKLIST);

  // Order: P0-missing first, then P0-partial, etc.
  const statusWeight: Record<Status, number> = { missing: 0, partial: 1, blocked: 2, done: 3, na: 4 };
  const priorityWeight: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const sortItems = (items: Item[]) =>
    [...items].sort((a, b) => {
      const p = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (p !== 0) return p;
      return statusWeight[a.status] - statusWeight[b.status];
    });

  return (
    <StatusShell active="list">
      {/* Filter bar */}
      <section className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-faint">Filter:</span>
        <FilterPill label="All" href="/admin/status/list" active={!wantStatus && !wantPriority} />
        {STATUS_FILTERS.map((s) => (
          <FilterPill
            key={s}
            label={`${STATUS_LABEL[s]} (${overall[s]})`}
            href={`/admin/status/list?status=${s}`}
            active={wantStatus === s}
          />
        ))}
        <span className="mx-1 h-3 w-px bg-app" aria-hidden="true" />
        {PRIORITY_FILTERS.map((p) => (
          <FilterPill
            key={p}
            label={p}
            href={`/admin/status/list?priority=${p}`}
            active={wantPriority === p}
          />
        ))}
      </section>

      {/* Filter result note */}
      {(wantStatus || wantPriority) && (
        <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-2 text-xs text-tool-accent">
          Showing {visible.length} of {CHECKLIST.length} items
          {wantStatus ? ` · status = ${STATUS_LABEL[wantStatus]}` : ""}
          {wantPriority ? ` · priority = ${wantPriority}` : ""}
          {" · "}
          <Link href="/admin/status/list" className="underline">
            clear
          </Link>
        </div>
      )}

      {/* Quick-jump category nav */}
      <nav
        aria-label="Categories"
        className="flex flex-wrap gap-2 rounded-xl border border-app bg-app-elevated p-3 text-xs"
      >
        {CATEGORIES.map((c) => {
          const items = byCategory(c.id);
          const pct = completion(items);
          return (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="group flex items-center gap-2 rounded-md border border-app bg-app px-2 py-1 text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              <span>{c.label}</span>
              <span className="font-mono tabular-nums text-faint group-hover:text-tool-accent">
                {pct}%
              </span>
            </a>
          );
        })}
      </nav>

      {/* Per-category sections */}
      <div className="space-y-10">
        {CATEGORIES.map((c) => {
          const all = byCategory(c.id);
          const shown = visible.filter((i) => i.category === c.id);
          if ((wantStatus || wantPriority) && shown.length === 0) return null;
          const t = tally(all);
          const pct = completion(all);
          return (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
              <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-app pb-2">
                <div>
                  <h2 className="text-lg font-semibold text-app">{c.label}</h2>
                  <p className="mt-0.5 max-w-2xl text-xs text-secondary">{c.plain}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-mono tabular-nums text-app">{pct}%</div>
                  <div className="text-faint">
                    {t.done}/{t.total} done · {t.partial} in prog · {t.missing} missing
                  </div>
                </div>
              </div>
              <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-app-elevated">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${(t.done / Math.max(1, t.total)) * 100}%` }}
                  aria-hidden="true"
                />
              </div>
              <ul className="divide-y divide-app overflow-hidden rounded-xl border border-app bg-app-elevated">
                {sortItems(shown).map((it) => (
                  <ItemRow key={it.id} item={it} showPhase />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </StatusShell>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-2.5 py-1 transition-colors",
        active
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app text-secondary hover:border-tool-accent hover:text-app",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
