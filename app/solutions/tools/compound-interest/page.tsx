"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// S&P 500 real (inflation-adjusted) compound annual return references.
// Source: NYU Stern / Damodaran annual returns dataset + US BLS CPI.
const BENCHMARKS: { label: string; rate: number; note: string }[] = [
  { label: "S&P 500 real 1928-2024", rate: 6.9, note: "Stern / Damodaran" },
  { label: "S&P 500 nominal 1928-2024", rate: 9.8, note: "Stern / Damodaran" },
  { label: "10-yr US Treasury 1928-2024", rate: 4.6, note: "Stern / Damodaran" },
  { label: "60/40 portfolio (real)", rate: 5.4, note: "Vanguard research 2024" },
  { label: "Gold real 1928-2024", rate: 0.9, note: "Stern / Damodaran" },
  { label: "US inflation avg 1928-2024", rate: 3.1, note: "BLS CPI-U" },
];

interface Inputs {
  principal: string;
  monthly: string;
  rate: string;
  years: string;
  freq: string;
  inflation: string; // %
  taxRate: string; // % drag on earnings
  useReal: boolean;
  useTax: boolean;
}

const DEFAULTS: Inputs = {
  principal: "10000",
  monthly: "500",
  rate: "7",
  years: "20",
  freq: "12",
  inflation: "3",
  taxRate: "15",
  useReal: false,
  useTax: false,
};

const FREQ_OPTIONS: { v: string; label: string; short: string }[] = [
  { v: "365", label: "Daily", short: "D" },
  { v: "12", label: "Monthly", short: "M" },
  { v: "4", label: "Quarterly", short: "Q" },
  { v: "1", label: "Annually", short: "A" },
];

function grow(
  principal: number,
  monthly: number,
  annualRate: number,
  years: number,
  compoundsPerYear: number,
  taxDrag: number // 0..1 applied to earnings each period
) {
  const rate = annualRate / 100;
  const n = compoundsPerYear;
  const periodRate = rate / n;
  const periods = Math.round(years * n);
  const monthlyPerPeriod = (monthly * 12) / n;

  const snapshots: { year: number; balance: number; contributions: number }[] =
    [];
  let balance = principal;
  let contributions = principal;

  for (let p = 1; p <= periods; p++) {
    const earnings = balance * periodRate;
    const taxed = earnings * (1 - taxDrag);
    balance = balance + taxed + monthlyPerPeriod;
    contributions += monthlyPerPeriod;
    if (p % n === 0) {
      snapshots.push({ year: p / n, balance, contributions });
    }
  }

  return {
    final: balance,
    contributed: contributions,
    earned: balance - contributions,
    snapshots,
  };
}

// Finance-flavored input class. Tabular-num for ledger precision.
const fieldInput =
  "w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

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
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="text-[0.55rem] italic text-faint">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}

export default function CompoundInterestPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  const principal = parseFloat(inputs.principal) || 0;
  const monthly = parseFloat(inputs.monthly) || 0;
  const nominalRate = parseFloat(inputs.rate) || 0;
  const years = parseFloat(inputs.years) || 0;
  const freq = parseInt(inputs.freq) || 12;
  const inflation = parseFloat(inputs.inflation) || 0;
  const taxRate = parseFloat(inputs.taxRate) || 0;

  // Fisher equation for real rate.
  const realRate = ((1 + nominalRate / 100) / (1 + inflation / 100) - 1) * 100;
  const effectiveRate = inputs.useReal ? realRate : nominalRate;
  const taxDrag = inputs.useTax ? taxRate / 100 : 0;

  const result = useMemo(
    () => grow(principal, monthly, effectiveRate, years, freq, taxDrag),
    [principal, monthly, effectiveRate, years, freq, taxDrag]
  );

  // Scenario comparison (base / conservative / aggressive).
  const scenarios = useMemo(
    () => [
      {
        label: "Conservative",
        rate: 4,
        r: grow(principal, monthly, 4, years, freq, taxDrag),
      },
      {
        label: "Base",
        rate: effectiveRate,
        r: result,
      },
      {
        label: "Aggressive",
        rate: 10,
        r: grow(principal, monthly, 10, years, freq, taxDrag),
      },
    ],
    [principal, monthly, years, freq, taxDrag, result, effectiveRate]
  );

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const fmtCompact = (n: number) => {
    if (Math.abs(n) >= 1_000_000)
      return "$" + (n / 1_000_000).toFixed(2) + "M";
    if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
    return fmt(n);
  };

  const peakBalance = Math.max(1, ...result.snapshots.map((s) => s.balance));
  const multiple = principal > 0 ? result.final / principal : 0;
  const earnedPct = result.final > 0 ? (result.earned / result.final) * 100 : 0;

  // Build SVG path for the growth curve. Coordinate space: 0..100.
  const curvePath = useMemo(() => {
    if (result.snapshots.length === 0)
      return { line: "", area: "", contribLine: "", contribArea: "" };
    const pts = result.snapshots;
    const n = pts.length;
    const xAt = (i: number) => (i / Math.max(1, n - 1)) * 100;
    const yAt = (v: number) => 100 - (v / peakBalance) * 100;

    const lineCoords = pts.map((s, i) => `${xAt(i)},${yAt(s.balance)}`);
    const line = "M" + lineCoords.join(" L");
    const area =
      "M" +
      `${xAt(0)},100 L` +
      lineCoords.join(" L") +
      ` L${xAt(n - 1)},100 Z`;

    const contribCoords = pts.map(
      (s, i) => `${xAt(i)},${yAt(s.contributions)}`
    );
    const contribLine = "M" + contribCoords.join(" L");
    const contribArea =
      "M" +
      `${xAt(0)},100 L` +
      contribCoords.join(" L") +
      ` L${xAt(n - 1)},100 Z`;

    return { line, area, contribLine, contribArea };
  }, [result.snapshots, peakBalance]);

  // Reveal animation: replay when key inputs change.
  const animKey = `${principal}-${monthly}-${effectiveRate}-${years}-${freq}-${taxDrag}`;

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  return (
    <div data-tool-theme="finance" data-tool="compound-interest">
      <ToolShell
        category="Finance"
        title="Compound Interest Calculator"
        description="Model investment growth with contributions, compounding, inflation drag, and taxes. Curve + scenarios + cited benchmarks."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — context chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {inputs.useReal ? "REAL" : "NOMINAL"}
            </span>
            {inputs.useTax && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-amber-500">
                AFTER-TAX
              </span>
            )}
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              compound.ledger
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {effectiveRate.toFixed(2)}pct.{years || 0}y.{freq}cpy
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              ◉ as of {asOfStamp}
            </div>
          </div>

          <div className="relative p-5">
            {/* Faint grid rule, ledger style */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  "linear-gradient(currentColor 1px, transparent 1px)",
                backgroundSize: "100% 2.25rem",
              }}
            />
            {/* Curve underlay */}
            {result.snapshots.length > 0 && (
              <svg
                key={`hero-${animKey}`}
                aria-hidden
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
              >
                <defs>
                  <linearGradient
                    id="ci-hero-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity="0.35"
                      className="text-tool-accent"
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity="0"
                      className="text-tool-accent"
                    />
                  </linearGradient>
                </defs>
                <path
                  d={curvePath.area}
                  fill="url(#ci-hero-fill)"
                  className="text-tool-accent"
                />
                <path
                  d={curvePath.line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                  className="text-tool-accent ci-curve-reveal"
                />
              </svg>
            )}

            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Future value · year {years || 0}
                </div>

                <div
                  key={`fv-${animKey}`}
                  className="ci-fv-reveal mt-3 flex items-baseline gap-3"
                >
                  <span className="font-mono text-6xl font-semibold tabular-nums leading-none tracking-tight text-tool-accent sm:text-7xl">
                    {fmtCompact(result.final)}
                  </span>
                  <span className="font-mono text-base tabular-nums text-muted">
                    {multiple > 0 && principal > 0
                      ? `× ${multiple.toFixed(1)} principal`
                      : ""}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    + {fmt(result.earned)} earned
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {effectiveRate.toFixed(2)}% · {freq === 1 ? "annually" : freq === 4 ? "quarterly" : freq === 12 ? "monthly" : "daily"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {earnedPct.toFixed(0)}% interest share
                  </span>
                </div>
              </div>

              <div className="grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border border-app bg-app font-mono text-sm sm:w-auto">
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Total contributed
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {fmt(result.contributed)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Interest earned
                  </div>
                  <div className="mt-1 tabular-nums text-tool-accent">
                    {fmt(result.earned)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Effective rate
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {effectiveRate.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Multiple on principal
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {principal > 0 ? `${multiple.toFixed(2)}×` : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-5 border-t border-dashed border-app pt-3 font-mono text-xs text-secondary">
              <span className="text-faint">//</span> Real rate ≈{" "}
              <span className="font-semibold text-app">
                {realRate.toFixed(2)}%
              </span>{" "}
              via Fisher: (1+nom)/(1+inf) − 1.
            </div>
          </div>

          {/* compounding frequency segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Compounding
            </span>
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {FREQ_OPTIONS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => setInputs((s) => ({ ...s, freq: f.v }))}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    inputs.freq === f.v
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={
                    inputs.freq === f.v ? { color: "var(--bg)" } : undefined
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setInputs((s) => ({ ...s, useReal: !s.useReal }))
                }
                className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  inputs.useReal
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                }`}
              >
                Inflation-adjusted
              </button>
              <button
                type="button"
                onClick={() => setInputs((s) => ({ ...s, useTax: !s.useTax }))}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  inputs.useTax
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                }`}
              >
                Tax drag
              </button>
            </div>
          </div>
        </section>

        {/* Inputs + growth curve */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Terms panel */}
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Terms
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Inputs · USD
              </span>
            </div>

            <div className="space-y-4">
              <FinanceField label="Starting principal">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                    $
                  </span>
                  <input
                    type="number"
                    value={inputs.principal}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, principal: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="100"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Monthly contribution">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                    $
                  </span>
                  <input
                    type="number"
                    value={inputs.monthly}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, monthly: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="50"
                  />
                </div>
              </FinanceField>
              <div className="grid grid-cols-2 gap-3">
                <FinanceField label="Annual rate" hint="nominal %">
                  <input
                    type="number"
                    value={inputs.rate}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, rate: e.target.value }))
                    }
                    className={fieldInput}
                    step="0.1"
                  />
                </FinanceField>
                <FinanceField label="Years">
                  <input
                    type="number"
                    value={inputs.years}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, years: e.target.value }))
                    }
                    className={fieldInput}
                    min="0"
                    step="1"
                  />
                </FinanceField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FinanceField label="Inflation" hint="Fisher %">
                  <input
                    type="number"
                    value={inputs.inflation}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, inflation: e.target.value }))
                    }
                    className={fieldInput}
                    step="0.1"
                  />
                </FinanceField>
                <FinanceField label="Tax on gains" hint="drag %">
                  <input
                    type="number"
                    value={inputs.taxRate}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, taxRate: e.target.value }))
                    }
                    className={fieldInput}
                    step="0.1"
                  />
                </FinanceField>
              </div>
            </div>
          </div>

          {/* Growth curve — contribution vs interest stacked area */}
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                  Growth curve · contributions vs interest
                </h2>
                <p className="mt-0.5 text-[0.7rem] text-muted">
                  Year-end balances. Lower band is what you put in. The gap is what compounding made.
                </p>
              </div>
              <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 bg-tool-accent-soft" />
                  Contributions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 bg-tool-accent" />
                  Interest
                </span>
              </div>
            </div>

            {result.snapshots.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-app bg-app font-mono text-xs text-faint">
                Enter positive years to see the growth curve.
              </div>
            ) : (
              <>
                {/* Stacked-area SVG chart */}
                <div className="relative h-72 w-full overflow-hidden rounded-lg border border-app bg-app">
                  {/* Y-axis ticks */}
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex w-14 flex-col justify-between border-r border-app px-1.5 py-2 font-mono text-[0.55rem] tabular-nums text-faint">
                    <span>{fmtCompact(peakBalance)}</span>
                    <span>{fmtCompact(peakBalance * 0.66)}</span>
                    <span>{fmtCompact(peakBalance * 0.33)}</span>
                    <span>$0</span>
                  </div>

                  <svg
                    key={`chart-${animKey}`}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 ml-14 h-full w-[calc(100%-3.5rem)]"
                  >
                    <defs>
                      <linearGradient
                        id="ci-interest-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="currentColor"
                          stopOpacity="0.55"
                          className="text-tool-accent"
                        />
                        <stop
                          offset="100%"
                          stopColor="currentColor"
                          stopOpacity="0.08"
                          className="text-tool-accent"
                        />
                      </linearGradient>
                      <linearGradient
                        id="ci-contrib-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="currentColor"
                          stopOpacity="0.32"
                          className="text-tool-accent"
                        />
                        <stop
                          offset="100%"
                          stopColor="currentColor"
                          stopOpacity="0.04"
                          className="text-tool-accent"
                        />
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    <g
                      stroke="var(--border)"
                      strokeWidth="0.15"
                      vectorEffect="non-scaling-stroke"
                    >
                      <line x1="0" y1="33" x2="100" y2="33" />
                      <line x1="0" y1="66" x2="100" y2="66" />
                    </g>

                    {/* Total balance area = interest + contribs */}
                    <path
                      d={curvePath.area}
                      fill="url(#ci-interest-fill)"
                      className="text-tool-accent"
                    />
                    {/* Contribution area on top, lighter */}
                    <path
                      d={curvePath.contribArea}
                      fill="url(#ci-contrib-fill)"
                      className="text-tool-accent"
                    />

                    {/* Lines */}
                    <path
                      d={curvePath.contribLine}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                      strokeDasharray="0.8 0.8"
                      vectorEffect="non-scaling-stroke"
                      className="text-tool-accent opacity-60"
                    />
                    <path
                      d={curvePath.line}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.7"
                      vectorEffect="non-scaling-stroke"
                      className="text-tool-accent ci-curve-reveal"
                    />
                  </svg>

                  {/* X-axis label */}
                  <div className="pointer-events-none absolute inset-x-14 bottom-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-faint">
                    <span>Yr 0</span>
                    <span>
                      Yr {Math.round((result.snapshots.length || 0) / 2)}
                    </span>
                    <span>Yr {result.snapshots.length}</span>
                  </div>
                </div>

                {/* Year-by-year ledger */}
                <div className="mt-4 grid grid-cols-[3rem_1fr_6rem_5rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>Year</span>
                  <span>Composition</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">% int.</span>
                </div>
                <div className="mt-2 max-h-72 space-y-[3px] overflow-y-auto pr-1 font-mono text-[0.7rem]">
                  {result.snapshots.map((s) => {
                    const interestPct =
                      s.balance > 0
                        ? ((s.balance - s.contributions) / s.balance) * 100
                        : 0;
                    const contribW =
                      (s.contributions / Math.max(s.balance, 1)) * 100;
                    return (
                      <div
                        key={s.year}
                        className="grid grid-cols-[3rem_1fr_6rem_5rem] items-center gap-2 rounded-md px-1 py-0.5 text-secondary"
                      >
                        <span className="tabular-nums text-faint">
                          Yr {s.year.toString().padStart(2, "0")}
                        </span>
                        <div className="relative h-3.5 overflow-hidden rounded bg-app">
                          <div
                            className="absolute left-0 top-0 h-full bg-tool-accent opacity-70"
                            style={{
                              width: `${(s.balance / peakBalance) * 100}%`,
                            }}
                          />
                          <div
                            className="absolute left-0 top-0 h-full bg-tool-accent-soft"
                            style={{
                              width: `${
                                (s.balance / peakBalance) *
                                (contribW / 100) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-right tabular-nums text-app">
                          {fmt(s.balance)}
                        </span>
                        <span className="text-right tabular-nums text-tool-accent">
                          {interestPct.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Scenarios */}
        <section className="mt-6 rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Scenarios · 4% / base / 10%
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Same principal, monthly, and horizon — different rate regime.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {scenarios.map((s) => {
              const isBase = s.label === "Base";
              return (
                <div
                  key={s.label}
                  className={`relative overflow-hidden rounded-xl border p-4 ${
                    isBase
                      ? "border-tool-accent bg-tool-accent-soft"
                      : "border-app bg-app"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                    <span
                      className={isBase ? "text-tool-accent" : "text-muted"}
                    >
                      {s.label}
                    </span>
                    <span className="tabular-nums text-faint">
                      {s.rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-app">
                    {fmtCompact(s.r.final)}
                  </div>
                  <div className="mt-1 font-mono text-[0.7rem] tabular-nums text-muted">
                    Earned {fmt(s.r.earned)}
                  </div>
                  {/* mini-bar */}
                  <div className="mt-3 h-1 overflow-hidden rounded bg-app-elevated">
                    <div
                      className="h-full bg-tool-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          (s.r.final /
                            Math.max(
                              ...scenarios.map((x) => x.r.final),
                              1
                            )) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Benchmarks */}
        <section className="mt-6 rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Benchmark returns
            </h2>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              Long-run context
            </span>
          </div>
          <ul className="divide-y divide-[color:var(--border)] font-mono text-xs">
            {BENCHMARKS.map((b) => (
              <li
                key={b.label}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-secondary">{b.label}</span>
                <span className="flex items-baseline gap-3">
                  <span className="tabular-nums text-app">
                    {b.rate.toFixed(1)}%
                  </span>
                  <span className="text-[0.55rem] text-faint">{b.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.6rem] leading-relaxed text-faint">
            Past performance is not a forecast. 95-year windows smooth out
            regimes you&apos;ll actually live through.
          </p>
        </section>

        <p className="mt-4 text-[0.65rem] leading-relaxed text-muted">
          Compounds at the chosen frequency. Monthly contributions are split
          across periods. Inflation toggle uses Fisher; tax toggle drags
          earnings each period. Ignores sequence-of-returns risk, fees, and
          behavioral drift.
        </p>

        {/* Local reveal animation */}
        <style jsx>{`
          .ci-fv-reveal {
            animation: ci-fv 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
          }
          @keyframes ci-fv {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          :global(.ci-curve-reveal) {
            stroke-dasharray: 200;
            stroke-dashoffset: 200;
            animation: ci-draw 900ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
          }
          @keyframes ci-draw {
            to {
              stroke-dashoffset: 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .ci-fv-reveal,
            :global(.ci-curve-reveal) {
              animation: none;
            }
          }
        `}</style>

        <ScenarioBar<Inputs>
          slug="compound-interest"
          state={inputs}
          onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
          exports={{
            csv: () =>
              toCsv([
                ["Year", "Contributions", "Balance"],
                ...result.snapshots.map((s) => [
                  s.year,
                  s.contributions.toFixed(2),
                  s.balance.toFixed(2),
                ]),
              ]),
            json: () => ({ inputs, effectiveRate, result }),
            markdown: () =>
              `# Compound growth\n\n- Principal: ${fmt(principal)}\n- Monthly: ${fmt(monthly)}\n- Rate: ${effectiveRate.toFixed(2)}% (${inputs.useReal ? "real" : "nominal"}${inputs.useTax ? ", after-tax" : ""})\n- Years: ${years}\n\n**Final:** ${fmt(result.final)} (contributed ${fmt(result.contributed)}, earned ${fmt(result.earned)})\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}
