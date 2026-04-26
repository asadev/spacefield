"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// Typical contribution-margin benchmarks by industry (Deloitte / IBISWorld
// 2024 benchmarks, rounded). Not a target — a reference band.
const MARGIN_BENCHMARKS: { industry: string; cm: number }[] = [
  { industry: "SaaS (mature)", cm: 80 },
  { industry: "Software (new)", cm: 60 },
  { industry: "Agency / services", cm: 55 },
  { industry: "D2C brand (good)", cm: 45 },
  { industry: "Food & bev brand", cm: 35 },
  { industry: "Marketplace (take-rate)", cm: 30 },
  { industry: "Retail / e-com average", cm: 28 },
  { industry: "Restaurant", cm: 25 },
  { industry: "Wholesale / distributor", cm: 18 },
];

interface Product {
  id: string;
  name: string;
  price: string;
  variable: string;
  mix: string; // % of volume
}

interface Inputs {
  fixed: string;
  target: string;
  products: Product[];
}

const DEFAULTS: Inputs = {
  fixed: "50000",
  target: "100000",
  products: [
    { id: "a", name: "Core", price: "39", variable: "15", mix: "70" },
    { id: "b", name: "Pro", price: "99", variable: "30", mix: "30" },
  ],
};

type View = "chart" | "sensitivity" | "benchmarks";

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function BreakEvenPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [view, setView] = useState<View>("chart");

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  const fixed = parseFloat(inputs.fixed) || 0;
  const target = parseFloat(inputs.target) || 0;

  // Weighted average contribution per unit using mix %.
  const analysis = useMemo(() => {
    const rows = inputs.products.map((p) => {
      const price = parseFloat(p.price) || 0;
      const variable = parseFloat(p.variable) || 0;
      const mix = parseFloat(p.mix) || 0;
      const cm = price - variable;
      return { ...p, priceN: price, variableN: variable, mixN: mix, cm };
    });
    const totalMix = rows.reduce((a, r) => a + r.mixN, 0) || 1;
    const weightedCm = rows.reduce(
      (a, r) => a + (r.cm * r.mixN) / totalMix,
      0
    );
    const weightedPrice = rows.reduce(
      (a, r) => a + (r.priceN * r.mixN) / totalMix,
      0
    );
    const weightedVariable = rows.reduce(
      (a, r) => a + (r.variableN * r.mixN) / totalMix,
      0
    );
    const marginPct = weightedPrice > 0 ? (weightedCm / weightedPrice) * 100 : 0;
    const units = weightedCm > 0 ? Math.ceil(fixed / weightedCm) : 0;
    const revenue = units * weightedPrice;
    const targetUnits =
      weightedCm > 0 ? Math.ceil((fixed + target) / weightedCm) : 0;
    return {
      rows,
      weightedCm,
      weightedPrice,
      weightedVariable,
      marginPct,
      units,
      revenue,
      targetUnits,
    };
  }, [inputs.products, fixed, target]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const addProduct = () =>
    setInputs((s) => ({
      ...s,
      products: [
        ...s.products,
        { id: uid(), name: `Product ${s.products.length + 1}`, price: "49", variable: "20", mix: "0" },
      ],
    }));

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setInputs((s) => ({
      ...s,
      products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const removeProduct = (id: string) =>
    setInputs((s) => ({
      ...s,
      products: s.products.filter((p) => p.id !== id),
    }));

  // Sensitivity: fixed cost vs price change.
  const sensitivity = useMemo(() => {
    const priceDeltas = [-10, -5, 0, 5, 10];
    const fixedDeltas = [-20, -10, 0, 10, 20];
    return { priceDeltas, fixedDeltas };
  }, []);

  // ── Chart data for the break-even crossover hero ────────────────
  const chart = useMemo(() => {
    const beUnits = analysis.units;
    // Show 0 → ~1.6× break-even so the crossover sits left-of-center.
    const maxUnits = Math.max(
      Math.ceil(beUnits * 1.6),
      Math.ceil((analysis.targetUnits || 0) * 1.05),
      10
    );
    const w = 600;
    const h = 220;
    const padL = 8;
    const padR = 8;
    const padT = 12;
    const padB = 18;

    const maxRevenue = analysis.weightedPrice * maxUnits;
    const maxCost = fixed + analysis.weightedVariable * maxUnits;
    const yMax = Math.max(maxRevenue, maxCost, fixed * 1.2, 1);

    const xOf = (u: number) =>
      padL + ((w - padL - padR) * u) / Math.max(1, maxUnits);
    const yOf = (v: number) =>
      h - padB - ((h - padT - padB) * v) / yMax;

    const revPath = `M ${xOf(0)} ${yOf(0)} L ${xOf(maxUnits)} ${yOf(maxRevenue)}`;
    const costPath = `M ${xOf(0)} ${yOf(fixed)} L ${xOf(maxUnits)} ${yOf(maxCost)}`;
    const fixedPath = `M ${xOf(0)} ${yOf(fixed)} L ${xOf(maxUnits)} ${yOf(fixed)}`;

    // Profit-shaded polygon (revenue above cost from BE → maxUnits).
    let profitPath: string | null = null;
    if (analysis.weightedCm > 0 && beUnits > 0 && beUnits < maxUnits) {
      profitPath = `M ${xOf(beUnits)} ${yOf(fixed + analysis.weightedVariable * beUnits)} L ${xOf(maxUnits)} ${yOf(maxRevenue)} L ${xOf(maxUnits)} ${yOf(maxCost)} Z`;
    }
    // Loss-shaded polygon (cost above revenue from 0 → BE).
    let lossPath: string | null = null;
    if (beUnits > 0) {
      lossPath = `M ${xOf(0)} ${yOf(0)} L ${xOf(0)} ${yOf(fixed)} L ${xOf(beUnits)} ${yOf(fixed + analysis.weightedVariable * beUnits)} Z`;
    }

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      maxUnits,
      yMax,
      xOf,
      yOf,
      revPath,
      costPath,
      fixedPath,
      profitPath,
      lossPath,
      bePoint:
        analysis.weightedCm > 0 && beUnits > 0
          ? { x: xOf(beUnits), y: yOf(analysis.revenue) }
          : null,
    };
  }, [analysis, fixed]);

  // Margin of safety — based on a target/expected volume.
  const mos = useMemo(() => {
    const expectedUnits = analysis.targetUnits || Math.ceil(analysis.units * 1.25);
    const expectedRevenue = expectedUnits * analysis.weightedPrice;
    const safetyUnits = Math.max(0, expectedUnits - analysis.units);
    const safetyRevenue = Math.max(0, expectedRevenue - analysis.revenue);
    const safetyPct = expectedRevenue > 0 ? (safetyRevenue / expectedRevenue) * 100 : 0;
    return { expectedUnits, expectedRevenue, safetyUnits, safetyRevenue, safetyPct };
  }, [analysis]);

  const verdict =
    analysis.weightedCm <= 0
      ? { tone: "danger", label: "Unit economics broken", reason: "Variable cost exceeds price — every unit deepens the hole. Fix the cost stack or the price." }
      : analysis.marginPct < 20
      ? { tone: "warn", label: "Thin margin", reason: "Contribution margin under 20%. Volume sensitivity is brutal — small price drops blow up break-even." }
      : analysis.marginPct < 50
      ? { tone: "ok", label: "Healthy", reason: "Solid contribution margin. Volume targets are workable." }
      : { tone: "good", label: "Strong unit economics", reason: "High contribution margin. Each unit pays down fixed cost fast." };

  const verdictChip =
    verdict.tone === "danger"
      ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
      : verdict.tone === "warn"
      ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
      : verdict.tone === "ok"
      ? "border-tool-accent/40 bg-tool-accent-soft text-tool-accent"
      : "border-emerald-400/40 bg-emerald-500/15 text-emerald-300";

  const verdictDot =
    verdict.tone === "danger"
      ? "bg-rose-400"
      : verdict.tone === "warn"
      ? "bg-amber-400"
      : verdict.tone === "ok"
      ? "bg-tool-accent"
      : "bg-emerald-400";

  return (
    <ToolShell
      category="Finance"
      title="Break-even Analysis"
      description="Multi-product contribution margin, target-profit planning, sensitivity grid. Know exactly how many units stop the bleeding."
    >
      <div
        data-tool-theme="finance"
        data-tool="break-even"
        className="space-y-6 text-app"
      >
        {/* In-tool header — analyst's spreadsheet chrome */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Unit Economics
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Break-even
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Where revenue catches cost. Drag the levers, watch the lines cross.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated/60 px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              Weighted CM {analysis.marginPct.toFixed(1)}%
            </div>
          </div>
        </header>

        {/* Hero summary — break-even units + revenue, always visible */}
        <section className="relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-6 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Break-even units / month
                <span
                  className={`ml-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold tracking-[0.15em] ${verdictChip}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${verdictDot}`} />
                  {verdict.label}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-6xl font-semibold tabular-nums leading-none tracking-tight text-tool-accent sm:text-7xl">
                  {analysis.weightedCm > 0 ? analysis.units.toLocaleString() : "—"}
                </span>
                <span className="font-mono text-sm uppercase tracking-[0.2em] text-faint">
                  units
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm text-secondary">
                {verdict.reason}
              </p>
            </div>

            <div className="flex flex-col items-start gap-1">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Revenue at break-even
              </span>
              <span className="font-mono text-4xl font-semibold tabular-nums leading-none tracking-tight text-app sm:text-5xl">
                {analysis.weightedCm > 0 ? fmt(analysis.revenue) : "—"}
              </span>
              <span className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
                CM / unit {fmt(analysis.weightedCm)}
              </span>
            </div>
          </div>

          {/* Sub-tabs — state buttons */}
          <div className="mt-6 flex flex-wrap gap-2">
            <StateButton active={view === "chart"} onClick={() => setView("chart")}>
              Crossover chart
            </StateButton>
            <StateButton
              active={view === "sensitivity"}
              onClick={() => setView("sensitivity")}
            >
              Sensitivity grid
            </StateButton>
            <StateButton
              active={view === "benchmarks"}
              onClick={() => setView("benchmarks")}
            >
              CM benchmarks
            </StateButton>
          </div>

          {/* View — Crossover chart */}
          {view === "chart" && (
            <div className="relative mt-5 overflow-hidden rounded-xl border border-app bg-app-elevated/40 p-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
                  backgroundSize: "100% 2.5rem, 4rem 100%",
                }}
              />
              <svg
                viewBox={`0 0 ${chart.w} ${chart.h}`}
                className="relative block w-full"
                preserveAspectRatio="none"
              >
                {/* Loss & profit fills */}
                {chart.lossPath && (
                  <path
                    d={chart.lossPath}
                    fill="rgb(244 63 94 / 0.12)"
                    stroke="none"
                  />
                )}
                {chart.profitPath && (
                  <path
                    d={chart.profitPath}
                    fill="rgb(16 185 129 / 0.14)"
                    stroke="none"
                  />
                )}

                {/* Fixed-cost baseline (dashed) */}
                <path
                  d={chart.fixedPath}
                  stroke="currentColor"
                  strokeOpacity="0.35"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  fill="none"
                />

                {/* Total cost line (rose) */}
                <path
                  d={chart.costPath}
                  stroke="rgb(244 63 94 / 0.85)"
                  strokeWidth="2"
                  fill="none"
                />

                {/* Revenue line (accent) */}
                <path
                  d={chart.revPath}
                  stroke="var(--tool-accent)"
                  strokeWidth="2.25"
                  fill="none"
                />

                {/* BE crossover marker */}
                {chart.bePoint && (
                  <g>
                    <line
                      x1={chart.bePoint.x}
                      x2={chart.bePoint.x}
                      y1={chart.padT}
                      y2={chart.h - chart.padB}
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeDasharray="2 3"
                      strokeWidth="1"
                    />
                    <circle
                      cx={chart.bePoint.x}
                      cy={chart.bePoint.y}
                      r="6"
                      fill="var(--tool-accent)"
                      stroke="white"
                      strokeWidth="2"
                    />
                    <circle
                      cx={chart.bePoint.x}
                      cy={chart.bePoint.y}
                      r="11"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeOpacity="0.35"
                      strokeWidth="1"
                    />
                  </g>
                )}
              </svg>

              {/* Legend */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 bg-tool-accent" /> Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 bg-rose-500/80" /> Total cost
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-[2px] w-4 border-t border-dashed border-current opacity-50" />{" "}
                  Fixed cost
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/30" /> Profit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/25" /> Loss
                </span>
                {chart.bePoint && (
                  <span className="ml-auto font-mono tabular-nums text-tool-accent">
                    BE at {analysis.units.toLocaleString()} units · {fmt(analysis.revenue)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* View — Sensitivity grid */}
          {view === "sensitivity" && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-app bg-app-elevated/40 p-3">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="px-2 py-1 text-left">Fixed \ Price</th>
                    {sensitivity.priceDeltas.map((d) => (
                      <th key={d} className="px-2 py-1 text-right">
                        {d > 0 ? `+${d}%` : `${d}%`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivity.fixedDeltas.map((fd) => (
                    <tr key={fd} className="border-t border-app">
                      <td className="px-2 py-1.5 text-secondary">
                        {fd > 0 ? `+${fd}%` : `${fd}%`}
                      </td>
                      {sensitivity.priceDeltas.map((pd) => {
                        const adjFixed = fixed * (1 + fd / 100);
                        const adjPrice = analysis.weightedPrice * (1 + pd / 100);
                        const adjCm =
                          adjPrice - (analysis.weightedPrice - analysis.weightedCm);
                        const u = adjCm > 0 ? Math.ceil(adjFixed / adjCm) : 0;
                        const isBase = fd === 0 && pd === 0;
                        return (
                          <td
                            key={pd}
                            className={`px-2 py-1.5 text-right tabular-nums ${
                              isBase
                                ? "bg-tool-accent-soft font-semibold text-tool-accent"
                                : u === 0
                                ? "text-rose-400"
                                : "text-app"
                            }`}
                          >
                            {u > 0 ? u.toLocaleString() : "∞"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 px-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Each cell = break-even units when fixed cost shifts (rows) and price shifts (cols).
              </p>
            </div>
          )}

          {/* View — Industry CM benchmarks */}
          {view === "benchmarks" && (
            <div className="mt-5 rounded-xl border border-app bg-app-elevated/40 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Your weighted CM · {analysis.marginPct.toFixed(1)}%
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  2024 reference bands
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MARGIN_BENCHMARKS.map((b) => {
                  const nearby = Math.abs(b.cm - analysis.marginPct) < 5;
                  return (
                    <span
                      key={b.industry}
                      className={`rounded-full border px-3 py-1 font-mono text-[0.6rem] tabular-nums ${
                        nearby
                          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated/60 text-secondary"
                      }`}
                    >
                      {b.industry} · {b.cm}%
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                Deloitte 2024 · IBISWorld. Bands, not targets.
              </p>
            </div>
          )}

          {/* Secondary metrics ledger */}
          <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app-elevated/60 font-mono text-sm sm:grid-cols-4">
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                CM / unit
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmt(analysis.weightedCm)}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Weighted CM %
              </div>
              <div className="mt-1 tabular-nums text-app">
                {analysis.marginPct.toFixed(1)}%
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Avg price
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmt(analysis.weightedPrice)}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Units to target
              </div>
              <div className="mt-1 tabular-nums text-app">
                {target > 0 && analysis.weightedCm > 0
                  ? analysis.targetUnits.toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Cost & target inputs */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
              Fixed cost & target
            </h2>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
              Monthly
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Fixed cost / month
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                  $
                </span>
                <input
                  type="number"
                  value={inputs.fixed}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, fixed: e.target.value }))
                  }
                  className="w-full rounded-md border border-app bg-app-elevated/50 py-2 pl-6 pr-3 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 ring-tool-accent"
                  min="0"
                  step="100"
                />
              </div>
              <span className="mt-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Rent · payroll · software
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Target profit / month
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                  $
                </span>
                <input
                  type="number"
                  value={inputs.target}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, target: e.target.value }))
                  }
                  className="w-full rounded-md border border-app bg-app-elevated/50 py-2 pl-6 pr-3 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 ring-tool-accent"
                  min="0"
                  step="100"
                />
              </div>
              <span className="mt-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Optional — adds units-to-target
              </span>
            </label>
          </div>

          {analysis.weightedCm <= 0 && (
            <p className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-rose-300">
              Variable cost &gt; price. Every unit loses money. Fix unit economics first.
            </p>
          )}
        </section>

        {/* Product ledger — fixed/variable/price with per-row bars */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                Product ledger
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Mix-weighted contribution per unit. Bars show variable vs contribution split.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/70" /> Variable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" /> Contribution
              </span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[minmax(0,1.2fr)_5rem_5rem_4.5rem_minmax(0,1.4fr)_2rem] gap-3 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            <span>Product</span>
            <span className="text-right">Price</span>
            <span className="text-right">Variable</span>
            <span className="text-right">Mix %</span>
            <span>Cost / contribution</span>
            <span />
          </div>

          <div className="mt-2 space-y-1">
            {inputs.products.map((p) => {
              const price = parseFloat(p.price) || 0;
              const variable = parseFloat(p.variable) || 0;
              const cm = price - variable;
              const peak = Math.max(price, 1);
              const varPct = Math.max(0, Math.min(100, (variable / peak) * 100));
              const cmPct = Math.max(0, Math.min(100 - varPct, (cm / peak) * 100));
              const cmNeg = cm < 0;
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_5rem_5rem_4.5rem_minmax(0,1.4fr)_2rem] items-center gap-3 px-1 py-1"
                >
                  <input
                    value={p.name}
                    onChange={(e) =>
                      updateProduct(p.id, { name: e.target.value })
                    }
                    className="w-full rounded-md border border-transparent bg-transparent py-1.5 px-2 font-mono text-sm text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated/50"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                      $
                    </span>
                    <input
                      type="number"
                      value={p.price}
                      onChange={(e) =>
                        updateProduct(p.id, { price: e.target.value })
                      }
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated/50"
                      step="0.1"
                    />
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                      $
                    </span>
                    <input
                      type="number"
                      value={p.variable}
                      onChange={(e) =>
                        updateProduct(p.id, { variable: e.target.value })
                      }
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated/50"
                      step="0.1"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={p.mix}
                      onChange={(e) =>
                        updateProduct(p.id, { mix: e.target.value })
                      }
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-2 pr-5 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated/50"
                      step="1"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                      %
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-app-elevated">
                      <div
                        className="absolute inset-y-0 left-0 bg-rose-500/70"
                        style={{ width: `${varPct}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 ${cmNeg ? "bg-rose-700/80" : "bg-tool-accent"}`}
                        style={{ left: `${varPct}%`, width: `${cmPct}%` }}
                      />
                    </div>
                    <span
                      className={`w-16 text-right font-mono text-xs tabular-nums ${
                        cmNeg ? "text-rose-400" : "text-secondary"
                      }`}
                    >
                      {cm >= 0 ? "+" : ""}
                      {fmt(cm)}
                    </span>
                  </div>
                  {inputs.products.length > 1 ? (
                    <button
                      onClick={() => removeProduct(p.id)}
                      className="rounded-md border border-transparent text-sm text-faint transition-colors hover:border-rose-400/40 hover:text-rose-400"
                      aria-label={`Remove ${p.name}`}
                      type="button"
                    >
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addProduct}
            className="mt-3 rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
          >
            + Add product
          </button>
        </section>

        {/* Margin of safety */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
              Margin of safety
            </h2>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
              {target > 0 ? "vs target volume" : "vs +25% expected"}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span
              className={`font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight ${
                mos.safetyPct >= 30
                  ? "text-emerald-400"
                  : mos.safetyPct >= 10
                  ? "text-tool-accent"
                  : "text-rose-400"
              }`}
            >
              {mos.safetyPct.toFixed(1)}%
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              cushion
            </span>
          </div>

          {/* MOS bar */}
          <div className="mt-4 overflow-hidden rounded-md border border-app">
            <div className="flex h-3 w-full bg-app-elevated">
              <div
                className="h-full bg-rose-500/60"
                style={{
                  width: `${
                    mos.expectedRevenue > 0
                      ? Math.min(100, (analysis.revenue / mos.expectedRevenue) * 100)
                      : 0
                  }%`,
                }}
                title="Break-even revenue"
              />
              <div
                className="h-full bg-emerald-500/60"
                style={{
                  width: `${
                    mos.expectedRevenue > 0
                      ? Math.min(
                          100 -
                            Math.min(100, (analysis.revenue / mos.expectedRevenue) * 100),
                          (mos.safetyRevenue / mos.expectedRevenue) * 100
                        )
                      : 0
                  }%`,
                }}
                title="Safety cushion"
              />
            </div>
            <div className="flex justify-between border-t border-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              <span>0</span>
              <span>BE {fmt(analysis.revenue)}</span>
              <span>Target {fmt(mos.expectedRevenue)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app-elevated/60 font-mono text-sm">
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Cushion units
              </div>
              <div className="mt-1 tabular-nums text-app">
                {mos.safetyUnits.toLocaleString()}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Cushion revenue
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmt(mos.safetyRevenue)}
              </div>
            </div>
          </div>

          <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-faint">
            Drop in volume you can absorb before hitting break-even.
          </p>
        </section>
      </div>

      <ScenarioBar<Inputs>
        slug="break-even"
        state={inputs}
        onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Product", "Price", "Variable", "Mix %", "CM"],
              ...analysis.rows.map((r) => [
                r.name,
                r.priceN,
                r.variableN,
                r.mixN,
                r.cm.toFixed(2),
              ]),
              [],
              ["Weighted CM", analysis.weightedCm.toFixed(2)],
              ["Break-even units", analysis.units],
              ["Break-even revenue", analysis.revenue.toFixed(2)],
            ]),
          json: () => ({ inputs, analysis }),
          markdown: () =>
            `# Break-even\n\nFixed: ${fmt(fixed)} / target: ${fmt(target)}\n\nWeighted CM: ${fmt(analysis.weightedCm)} (${analysis.marginPct.toFixed(1)}%)\nBreak-even: **${analysis.units.toLocaleString()} units** (${fmt(analysis.revenue)})\n`,
        }}
      />
    </ToolShell>
  );
}

function StateButton({
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
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated/60 text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}
