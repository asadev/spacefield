"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface CashFlow {
  id: string;
  value: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// NPV = sum( CF_t / (1+r)^t ), t = 0..n (initial investment is CF_0 and typically negative).
function computeNPV(cashflows: number[], rate: number) {
  let npv = 0;
  for (let t = 0; t < cashflows.length; t++) {
    npv += cashflows[t] / Math.pow(1 + rate, t);
  }
  return npv;
}

// Newton-Raphson IRR. Derivative: dNPV/dr = sum( -t * CF_t / (1+r)^(t+1) ).
function computeIRR(cashflows: number[]): number | null {
  // Need at least one sign change for an IRR to exist.
  let pos = false;
  let neg = false;
  for (const c of cashflows) {
    if (c > 0) pos = true;
    if (c < 0) neg = true;
  }
  if (!pos || !neg) return null;

  let r = 0.1;
  for (let i = 0; i < 80; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const factor = Math.pow(1 + r, t);
      npv += cashflows[t] / factor;
      if (t > 0) dnpv += (-t * cashflows[t]) / Math.pow(1 + r, t + 1);
    }
    if (Math.abs(dnpv) < 1e-10) break;
    const next = r - npv / dnpv;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-8) {
      r = next;
      break;
    }
    // Keep r sensible (-99% to 10000%).
    if (next < -0.99) r = -0.99 + 0.01;
    else if (next > 100) r = 100;
    else r = next;
  }

  // Validate by re-computing NPV at the result.
  const check = computeNPV(cashflows, r);
  if (!isFinite(r) || Math.abs(check) > 1) return null;
  return r;
}

// Modified IRR — reinvestment rate vs finance rate. More realistic than
// vanilla IRR because it separates "cost of capital" from "return on
// reinvested positive cash flows".
function computeMIRR(cashflows: number[], financeRate: number, reinvestRate: number): number | null {
  const n = cashflows.length - 1;
  if (n <= 0) return null;
  let pvNeg = 0;
  let fvPos = 0;
  for (let t = 0; t < cashflows.length; t++) {
    if (cashflows[t] < 0) pvNeg += cashflows[t] / Math.pow(1 + financeRate, t);
    else fvPos += cashflows[t] * Math.pow(1 + reinvestRate, n - t);
  }
  if (pvNeg === 0 || fvPos <= 0) return null;
  const mirr = Math.pow(-fvPos / pvNeg, 1 / n) - 1;
  return isFinite(mirr) ? mirr : null;
}

// Discounted payback: time for cumulative discounted cash flows to turn
// positive. Fraction of year for partial recovery.
function discountedPayback(cashflows: number[], rate: number) {
  let cumulative = 0;
  for (let t = 0; t < cashflows.length; t++) {
    const pv = cashflows[t] / Math.pow(1 + rate, t);
    const prev = cumulative;
    cumulative += pv;
    if (cumulative >= 0 && t > 0) {
      if (pv === 0) return t;
      return t - 1 + -prev / pv;
    }
  }
  return null;
}

function paybackPeriod(cashflows: number[]) {
  let cumulative = 0;
  for (let t = 0; t < cashflows.length; t++) {
    cumulative += cashflows[t];
    if (cumulative >= 0 && t > 0) {
      const prev = cumulative - cashflows[t];
      if (cashflows[t] === 0) return t;
      return t - 1 + -prev / cashflows[t];
    }
  }
  return null;
}

interface Inputs {
  initial: string;
  rate: string;
  financeRate: string;
  reinvestRate: string;
  flows: CashFlow[];
}

const DEFAULTS: Inputs = {
  initial: "-100000",
  rate: "10",
  financeRate: "8",
  reinvestRate: "10",
  flows: [
    { id: "f1", value: "25000" },
    { id: "f2", value: "30000" },
    { id: "f3", value: "35000" },
    { id: "f4", value: "40000" },
    { id: "f5", value: "45000" },
  ],
};

type Mode = "npv" | "irr" | "mirr" | "payback";

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

export default function NpvIrrPage() {
  const [state, setState] = useState<Inputs>(DEFAULTS);
  const [mode, setMode] = useState<Mode>("npv");

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setState({ ...DEFAULTS, ...shared });
  }, []);
  const { initial, rate, flows } = state;
  const setInitial = (v: string) => setState((s) => ({ ...s, initial: v }));
  const setRate = (v: string) => setState((s) => ({ ...s, rate: v }));
  const setFlows = (updater: (p: CashFlow[]) => CashFlow[]) =>
    setState((s) => ({ ...s, flows: updater(s.flows) }));

  const cashflows = useMemo(() => {
    return [parseFloat(initial) || 0, ...flows.map((f) => parseFloat(f.value) || 0)];
  }, [initial, flows]);

  const discountRate = (parseFloat(rate) || 0) / 100;

  const npv = useMemo(() => computeNPV(cashflows, discountRate), [cashflows, discountRate]);
  const irr = useMemo(() => computeIRR(cashflows), [cashflows]);
  const payback = useMemo(() => paybackPeriod(cashflows), [cashflows]);
  const dpb = useMemo(
    () => discountedPayback(cashflows, discountRate),
    [cashflows, discountRate]
  );
  const mirr = useMemo(
    () =>
      computeMIRR(
        cashflows,
        (parseFloat(state.financeRate) || 0) / 100,
        (parseFloat(state.reinvestRate) || 0) / 100
      ),
    [cashflows, state.financeRate, state.reinvestRate]
  );

  // Profitability index = PV of future flows / |initial outlay|
  const pi = useMemo(() => {
    if (cashflows.length < 2) return 0;
    const outlay = Math.abs(cashflows[0]);
    if (outlay === 0) return 0;
    const pvFuture = cashflows.slice(1).reduce((s, cf, i) => s + cf / Math.pow(1 + discountRate, i + 1), 0);
    return pvFuture / outlay;
  }, [cashflows, discountRate]);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const addFlow = () => setFlows((p) => [...p, { id: uid(), value: "0" }]);
  const removeFlow = (id: string) => setFlows((p) => p.filter((f) => f.id !== id));
  const updateFlow = (id: string, value: string) =>
    setFlows((p) => p.map((f) => (f.id === id ? { ...f, value } : f)));

  const verdict =
    npv > 0 && pi > 1
      ? { label: "Accept", tone: "good" as const, reason: "Positive NPV and PI > 1 — project creates value at this hurdle rate." }
      : npv < 0
      ? { label: "Reject", tone: "bad" as const, reason: "Negative NPV at this discount rate — project destroys value." }
      : { label: "Marginal", tone: "mid" as const, reason: "NPV close to zero — decision depends on strategic factors beyond cash flows." };

  const verdictClasses = {
    good: {
      border: "border-tool-accent",
      chip: "bg-tool-accent-soft text-tool-accent border-tool-accent",
      dot: "bg-tool-accent",
      number: "text-tool-accent",
    },
    mid: {
      border: "border-amber-500/40",
      chip: "bg-amber-500/10 text-amber-500 border-amber-500/40",
      dot: "bg-amber-500",
      number: "text-amber-500",
    },
    bad: {
      border: "border-rose-500/40",
      chip: "bg-rose-500/10 text-rose-500 border-rose-500/40",
      dot: "bg-rose-500",
      number: "text-rose-500",
    },
  }[verdict.tone];

  const irrClasses =
    irr === null
      ? "text-faint"
      : irr >= discountRate
      ? "text-tool-accent"
      : "text-rose-500";

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  // Sensitivity sweep
  const sweep = [0, 5, 8, 10, 12, 15, 20, 25];

  // NPV-vs-rate chart points (0% .. 40% in 1% steps)
  const chartPoints = useMemo(() => {
    const pts: { r: number; v: number }[] = [];
    for (let r = 0; r <= 40; r += 1) {
      pts.push({ r, v: computeNPV(cashflows, r / 100) });
    }
    return pts;
  }, [cashflows]);

  return (
    <ToolShell
      category="Finance"
      title="NPV & IRR Calculator"
      description="Discounted cash flow for any project. NPV, IRR via Newton's method, payback, profitability index — the full DCF kit."
    >
      <div
        data-tool-theme="finance"
        data-tool="npv-irr"
        className="space-y-6 text-app"
      >
        {/* In-tool header */}
        <header className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Capital Budgeting
              </div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-app">
                NPV &amp; IRR
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Year-by-year DCF. Pull the discount rate, watch the verdict flip.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-app bg-app px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>

          {/* Mode tab strip — segmented pills */}
          <div className="mt-5 inline-flex overflow-hidden rounded-lg border border-app bg-app">
            {(
              [
                { k: "npv", label: "NPV" },
                { k: "irr", label: "IRR" },
                { k: "mirr", label: "MIRR" },
                { k: "payback", label: "Payback" },
              ] as { k: Mode; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={`px-3.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                  mode === t.k
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={mode === t.k ? { color: "var(--bg)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {/* Hero numbers — NPV $ + IRR % chip */}
        <section
          className={`relative overflow-hidden rounded-xl border bg-app-elevated px-6 py-8 ${verdictClasses.border}`}
        >
          {/* Faint ledger grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-8">
            <div>
              <div className="mb-3 flex items-center gap-2 font-mono text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Net present value
                <span
                  className={`ml-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold tracking-[0.15em] ${verdictClasses.chip}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${verdictClasses.dot}`} />
                  {verdict.label}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span
                  className={`font-mono text-6xl font-semibold tabular-nums leading-none tracking-tight sm:text-7xl ${verdictClasses.number}`}
                >
                  {fmt(npv)}
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm text-secondary">
                {verdict.reason}
              </p>
            </div>

            <div className="flex flex-col items-start gap-1">
              <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Internal rate of return
              </span>
              <span
                className={`inline-flex items-baseline gap-1 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight sm:text-6xl ${irrClasses}`}
              >
                {irr !== null ? (irr * 100).toFixed(2) + "%" : "—"}
              </span>
              <span className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
                vs hurdle {(discountRate * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Secondary metrics ledger */}
          <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app sm:grid-cols-4">
            <div className="bg-app-elevated p-3">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                MIRR
              </div>
              <div className="mt-1 font-mono tabular-nums text-app">
                {mirr !== null ? (mirr * 100).toFixed(2) + "%" : "—"}
              </div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Profitability idx
              </div>
              <div className="mt-1 font-mono tabular-nums text-app">
                {pi.toFixed(2)}
              </div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Payback
              </div>
              <div className="mt-1 font-mono tabular-nums text-app">
                {payback !== null ? payback.toFixed(2) + " yrs" : "Never"}
              </div>
            </div>
            <div className="bg-app-elevated p-3">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Disc. payback
              </div>
              <div className="mt-1 font-mono tabular-nums text-app">
                {dpb !== null ? dpb.toFixed(2) + " yrs" : "Never"}
              </div>
            </div>
          </div>
        </section>

        {/* Discount rate slider — front and center (always visible) */}
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                Discount rate
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Hurdle rate / cost of capital. Drag to stress-test the verdict.
              </p>
            </div>
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-4xl font-semibold tabular-nums text-tool-accent">
                {(parseFloat(rate) || 0).toFixed(1)}
              </span>
              <span className="text-lg tabular-nums text-muted">%</span>
            </div>
          </div>
          <div className="mt-4">
            <input
              type="range"
              min="0"
              max="40"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full accent-tool-accent"
            />
            <div className="mt-1 flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              <span>0%</span>
              <span>10%</span>
              <span>20%</span>
              <span>30%</span>
              <span>40%</span>
            </div>
          </div>
        </section>

        {/* Cash flow ledger */}
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                Cash flow ledger
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Year 0 is the outlay. Future years compound discounting at {(discountRate * 100).toFixed(1)}%.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-tool-accent" /> Inflow PV
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 bg-rose-500/70" /> Outflow PV
              </span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[3rem_1fr_minmax(0,1.4fr)_8rem_2rem] gap-3 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            <span>Year</span>
            <span>Cash flow</span>
            <span>PV bar</span>
            <span className="text-right">Present value</span>
            <span />
          </div>

          {/* Year 0 — initial outlay (special row, always tinted) */}
          <div className="mt-2 space-y-0.5">
            <div className="grid grid-cols-[3rem_1fr_minmax(0,1.4fr)_8rem_2rem] items-center gap-3 rounded-md bg-tool-accent-soft px-2 py-1.5">
              <span className="font-mono text-xs tabular-nums text-tool-accent">
                Y0
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                  $
                </span>
                <input
                  type="number"
                  value={initial}
                  onChange={(e) => setInitial(e.target.value)}
                  className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                  step="1000"
                />
              </div>
              <PVBar
                pv={cashflows[0]}
                peak={Math.max(
                  1,
                  ...cashflows.map((c, i) => Math.abs(c / Math.pow(1 + discountRate, i)))
                )}
              />
              <span
                className={`text-right font-mono text-sm tabular-nums ${
                  cashflows[0] >= 0 ? "text-app" : "text-rose-500"
                }`}
              >
                {fmt(cashflows[0])}
              </span>
              <span />
            </div>

            {/* Future cash flows — alternating row tints */}
            {flows.map((f, i) => {
              const cf = parseFloat(f.value) || 0;
              const t = i + 1;
              const pv = cf / Math.pow(1 + discountRate, t);
              const peak = Math.max(
                1,
                ...cashflows.map((c, idx) => Math.abs(c / Math.pow(1 + discountRate, idx)))
              );
              return (
                <div
                  key={f.id}
                  className={`grid grid-cols-[3rem_1fr_minmax(0,1.4fr)_8rem_2rem] items-center gap-3 rounded-md px-2 py-1 ${
                    i % 2 === 0 ? "bg-app/40" : ""
                  }`}
                >
                  <span className="font-mono text-xs tabular-nums text-muted">
                    Y{t}
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-faint">
                      $
                    </span>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => updateFlow(f.id, e.target.value)}
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                      step="1000"
                    />
                  </div>
                  <PVBar pv={pv} peak={peak} />
                  <span
                    className={`text-right font-mono text-sm tabular-nums ${
                      pv >= 0 ? "text-app" : "text-rose-500"
                    }`}
                  >
                    {fmt(pv)}
                  </span>
                  <button
                    onClick={() => removeFlow(f.id)}
                    className="rounded-md border border-transparent text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    aria-label={`Remove year ${t}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={addFlow}
            className="mt-3 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            style={{ ["--hover-color" as string]: "var(--bg)" }}
          >
            + Add year
          </button>
        </section>

        {/* MIRR rates panel */}
        {(mode === "mirr" || mode === "npv") && (
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                MIRR assumptions
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Modified IRR · split rates
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FinanceField label="Finance rate" hint="cost of capital">
                <div className="relative">
                  <input
                    type="number"
                    value={state.financeRate}
                    onChange={(e) => setState((s) => ({ ...s, financeRate: e.target.value }))}
                    className={fieldInput + " pr-7"}
                    step="0.1"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    %
                  </span>
                </div>
              </FinanceField>
              <FinanceField label="Reinvest rate" hint="cash redeployment">
                <div className="relative">
                  <input
                    type="number"
                    value={state.reinvestRate}
                    onChange={(e) => setState((s) => ({ ...s, reinvestRate: e.target.value }))}
                    className={fieldInput + " pr-7"}
                    step="0.1"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    %
                  </span>
                </div>
              </FinanceField>
            </div>
          </section>
        )}

        {/* NPV-vs-rate chart */}
        <NpvCurveChart
          points={chartPoints}
          currentRate={parseFloat(rate) || 0}
          irr={irr}
        />

        {/* Sensitivity sweep */}
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
              NPV sensitivity
            </h2>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              Discount rate sweep
            </span>
          </div>

          <div className="grid grid-cols-[5rem_1fr_8rem_5rem] gap-3 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            <span>Rate</span>
            <span>Magnitude</span>
            <span className="text-right">NPV</span>
            <span className="text-right">Verdict</span>
          </div>

          <div className="mt-2 space-y-0.5 font-mono text-xs">
            {(() => {
              const values = sweep.map((r) => computeNPV(cashflows, r / 100));
              const peak = Math.max(1, ...values.map((v) => Math.abs(v)));
              return sweep.map((r, idx) => {
                const v = values[idx];
                const positive = v >= 0;
                const pct = (Math.abs(v) / peak) * 50;
                const isCurrent = Math.abs(r - (parseFloat(rate) || 0)) < 0.01;
                return (
                  <div
                    key={r}
                    className={`grid grid-cols-[5rem_1fr_8rem_5rem] items-center gap-3 rounded-md px-2 py-1 transition-colors ${
                      isCurrent
                        ? "bg-tool-accent-soft text-tool-accent"
                        : idx % 2 === 0
                        ? "bg-app/40 text-secondary"
                        : "text-secondary"
                    }`}
                  >
                    <span className="tabular-nums">
                      {isCurrent && <span className="mr-1">▸</span>}
                      {r}%
                    </span>
                    <div className="relative h-3.5 overflow-hidden rounded bg-app">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-app" />
                      {positive ? (
                        <div
                          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-tool-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div
                          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-rose-500/70"
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`text-right tabular-nums ${
                        positive ? "text-app" : "text-rose-500"
                      }`}
                    >
                      {fmt(v)}
                    </span>
                    <span
                      className={`text-right text-[0.6rem] uppercase tracking-[0.15em] ${
                        positive ? "text-tool-accent" : "text-rose-500"
                      }`}
                    >
                      {positive ? "Accept" : "Reject"}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          <p className="mt-4 text-[0.6rem] leading-relaxed text-muted">
            Hurdle benchmarks: early-stage VC 25-40%, growth PE 15-20%, infrastructure 6-9%, corporate WACC 8-12%.
            Capital rationing: when budget is limited, rank by profitability index, not NPV.
          </p>
        </section>

        <p className="text-[0.65rem] leading-relaxed text-muted">
          NPV uses standard DCF. IRR is solved via Newton-Raphson — multiple sign changes can yield multiple IRRs, in which
          case the tool shows &quot;—&quot;. MIRR resolves that by separating cost-of-capital from reinvestment assumptions.
          Profitability index = PV(future flows) ÷ |initial outlay|.
        </p>
      </div>

      <ScenarioBar<Inputs>
        slug="npv-irr"
        state={state}
        onLoad={(d) => setState({ ...DEFAULTS, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Year", "Cash flow", "PV"],
              ...cashflows.map((cf, t) => [
                t,
                cf.toFixed(2),
                (cf / Math.pow(1 + discountRate, t)).toFixed(2),
              ]),
              [],
              ["NPV", npv.toFixed(2)],
              ["IRR", irr !== null ? (irr * 100).toFixed(4) + "%" : "n/a"],
              ["MIRR", mirr !== null ? (mirr * 100).toFixed(4) + "%" : "n/a"],
              ["Profitability index", pi.toFixed(3)],
            ]),
          json: () => ({ state, npv, irr, mirr, pi, payback, dpb }),
          markdown: () =>
            `# NPV / IRR\n\n- Discount rate: ${rate}%\n- NPV: **${fmt(npv)}**\n- IRR: ${irr !== null ? (irr * 100).toFixed(2) + "%" : "—"}\n- MIRR: ${mirr !== null ? (mirr * 100).toFixed(2) + "%" : "—"}\n- Payback: ${payback !== null ? payback.toFixed(2) + " yrs" : "—"}\n- Discounted payback: ${dpb !== null ? dpb.toFixed(2) + " yrs" : "—"}\n- Profitability index: ${pi.toFixed(2)}\n\nVerdict: ${verdict.label}\n`,
        }}
      />
    </ToolShell>
  );
}

function PVBar({ pv, peak }: { pv: number; peak: number }) {
  const pct = (Math.abs(pv) / peak) * 50;
  const positive = pv >= 0;
  return (
    <div className="relative h-3.5 overflow-hidden rounded bg-app">
      <div className="absolute left-1/2 top-0 h-full w-px bg-app" />
      {positive ? (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-tool-accent/70"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-rose-500/70"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

// NPV vs discount-rate curve. Reads --tool-accent at draw time so the line
// matches the active tool theme.
function NpvCurveChart({
  points,
  currentRate,
  irr,
}: {
  points: { r: number; v: number }[];
  currentRate: number;
  irr: number | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cs = getComputedStyle(canvas);
    const accent = cs.getPropertyValue("--tool-accent").trim() || "#7c3aed";
    const border = cs.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
    const muted = cs.getPropertyValue("--text-muted").trim() || "#888";

    const pad = { l: 36, r: 12, t: 12, b: 22 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const xs = points.map((p) => p.r);
    const ys = points.map((p) => p.v);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(0, ...ys);
    const yMax = Math.max(0, ...ys);
    const yRange = yMax - yMin || 1;

    const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const sy = (y: number) => pad.t + (1 - (y - yMin) / yRange) * innerH;

    // grid + axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * innerH;
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + innerW, y);
    }
    ctx.stroke();

    // zero line
    if (yMin < 0 && yMax > 0) {
      const zy = sy(0);
      ctx.strokeStyle = muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, zy);
      ctx.lineTo(pad.l + innerW, zy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // curve fill
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = sx(p.r);
      const y = sy(p.v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = sx(points[points.length - 1].r);
    const firstX = sx(points[0].r);
    const zeroY = sy(0);
    ctx.lineTo(lastX, zeroY);
    ctx.lineTo(firstX, zeroY);
    ctx.closePath();
    ctx.fillStyle = accent + "22";
    ctx.fill();

    // curve line
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = sx(p.r);
      const y = sy(p.v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // current rate marker
    const cx = sx(currentRate);
    ctx.strokeStyle = accent;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, pad.t);
    ctx.lineTo(cx, pad.t + innerH);
    ctx.stroke();
    ctx.setLineDash([]);

    // current dot
    const currentNpv =
      points.find((p) => p.r === Math.round(currentRate))?.v ?? points[0].v;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, sy(currentNpv), 3.5, 0, Math.PI * 2);
    ctx.fill();

    // IRR marker (where curve crosses zero)
    if (irr !== null && irr * 100 >= xMin && irr * 100 <= xMax) {
      const ix = sx(irr * 100);
      ctx.strokeStyle = muted;
      ctx.setLineDash([1, 2]);
      ctx.beginPath();
      ctx.moveTo(ix, pad.t);
      ctx.lineTo(ix, pad.t + innerH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = muted;
      ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`IRR ${(irr * 100).toFixed(1)}%`, ix + 4, pad.t + 10);
    }

    // x-axis labels
    ctx.fillStyle = muted;
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    [0, 10, 20, 30, 40].forEach((r) => {
      ctx.fillText(`${r}%`, sx(r), h - 6);
    });

    // y-axis labels (top, mid, bottom)
    ctx.textAlign = "right";
    const fmtShort = (n: number) => {
      const a = Math.abs(n);
      if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (a >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
      return n.toFixed(0);
    };
    ctx.fillText(fmtShort(yMax), pad.l - 4, pad.t + 10);
    ctx.fillText(fmtShort(yMin), pad.l - 4, pad.t + innerH);
  }, [points, currentRate, irr]);

  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
          NPV vs discount rate
        </h2>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          0% — 40% sweep · IRR = zero crossing
        </span>
      </div>
      <div className="relative h-48 w-full overflow-hidden rounded-lg border border-app bg-app">
        <canvas ref={ref} className="h-full w-full" />
      </div>
    </section>
  );
}
