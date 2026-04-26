"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

const LS_KEY = "solutions:runway-scenarios:v1";
const HORIZON = 24;

interface State {
  startingCash: string;
  monthlyRevenue: string;
  monthlyGrowth: string; // %
  fixedCosts: string;
  variableCostPct: string; // % of revenue
  bestRevBoost: string; // %
  worstRevHit: string; // %
  worstCostBump: string; // %
}

const defaultState: State = {
  startingCash: "2000000",
  monthlyRevenue: "150000",
  monthlyGrowth: "8",
  fixedCosts: "220000",
  variableCostPct: "25",
  bestRevBoost: "30",
  worstRevHit: "20",
  worstCostBump: "10",
};

interface ScenarioPoint {
  month: number;
  cash: number;
  revenue: number;
  cost: number;
  net: number;
}

type ScenarioKey = "base" | "best" | "worst";
type ChartView = "cash" | "burn" | "net";

interface Scenario {
  key: ScenarioKey;
  label: string;
  curve: ScenarioPoint[];
  monthsRunway: number;
  zeroDate: number | null;
}

function simulate(
  startingCash: number,
  revenue0: number,
  growthPct: number,
  fixed: number,
  varPct: number,
  revenueMultiplier: number,
  costMultiplier: number
): ScenarioPoint[] {
  const curve: ScenarioPoint[] = [
    { month: 0, cash: startingCash, revenue: 0, cost: 0, net: 0 },
  ];
  let cash = startingCash;
  const g = growthPct / 100;
  for (let m = 1; m <= HORIZON; m++) {
    const revenue = revenue0 * Math.pow(1 + g, m - 1) * revenueMultiplier;
    const varCost = (revenue * varPct) / 100;
    const totalCost = (fixed + varCost) * costMultiplier;
    const net = revenue - totalCost;
    cash += net;
    curve.push({ month: m, cash, revenue, cost: totalCost, net });
  }
  return curve;
}

function runway(curve: ScenarioPoint[]): { months: number; zero: number | null } {
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].cash <= 0) return { months: i, zero: i };
  }
  return { months: HORIZON, zero: null };
}

// Finance ledger field — tabular-nums + accent focus, foundation tokens for color.
const fieldInput =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[0.85rem] tabular-nums text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function FinanceField({
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
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {label}
        </span>
        {hint && (
          <span className="text-[0.55rem] italic text-[var(--text-faint)]">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

export default function RunwayScenariosPage() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [chartView, setChartView] = useState<ChartView>("cash");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {}
    const shared = readShareState<State>();
    if (shared) setState({ ...defaultState, ...shared });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const scenarios: Scenario[] = useMemo(() => {
    const cash = parseFloat(state.startingCash) || 0;
    const rev = parseFloat(state.monthlyRevenue) || 0;
    const g = parseFloat(state.monthlyGrowth) || 0;
    const fixed = parseFloat(state.fixedCosts) || 0;
    const varPct = parseFloat(state.variableCostPct) || 0;
    const bestBoost = parseFloat(state.bestRevBoost) || 0;
    const worstHit = parseFloat(state.worstRevHit) || 0;
    const worstCost = parseFloat(state.worstCostBump) || 0;

    const base = simulate(cash, rev, g, fixed, varPct, 1, 1);
    const best = simulate(cash, rev, g, fixed, varPct, 1 + bestBoost / 100, 1);
    const worst = simulate(
      cash,
      rev,
      g,
      fixed,
      varPct,
      1 - worstHit / 100,
      1 + worstCost / 100
    );

    const baseR = runway(base);
    const bestR = runway(best);
    const worstR = runway(worst);

    return [
      {
        key: "base",
        label: "Base",
        curve: base,
        monthsRunway: baseR.months,
        zeroDate: baseR.zero,
      },
      {
        key: "best",
        label: "Best",
        curve: best,
        monthsRunway: bestR.months,
        zeroDate: bestR.zero,
      },
      {
        key: "worst",
        label: "Worst",
        curve: worst,
        monthsRunway: worstR.months,
        zeroDate: worstR.zero,
      },
    ];
  }, [state]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const cutDate = scenarios.find((s) => s.key === "worst")?.zeroDate;

  // Per-scenario display palette — foundation accent for base, semantic
  // emerald/rose for best/worst (intentional finance convention).
  const scenarioStyle: Record<
    ScenarioKey,
    { stroke: string; fill: string; chip: string; dot: string; bar: string; tone: string }
  > = {
    base: {
      stroke: "var(--tool-accent)",
      fill: "color-mix(in srgb, var(--tool-accent) 18%, transparent)",
      chip: "border-tool-accent/40 bg-tool-accent-soft text-tool-accent",
      dot: "bg-tool-accent",
      bar: "bg-tool-accent",
      tone: "Steady-state path",
    },
    best: {
      stroke: "rgb(16,185,129)",
      fill: "rgba(16,185,129,0.16)",
      chip:
        "border-emerald-400/40 bg-emerald-500/[0.10] text-emerald-500",
      dot: "bg-emerald-500",
      bar: "bg-emerald-500",
      tone: "Boost case",
    },
    worst: {
      stroke: "rgb(244,63,94)",
      fill: "rgba(244,63,94,0.12)",
      chip:
        "border-rose-400/40 bg-rose-500/[0.10] text-rose-500",
      dot: "bg-rose-500",
      bar: "bg-rose-500",
      tone: "Drawdown case",
    },
  };

  // Selector for the active chart series — drives both extents and curves.
  const seriesAccessor = (p: ScenarioPoint): number => {
    if (chartView === "cash") return p.cash;
    if (chartView === "burn") return p.cost - p.revenue; // positive = burn
    return p.net;
  };

  const allValues = scenarios.flatMap((s) => s.curve.map(seriesAccessor));
  const maxV = Math.max(...allValues, 1);
  const minV = Math.min(...allValues, 0);
  const range = maxV - minV || 1;

  // Chart geometry — wide canvas so we can paint area fills under each curve.
  const chartW = 800;
  const chartH = 220;
  const padL = 38;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const xFor = (m: number) => padL + (m / HORIZON) * innerW;
  const yFor = (v: number) =>
    padT + innerH - ((v - minV) / range) * innerH;
  const zeroY = yFor(0);

  // Build a path string for a scenario's curve.
  const curvePath = (curve: ScenarioPoint[]) =>
    curve
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xFor(p.month).toFixed(2)} ${yFor(seriesAccessor(p)).toFixed(2)}`
      )
      .join(" ");

  // Build the area-fill path (down to zero baseline) for a scenario.
  const areaPath = (curve: ScenarioPoint[]) => {
    const top = curve
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xFor(p.month).toFixed(2)} ${yFor(seriesAccessor(p)).toFixed(2)}`
      )
      .join(" ");
    return `${top} L ${xFor(HORIZON).toFixed(2)} ${zeroY.toFixed(2)} L ${xFor(0).toFixed(2)} ${zeroY.toFixed(2)} Z`;
  };

  // Months-of-runway dial: 24-month ring with a coloured arc.
  const Dial = ({ months, color }: { months: number; color: string }) => {
    const r = 28;
    const c = 2 * Math.PI * r;
    const pct = Math.min(1, months / HORIZON);
    return (
      <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 36 36)"
        />
      </svg>
    );
  };

  // "As of" stamp for the header — purely cosmetic.
  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  // Convert a zero-month index into a relative cash-out date label.
  const zeroLabel = (zero: number | null) => {
    if (zero === null) return "Beyond M24";
    const d = new Date();
    d.setMonth(d.getMonth() + zero);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Per-scenario assumption ledger values.
  const baseRev = parseFloat(state.monthlyRevenue) || 0;
  const baseFixed = parseFloat(state.fixedCosts) || 0;
  const baseVarPct = parseFloat(state.variableCostPct) || 0;
  const headcount = Math.max(1, Math.round(baseFixed / 8500)); // proxy: avg fully-loaded $8.5k/headcount
  const burn = baseFixed + (baseRev * baseVarPct) / 100 - baseRev;
  const ledgerRows: {
    key: ScenarioKey;
    label: string;
    rev: string;
    burn: string;
    headcount: string;
    swing: string;
  }[] = [
    {
      key: "base",
      label: "Base",
      rev: fmt(baseRev),
      burn: burn > 0 ? `-${fmt(burn)}/mo` : `+${fmt(-burn)}/mo`,
      headcount: `${headcount}`,
      swing: "0%",
    },
    {
      key: "best",
      label: "Best",
      rev: fmt(baseRev * (1 + (parseFloat(state.bestRevBoost) || 0) / 100)),
      burn:
        burn -
          (baseRev * (parseFloat(state.bestRevBoost) || 0)) / 100 >
        0
          ? `-${fmt(burn - (baseRev * (parseFloat(state.bestRevBoost) || 0)) / 100)}/mo`
          : `+${fmt(-(burn - (baseRev * (parseFloat(state.bestRevBoost) || 0)) / 100))}/mo`,
      headcount: `${headcount}`,
      swing: `+${state.bestRevBoost || 0}% rev`,
    },
    {
      key: "worst",
      label: "Worst",
      rev: fmt(baseRev * (1 - (parseFloat(state.worstRevHit) || 0) / 100)),
      burn: (() => {
        const wRev = baseRev * (1 - (parseFloat(state.worstRevHit) || 0) / 100);
        const wTotal =
          (baseFixed + (wRev * baseVarPct) / 100) *
          (1 + (parseFloat(state.worstCostBump) || 0) / 100);
        const wBurn = wTotal - wRev;
        return wBurn > 0 ? `-${fmt(wBurn)}/mo` : `+${fmt(-wBurn)}/mo`;
      })(),
      headcount: `${headcount}`,
      swing: `-${state.worstRevHit || 0}% rev / +${state.worstCostBump || 0}% cost`,
    },
  ];

  // Y-axis label formatter — adapts to active series scale.
  const fmtAxis = (v: number) =>
    Math.abs(v) >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : `${Math.round(v / 1000)}k`;

  const viewLabels: Record<ChartView, { name: string; subtitle: string }> = {
    cash: { name: "Cash", subtitle: "Cash balance · best vs base vs worst" },
    burn: { name: "Burn", subtitle: "Net burn (cost − revenue) by month" },
    net: { name: "Net", subtitle: "Net contribution (revenue − cost)" },
  };

  return (
    <ToolShell
      category="Finance"
      title="Runway Scenarios"
      description="Base / best / worst three-scenario cash model. See decision triggers before you hit them."
    >
      <div
        data-tool-theme="finance"
        data-tool="runway-scenarios"
        className="space-y-6 text-[var(--text-secondary)]"
      >
        {/* Hero — three diverging curves with summary chips */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-[var(--border)] bg-tool-surface px-6 py-6 shadow-sm">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Runway Scenarios
              </div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-[var(--text)]">
                {HORIZON}-month cash trajectory
              </h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--text-secondary)]">
                Three paths from the same starting cash. Where they diverge is
                where your decisions live.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-[var(--text-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>

          {/* Cash-out date chips — one per scenario */}
          <div className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {scenarios.map((s) => {
              const st = scenarioStyle[s.key];
              return (
                <div
                  key={s.key}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 font-mono text-xs ${st.chip}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${st.dot}`} />
                    <span className="font-semibold uppercase tracking-[0.18em]">
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-[0.55rem] uppercase tracking-[0.18em] opacity-70">
                      {s.zeroDate !== null ? "cash-out" : "clear"}
                    </span>
                    <span className="font-semibold">{zeroLabel(s.zeroDate)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hero divergence chart */}
          <div className="relative mt-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {viewLabels[chartView].subtitle}
              </div>
              <div className="font-mono text-[0.6rem] tabular-nums text-[var(--text-faint)]">
                Peak {fmt(maxV)} · Trough {fmt(minV)}
              </div>
            </div>

            {/* Sub-tabs as state buttons — switches the active series */}
            <div
              role="tablist"
              aria-label="Chart series"
              className="mb-3 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 font-mono text-[0.6rem] uppercase tracking-[0.2em]"
            >
              {(Object.keys(viewLabels) as ChartView[]).map((k) => {
                const active = chartView === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setChartView(k)}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      active
                        ? "bg-tool-accent text-white shadow-sm"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    }`}
                  >
                    {viewLabels[k].name}
                  </button>
                );
              })}
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="block h-56 w-full"
              aria-label="Best / base / worst runway divergence chart"
            >
              {/* Y-axis ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((g) => {
                const y = padT + innerH * g;
                const value = maxV - g * range;
                return (
                  <g key={g}>
                    <line
                      x1={padL}
                      x2={chartW - padR}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity="0.07"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padL - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-current opacity-40"
                      fontSize="9"
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                    >
                      {fmtAxis(value)}
                    </text>
                  </g>
                );
              })}

              {/* Zero baseline */}
              <line
                x1={padL}
                x2={chartW - padR}
                y1={zeroY}
                y2={zeroY}
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x={padL - 6}
                y={zeroY + 3}
                textAnchor="end"
                className="fill-current opacity-50"
                fontSize="9"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                0
              </text>

              {/* Area fills (worst behind, best in front for visual stack) */}
              {(["worst", "base", "best"] as const).map((k) => {
                const s = scenarios.find((x) => x.key === k);
                if (!s) return null;
                return (
                  <path
                    key={`fill-${k}`}
                    d={areaPath(s.curve)}
                    fill={scenarioStyle[k].fill}
                    opacity={k === "base" ? 0.6 : 0.4}
                  />
                );
              })}

              {/* Curves on top */}
              {scenarios.map((s) => (
                <path
                  key={`line-${s.key}`}
                  d={curvePath(s.curve)}
                  fill="none"
                  stroke={scenarioStyle[s.key].stroke}
                  strokeWidth={s.key === "base" ? 2.4 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Cash-out markers — only meaningful on the cash view */}
              {chartView === "cash" &&
                scenarios.map((s) => {
                  if (s.zeroDate === null) return null;
                  const x = xFor(s.zeroDate);
                  return (
                    <g key={`cut-${s.key}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={padT}
                        y2={chartH - padB}
                        stroke={scenarioStyle[s.key].stroke}
                        strokeOpacity="0.35"
                        strokeDasharray="2 3"
                      />
                      <circle
                        cx={x}
                        cy={zeroY}
                        r="4.5"
                        fill={scenarioStyle[s.key].stroke}
                        stroke="var(--bg-elevated)"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}

              {/* X-axis tick labels */}
              {[0, 6, 12, 18, 24].map((m) => (
                <text
                  key={m}
                  x={xFor(m)}
                  y={chartH - 6}
                  textAnchor="middle"
                  className="fill-current opacity-40"
                  fontSize="9"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  M{m}
                </text>
              ))}
            </svg>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {scenarios.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-[2px] w-5"
                    style={{ background: scenarioStyle[s.key].stroke }}
                  />
                  {s.label} · {scenarioStyle[s.key].tone}
                </span>
              ))}
              {chartView === "cash" && (
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-current opacity-50" />
                  Cash-out marker
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Months-of-runway dials */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {scenarios.map((s) => {
            const st = scenarioStyle[s.key];
            const months = s.zeroDate ?? HORIZON;
            const overflow = s.zeroDate === null;
            return (
              <div
                key={s.key}
                className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-tool-surface px-4 py-4 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Dial months={months} color={st.stroke} />
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center font-mono leading-none">
                      <span className="text-lg font-semibold tabular-nums text-[var(--text)]">
                        {months}
                        {overflow ? "+" : ""}
                      </span>
                      <span className="text-[0.5rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        mo
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${st.dot}`} />
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        {s.label} runway
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-[var(--text)]">
                      {fmt(s.curve[s.curve.length - 1]?.cash ?? 0)}
                    </div>
                    <div className="mt-0.5 text-[0.6rem] text-[var(--text-faint)]">
                      End-of-horizon cash
                    </div>
                  </div>
                </div>
                {/* Bottom progress strip */}
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--surface)]">
                  <div
                    className={`h-full ${st.bar}`}
                    style={{
                      width: `${Math.min(100, (months / HORIZON) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {/* Inputs + Per-scenario assumption ledger */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          {/* Assumptions input column */}
          <div className="rounded-2xl border border-[var(--border)] bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
                Inputs
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                USD · monthly
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="Starting cash">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--text-faint)]">
                    $
                  </span>
                  <input
                    type="number"
                    value={state.startingCash}
                    onChange={(e) =>
                      setState((s) => ({ ...s, startingCash: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="10000"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Monthly revenue">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--text-faint)]">
                    $
                  </span>
                  <input
                    type="number"
                    value={state.monthlyRevenue}
                    onChange={(e) =>
                      setState((s) => ({ ...s, monthlyRevenue: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="1000"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Monthly revenue growth" hint="%">
                <input
                  type="number"
                  value={state.monthlyGrowth}
                  onChange={(e) =>
                    setState((s) => ({ ...s, monthlyGrowth: e.target.value }))
                  }
                  className={fieldInput}
                  step="0.5"
                />
              </FinanceField>
              <FinanceField
                label="Fixed monthly costs"
                hint="payroll · rent · SaaS"
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--text-faint)]">
                    $
                  </span>
                  <input
                    type="number"
                    value={state.fixedCosts}
                    onChange={(e) =>
                      setState((s) => ({ ...s, fixedCosts: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="1000"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Variable costs" hint="% of revenue">
                <input
                  type="number"
                  value={state.variableCostPct}
                  onChange={(e) =>
                    setState((s) => ({ ...s, variableCostPct: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="1"
                />
              </FinanceField>

              <div className="mt-2 border-t border-[var(--border)] pt-3">
                <div className="mb-3 text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Scenario swings
                </div>
                <div className="space-y-3">
                  <FinanceField label="Best · revenue boost" hint="%">
                    <input
                      type="number"
                      value={state.bestRevBoost}
                      onChange={(e) =>
                        setState((s) => ({ ...s, bestRevBoost: e.target.value }))
                      }
                      className={fieldInput}
                      step="1"
                    />
                  </FinanceField>
                  <FinanceField label="Worst · revenue hit" hint="%">
                    <input
                      type="number"
                      value={state.worstRevHit}
                      onChange={(e) =>
                        setState((s) => ({ ...s, worstRevHit: e.target.value }))
                      }
                      className={fieldInput}
                      step="1"
                    />
                  </FinanceField>
                  <FinanceField label="Worst · cost bump" hint="%">
                    <input
                      type="number"
                      value={state.worstCostBump}
                      onChange={(e) =>
                        setState((s) => ({ ...s, worstCostBump: e.target.value }))
                      }
                      className={fieldInput}
                      step="1"
                    />
                  </FinanceField>
                </div>
              </div>
            </div>
          </div>

          {/* Per-scenario assumption ledger */}
          <div className="rounded-2xl border border-[var(--border)] bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
                Assumptions ledger
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Burn · revenue · headcount
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full font-mono text-xs">
                <thead className="bg-[var(--surface)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.2em]">
                      Scenario
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.2em]">
                      Revenue
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.2em]">
                      Net burn
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] uppercase tracking-[0.2em]">
                      Headcount
                    </th>
                    <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.2em]">
                      Swing vs base
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((r) => {
                    const st = scenarioStyle[r.key];
                    return (
                      <tr
                        key={r.key}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${st.dot}`} />
                            <span className="font-semibold text-[var(--text)]">
                              {r.label}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {r.rev}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right tabular-nums ${
                            r.burn.startsWith("-")
                              ? "text-rose-500"
                              : "text-emerald-500"
                          }`}
                        >
                          {r.burn}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {r.headcount}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">
                          {r.swing}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Decision-trigger callout */}
            {typeof cutDate === "number" && cutDate <= HORIZON && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/[0.08] px-4 py-3 text-xs text-amber-600">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] opacity-80">
                    Decision trigger
                  </div>
                  <div className="mt-1 leading-relaxed">
                    Worst-case cash-out at month <b>{cutDate}</b>. Cut costs or
                    close a round no later than month{" "}
                    <b>{Math.max(1, cutDate - 4)}</b>.
                  </div>
                </div>
              </div>
            )}

            {/* Monthly cash table — collapsed footer view */}
            <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-[var(--border)]">
              <table className="w-full font-mono text-[0.7rem]">
                <thead className="sticky top-0 bg-[var(--surface)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[0.55rem] uppercase tracking-[0.2em]">
                      M
                    </th>
                    {scenarios.map((s) => (
                      <th
                        key={s.key}
                        className="px-3 py-1.5 text-right text-[0.55rem] uppercase tracking-[0.2em]"
                      >
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  {Array.from({ length: HORIZON + 1 }).map((_, m) => (
                    <tr
                      key={m}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-1 text-[var(--text-muted)]">
                        {m}
                      </td>
                      {scenarios.map((s) => (
                        <td
                          key={s.key}
                          className={`px-3 py-1 text-right tabular-nums ${
                            (s.curve[m]?.cash ?? 0) < 0
                              ? "text-rose-500"
                              : ""
                          }`}
                        >
                          {fmt(s.curve[m]?.cash ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Cut-cost recommendations */}
        <section className="rounded-2xl border border-[var(--border)] bg-tool-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
              Cut-cost playbook
            </h2>
            <span className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              How to extend runway
            </span>
          </div>
          {(() => {
            const fixed = parseFloat(state.fixedCosts) || 0;
            const rev = parseFloat(state.monthlyRevenue) || 0;
            const base = scenarios.find((s) => s.key === "base");
            const worst = scenarios.find((s) => s.key === "worst");
            const baseMonths = base?.zeroDate ?? HORIZON;
            const gapToTarget = Math.max(0, 18 - baseMonths);
            const suggestions: { title: string; impact: string; detail: string }[] = [];
            if (gapToTarget > 0) {
              // Calculate cuts needed to hit 18 months.
              const currCash = parseFloat(state.startingCash) || 0;
              const netBurnMo = Math.max(
                1,
                fixed + rev * 0.25 - rev
              );
              const needed = netBurnMo - currCash / 18;
              suggestions.push({
                title: `Cut fixed costs by ~${Math.max(0, Math.round((needed / fixed) * 100))}%`,
                impact: `Extends base runway to ~18 months`,
                detail: `That's about $${Math.round(needed).toLocaleString()}/mo in savings. Start with headcount review, SaaS audit, and vendor renegotiation.`,
              });
            }
            if (rev > 0) {
              const needGrowth = Math.max(0, 12 - parseFloat(state.monthlyGrowth || "0"));
              if (needGrowth > 0) {
                suggestions.push({
                  title: `Lift MoM growth to ${12 + (parseFloat(state.monthlyGrowth) || 0)}%`,
                  impact: "Biggest leverage on base runway",
                  detail:
                    "Double-down on the top-2 acquisition channels from cohort data. Retention fixes compound faster than headline growth.",
                });
              }
            }
            if (worst?.zeroDate && worst.zeroDate < 12) {
              suggestions.push({
                title: "Trigger a pre-emptive RIF plan at month 6",
                impact: `Avoid hitting 0 cash at month ${worst.zeroDate}`,
                detail:
                  "Model 15-25% opex cut (typical venture-backed trim) tied to a revenue missed-target signal. Pre-agree the trigger with board.",
              });
            }
            if (rev / Math.max(1, fixed) < 0.5) {
              suggestions.push({
                title: "Kill one discretionary budget line",
                impact: "Quickest runway extension",
                detail:
                  "Identify the single largest non-essential cost (events, brand marketing, senior hire). Pause for 2 quarters, re-evaluate at review.",
              });
            }
            if (suggestions.length === 0) {
              suggestions.push({
                title: "Numbers look defensible",
                impact: "Focus on growth, not cuts",
                detail:
                  "Base case clears 18+ months. Document the triggers that would flip this thesis so you don't wait too long to react.",
              });
            }
            return (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-tool-accent/40"
                  >
                    <span className="absolute left-0 top-0 h-full w-0.5 bg-tool-accent/40 transition-colors group-hover:bg-tool-accent" />
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-sm font-semibold text-[var(--text)]">
                        {s.title}
                      </span>
                      <span className="shrink-0 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-tool-accent">
                        {s.impact}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {s.detail}
                    </p>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>

        <ScenarioBar<State>
          slug="runway-scenarios"
          state={state}
          onLoad={(d) => setState({ ...defaultState, ...d })}
          exports={{
            csv: () =>
              toCsv([
                ["Month", "Base", "Best", "Worst"],
                ...Array.from({ length: HORIZON + 1 }).map((_, m) => [
                  m,
                  (scenarios[0].curve[m]?.cash ?? 0).toFixed(0),
                  (scenarios[1].curve[m]?.cash ?? 0).toFixed(0),
                  (scenarios[2].curve[m]?.cash ?? 0).toFixed(0),
                ]),
              ]),
            json: () => ({ state, scenarios }),
            markdown: () =>
              `# Runway scenarios\n\n| Scenario | Runway |\n|---|---|\n${scenarios
                .map(
                  (s) =>
                    `| ${s.label} | ${s.zeroDate !== null ? `${s.zeroDate} months` : "24+"} |`
                )
                .join("\n")}\n`,
          }}
        />
      </div>
    </ToolShell>
  );
}
