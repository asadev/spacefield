"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// US federal income tax brackets 2024 / 2025 / 2026.
// 2024 source: IRS Rev. Proc. 2023-34. 2025 source: IRS Rev. Proc. 2024-40.
// 2026 projections are inflation-adjusted estimates (not yet published) —
// labeled as such. Amounts are bracket upper bounds; null = no upper bound.
type Bracket = { rate: number; upTo: number | null };

type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
type TaxYear = "2024" | "2025" | "2026";

const FEDERAL: Record<TaxYear, Record<FilingStatus, Bracket[]>> = {
  "2024": {
    single: [
      { rate: 0.10, upTo: 11600 },
      { rate: 0.12, upTo: 47150 },
      { rate: 0.22, upTo: 100525 },
      { rate: 0.24, upTo: 191950 },
      { rate: 0.32, upTo: 243725 },
      { rate: 0.35, upTo: 609350 },
      { rate: 0.37, upTo: null },
    ],
    mfj: [
      { rate: 0.10, upTo: 23200 },
      { rate: 0.12, upTo: 94300 },
      { rate: 0.22, upTo: 201050 },
      { rate: 0.24, upTo: 383900 },
      { rate: 0.32, upTo: 487450 },
      { rate: 0.35, upTo: 731200 },
      { rate: 0.37, upTo: null },
    ],
    mfs: [
      { rate: 0.10, upTo: 11600 },
      { rate: 0.12, upTo: 47150 },
      { rate: 0.22, upTo: 100525 },
      { rate: 0.24, upTo: 191950 },
      { rate: 0.32, upTo: 243725 },
      { rate: 0.35, upTo: 365600 },
      { rate: 0.37, upTo: null },
    ],
    hoh: [
      { rate: 0.10, upTo: 16550 },
      { rate: 0.12, upTo: 63100 },
      { rate: 0.22, upTo: 100500 },
      { rate: 0.24, upTo: 191950 },
      { rate: 0.32, upTo: 243700 },
      { rate: 0.35, upTo: 609350 },
      { rate: 0.37, upTo: null },
    ],
  },
  "2025": {
    single: [
      { rate: 0.10, upTo: 11925 },
      { rate: 0.12, upTo: 48475 },
      { rate: 0.22, upTo: 103350 },
      { rate: 0.24, upTo: 197300 },
      { rate: 0.32, upTo: 250525 },
      { rate: 0.35, upTo: 626350 },
      { rate: 0.37, upTo: null },
    ],
    mfj: [
      { rate: 0.10, upTo: 23850 },
      { rate: 0.12, upTo: 96950 },
      { rate: 0.22, upTo: 206700 },
      { rate: 0.24, upTo: 394600 },
      { rate: 0.32, upTo: 501050 },
      { rate: 0.35, upTo: 751600 },
      { rate: 0.37, upTo: null },
    ],
    mfs: [
      { rate: 0.10, upTo: 11925 },
      { rate: 0.12, upTo: 48475 },
      { rate: 0.22, upTo: 103350 },
      { rate: 0.24, upTo: 197300 },
      { rate: 0.32, upTo: 250525 },
      { rate: 0.35, upTo: 375800 },
      { rate: 0.37, upTo: null },
    ],
    hoh: [
      { rate: 0.10, upTo: 17000 },
      { rate: 0.12, upTo: 64850 },
      { rate: 0.22, upTo: 103350 },
      { rate: 0.24, upTo: 197300 },
      { rate: 0.32, upTo: 250500 },
      { rate: 0.35, upTo: 626350 },
      { rate: 0.37, upTo: null },
    ],
  },
  // 2026 = 2025 scaled 2.5% for inflation. Projection, not official.
  "2026": {
    single: [
      { rate: 0.10, upTo: 12225 },
      { rate: 0.12, upTo: 49685 },
      { rate: 0.22, upTo: 105935 },
      { rate: 0.24, upTo: 202235 },
      { rate: 0.32, upTo: 256790 },
      { rate: 0.35, upTo: 642010 },
      { rate: 0.37, upTo: null },
    ],
    mfj: [
      { rate: 0.10, upTo: 24445 },
      { rate: 0.12, upTo: 99375 },
      { rate: 0.22, upTo: 211870 },
      { rate: 0.24, upTo: 404465 },
      { rate: 0.32, upTo: 513575 },
      { rate: 0.35, upTo: 770390 },
      { rate: 0.37, upTo: null },
    ],
    mfs: [
      { rate: 0.10, upTo: 12225 },
      { rate: 0.12, upTo: 49685 },
      { rate: 0.22, upTo: 105935 },
      { rate: 0.24, upTo: 202235 },
      { rate: 0.32, upTo: 256790 },
      { rate: 0.35, upTo: 385195 },
      { rate: 0.37, upTo: null },
    ],
    hoh: [
      { rate: 0.10, upTo: 17425 },
      { rate: 0.12, upTo: 66470 },
      { rate: 0.22, upTo: 105935 },
      { rate: 0.24, upTo: 202235 },
      { rate: 0.32, upTo: 256765 },
      { rate: 0.35, upTo: 642010 },
      { rate: 0.37, upTo: null },
    ],
  },
};

// 2025 state income tax: rough simplified brackets/flat rates for top 6
// asked + zero-tax states. Source: state tax agencies, 2025 schedules.
interface StateScheme {
  label: string;
  // Flat rate in %, or tiered brackets in USD (single-filer simple model).
  flat?: number;
  tiers?: { upTo: number | null; rate: number }[];
  note: string;
}
const STATES: Record<string, StateScheme> = {
  none: { label: "None / no state tax", flat: 0, note: "TX, FL, NV, WA, WY, SD, AK, TN, NH" },
  ca: {
    label: "California (2025)",
    tiers: [
      { upTo: 10756, rate: 0.01 },
      { upTo: 25499, rate: 0.02 },
      { upTo: 40245, rate: 0.04 },
      { upTo: 55866, rate: 0.06 },
      { upTo: 70606, rate: 0.08 },
      { upTo: 360659, rate: 0.093 },
      { upTo: 432787, rate: 0.103 },
      { upTo: 721314, rate: 0.113 },
      { upTo: null, rate: 0.123 },
    ],
    note: "CA FTB 2025 single schedule; excludes 1% mental-health surtax >$1M",
  },
  ny: {
    label: "New York (2025)",
    tiers: [
      { upTo: 8500, rate: 0.04 },
      { upTo: 11700, rate: 0.045 },
      { upTo: 13900, rate: 0.0525 },
      { upTo: 80650, rate: 0.055 },
      { upTo: 215400, rate: 0.06 },
      { upTo: 1077550, rate: 0.0685 },
      { upTo: 5000000, rate: 0.0965 },
      { upTo: null, rate: 0.103 },
    ],
    note: "NY DTF 2025 single schedule; excludes NYC local tax",
  },
  tx: { label: "Texas", flat: 0, note: "No state income tax" },
  fl: { label: "Florida", flat: 0, note: "No state income tax" },
  il: {
    label: "Illinois (2025)",
    flat: 0.0495,
    note: "Flat 4.95% on net income",
  },
  pa: {
    label: "Pennsylvania (2025)",
    flat: 0.0307,
    note: "Flat 3.07% on most income",
  },
  co: {
    label: "Colorado (2025)",
    flat: 0.044,
    note: "Flat 4.4% (reduced from 4.55%)",
  },
};

const STATUS_LABEL: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
};

const FICA = { ssRate: 0.062, ssCap2025: 176100, medicareRate: 0.0145 };

function computeProgressive(income: number, brackets: Bracket[]) {
  let tax = 0;
  let prev = 0;
  let marginal = 0;
  const breakdown: {
    rate: number;
    from: number;
    to: number;
    taxable: number;
    tax: number;
  }[] = [];
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (income <= prev) {
      breakdown.push({ rate: b.rate, from: prev, to: top, taxable: 0, tax: 0 });
      prev = top;
      continue;
    }
    const taxable = Math.min(income, top) - prev;
    const bracketTax = taxable * b.rate;
    tax += bracketTax;
    marginal = b.rate;
    breakdown.push({ rate: b.rate, from: prev, to: top, taxable, tax: bracketTax });
    prev = top;
    if (income <= top) break;
  }
  return { tax, marginal, breakdown };
}

function computeState(income: number, s: StateScheme) {
  if (s.flat !== undefined) return income * s.flat;
  if (!s.tiers) return 0;
  let tax = 0;
  let prev = 0;
  for (const t of s.tiers) {
    const top = t.upTo ?? Infinity;
    if (income <= prev) break;
    const taxable = Math.min(income, top) - prev;
    tax += taxable * t.rate;
    prev = top;
    if (income <= top) break;
  }
  return tax;
}

function computeFica(income: number) {
  const ss = Math.min(income, FICA.ssCap2025) * FICA.ssRate;
  const medicare = income * FICA.medicareRate;
  return { ss, medicare, total: ss + medicare };
}

interface Inputs {
  income: string;
  status: FilingStatus;
  year: TaxYear;
  state: keyof typeof STATES;
  includeFica: boolean;
}

const DEFAULTS: Inputs = {
  income: "120000",
  status: "single",
  year: "2025",
  state: "none",
  includeFica: true,
};

// Finance ledger field input — uses app tokens, accent ring on focus.
const fieldInput =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

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
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-secondary">
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

// Segmented pill picker — `bg-tool-accent` for active, `bg-app-elevated` otherwise.
function SegmentedPills<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-app bg-app p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] transition-colors ${
              active
                ? "bg-tool-accent text-app-elevated"
                : "text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
            }`}
            style={active ? { color: "var(--bg)" } : undefined}
            title={opt.sub}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function TaxBracketCalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  const inc = parseFloat(inputs.income) || 0;
  const brackets = FEDERAL[inputs.year][inputs.status];
  const federal = useMemo(() => computeProgressive(inc, brackets), [inc, brackets]);
  const state = STATES[inputs.state];
  const stateTax = useMemo(() => computeState(inc, state), [inc, state]);
  const fica = useMemo(() => computeFica(inc), [inc]);

  const totalTax =
    federal.tax + stateTax + (inputs.includeFica ? fica.total : 0);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  const effective = inc > 0 ? totalTax / inc : 0;

  // Stacked-bar geometry: each bracket gets width proportional to taxable
  // amount in that bracket. Empty brackets sit beyond the income line.
  const stackTotal = federal.breakdown.reduce((s, b) => s + b.taxable, 0) || 1;
  const activeBrackets = federal.breakdown.filter((b) => b.taxable > 0);

  // Read --tool-accent from CSS at draw time so the stacked bar matches the
  // current tool theme; opacity steps fan the brackets out lightest → strongest.
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [accentRgb, setAccentRgb] = useState<string>("");
  useEffect(() => {
    if (!heroRef.current) return;
    const raw = getComputedStyle(heroRef.current)
      .getPropertyValue("--tool-accent")
      .trim();
    setAccentRgb(raw);
  }, [inputs.year, inputs.status]);

  const opacityForRate = (rate: number) => {
    // 0.10 → ~0.35, 0.37 → 1.00. Linear ramp across the federal scale.
    const lo = 0.1;
    const hi = 0.37;
    const t = Math.max(0, Math.min(1, (rate - lo) / (hi - lo)));
    return 0.35 + t * 0.6;
  };

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
    <ToolShell
      category="Finance"
      title="US Federal + State Tax Calculator (2024-2026)"
      description="Federal brackets for 2024, 2025, and projected 2026. State layer (CA, NY, TX, FL, IL, PA, CO). FICA optional. Marginal vs effective, full breakdown."
    >
      <div
        data-tool-theme="finance"
        data-tool="tax-bracket-calculator"
        className="space-y-6 text-app"
      >
        {/* ============================== MASTHEAD ============================== */}
        <header className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Tax planning
              </div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-app">
                Progressive Tax Bracket Visualizer
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Income laid across the federal ladder. State and FICA stacked on
                top. Marginal versus effective at a glance.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-app bg-app px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              TY {inputs.year} · {asOfStamp}
            </div>
          </div>
        </header>

        {/* ====================== TAX-DUE VERDICT HERO ====================== */}
        <section
          ref={heroRef}
          className="relative overflow-hidden rounded-xl border border-app bg-app-elevated px-6 py-8"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06] text-app"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Total tax due
                <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] font-semibold tracking-[0.15em] text-tool-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  {STATUS_LABEL[inputs.status]}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-7xl font-semibold tabular-nums leading-none tracking-tight text-tool-accent sm:text-8xl">
                  {fmt(totalTax)}
                </span>
                <span className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-tool-accent">
                  {(effective * 100).toFixed(2)}% eff.
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm text-secondary">
                Federal {fmt(federal.tax)} + state {fmt(stateTax)}
                {inputs.includeFica ? ` + FICA ${fmt(fica.total)}` : ""}.
                After-tax take-home{" "}
                <span className="font-semibold text-app">
                  {fmt(inc - totalTax)}
                </span>
                .
              </p>
            </div>

            <div className="grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border border-app bg-app font-mono text-sm sm:w-auto">
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Marginal rate
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-tool-accent">
                  {(federal.marginal * 100).toFixed(0)}%
                </div>
                <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Next $1 taxed at
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Effective rate
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-tool-accent">
                  {(effective * 100).toFixed(2)}%
                </div>
                <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Total tax / income
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Federal
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(federal.tax)}
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  State + FICA
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {fmt(stateTax + (inputs.includeFica ? fica.total : 0))}
                </div>
              </div>
            </div>
          </div>

          {/* Stacked bracket bar — visual ladder of where income falls */}
          {inc > 0 && activeBrackets.length > 0 && (
            <div className="relative mt-8">
              <div className="mb-2 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span>$0</span>
                <span>Your income · {fmt(inc)}</span>
              </div>
              <div className="flex h-7 w-full overflow-hidden rounded-lg border border-app bg-app">
                {activeBrackets.map((b, i) => {
                  const w = (b.taxable / stackTotal) * 100;
                  const isMarginal = b.rate === federal.marginal;
                  const op = opacityForRate(b.rate);
                  return (
                    <div
                      key={i}
                      className={`relative flex items-center justify-center ${
                        isMarginal ? "ring-2 ring-inset ring-tool-accent" : ""
                      }`}
                      style={{
                        width: `${w}%`,
                        backgroundColor: accentRgb || "var(--tool-accent)",
                        opacity: op,
                      }}
                      title={`${(b.rate * 100).toFixed(0)}% bracket · ${fmt(b.taxable)}`}
                    >
                      {w > 8 && (
                        <span className="font-mono text-[0.6rem] font-semibold text-app-elevated drop-shadow-sm" style={{ color: "var(--bg)" }}>
                          {(b.rate * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6rem] tabular-nums text-muted">
                {activeBrackets.map((b, i) => {
                  const isMarginal = b.rate === federal.marginal;
                  const op = opacityForRate(b.rate);
                  return (
                    <span key={i} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{
                          backgroundColor: accentRgb || "var(--tool-accent)",
                          opacity: op,
                        }}
                      />
                      <span
                        className={isMarginal ? "font-semibold text-tool-accent" : ""}
                      >
                        {(b.rate * 100).toFixed(0)}% · {fmt(b.taxable)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* =========== SEGMENTED PICKERS — YEAR & FILING STATUS =========== */}
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Tax year
              </div>
              <SegmentedPills<TaxYear>
                ariaLabel="Tax year"
                value={inputs.year}
                onChange={(v) => setInputs((s) => ({ ...s, year: v }))}
                options={[
                  { value: "2024", label: "2024", sub: "IRS Rev. Proc. 2023-34" },
                  { value: "2025", label: "2025", sub: "IRS Rev. Proc. 2024-40" },
                  { value: "2026", label: "2026", sub: "Projected" },
                ]}
              />
              <div className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                {inputs.year === "2026"
                  ? "Projected · 2025 scaled ~2.5%"
                  : inputs.year === "2025"
                  ? "IRS Rev. Proc. 2024-40"
                  : "IRS Rev. Proc. 2023-34"}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Filing status
              </div>
              <SegmentedPills<FilingStatus>
                ariaLabel="Filing status"
                value={inputs.status}
                onChange={(v) => setInputs((s) => ({ ...s, status: v }))}
                options={[
                  { value: "single", label: "Single" },
                  { value: "mfj", label: "MFJ" },
                  { value: "mfs", label: "MFS" },
                  { value: "hoh", label: "HoH" },
                ]}
              />
              <div className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                {STATUS_LABEL[inputs.status]}
              </div>
            </div>
          </div>
        </section>

        {/* ============== INPUTS PANEL + BRACKET BREAKDOWN ============== */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr]">
          {/* Return inputs panel */}
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Your return
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Inputs · USD
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="State">
                <select
                  value={inputs.state}
                  onChange={(e) =>
                    setInputs((s) => ({
                      ...s,
                      state: e.target.value as keyof typeof STATES,
                    }))
                  }
                  className={fieldInput}
                >
                  {Object.entries(STATES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </FinanceField>
              <FinanceField label="Taxable income" hint="after deductions">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
                    $
                  </span>
                  <input
                    type="number"
                    value={inputs.income}
                    onChange={(e) =>
                      setInputs((s) => ({ ...s, income: e.target.value }))
                    }
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="1000"
                  />
                </div>
              </FinanceField>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-app bg-app px-3 py-2 text-[0.7rem] text-secondary">
                <input
                  type="checkbox"
                  checked={inputs.includeFica}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, includeFica: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 accent-[var(--tool-accent)]"
                />
                Include FICA (SS 6.2% to cap + Medicare 1.45%)
              </label>
            </div>

            {/* Stat ledger */}
            <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
              <div className="flex items-center justify-between bg-app-elevated px-3 py-2">
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Federal ({inputs.year})
                </span>
                <span className="tabular-nums font-semibold text-tool-accent">
                  {fmt(federal.tax)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-app-elevated px-3 py-2">
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  State
                </span>
                <span className="tabular-nums text-app">{fmt(stateTax)}</span>
              </div>
              {inputs.includeFica && (
                <div className="flex items-center justify-between bg-app-elevated px-3 py-2">
                  <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    FICA (SS + Medicare)
                  </span>
                  <span className="tabular-nums text-app">{fmt(fica.total)}</span>
                </div>
              )}
              <div className="flex items-center justify-between bg-app-elevated px-3 py-2">
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Total tax
                </span>
                <span className="tabular-nums font-semibold text-app">
                  {fmt(totalTax)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-app-elevated px-3 py-2">
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  After-tax income
                </span>
                <span className="tabular-nums font-semibold text-tool-accent">
                  {fmt(inc - totalTax)}
                </span>
              </div>
            </div>
          </div>

          {/* Bracket breakdown ledger */}
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                  Bracket breakdown
                </h2>
                <p className="mt-0.5 text-[0.7rem] text-muted">
                  Federal {inputs.year} · {STATUS_LABEL[inputs.status]}
                </p>
              </div>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Progressive
              </span>
            </div>

            <div className="grid grid-cols-[3.5rem_1fr_7rem_7rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              <span>Rate</span>
              <span>Range</span>
              <span className="text-right">In bracket</span>
              <span className="text-right">Tax</span>
            </div>

            <div className="mt-2 space-y-1">
              {federal.breakdown.map((b, i) => {
                const active = b.taxable > 0;
                const isMarginal = b.rate === federal.marginal && active;
                const fillPct = stackTotal > 0 ? (b.taxable / stackTotal) * 100 : 0;
                const op = opacityForRate(b.rate);
                return (
                  <div
                    key={i}
                    className={`relative grid grid-cols-[3.5rem_1fr_7rem_7rem] items-center gap-2 rounded-lg px-2 py-2 font-mono text-xs transition-colors ${
                      active ? "text-app" : "text-faint"
                    } ${
                      isMarginal
                        ? "bg-tool-accent-soft ring-1 ring-tool-accent"
                        : active
                        ? "bg-app"
                        : ""
                    }`}
                  >
                    <span>
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6rem] font-semibold ${
                          active
                            ? "border-tool-accent text-tool-accent"
                            : "border-app text-faint"
                        }`}
                        style={
                          active
                            ? {
                                backgroundColor: accentRgb
                                  ? `color-mix(in srgb, ${accentRgb} ${Math.round(op * 25)}%, transparent)`
                                  : undefined,
                              }
                            : undefined
                        }
                      >
                        {(b.rate * 100).toFixed(0)}%
                      </span>
                    </span>
                    <span className="truncate text-[0.7rem] tabular-nums text-secondary">
                      {fmt(b.from)} – {b.to === Infinity ? "∞" : fmt(b.to)}
                    </span>
                    <span className="text-right tabular-nums">
                      {active ? fmt(b.taxable) : "—"}
                    </span>
                    <span
                      className={`text-right font-semibold tabular-nums ${
                        active ? "text-tool-accent" : ""
                      }`}
                    >
                      {active ? fmt(b.tax) : "—"}
                    </span>
                    {active && (
                      <div
                        aria-hidden
                        className="absolute bottom-0 left-2 h-[2px] rounded-full bg-tool-accent"
                        style={{
                          width: `calc(${Math.max(fillPct, 4)}% - 1rem)`,
                          opacity: op,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-dashed border-app pt-3 font-mono text-xs">
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Total federal tax
              </span>
              <span className="tabular-nums text-base font-semibold text-tool-accent">
                {fmt(federal.tax)}
              </span>
            </div>

            {state.flat !== undefined && state.flat > 0 && (
              <div className="mt-4 rounded-lg border border-dashed border-app bg-app px-3 py-2 font-mono text-[0.65rem] text-secondary">
                <span className="text-faint">State //</span>{" "}
                {state.label}: flat {(state.flat * 100).toFixed(2)}% ={" "}
                <span className="font-semibold tabular-nums text-app">
                  {fmt(stateTax)}
                </span>
                . {state.note}.
              </div>
            )}
            {state.tiers && (
              <div className="mt-4 rounded-lg border border-dashed border-app bg-app px-3 py-2 font-mono text-[0.65rem] text-secondary">
                <span className="text-faint">State //</span>{" "}
                {state.label}: progressive. Effective state rate{" "}
                <span className="font-semibold tabular-nums text-app">
                  {(inc > 0 ? (stateTax / inc) * 100 : 0).toFixed(2)}%
                </span>
                . {state.note}.
              </div>
            )}

            <p className="mt-5 text-[0.6rem] leading-relaxed text-faint">
              2024 = IRS Rev. Proc. 2023-34. 2025 = IRS Rev. Proc. 2024-40. 2026
              projection (not yet published) = 2025 scaled ~2.5% for inflation.
              Simplified: excludes AMT, credits (child, EITC, premium), QBI,
              capital-gains rates, city/local tax, itemized vs standard tradeoff.
              Use for planning, not filing.
            </p>
          </div>
        </section>
      </div>

      <ScenarioBar<Inputs>
        slug="tax-bracket-calculator"
        state={inputs}
        onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Rate", "From", "To", "Taxable", "Tax"],
              ...federal.breakdown.map((b) => [
                `${(b.rate * 100).toFixed(0)}%`,
                b.from,
                b.to === Infinity ? "∞" : b.to,
                b.taxable.toFixed(2),
                b.tax.toFixed(2),
              ]),
              [],
              ["Federal", federal.tax.toFixed(2)],
              ["State", stateTax.toFixed(2)],
              ["FICA", fica.total.toFixed(2)],
              ["Total", totalTax.toFixed(2)],
            ]),
          json: () => ({ inputs, federal, stateTax, fica, totalTax }),
          markdown: () =>
            `# Tax summary ${inputs.year}\n\n- Status: ${STATUS_LABEL[inputs.status]}\n- Income: ${fmt(inc)}\n- State: ${state.label}\n\n| | Amount |\n|---|---|\n| Federal | ${fmt(federal.tax)} |\n| State | ${fmt(stateTax)} |\n| FICA | ${fmt(fica.total)} |\n| **Total** | **${fmt(totalTax)}** |\n| Effective | ${(effective * 100).toFixed(2)}% |\n| After-tax | ${fmt(inc - totalTax)} |\n`,
        }}
      />
    </ToolShell>
  );
}
