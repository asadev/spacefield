"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   OKR Tracker — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Inside-the-Window variant of `/solutions/tools/okr-tracker`. The standalone
   page (page.tsx) stays for direct visits / SEO / sharing. This file is
   mounted by the desktop's Window component when the user opens the tool
   from the workspace.

   Differences vs page.tsx:
     - No <ToolShell> / <AuthGate> / <SolutionsHeader> / breadcrumb (Window
       provides its own chrome and passes intent via NativeAppProps).
     - No Suspense + useSearchParams, no frame=1 branch.
     - No PageHeader / back-links / macOS chrome.
     - No <ToolRecommendations> / RelatedTools at the foot.
     - No WorkspaceSwitcher.
     - Layout collapses based on the live window width, not the viewport.
     - Foundation tokens preserved verbatim (bg-app, tool-accent, etc.).
     - data-tool-theme + data-tool attrs preserved so per-tool theming holds.
     - Every objective, KR, scoring rule, weighted rollup, sparkline,
       check-in cadence, and JSON export preserved exactly.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

type Unit = "%" | "$" | "count";

interface KR {
  id: string;
  description: string;
  target: string;
  current: string;
  unit: Unit;
  /** Optional rolling history of current values, oldest first. */
  history?: number[];
}

interface Objective {
  id: string;
  title: string;
  owner: string;
  quarter: string;
  krs: KR[];
  weight?: number; // relative importance, default 1
}

const STORAGE_KEY = "solutions:okr-tracker:v1";
const VIEW_KEY = "solutions:okr-tracker:view:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function currentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}

const DEFAULT: Objective[] = [
  {
    id: uid(),
    title: "Grow recurring revenue",
    owner: "CEO",
    quarter: currentQuarter(),
    krs: [
      { id: uid(), description: "Net new ARR", target: "250000", current: "85000", unit: "$" },
      { id: uid(), description: "Logo retention", target: "95", current: "91", unit: "%" },
      { id: uid(), description: "Closed/won deals", target: "40", current: "14", unit: "count" },
    ],
  },
];

type Status = "completed" | "on-track" | "at-risk" | "off-track";

function statusOf(pct: number): Status {
  if (pct >= 100) return "completed";
  if (pct >= 70) return "on-track";
  if (pct >= 40) return "at-risk";
  return "off-track";
}

const STATUS_LABEL: Record<Status, string> = {
  completed: "Completed",
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
};

// Status fill — accent for healthy, semantic colors preserved for warnings.
const BAR_FILL: Record<Status, string> = {
  completed: "bg-emerald-500",
  "on-track": "bg-tool-accent",
  "at-risk": "bg-amber-500",
  "off-track": "bg-rose-500",
};

const CHIP: Record<Status, string> = {
  completed: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30",
  "on-track": "bg-tool-accent-soft text-tool-accent ring-[color:var(--tool-accent-ring)]",
  "at-risk": "bg-amber-500/10 text-amber-500 ring-amber-500/30",
  "off-track": "bg-rose-500/10 text-rose-500 ring-rose-500/30",
};

const SUMMARY_ACCENT: Record<Status, string> = {
  completed: "text-emerald-500",
  "on-track": "text-tool-accent",
  "at-risk": "text-amber-500",
  "off-track": "text-rose-500",
};

type ViewKey = "list" | "edit" | "checkin";

/* Local input class — mirrors solutions/_components/ToolCard inputCls,
   inlined so this native app has zero dependency on ToolShell helpers. */
function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-surface px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-app-focus focus:outline-none ${extra}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
          {label}
        </span>
        {hint && <span className="text-[0.6rem] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function OkrTrackerApp(props: NativeAppProps) {
  const { width } = props;

  /* Width-driven breakpoints — based on live window inner width. */
  const isNarrow = width < 720;
  const summaryCols = isNarrow ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4";
  const rollupCols = isNarrow ? "" : "md:grid-cols-2";

  const [objs, setObjs] = useState<Objective[]>(DEFAULT);
  const [quarter, setQuarter] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("list");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Objective[];
        if (Array.isArray(parsed)) setObjs(parsed);
      }
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "edit" || v === "checkin") setView(v);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(objs));
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [objs, view, hydrated]);

  const quarters = useMemo(() => {
    const set = new Set<string>();
    objs.forEach((o) => set.add(o.quarter));
    return Array.from(set).sort();
  }, [objs]);

  const visible = useMemo(
    () => (quarter ? objs.filter((o) => o.quarter === quarter) : objs),
    [objs, quarter]
  );

  const overall = useMemo(() => {
    const all = visible.flatMap((o) => o.krs.map(progressOf));
    if (all.length === 0) return 0;
    return all.reduce((a, b) => a + b, 0) / all.length;
  }, [visible]);

  // Weighted rollup across visible objectives. Weight defaults to 1.
  const rollup = useMemo(() => {
    if (visible.length === 0)
      return {
        weighted: 0,
        totalWeight: 0,
        perObjective: [] as { id: string; title: string; progress: number; weight: number }[],
      };
    const perObjective = visible.map((o) => {
      const prog =
        o.krs.length > 0
          ? o.krs.map(progressOf).reduce((a, b) => a + b, 0) / o.krs.length
          : 0;
      return {
        id: o.id,
        title: o.title || "Untitled objective",
        progress: prog,
        weight: o.weight ?? 1,
      };
    });
    const totalWeight = perObjective.reduce((s, p) => s + p.weight, 0);
    const weighted =
      totalWeight > 0
        ? perObjective.reduce((s, p) => s + p.progress * p.weight, 0) / totalWeight
        : 0;
    return { weighted, totalWeight, perObjective };
  }, [visible]);

  // Counts per status across every visible KR.
  const counts = useMemo(() => {
    const base: Record<Status, number> = {
      completed: 0,
      "on-track": 0,
      "at-risk": 0,
      "off-track": 0,
    };
    visible.forEach((o) => {
      o.krs.forEach((k) => {
        base[statusOf(progressOf(k))] += 1;
      });
    });
    return base;
  }, [visible]);

  const totalKrs =
    counts.completed + counts["on-track"] + counts["at-risk"] + counts["off-track"];

  const addObjective = () =>
    setObjs((prev) => [
      ...prev,
      {
        id: uid(),
        title: "",
        owner: "",
        quarter: currentQuarter(),
        krs: [{ id: uid(), description: "", target: "", current: "", unit: "%" }],
      },
    ]);
  const updateObj = (id: string, patch: Partial<Objective>) =>
    setObjs((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeObj = (id: string) =>
    setObjs((prev) => prev.filter((o) => o.id !== id));

  const updateKR = (objId: string, krId: string, patch: Partial<KR>) =>
    setObjs((prev) =>
      prev.map((o) =>
        o.id === objId
          ? { ...o, krs: o.krs.map((k) => (k.id === krId ? { ...k, ...patch } : k)) }
          : o
      )
    );
  const addKR = (objId: string) =>
    setObjs((prev) =>
      prev.map((o) =>
        o.id === objId
          ? {
              ...o,
              krs: [
                ...o.krs,
                { id: uid(), description: "", target: "", current: "", unit: "%" },
              ],
            }
          : o
      )
    );
  const removeKR = (objId: string, krId: string) =>
    setObjs((prev) =>
      prev.map((o) =>
        o.id === objId ? { ...o, krs: o.krs.filter((k) => k.id !== krId) } : o
      )
    );

  // Weekly check-in: append the current numeric value to KR history (one entry per week).
  const recordCheckin = (objId: string, krId: string, nextCurrent: string) => {
    setObjs((prev) =>
      prev.map((o) => {
        if (o.id !== objId) return o;
        return {
          ...o,
          krs: o.krs.map((k) => {
            if (k.id !== krId) return k;
            const num = parseFloat(nextCurrent);
            const safe = isFinite(num) ? num : 0;
            const hist = [...(k.history ?? []), safe].slice(-12); // keep last 12 weeks
            return { ...k, current: nextCurrent, history: hist };
          }),
        };
      })
    );
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(objs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "okrs.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const subtitleQuarter = quarter || "All quarters";
  const subtitle = `${subtitleQuarter} · ${visible.length} objective${
    visible.length === 1 ? "" : "s"
  }, ${totalKrs} KR${totalKrs === 1 ? "" : "s"}`;

  return (
    <div
      data-tool-theme="productivity"
      data-tool="okr-tracker"
      className="h-full overflow-y-auto bg-app"
    >
      <div className="mx-auto max-w-[1100px] px-4 py-4">
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="relative p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  Objectives & Key Results
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-tool-accent text-app-elevated shadow-sm"
                    style={{ color: "var(--bg)" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    </svg>
                  </span>
                  <h2 className="text-lg font-semibold tracking-tight text-app">
                    OKR Tracker
                  </h2>
                </div>
                <p className="mt-1.5 text-sm text-secondary">{subtitle}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportJson}
                  className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={addObjective}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  + Add objective
                </button>
              </div>
            </div>

            {/* Quarter filter pills */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <QuarterPill active={quarter === ""} onClick={() => setQuarter("")}>
                All quarters
              </QuarterPill>
              {quarters.map((q) => (
                <QuarterPill key={q} active={quarter === q} onClick={() => setQuarter(q)}>
                  {q}
                </QuarterPill>
              ))}
            </div>
          </div>

          {/* segmented View tabs: List / Edit / Check-in */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "list", label: "List" },
                  { k: "edit", label: "Edit" },
                  { k: "checkin", label: "Check-in" },
                ] as { k: ViewKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setView(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    view === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={view === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>
        </section>

        {/* Status summary cards */}
        <section className={`mb-6 grid gap-3 ${summaryCols}`}>
          <SummaryCard status="completed" count={counts.completed} total={totalKrs} />
          <SummaryCard status="on-track" count={counts["on-track"]} total={totalKrs} />
          <SummaryCard status="at-risk" count={counts["at-risk"]} total={totalKrs} />
          <SummaryCard status="off-track" count={counts["off-track"]} total={totalKrs} />
        </section>

        {/* Overall + weighted rollup bar */}
        <section className={`mb-6 grid gap-3 ${rollupCols}`}>
          <RollupBar label="Average progress" value={overall} variant="accent" />
          <RollupBar label="Weighted rollup" value={rollup.weighted} variant="muted" />
        </section>

        {rollup.perObjective.length > 1 && (
          <section className="mb-6">
            <div className="relative overflow-hidden rounded-xl border border-app bg-surface p-6">
              <header className="mb-5">
                <div className="text-[0.55rem] uppercase tracking-[0.22em] text-violet-300/70">
                  Across {rollup.perObjective.length} objectives
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-app">
                  Weighted rollup
                </h2>
              </header>
              <div className="space-y-2.5">
                {rollup.perObjective.map((p) => {
                  const weightPct =
                    rollup.totalWeight > 0 ? (p.weight / rollup.totalWeight) * 100 : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-40 truncate text-sm text-app">{p.title}</div>
                      <div className="w-24 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                        w{p.weight.toFixed(1)} · {weightPct.toFixed(0)}%
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-app">
                        <div
                          className="h-full rounded-full bg-tool-accent transition-all"
                          style={{ width: `${Math.min(100, p.progress)}%` }}
                        />
                      </div>
                      <div className="w-12 text-right font-mono text-sm tabular-nums text-app">
                        {p.progress.toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                Rollup = Σ(progress × weight) / Σ(weight). Use weights to reflect strategic
                priority — a 0.5-weight objective counts half as much as a 1.0-weight one.
              </p>
            </div>
          </section>
        )}

        {/* ============================== VIEWS ============================== */}
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-app bg-app-elevated py-14 text-center text-sm text-muted">
            No objectives yet. Use &ldquo;Add objective&rdquo; to begin.
          </div>
        ) : view === "list" ? (
          <ListView objectives={visible} />
        ) : view === "checkin" ? (
          <CheckinView objectives={visible} onCheckin={recordCheckin} />
        ) : (
          <EditView
            objectives={visible}
            updateObj={updateObj}
            removeObj={removeObj}
            updateKR={updateKR}
            addKR={addKR}
            removeKR={removeKR}
          />
        )}
      </div>
    </div>
  );
}

function progressOf(k: KR): number {
  const cur = parseFloat(k.current);
  const tgt = parseFloat(k.target);
  if (!isFinite(cur) || !isFinite(tgt) || tgt === 0) return 0;
  return Math.max(0, Math.min(100, (cur / tgt) * 100));
}

/* ---- View: List (read-only summary) ---- */

function ListView({ objectives }: { objectives: Objective[] }) {
  return (
    <div className="space-y-4">
      {objectives.map((o) => {
        const prog =
          o.krs.length > 0
            ? o.krs.map(progressOf).reduce((a, b) => a + b, 0) / o.krs.length
            : 0;
        const objStatus = statusOf(prog);
        return (
          <article
            key={o.id}
            className="rounded-xl border border-app bg-app-elevated p-5 transition-colors hover:border-tool-accent"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold tracking-tight text-app">
                  {o.title || <span className="text-faint">(untitled)</span>}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    {o.quarter || "—"}
                  </span>
                  {o.owner && (
                    <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                      {o.owner}
                    </span>
                  )}
                  <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    w{(o.weight ?? 1).toFixed(1)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider ring-1 ring-inset ${CHIP[objStatus]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${BAR_FILL[objStatus]}`} />
                    {STATUS_LABEL[objStatus]}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-semibold tabular-nums text-app">
                  {prog.toFixed(0)}
                  <span className="text-base text-muted">%</span>
                </div>
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                  objective done
                </div>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-app">
              <div
                className={`h-full rounded-full transition-all ${BAR_FILL[objStatus]}`}
                style={{ width: `${Math.min(100, prog)}%` }}
              />
            </div>

            <div className="mt-4 space-y-2">
              {o.krs.map((k) => {
                const pct = progressOf(k);
                const s = statusOf(pct);
                return (
                  <div
                    key={k.id}
                    className="rounded-lg border border-app bg-app p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 text-sm text-app">
                        {k.description || <span className="text-faint">(unnamed KR)</span>}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider ring-1 ring-inset ${CHIP[s]}`}
                      >
                        {STATUS_LABEL[s]}
                      </span>
                      <span className={`font-mono text-sm tabular-nums ${SUMMARY_ACCENT[s]}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-elevated">
                        <div
                          className={`h-full rounded-full transition-all ${BAR_FILL[s]}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                        {formatVal(k.current, k.unit)} / {formatVal(k.target, k.unit)}
                      </div>
                      <Sparkline values={k.history ?? []} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---- View: Check-in (weekly cadence) ---- */

function CheckinView({
  objectives,
  onCheckin,
}: {
  objectives: Objective[];
  onCheckin: (objId: string, krId: string, nextCurrent: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-tool-accent bg-tool-accent-soft px-4 py-3">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
          Weekly check-in
        </div>
        <div className="mt-1 text-xs text-secondary">
          Update each KR&apos;s current value. Saving appends to the trend sparkline (last 12 weeks).
        </div>
      </div>

      {objectives.map((o) => {
        const prog =
          o.krs.length > 0
            ? o.krs.map(progressOf).reduce((a, b) => a + b, 0) / o.krs.length
            : 0;
        return (
          <article
            key={o.id}
            className="rounded-xl border border-app bg-app-elevated p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-app">
                  {o.title || <span className="text-faint">(untitled)</span>}
                </h3>
                <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                  {o.quarter || "—"} · {o.owner || "no owner"}
                </div>
              </div>
              <div className="font-mono text-lg font-semibold tabular-nums text-app">
                {prog.toFixed(0)}%
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {o.krs.map((k) => {
                const pct = progressOf(k);
                const s = statusOf(pct);
                const draft = drafts[k.id] ?? k.current;
                return (
                  <div
                    key={k.id}
                    className="rounded-lg border border-app bg-app p-3"
                  >
                    <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-app">
                          {k.description || <span className="text-faint">(unnamed KR)</span>}
                        </div>
                        <div className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                          target {formatVal(k.target, k.unit)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={draft}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [k.id]: e.target.value }))
                          }
                          placeholder="0"
                          className={inputCls("w-28 font-mono")}
                        />
                        <span className="font-mono text-xs text-muted">{k.unit}</span>
                      </div>
                      <Sparkline values={k.history ?? []} />
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm tabular-nums ${SUMMARY_ACCENT[s]}`}>
                          {pct.toFixed(0)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onCheckin(o.id, k.id, draft);
                            setDrafts((d) => {
                              const n = { ...d };
                              delete n[k.id];
                              return n;
                            });
                          }}
                          className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                          style={{ color: "var(--bg)" }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-app-elevated">
                      <div
                        className={`h-full rounded-full transition-all ${BAR_FILL[s]}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---- View: Edit (full CRUD) ---- */

function EditView({
  objectives,
  updateObj,
  removeObj,
  updateKR,
  addKR,
  removeKR,
}: {
  objectives: Objective[];
  updateObj: (id: string, patch: Partial<Objective>) => void;
  removeObj: (id: string) => void;
  updateKR: (objId: string, krId: string, patch: Partial<KR>) => void;
  addKR: (objId: string) => void;
  removeKR: (objId: string, krId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {objectives.map((o) => {
        const prog =
          o.krs.length > 0
            ? o.krs.map(progressOf).reduce((a, b) => a + b, 0) / o.krs.length
            : 0;
        const objStatus = statusOf(prog);
        return (
          <article
            key={o.id}
            className="group rounded-xl border border-app bg-app-elevated p-5 transition-colors hover:border-tool-accent"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[220px] flex-1">
                <input
                  type="text"
                  value={o.title}
                  onChange={(e) => updateObj(o.id, { title: e.target.value })}
                  placeholder="Objective title"
                  className="w-full bg-transparent text-base font-semibold tracking-tight text-app placeholder:text-faint focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app px-2.5 py-1 text-xs text-secondary">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
                    </svg>
                    <input
                      type="text"
                      value={o.owner}
                      onChange={(e) => updateObj(o.id, { owner: e.target.value })}
                      placeholder="owner"
                      className="w-20 bg-transparent placeholder:text-faint focus:outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app px-2.5 py-1 text-xs text-secondary">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 9h18M8 3v4M16 3v4" />
                    </svg>
                    <input
                      type="text"
                      value={o.quarter}
                      onChange={(e) => updateObj(o.id, { quarter: e.target.value })}
                      placeholder="Q2 2026"
                      className="w-20 bg-transparent placeholder:text-faint focus:outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app px-2.5 py-1 text-xs text-secondary">
                    <span className="font-mono text-[0.6rem] uppercase tracking-wider text-muted">
                      w
                    </span>
                    <input
                      type="number"
                      value={o.weight ?? 1}
                      onChange={(e) =>
                        updateObj(o.id, { weight: parseFloat(e.target.value) || 0 })
                      }
                      min="0"
                      step="0.1"
                      title="Relative importance weight for rollup"
                      className="w-10 bg-transparent focus:outline-none"
                    />
                  </label>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-wider ring-1 ring-inset ${CHIP[objStatus]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${BAR_FILL[objStatus]}`} />
                    {STATUS_LABEL[objStatus]}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-mono text-2xl font-semibold tabular-nums text-app">
                    {prog.toFixed(0)}
                    <span className="text-base text-muted">%</span>
                  </div>
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                    objective done
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeObj(o.id)}
                  className="rounded-lg border border-app p-2 text-muted opacity-0 transition-colors hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                  aria-label="Remove objective"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Objective-level progress bar */}
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-app">
              <div
                className={`h-full rounded-full transition-all ${BAR_FILL[objStatus]}`}
                style={{ width: `${Math.min(100, prog)}%` }}
              />
            </div>

            {/* KRs */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                <span>Key results</span>
                <span>{o.krs.length}</span>
              </div>

              {o.krs.map((k) => {
                const pct = progressOf(k);
                const s = statusOf(pct);
                return (
                  <div
                    key={k.id}
                    className="rounded-lg border border-app bg-app p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                      <input
                        type="text"
                        value={k.description}
                        onChange={(e) =>
                          updateKR(o.id, k.id, { description: e.target.value })
                        }
                        placeholder="What's being measured"
                        className="bg-transparent text-sm font-medium text-app placeholder:text-faint focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider ring-1 ring-inset ${CHIP[s]}`}
                        >
                          {STATUS_LABEL[s]}
                        </span>
                        <span className={`font-mono text-sm tabular-nums ${SUMMARY_ACCENT[s]}`}>
                          {pct.toFixed(0)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKR(o.id, k.id)}
                          className="rounded text-muted transition-colors hover:text-rose-500"
                          aria-label="Remove KR"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden
                          >
                            <path d="M6 6l12 12M18 6l-12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* KR progress bar */}
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-app-elevated">
                      <div
                        className={`h-full rounded-full transition-all ${BAR_FILL[s]}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    {/* Current / Target / Unit */}
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <Field label="Current">
                        <input
                          type="number"
                          value={k.current}
                          onChange={(e) => updateKR(o.id, k.id, { current: e.target.value })}
                          placeholder="0"
                          className={inputCls("font-mono")}
                        />
                      </Field>
                      <Field label="Target">
                        <input
                          type="number"
                          value={k.target}
                          onChange={(e) => updateKR(o.id, k.id, { target: e.target.value })}
                          placeholder="0"
                          className={inputCls("font-mono")}
                        />
                      </Field>
                      <Field label="Unit">
                        <select
                          value={k.unit}
                          onChange={(e) =>
                            updateKR(o.id, k.id, { unit: e.target.value as Unit })
                          }
                          className={inputCls()}
                        >
                          <option value="%">%</option>
                          <option value="$">$</option>
                          <option value="count">count</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => addKR(o.id)}
                className="mt-1 w-full rounded-lg border border-dashed border-app bg-transparent px-3 py-2 font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
              >
                + Add key result
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---- Small local UI helpers ---- */

function formatVal(v: string, unit: Unit) {
  if (!v) return "—";
  if (unit === "$") return `$${v}`;
  if (unit === "%") return `${v}%`;
  return v;
}

function QuarterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-tool-accent px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-wider transition-opacity hover:opacity-90"
          : "rounded-lg border border-app bg-app-elevated px-3 py-1 font-mono text-[0.6rem] font-medium uppercase tracking-wider text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
      }
      style={active ? { color: "var(--bg)" } : undefined}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  status,
  count,
  total,
}: {
  status: Status;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-secondary">
          {STATUS_LABEL[status]}
        </span>
        <span className={`h-2 w-2 rounded-full ${BAR_FILL[status]}`} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-mono text-2xl font-semibold tabular-nums ${SUMMARY_ACCENT[status]}`}>
          {count}
        </span>
        <span className="text-xs text-muted">
          of {total} KR{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full rounded-full ${BAR_FILL[status]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RollupBar({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "accent" | "muted";
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-secondary">
          {label}
        </span>
        <span
          className={`font-mono text-lg font-semibold tabular-nums ${
            variant === "accent" ? "text-tool-accent" : "text-app"
          }`}
        >
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full rounded-full transition-all ${
            variant === "accent" ? "bg-tool-accent" : "bg-secondary"
          }`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return (
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
        no trend
      </span>
    );
  }
  const w = 64;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline
        fill="none"
        stroke="var(--tool-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
