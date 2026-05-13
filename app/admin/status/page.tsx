import Link from "next/link";

import {
  CATEGORIES,
  CHECKLIST,
  PRIORITY_CLASSES,
  STATUS_CLASSES,
  STATUS_LABEL,
  byCategory,
  completion,
  tally,
  type CategoryId,
  type Item,
  type Status,
} from "./_checklist";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Launch readiness · Admin · Space Field",
};

const STATUS_ORDER: Status[] = ["done", "partial", "missing", "blocked", "na"];

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const wantStatus = (sp.status as Status | undefined) ?? null;
  const wantPriority = sp.priority ?? null;

  const visible = CHECKLIST.filter((it) => {
    if (wantStatus && it.status !== wantStatus) return false;
    if (wantPriority && it.priority !== wantPriority) return false;
    return true;
  });

  const overall = tally(CHECKLIST);
  const overallPct = completion(CHECKLIST);
  const p0Items = CHECKLIST.filter((i) => i.priority === "P0");
  const p0Open = p0Items.filter((i) => i.status === "missing" || i.status === "partial").length;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <header className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Internal · launch readiness
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-app">
              Launch readiness — {overallPct}% complete
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-secondary">
              Single source of truth for what&apos;s done, what&apos;s in flight, and what&apos;s
              missing before public launch. Spans product, AI, database, caching,
              perf, security, scale, reliability, observability, devops, compliance,
              CX, GTM, mobile, and launch ops — modeled on the readiness rubrics
              Stripe, Linear, Vercel, and Notion publish. Edit{" "}
              <code className="rounded bg-app-elevated px-1 py-0.5 text-[11px]">
                app/admin/status/_checklist.ts
              </code>{" "}
              to update items.
            </p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>{overall.total} items</span>
            <span>
              {overall.done} done · {overall.partial} in progress · {overall.missing} missing
              {overall.blocked > 0 ? ` · ${overall.blocked} blocked` : ""}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-app-elevated">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${(overall.done / overall.total) * 100}%` }}
              aria-hidden="true"
            />
            <div
              className="-mt-2 h-2 bg-amber-500/70"
              style={{
                width: `${(overall.partial / overall.total) * 100}%`,
                marginLeft: `${(overall.done / overall.total) * 100}%`,
              }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard label="Done" value={overall.done} tone="emerald" />
          <StatCard label="In progress" value={overall.partial} tone="amber" />
          <StatCard label="Missing" value={overall.missing} tone="rose" />
          <StatCard label="P0 open" value={p0Open} tone="rose" sub={`${p0Items.length} P0 total`} />
          <StatCard label="Categories" value={CATEGORIES.length} tone="slate" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <span className="text-faint">Filter:</span>
          <FilterPill label="All" href="/admin/status" active={!wantStatus && !wantPriority} />
          {STATUS_ORDER.filter((s) => s !== "na").map((s) => (
            <FilterPill
              key={s}
              label={`${STATUS_LABEL[s]} (${overall[s]})`}
              href={`/admin/status?status=${s}`}
              active={wantStatus === s}
            />
          ))}
          <span className="mx-1 h-3 w-px bg-app" aria-hidden="true" />
          {(["P0", "P1", "P2", "P3"] as const).map((p) => (
            <FilterPill
              key={p}
              label={p}
              href={`/admin/status?priority=${p}`}
              active={wantPriority === p}
            />
          ))}
        </div>
      </header>

      {/* Category quick-jump */}
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

      {/* Filtered view note */}
      {(wantStatus || wantPriority) && (
        <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-2 text-xs text-tool-accent">
          Showing {visible.length} of {CHECKLIST.length} items
          {wantStatus ? ` · status = ${STATUS_LABEL[wantStatus]}` : ""}
          {wantPriority ? ` · priority = ${wantPriority}` : ""}
          {" · "}
          <Link href="/admin/status" className="underline">
            clear filters
          </Link>
        </div>
      )}

      {/* Per-category sections */}
      <div className="space-y-12">
        {CATEGORIES.map((c) => {
          const all = byCategory(c.id);
          const shown = visible.filter((i) => i.category === c.id);
          if (wantStatus || wantPriority) {
            if (shown.length === 0) return null;
          }
          const pct = completion(all);
          const t = tally(all);
          return (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-app pb-2">
                <div>
                  <h2 className="text-lg font-semibold text-app">{c.label}</h2>
                  <p className="mt-0.5 max-w-2xl text-xs text-secondary">{c.description}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-mono tabular-nums text-app">{pct}%</div>
                  <div className="text-faint">
                    {t.done}/{t.total} done · {t.partial} in progress · {t.missing} missing
                  </div>
                </div>
              </div>

              {/* slim progress bar */}
              <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-app-elevated">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${(t.done / Math.max(1, t.total)) * 100}%` }}
                  aria-hidden="true"
                />
              </div>

              <ItemList items={shown} />
            </section>
          );
        })}
      </div>

      <footer className="rounded-xl border border-app bg-app-elevated px-4 py-3 text-xs text-secondary">
        <p>
          <strong className="text-app">How to use this page.</strong> Treat it as a
          PM dashboard, not a chat log. Each item should be one PR-sized unit. When
          you ship something, flip its status in{" "}
          <code className="rounded bg-app px-1 py-0.5">_checklist.ts</code> and
          commit. The overall % above moves automatically.
        </p>
        <p className="mt-2">
          <strong className="text-app">Public uptime page</strong> (status.spacefield.co)
          is a separate thing — that&apos;s the customer-facing &quot;is the site up?&quot; page.
          This one is internal-only and never shown to users.
        </p>
      </footer>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

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

function ItemList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-faint">No items in this view.</p>;
  }
  // Order: P0 missing first, then P0 partial, then by priority, then by status weight.
  const statusWeight: Record<Status, number> = { missing: 0, partial: 1, blocked: 2, done: 3, na: 4 };
  const priorityWeight: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const sorted = [...items].sort((a, b) => {
    const p = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (p !== 0) return p;
    return statusWeight[a.status] - statusWeight[b.status];
  });

  return (
    <ul className="divide-y divide-app overflow-hidden rounded-xl border border-app bg-app-elevated">
      {sorted.map((it) => (
        <li key={it.id} id={it.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-app">{it.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide ${PRIORITY_CLASSES[it.priority]}`}>
                {it.priority}
              </span>
            </div>
            {it.notes ? (
              <p className="mt-1 text-xs leading-relaxed text-secondary">{it.notes}</p>
            ) : null}
            {it.ref ? (
              <p className="mt-1 font-mono text-[11px] text-faint">{it.ref}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_CLASSES[it.status]}`}>
              {STATUS_LABEL[it.status]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
