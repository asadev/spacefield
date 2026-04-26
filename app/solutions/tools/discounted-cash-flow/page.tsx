"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// Box-Muller normal sample, mean 0, stdev 1.
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const LS_KEY = "solutions:discounted-cash-flow:v1";
const YEARS = 5;

interface State {
  fcfs: string[]; // 5 values
  terminalGrowth: string; // %
  wacc: string; // %
  shares: string;
  netDebt: string;
}

const defaultState: State = {
  fcfs: ["1500000", "1900000", "2400000", "3000000", "3600000"],
  terminalGrowth: "3",
  wacc: "10",
  shares: "1000000",
  netDebt: "0",
};

function computeEV(fcfs: number[], g: number, r: number): {
  ev: number;
  pvYears: number[];
  terminalValue: number;
  pvTerminal: number;
} {
  if (r <= g) {
    return { ev: NaN, pvYears: [], terminalValue: NaN, pvTerminal: NaN };
  }
  const pvYears = fcfs.map((f, i) => f / Math.pow(1 + r, i + 1));
  const last = fcfs[fcfs.length - 1] || 0;
  const terminalValue = (last * (1 + g)) / (r - g);
  const pvTerminal = terminalValue / Math.pow(1 + r, fcfs.length);
  const ev = pvYears.reduce((a, b) => a + b, 0) + pvTerminal;
  return { ev, pvYears, terminalValue, pvTerminal };
}

// Equity-research field input. Tabular-num, mono, finance-precision.
const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function ResearchField({
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
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="text-[0.55rem] italic text-muted">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

// Sub-tab style "state buttons" for switching projection views.
type ProjectionTab = "schedule" | "growth";

function TabButton({
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
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function DCFPage() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [projectionTab, setProjectionTab] =
    useState<ProjectionTab>("schedule");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.fcfs) && parsed.fcfs.length === YEARS)
          setState({ ...defaultState, ...parsed });
      }
    } catch {}
    const shared = readShareState<State>();
    if (shared && Array.isArray(shared.fcfs) && shared.fcfs.length === YEARS)
      setState({ ...defaultState, ...shared });
    setHydrated(true);
  }, []);

  // Monte Carlo: 1,000 iterations with normal noise on WACC (±1.5pp) and
  // terminal growth (±0.5pp). Returns distribution stats.
  const monteCarlo = useMemo(() => {
    const fcfs = state.fcfs.map((f) => parseFloat(f) || 0);
    const baseWacc = (parseFloat(state.wacc) || 0) / 100;
    const baseG = (parseFloat(state.terminalGrowth) || 0) / 100;
    const shares = parseFloat(state.shares) || 0;
    const debt = parseFloat(state.netDebt) || 0;
    const N = 1000;
    const results: number[] = [];
    for (let i = 0; i < N; i++) {
      const w = baseWacc + randn() * 0.015;
      const g = baseG + randn() * 0.005;
      if (w <= g + 0.001) continue;
      const res = computeEV(fcfs, g, w);
      if (isFinite(res.ev)) {
        const equity = res.ev - debt;
        const perShare = shares > 0 ? equity / shares : NaN;
        results.push(isFinite(perShare) ? perShare : equity);
      }
    }
    results.sort((a, b) => a - b);
    const pct = (p: number) =>
      results.length === 0
        ? NaN
        : results[Math.min(results.length - 1, Math.floor((p / 100) * results.length))];
    const mean =
      results.length === 0
        ? 0
        : results.reduce((a, b) => a + b, 0) / results.length;
    return {
      count: results.length,
      mean,
      p5: pct(5),
      p25: pct(25),
      p50: pct(50),
      p75: pct(75),
      p95: pct(95),
      values: results,
      perShare: shares > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const model = useMemo(() => {
    const fcfs = state.fcfs.map((f) => parseFloat(f) || 0);
    const g = (parseFloat(state.terminalGrowth) || 0) / 100;
    const r = (parseFloat(state.wacc) || 0) / 100;
    const shares = parseFloat(state.shares) || 0;
    const debt = parseFloat(state.netDebt) || 0;
    const res = computeEV(fcfs, g, r);
    const equity = isFinite(res.ev) ? res.ev - debt : NaN;
    const perShare = shares > 0 && isFinite(equity) ? equity / shares : NaN;
    return { fcfs, g, r, shares, debt, ...res, equity, perShare };
  }, [state]);

  const fmt = (n: number) =>
    isFinite(n)
      ? n.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })
      : "—";

  // Sensitivity: WACC on Y axis (9 steps), terminal growth on X (7 steps)
  const waccRange = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map(
    (d) => (parseFloat(state.wacc) || 0) / 100 + d / 100
  );
  const gRange = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map(
    (d) => (parseFloat(state.terminalGrowth) || 0) / 100 + d / 100
  );

  const sensitivity = waccRange.map((r) =>
    gRange.map((g) => {
      const res = computeEV(model.fcfs, g, r);
      return isFinite(res.ev) ? res.ev : NaN;
    })
  );

  const flat = sensitivity.flat().filter((v) => isFinite(v));
  const minS = Math.min(...flat);
  const maxS = Math.max(...flat);
  const range = maxS - minS || 1;

  const updateFcf = (i: number, v: string) =>
    setState((s) => ({
      ...s,
      fcfs: s.fcfs.map((f, idx) => (idx === i ? v : f)),
    }));

  // Per-year growth rates for the equity-research projection table.
  const fcfGrowth = model.fcfs.map((f, i) =>
    i === 0 || !isFinite(model.fcfs[i - 1]) || model.fcfs[i - 1] === 0
      ? NaN
      : (f - model.fcfs[i - 1]) / model.fcfs[i - 1]
  );

  const pvExplicit = model.pvYears.reduce((a, b) => a + b, 0);
  const pvTerminalShare =
    isFinite(model.ev) && model.ev !== 0 ? model.pvTerminal / model.ev : NaN;

  // Verdict line driven by terminal-value share and validity.
  const verdict = !isFinite(model.ev)
    ? { label: "Invalid", tone: "alarm" as const }
    : pvTerminalShare > 0.85
      ? { label: "Terminal-heavy", tone: "caution" as const }
      : pvTerminalShare > 0.7
        ? { label: "Standard", tone: "neutral" as const }
        : { label: "Explicit-driven", tone: "good" as const };

  const verdictChip =
    verdict.tone === "alarm"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
      : verdict.tone === "caution"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : "border-tool-accent/40 bg-tool-accent-soft text-tool-accent";

  const dateStamp = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  return (
    <ToolShell
      category="Finance"
      title="Discounted Cash Flow (DCF)"
      description="5-year DCF with terminal value, per-share equity, and a WACC × terminal growth sensitivity grid."
    >
      <div
        data-tool-theme="finance"
        data-tool="discounted-cash-flow"
        className="space-y-6 text-app"
      >
        {/* Equity-research masthead */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface px-6 py-5 shadow-sm">
          <span className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l border-t border-tool-accent/40" />
          <span className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r border-b border-tool-accent/30" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Equity Research · Intrinsic Value
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Discounted Cash Flow
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Project free cash flows. Discount to today. Read the fair value.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold tracking-[0.15em] ${verdictChip}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                {verdict.label}
              </span>
              <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5">
                Model · {dateStamp}
              </span>
            </div>
          </div>
        </header>

        {/* Fair-value-per-share hero on ledger ruling */}
        <section
          className={`relative overflow-hidden rounded-2xl border bg-tool-surface px-6 py-8 shadow-sm ${
            !isFinite(model.ev)
              ? "border-rose-500/30"
              : "border-tool-accent/25"
          }`}
        >
          {/* Faint ledger ruling behind the hero number */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Fair value · per share
              </div>
              {!isFinite(model.ev) ? (
                <div className="font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight text-rose-500">
                  —
                </div>
              ) : (
                <div className="flex items-baseline gap-3">
                  <span className="font-tool-heading text-7xl font-semibold tabular-nums leading-none tracking-tight text-tool-accent sm:text-8xl">
                    {isFinite(model.perShare)
                      ? `$${model.perShare.toFixed(2)}`
                      : fmt(model.equity)}
                  </span>
                  <span className="font-mono text-2xl tabular-nums text-muted">
                    {isFinite(model.perShare) ? "/ sh" : "equity"}
                  </span>
                </div>
              )}
              <p className="mt-3 max-w-md text-sm text-secondary">
                {!isFinite(model.ev) ? (
                  <span className="font-medium text-rose-500">
                    WACC must exceed terminal growth for a finite valuation.
                  </span>
                ) : (
                  <>
                    Enterprise value of{" "}
                    <span className="font-mono text-app">
                      {fmt(model.ev)}
                    </span>
                    , less net debt of{" "}
                    <span className="font-mono text-app">
                      {fmt(model.debt)}
                    </span>
                    .
                  </>
                )}
              </p>
            </div>

            <div className="grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:w-auto">
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Enterprise value
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(model.ev)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Equity value
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(model.equity)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  PV explicit FCF
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(pvExplicit)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  PV terminal
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(model.pvTerminal)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Inputs + projections grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* Assumptions panel */}
          <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  01 · Assumptions
                </div>
                <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                  Inputs
                </h2>
              </div>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                USD · annual
              </span>
            </header>

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                    Free cash flow projections
                  </span>
                  <span className="text-[0.55rem] italic text-muted">
                    5-year explicit period
                  </span>
                </div>
                <div className="overflow-hidden rounded-md border border-app">
                  {state.fcfs.map((f, i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-[3rem_1fr] items-center gap-2 px-3 py-2 ${
                        i % 2 === 0 ? "bg-app-elevated" : "bg-app"
                      }`}
                    >
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
                        Y{i + 1}
                      </span>
                      <input
                        type="number"
                        value={f}
                        onChange={(e) => updateFcf(i, e.target.value)}
                        className={fieldInput}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <ResearchField
                label="Terminal growth (g)"
                hint="must be < WACC"
              >
                <input
                  type="number"
                  value={state.terminalGrowth}
                  onChange={(e) =>
                    setState((s) => ({ ...s, terminalGrowth: e.target.value }))
                  }
                  className={fieldInput}
                  step="0.1"
                />
              </ResearchField>
              <ResearchField label="Discount rate / WACC (r)">
                <input
                  type="number"
                  value={state.wacc}
                  onChange={(e) =>
                    setState((s) => ({ ...s, wacc: e.target.value }))
                  }
                  className={fieldInput}
                  step="0.1"
                />
              </ResearchField>
              <ResearchField
                label="Shares outstanding"
                hint="for per-share value"
              >
                <input
                  type="number"
                  value={state.shares}
                  onChange={(e) =>
                    setState((s) => ({ ...s, shares: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                />
              </ResearchField>
              <ResearchField label="Net debt" hint="debt − cash">
                <input
                  type="number"
                  value={state.netDebt}
                  onChange={(e) =>
                    setState((s) => ({ ...s, netDebt: e.target.value }))
                  }
                  className={fieldInput}
                />
              </ResearchField>
            </div>
          </section>

          {/* Projection schedule + terminal value card */}
          <section className="space-y-6">
            {/* Year-by-year FCF schedule */}
            <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    02 · Projection
                  </div>
                  <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                    Discounted cash flows
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <TabButton
                    active={projectionTab === "schedule"}
                    onClick={() => setProjectionTab("schedule")}
                  >
                    Schedule
                  </TabButton>
                  <TabButton
                    active={projectionTab === "growth"}
                    onClick={() => setProjectionTab("growth")}
                  >
                    Growth bars
                  </TabButton>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    r = {(model.r * 100).toFixed(1)}%
                  </span>
                </div>
              </header>

              {projectionTab === "schedule" ? (
                <div className="overflow-hidden rounded-md border border-app">
                  <table className="w-full font-mono text-xs">
                    <thead>
                      <tr className="bg-app-elevated text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                        <th className="px-3 py-2 text-left">Period</th>
                        <th className="px-3 py-2 text-right">FCF</th>
                        <th className="px-3 py-2 text-right">YoY</th>
                        <th className="px-3 py-2 text-right">Discount</th>
                        <th className="px-3 py-2 text-right">PV</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums text-app">
                      {model.fcfs.map((f, i) => {
                        const df = Math.pow(1 + model.r, i + 1);
                        const pv = model.pvYears[i] ?? 0;
                        const grow = fcfGrowth[i];
                        return (
                          <tr
                            key={i}
                            className="border-t border-app"
                          >
                            <td className="px-3 py-2 text-secondary">
                              Year {i + 1}
                            </td>
                            <td className="px-3 py-2 text-right">{fmt(f)}</td>
                            <td className="px-3 py-2 text-right text-secondary">
                              {isFinite(grow)
                                ? `${grow >= 0 ? "+" : ""}${(grow * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-secondary">
                              {(1 / df).toFixed(4)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-app">
                              {fmt(pv)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-tool-accent/40 bg-tool-accent-soft">
                        <td className="px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                          Σ Explicit
                        </td>
                        <td className="px-3 py-2 text-right text-secondary">
                          {fmt(model.fcfs.reduce((a, b) => a + b, 0))}
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right font-semibold text-tool-accent">
                          {fmt(pvExplicit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-app">
                  {model.fcfs.map((f, i) => {
                    const max = Math.max(...model.fcfs, 1);
                    const w = (f / max) * 100;
                    const grow = fcfGrowth[i];
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-app bg-app-elevated px-3 py-2 last:border-b-0"
                      >
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
                          Y{i + 1}
                        </span>
                        <div className="relative h-3 overflow-hidden rounded-sm bg-app">
                          <div
                            className="h-full bg-tool-accent/70"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                        <div className="flex items-baseline gap-3 font-mono tabular-nums text-xs">
                          <span className="text-app">{fmt(f)}</span>
                          <span className="w-12 text-right text-secondary">
                            {isFinite(grow)
                              ? `${grow >= 0 ? "+" : ""}${(grow * 100).toFixed(1)}%`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Terminal value card */}
            <div className="relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface p-5 shadow-sm">
              <span className="pointer-events-none absolute right-0 top-0 h-16 w-16 -translate-y-6 translate-x-6 rounded-full bg-tool-accent/10 blur-2xl" />
              <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    03 · Terminal value
                  </div>
                  <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                    Gordon growth
                  </h2>
                </div>
                <code className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.6rem] text-secondary">
                  TV = FCF₅ × (1+g) / (r−g)
                </code>
              </header>

              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-4">
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Terminal FCF
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {fmt((model.fcfs[YEARS - 1] || 0) * (1 + model.g))}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Terminal value
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {fmt(model.terminalValue)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    PV of terminal
                  </div>
                  <div className="mt-1 tabular-nums text-tool-accent">
                    {fmt(model.pvTerminal)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Share of EV
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {isFinite(pvTerminalShare)
                      ? `${(pvTerminalShare * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Composition bar: explicit vs terminal */}
              {isFinite(model.ev) && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <span>EV composition</span>
                    <span className="font-mono">
                      {((1 - pvTerminalShare) * 100).toFixed(0)}% explicit ·{" "}
                      {(pvTerminalShare * 100).toFixed(0)}% terminal
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className="bg-tool-accent"
                      style={{
                        width: `${Math.max(0, Math.min(100, (1 - pvTerminalShare) * 100))}%`,
                      }}
                    />
                    <div
                      className="bg-tool-accent/40"
                      style={{
                        width: `${Math.max(0, Math.min(100, pvTerminalShare * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sensitivity heatmap in tool-accent variants */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                04 · Sensitivity
              </div>
              <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                WACC × terminal growth · Enterprise value
              </h2>
            </div>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              Values in $M
            </span>
          </header>
          <div className="overflow-hidden rounded-md border border-app">
            <table className="w-full font-mono text-[0.7rem]">
              <thead>
                <tr className="bg-app-elevated text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <th className="px-2 py-2 text-left">WACC \ g</th>
                  {gRange.map((g, i) => (
                    <th key={i} className="px-2 py-2 text-right">
                      {(g * 100).toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sensitivity.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-t border-app"
                  >
                    <td className="px-2 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                      {(waccRange[ri] * 100).toFixed(1)}%
                    </td>
                    {row.map((v, ci) => {
                      const intensity = isFinite(v) ? (v - minS) / range : 0;
                      const isCenter = ri === 4 && ci === 3;
                      return (
                        <td
                          key={ci}
                          className={`px-2 py-1.5 text-right ${
                            isCenter
                              ? "font-semibold text-tool-accent ring-1 ring-inset ring-tool-accent/40"
                              : "text-app"
                          }`}
                          style={{
                            backgroundColor: isFinite(v)
                              ? `color-mix(in srgb, var(--tool-accent) ${5 + intensity * 32}%, transparent)`
                              : "rgba(244,63,94,0.12)",
                          }}
                        >
                          {isFinite(v) ? `${(v / 1_000_000).toFixed(1)}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Monte Carlo */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                05 · Monte Carlo
              </div>
              <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                1,000-iteration distribution
              </h2>
            </div>
            <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              σ(WACC) = 1.5pp · σ(g) = 0.5pp
            </span>
          </header>

          <p className="mb-4 text-xs text-secondary">
            Each iteration perturbs WACC and terminal growth with normal noise,
            holding FCFs fixed. Iterations where WACC ≤ g are discarded. Result
            below is{" "}
            <span className="font-medium text-app">
              {monteCarlo.perShare ? "per-share" : "equity value"}
            </span>
            .
          </p>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-5">
            {(
              [
                { l: "P5", v: monteCarlo.p5, accent: false },
                { l: "P25", v: monteCarlo.p25, accent: false },
                { l: "Median", v: monteCarlo.p50, accent: true },
                { l: "P75", v: monteCarlo.p75, accent: false },
                { l: "P95", v: monteCarlo.p95, accent: false },
              ] as const
            ).map((s) => (
              <div key={s.l} className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  {s.l}
                </div>
                <div
                  className={`mt-1 tabular-nums ${
                    s.accent ? "text-tool-accent" : "text-app"
                  }`}
                >
                  {monteCarlo.perShare
                    ? isFinite(s.v)
                      ? `$${s.v.toFixed(2)}`
                      : "—"
                    : fmt(s.v)}
                </div>
              </div>
            ))}
          </div>

          {(() => {
            // Histogram of the distribution (20 bins).
            const vals = monteCarlo.values;
            if (vals.length === 0) return null;
            const bins = 20;
            const lo = vals[0];
            const hi = vals[vals.length - 1];
            const w = (hi - lo) / bins || 1;
            const counts = new Array(bins).fill(0);
            for (const v of vals) {
              const idx = Math.min(
                bins - 1,
                Math.max(0, Math.floor((v - lo) / w))
              );
              counts[idx]++;
            }
            const peak = Math.max(...counts);
            const medianBin = Math.min(
              bins - 1,
              Math.max(0, Math.floor((monteCarlo.p50 - lo) / w))
            );
            return (
              <div className="mt-4">
                <div className="mb-1 flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>
                    {monteCarlo.perShare ? `$${lo.toFixed(2)}` : fmt(lo)}
                  </span>
                  <span>Distribution</span>
                  <span>
                    {monteCarlo.perShare ? `$${hi.toFixed(2)}` : fmt(hi)}
                  </span>
                </div>
                <div className="flex h-24 items-end gap-[2px] rounded-md border border-app bg-app-elevated p-2">
                  {counts.map((c, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t ${
                        i === medianBin
                          ? "bg-tool-accent"
                          : "bg-tool-accent/45"
                      }`}
                      style={{ height: `${(c / peak) * 100}%` }}
                      title={`${(lo + i * w).toFixed(0)} - ${(lo + (i + 1) * w).toFixed(0)}: ${c}`}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
            {monteCarlo.count.toLocaleString()} valid iterations · invalids
            discarded where r ≤ g
          </p>
        </section>
      </div>

      <ScenarioBar<State>
        slug="discounted-cash-flow"
        state={state}
        onLoad={(d) => {
          if (d && Array.isArray(d.fcfs) && d.fcfs.length === YEARS)
            setState({ ...defaultState, ...d });
        }}
        exports={{
          csv: () =>
            toCsv([
              ["Year", "FCF", "PV"],
              ...model.fcfs.map((f, i) => [
                `Y${i + 1}`,
                f.toFixed(0),
                (model.pvYears[i] ?? 0).toFixed(0),
              ]),
              [],
              ["Enterprise value", model.ev.toFixed(0)],
              ["Terminal value", model.terminalValue.toFixed(0)],
              ["PV of terminal", model.pvTerminal.toFixed(0)],
              ["Equity value", model.equity.toFixed(0)],
              ["Per share", model.perShare.toFixed(4)],
            ]),
          json: () => ({ state, model, monteCarlo }),
          markdown: () =>
            `# DCF\n\n- EV: ${fmt(model.ev)}\n- Equity: ${fmt(model.equity)}\n- Per share: ${isFinite(model.perShare) ? `$${model.perShare.toFixed(2)}` : "—"}\n\nMonte Carlo (${monteCarlo.count} iters):\n- P5: ${monteCarlo.perShare ? `$${monteCarlo.p5.toFixed(2)}` : fmt(monteCarlo.p5)}\n- Median: ${monteCarlo.perShare ? `$${monteCarlo.p50.toFixed(2)}` : fmt(monteCarlo.p50)}\n- P95: ${monteCarlo.perShare ? `$${monteCarlo.p95.toFixed(2)}` : fmt(monteCarlo.p95)}\n`,
        }}
      />
    </ToolShell>
  );
}
