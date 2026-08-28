"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Pipeline Dashboard — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no Suspense, no
   bespoke macOS chrome, no WorkspaceSwitcher. Width-driven layout collapses
   tile grids, filter strips, and dense deal rows below the 880 / 700 / 540
   thresholds. All weighted-value, conversion-funnel, owner rollup, monthly
   trend, and per-deal math preserved verbatim from page.tsx. Personal-mode
   only (localStorage); team mode dropped along with the WorkspaceSwitcher.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

type Stage =
  | "discovery"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "closed-won"
  | "closed-lost";

const STAGES: { key: Stage; label: string; default_prob: number }[] = [
  { key: "discovery", label: "Discovery", default_prob: 10 },
  { key: "qualified", label: "Qualified", default_prob: 25 },
  { key: "proposal", label: "Proposal", default_prob: 50 },
  { key: "negotiation", label: "Negotiation", default_prob: 75 },
  { key: "closed-won", label: "Closed-won", default_prob: 100 },
  { key: "closed-lost", label: "Closed-lost", default_prob: 0 },
];

interface Deal {
  id: string;
  name: string;
  owner: string;
  stage: Stage;
  probability: number;
  amount: number;
  expectedClose: string; // YYYY-MM-DD
  notes: string;
}

interface PipelineState {
  deals: Deal[];
}

type ViewKey = "overview" | "stages" | "reps" | "trend";

const LS_KEY = "solutions:pipeline-dashboard:v1";
const VIEW_LS_KEY = "solutions:pipeline-dashboard:view:v1";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

function monthEndIso(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  if (!dateStr) return "—";
  return dateStr.slice(0, 7);
}

function defaultState(): PipelineState {
  return {
    deals: [
      {
        id: uid(),
        name: "Acme Corp — Enterprise seat expansion",
        owner: "Alex",
        stage: "proposal",
        probability: 55,
        amount: 48000,
        expectedClose: monthEndIso(0),
        notes: "",
      },
      {
        id: uid(),
        name: "Bravo Logistics — Annual contract",
        owner: "Sam",
        stage: "negotiation",
        probability: 80,
        amount: 22000,
        expectedClose: monthEndIso(0),
        notes: "",
      },
      {
        id: uid(),
        name: "Crown Holdings — Pilot",
        owner: "Mira",
        stage: "qualified",
        probability: 25,
        amount: 9000,
        expectedClose: monthEndIso(1),
        notes: "",
      },
    ],
  };
}

const inputCls = (extra = "") =>
  `w-full rounded-md border border-app bg-app px-2.5 py-1.5 text-sm text-app placeholder:text-faint transition-colors focus:border-tool-accent focus:outline-none ${extra}`;

export default function PipelineDashboardApp(props: NativeAppProps) {
  const { width } = props;
  // Width-driven breakpoints — same idea as the rest of the native tools.
  const isNarrow = width < 880;
  const isCompact = width < 700;
  const isUltra = width < 540;

  const [state, setState] = useState<PipelineState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [view, setView] = useState<ViewKey>("overview");

  // Restore view + state from localStorage on mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === "overview" || v === "stages" || v === "reps" || v === "trend") {
        setView(v as ViewKey);
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? (JSON.parse(raw) as PipelineState) : null;
      setState(parsed && Array.isArray(parsed.deals) ? parsed : defaultState());
    } catch {
      setState(defaultState());
    }
    lastSig.current = null;
    setHydrated(true);
  }, []);

  // Persist view.
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Persist state with debounce.
  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, sig);
        setSyncedAt(new Date().toLocaleTimeString());
      } catch {
        /* ignore */
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated]);

  const owners = useMemo(
    () => Array.from(new Set(state.deals.map((d) => d.owner).filter(Boolean))),
    [state]
  );

  const filtered = useMemo(
    () =>
      state.deals.filter(
        (d) =>
          (ownerFilter === "all" || d.owner === ownerFilter) &&
          (stageFilter === "all" || d.stage === stageFilter)
      ),
    [state, ownerFilter, stageFilter]
  );

  const totals = useMemo(() => {
    let unweighted = 0;
    let weighted = 0;
    let open = 0;
    let won = 0;
    let lost = 0;
    for (const d of filtered) {
      if (d.stage === "closed-lost") {
        lost += d.amount;
        continue;
      }
      if (d.stage === "closed-won") {
        won += d.amount;
      } else {
        open += d.amount;
      }
      unweighted += d.amount;
      weighted += d.amount * (d.probability / 100);
    }
    const decided = won + lost;
    const winRate = decided > 0 ? (won / decided) * 100 : 0;
    return { unweighted, weighted, open, won, lost, winRate };
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { w: number; u: number; count: number }>();
    for (const d of filtered) {
      if (d.stage === "closed-lost") continue;
      const key = monthKey(d.expectedClose);
      const cur = map.get(key) || { w: 0, u: 0, count: 0 };
      cur.u += d.amount;
      cur.w += d.amount * (d.probability / 100);
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const addDeal = () => {
    setState((s) => ({
      ...s,
      deals: [
        ...s.deals,
        {
          id: uid(),
          name: "New deal",
          owner: owners[0] || "",
          stage: "discovery",
          probability: 10,
          amount: 0,
          expectedClose: monthEndIso(0),
          notes: "",
        },
      ],
    }));
  };

  const updateDeal = (id: string, patch: Partial<Deal>) => {
    setState((s) => ({
      ...s,
      deals: s.deals.map((d) => {
        if (d.id !== id) return d;
        const merged = { ...d, ...patch };
        // If stage changed, pull default probability if user hasn't overridden.
        if (patch.stage && !("probability" in patch)) {
          const defProb =
            STAGES.find((st) => st.key === patch.stage)?.default_prob ??
            merged.probability;
          merged.probability = defProb;
        }
        return merged;
      }),
    }));
  };

  const removeDeal = (id: string) => {
    setState((s) => ({ ...s, deals: s.deals.filter((d) => d.id !== id) }));
  };

  // Per-stage rollups for the overview strip + grouped deal lists.
  const stageRollups = useMemo(() => {
    return STAGES.map((s) => {
      const deals = filtered.filter((d) => d.stage === s.key);
      const unweighted = deals.reduce((sum, d) => sum + d.amount, 0);
      const weighted = deals.reduce(
        (sum, d) => sum + d.amount * (d.probability / 100),
        0
      );
      return {
        ...s,
        count: deals.length,
        unweighted,
        weighted,
        deals,
      };
    });
  }, [filtered]);

  // Open-pipeline funnel: Discovery → Qualified → Proposal → Negotiation → Closed-won.
  const funnel = useMemo(() => {
    const order: Stage[] = [
      "discovery",
      "qualified",
      "proposal",
      "negotiation",
      "closed-won",
    ];
    const counts = order.map((stage, idx) => ({
      key: stage,
      label: STAGES.find((s) => s.key === stage)?.label || stage,
      count: filtered.filter((d) => d.stage === stage).length,
      value: filtered
        .filter((d) => d.stage === stage)
        .reduce((sum, d) => sum + d.amount, 0),
      idx,
    }));
    const top = Math.max(1, ...counts.map((c) => c.count));
    return counts.map((c) => ({ ...c, pct: c.count / top }));
  }, [filtered]);

  // Forecast vs. (implicit) quota: derive a soft target from total open pipeline,
  // mirroring the original totals math without introducing new inputs.
  const quota = Math.max(totals.weighted, totals.open * 0.4, 1);
  const forecastPct = Math.min(100, (totals.weighted / quota) * 100);

  const today = new Date();
  const ageDays = (iso: string) => {
    if (!iso) return 0;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 0;
    return Math.max(
      0,
      Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    );
  };

  const funnelStageOpacity = (idx: number, total: number) =>
    0.35 + (idx / Math.max(1, total - 1)) * 0.55;

  return (
    <div
      data-tool-theme="sales"
      data-tool="pipeline-dashboard"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className="space-y-5 p-4 sm:p-5">
        {/* ============================ MASTHEAD ============================ */}
        <section className="relative overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* status strip */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              Pipeline
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {filtered.length} deal{filtered.length === 1 ? "" : "s"}
            </span>
            {!isCompact && (
              <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                <span className="text-tool-accent">▸</span>
                sales.forecast
                <span className="text-faint">/</span>
                <span className="text-secondary">personal.weighted</span>
              </div>
            )}
            <div className="ml-auto font-mono text-[0.6rem] text-muted">
              {syncedAt ? `◉ saved ${syncedAt}` : hydrated ? "◉ ready" : ""}
            </div>
          </div>

          {/* hero body */}
          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Weighted forecast · live
                </div>

                <div className="mt-3 flex items-baseline gap-3">
                  <div
                    className={`font-mono font-semibold tracking-tight text-app ${
                      isCompact ? "text-2xl" : "text-3xl md:text-4xl"
                    }`}
                  >
                    ${fmt(totals.weighted)}
                  </div>
                  <div className="text-sm text-secondary">weighted</div>
                </div>

                <p className="mt-2 max-w-xl text-sm text-secondary">
                  ${fmt(totals.open)} open · ${fmt(totals.won)} closed-won ·{" "}
                  {totals.winRate.toFixed(0)}% win-rate
                </p>
              </div>

              {/* forecast dial */}
              {!isUltra && (
                <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                  <div className="relative h-12 w-12">
                    <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="var(--tool-accent)"
                        strokeWidth="3"
                        strokeDasharray={`${forecastPct}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                      {forecastPct.toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Of target
                    </div>
                    <div className="text-sm font-semibold text-app">
                      ${fmt(totals.weighted)} / ${fmt(quota)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* segmented view tabs + actions */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "overview", label: "Overview" },
                  { k: "stages", label: "Stages" },
                  { k: "reps", label: "Reps" },
                  { k: "trend", label: "Trend" },
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

            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as Stage | "all")}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            >
              <option value="all">All stages</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={addDeal}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + Deal
              </button>
            </div>
          </div>
        </section>

        {/* ============================ STAT TILES ============================ */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: isUltra
              ? "1fr"
              : isCompact
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(4, minmax(0, 1fr))",
          }}
        >
          <StatTile label="Weighted" value={`$${fmt(totals.weighted)}`} accent />
          <StatTile label="Open" value={`$${fmt(totals.open)}`} />
          <StatTile label="Closed-won" value={`$${fmt(totals.won)}`} />
          <StatTile label="Win-rate" value={`${totals.winRate.toFixed(0)}%`} />
        </div>

        {/* ============================ OVERVIEW ============================ */}
        {view === "overview" && (
          <>
            {/* Stage cards row */}
            <Card title="Stages" subtitle="Tap a stage to filter the table below">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: isUltra
                    ? "repeat(2, minmax(0, 1fr))"
                    : isCompact
                      ? "repeat(3, minmax(0, 1fr))"
                      : isNarrow
                        ? "repeat(3, minmax(0, 1fr))"
                        : "repeat(6, minmax(0, 1fr))",
                }}
              >
                {stageRollups.map((s, idx) => {
                  const active = stageFilter === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() =>
                        setStageFilter((cur) => (cur === s.key ? "all" : s.key))
                      }
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        active
                          ? "border-tool-accent bg-tool-accent-soft"
                          : "border-app bg-app hover:border-tool-accent"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: "var(--tool-accent)",
                            opacity: funnelStageOpacity(idx, stageRollups.length),
                          }}
                        />
                        {s.label}
                      </div>
                      <div className="mt-2 font-mono text-lg font-semibold text-app">
                        {s.count}
                      </div>
                      <div className="mt-0.5 inline-flex rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] text-tool-accent">
                        W ${fmt(s.weighted)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Funnel */}
            <Card title="Conversion funnel" subtitle="Open pipeline by stage">
              <div className="space-y-2.5">
                {funnel.map((row) => (
                  <div
                    key={row.key}
                    className="grid items-center gap-3"
                    style={{
                      gridTemplateColumns: isCompact
                        ? "90px 1fr auto"
                        : "110px 1fr auto",
                    }}
                  >
                    <div className="flex items-center gap-1.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-secondary">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: "var(--tool-accent)",
                          opacity: funnelStageOpacity(row.idx, funnel.length),
                        }}
                      />
                      {row.label}
                    </div>
                    <div className="relative h-7 overflow-hidden rounded-lg border border-app bg-app">
                      <div
                        className="absolute inset-y-0 left-0 bg-tool-accent-soft"
                        style={{ width: `${row.pct * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 border-r border-tool-accent"
                        style={{
                          width: `${Math.min(100, row.pct * 100)}%`,
                          background: "var(--tool-accent)",
                          opacity: funnelStageOpacity(row.idx, funnel.length) * 0.45,
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[0.6rem] text-app">
                        <span className="font-semibold">{row.count}</span>
                        <span className="font-mono text-muted">
                          ${fmt(row.value)}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono text-[0.6rem] text-faint">
                      {(row.pct * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <DealsTable
              stageRollups={stageRollups}
              updateDeal={updateDeal}
              removeDeal={removeDeal}
              ageDays={ageDays}
              isNarrow={isNarrow}
            />
          </>
        )}

        {/* ============================ STAGES ============================ */}
        {view === "stages" && (
          <DealsTable
            stageRollups={stageRollups}
            updateDeal={updateDeal}
            removeDeal={removeDeal}
            ageDays={ageDays}
            isNarrow={isNarrow}
          />
        )}

        {/* ============================ REPS ============================ */}
        {view === "reps" && (
          <Card title="Owner breakdown" subtitle="Weighted by probability">
            <div className="space-y-2">
              {owners.length === 0 ? (
                <p className="text-sm text-muted">No owners assigned yet.</p>
              ) : (
                owners.map((owner) => {
                  const deals = state.deals.filter(
                    (d) => d.owner === owner && d.stage !== "closed-lost"
                  );
                  const w = deals.reduce(
                    (s, d) => s + d.amount * (d.probability / 100),
                    0
                  );
                  const ownerMax = Math.max(
                    1,
                    ...owners.map((o) =>
                      state.deals
                        .filter((d) => d.owner === o && d.stage !== "closed-lost")
                        .reduce(
                          (sum, d) => sum + d.amount * (d.probability / 100),
                          0
                        )
                    )
                  );
                  return (
                    <div
                      key={owner}
                      className="rounded-lg border border-app bg-app px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-semibold text-app">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-[0.6rem] uppercase text-tool-accent">
                            {owner.slice(0, 2)}
                          </span>
                          {owner}
                          <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                            {deals.length} open
                          </span>
                        </span>
                        <span className="font-mono text-xs text-secondary">
                          ${fmt(w)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-app bg-app-elevated">
                        <div
                          className="h-full bg-tool-accent"
                          style={{ width: `${(w / ownerMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        )}

        {/* ============================ TREND ============================ */}
        {view === "trend" && (
          <Card
            title="Monthly forecast"
            subtitle="Expected close month — weighted vs unweighted"
          >
            {byMonth.length === 0 ? (
              <p className="text-sm text-muted">No open deals.</p>
            ) : (
              <div className="space-y-3">
                {byMonth.map(([month, v]) => {
                  const max = Math.max(...byMonth.map(([, x]) => x.u));
                  return (
                    <div key={month}>
                      <div className="mb-1 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                        <span>{month}</span>
                        <span>
                          {v.count} deal{v.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="relative h-7 overflow-hidden rounded-lg border border-app bg-app">
                        <div
                          className="absolute left-0 top-0 h-full bg-tool-accent-soft"
                          style={{ width: `${(v.u / max) * 100}%` }}
                        />
                        <div
                          className="absolute left-0 top-0 h-full"
                          style={{
                            width: `${(v.w / max) * 100}%`,
                            background: "var(--tool-accent)",
                            opacity: 0.6,
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-2 text-[0.6rem] text-app">
                          <span className="font-semibold">W ${fmt(v.w)}</span>
                          <span className="font-mono text-muted">
                            U ${fmt(v.u)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* ======================== TOTALS FOOTER ======================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
          <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-muted">
            Pipeline totals
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.65rem] text-secondary">
            <span>
              Unweighted{" "}
              <span className="text-app">${fmt(totals.unweighted)}</span>
            </span>
            <span>
              Weighted{" "}
              <span className="text-tool-accent">${fmt(totals.weighted)}</span>
            </span>
            <span>
              Win-rate{" "}
              <span className="text-app">{totals.winRate.toFixed(0)}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Inline subcomponents — local to this file. No ToolCard / ToolShell.
   ───────────────────────────────────────────────────────────────────────── */

function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-4 sm:p-5">
      {(title || subtitle) && (
        <header className="mb-4">
          {subtitle && (
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              {subtitle}
            </div>
          )}
          {title && (
            <h2 className="mt-1 text-base font-semibold tracking-tight text-app">
              {title}
            </h2>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-app-elevated px-4 py-3 ${
        accent ? "border-tool-accent" : "border-app"
      }`}
    >
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

interface StageRollup {
  key: Stage;
  label: string;
  default_prob: number;
  count: number;
  unweighted: number;
  weighted: number;
  deals: Deal[];
}

function DealsTable({
  stageRollups,
  updateDeal,
  removeDeal,
  ageDays,
  isNarrow,
}: {
  stageRollups: StageRollup[];
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  removeDeal: (id: string) => void;
  ageDays: (iso: string) => number;
  isNarrow: boolean;
}) {
  const totalDeals = stageRollups.reduce((s, x) => s + x.deals.length, 0);
  const stageOpacity = (idx: number) =>
    0.35 + (idx / Math.max(1, STAGES.length - 1)) * 0.55;

  if (totalDeals === 0) {
    return (
      <div className="rounded-xl border border-dashed border-app bg-app-elevated px-6 py-10 text-center text-sm text-muted">
        No deals match the current filters.
      </div>
    );
  }

  // Below `isNarrow`, fall back to single-column rows; above, use the dense
  // 6-column grid that mirrors the original page layout.
  const rowGridClass = isNarrow
    ? "grid grid-cols-1 gap-3 p-3"
    : "grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto] items-center gap-3 p-3";

  return (
    <div className="space-y-5">
      {stageRollups.map((stage, sIdx) =>
        stage.deals.length === 0 ? null : (
          <section
            key={stage.key}
            className="overflow-hidden rounded-xl border border-app bg-app-elevated"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-app bg-app px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: "var(--tool-accent)",
                    opacity: stageOpacity(sIdx),
                  }}
                />
                <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                  {stage.label}
                </span>
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                  {stage.count} {stage.count === 1 ? "deal" : "deals"}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[0.6rem] text-muted">
                <span>U ${fmt(stage.unweighted)}</span>
                <span className="text-tool-accent">
                  W ${fmt(stage.weighted)}
                </span>
              </div>
            </header>

            <ul className="divide-y divide-[color:var(--border)]">
              {stage.deals.map((d) => {
                const weighted = d.amount * (d.probability / 100);
                const age = ageDays(d.expectedClose);
                return (
                  <li
                    key={d.id}
                    className={`${rowGridClass} transition-colors hover:bg-tool-accent-soft`}
                  >
                    {/* Deal name + owner */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-[0.6rem] uppercase text-tool-accent">
                          {(d.owner || "?").slice(0, 2)}
                        </span>
                        <input
                          value={d.name}
                          onChange={(e) =>
                            updateDeal(d.id, { name: e.target.value })
                          }
                          className="w-full bg-transparent text-sm font-semibold text-app placeholder:text-faint outline-none"
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-9 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                        <input
                          value={d.owner}
                          onChange={(e) =>
                            updateDeal(d.id, { owner: e.target.value })
                          }
                          placeholder="owner"
                          className="w-28 bg-transparent text-[0.6rem] uppercase tracking-[0.15em] text-secondary placeholder:text-faint outline-none"
                        />
                        <span>·</span>
                        <span>{age}d in stage</span>
                      </div>
                    </div>

                    {/* Stage selector */}
                    <div>
                      {isNarrow && (
                        <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-faint">
                          Stage
                        </div>
                      )}
                      <select
                        value={d.stage}
                        onChange={(e) =>
                          updateDeal(d.id, { stage: e.target.value as Stage })
                        }
                        className={inputCls("text-xs")}
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Probability */}
                    <div>
                      {isNarrow && (
                        <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-faint">
                          Prob %
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={d.probability}
                          onChange={(e) =>
                            updateDeal(d.id, {
                              probability: Math.max(
                                0,
                                Math.min(100, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className={inputCls("w-16 text-right text-xs")}
                        />
                        <span className="font-mono text-[0.6rem] text-muted">
                          %
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div>
                      {isNarrow && (
                        <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-faint">
                          Amount
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[0.65rem] text-faint">
                          $
                        </span>
                        <input
                          type="number"
                          value={d.amount}
                          onChange={(e) =>
                            updateDeal(d.id, {
                              amount: Number(e.target.value) || 0,
                            })
                          }
                          className={inputCls("w-full text-right text-xs")}
                        />
                      </div>
                      <div className="mt-1 text-right font-mono text-[0.6rem] text-tool-accent">
                        W ${fmt(weighted)}
                      </div>
                    </div>

                    {/* Close date */}
                    <div>
                      {isNarrow && (
                        <div className="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-faint">
                          Close
                        </div>
                      )}
                      <input
                        type="date"
                        value={d.expectedClose}
                        onChange={(e) =>
                          updateDeal(d.id, { expectedClose: e.target.value })
                        }
                        className={inputCls("text-xs")}
                      />
                    </div>

                    {/* Remove */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => removeDeal(d.id)}
                        aria-label="Remove deal"
                        className="rounded-md border border-app px-2 py-1 text-[0.7rem] font-semibold text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
