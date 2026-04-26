"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface Tier {
  id: string;
  name: string;
  price: string;
  mix: string; // % of customers
  churn: string; // monthly %
}

const LS_KEY = "solutions:subscription-ltv-advanced:v1";
const HORIZON_MONTHS = 60;

interface State {
  arpu: string; // monthly $
  grossMargin: string; // %
  monthlyChurn: string; // % logo churn
  expansion: string; // % MRR expansion
  contraction: string; // % MRR contraction
  annualDiscount: string; // %
}

const defaultState: State = {
  arpu: "300",
  grossMargin: "80",
  monthlyChurn: "2",
  expansion: "1.5",
  contraction: "0.5",
  annualDiscount: "10",
};

// Local field shell — finance-themed input wrapper.
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
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[0.55rem] tabular-nums text-muted">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-sm tabular-nums text-app placeholder:text-muted transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent";

// Sub-tab state-button — shared switcher pattern across the page.
type LowerTab = "payback" | "sensitivity" | "tiers";

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

export default function SubscriptionLtvPage() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [lowerTab, setLowerTab] = useState<LowerTab>("payback");

  const [tiers, setTiers] = useState<Tier[]>([
    { id: "t1", name: "Starter", price: "49", mix: "60", churn: "3" },
    { id: "t2", name: "Pro", price: "199", mix: "30", churn: "2" },
    { id: "t3", name: "Enterprise", price: "999", mix: "10", churn: "0.8" },
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
      const rawT = localStorage.getItem("solutions:subscription-ltv-advanced:tiers:v1");
      if (rawT) {
        const parsed = JSON.parse(rawT);
        if (Array.isArray(parsed)) setTiers(parsed);
      }
    } catch {}
    const shared = readShareState<State & { tiers?: Tier[] }>();
    if (shared) {
      setState({ ...defaultState, ...shared });
      if (shared.tiers) setTiers(shared.tiers);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        "solutions:subscription-ltv-advanced:tiers:v1",
        JSON.stringify(tiers)
      );
    } catch {}
  }, [tiers, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const model = useMemo(() => {
    const arpu = parseFloat(state.arpu) || 0;
    const gm = (parseFloat(state.grossMargin) || 0) / 100;
    const churn = (parseFloat(state.monthlyChurn) || 0) / 100;
    const exp = (parseFloat(state.expansion) || 0) / 100;
    const contr = (parseFloat(state.contraction) || 0) / 100;
    const annualR = (parseFloat(state.annualDiscount) || 0) / 100;
    const monthlyR = Math.pow(1 + annualR, 1 / 12) - 1;

    // Net expansion rate per month (applied to revenue of surviving cohort)
    const netExpansion = exp - contr;

    // Simple closed-form when no expansion: LTV_gross = arpu / churn
    // With expansion (net), use recursive: LTV_disc = Σ arpu * gm * retention_t * (1+netExp)^t / (1+r)^t
    // retention_t = (1 - churn)^t

    const schedule: {
      month: number;
      retention: number;
      revenue: number;
      contrib: number; // gross-margin contribution
      discFactor: number;
      pv: number;
    }[] = [];
    let cumulativePV = 0;
    const yearMarks: { year: number; cumPV: number }[] = [];
    for (let t = 1; t <= HORIZON_MONTHS; t++) {
      const retention = Math.pow(1 - churn, t);
      const revPerCust = arpu * Math.pow(1 + netExpansion, t - 1);
      const revenue = revPerCust * retention;
      const contrib = revenue * gm;
      const discFactor = Math.pow(1 + monthlyR, t);
      const pv = contrib / discFactor;
      cumulativePV += pv;
      schedule.push({ month: t, retention, revenue, contrib, discFactor, pv });
      if (t % 12 === 0) yearMarks.push({ year: t / 12, cumPV: cumulativePV });
    }

    // Undiscounted simple LTV comparison
    const simpleLtv = churn > 0 ? (arpu * gm) / churn : 0;

    return {
      schedule,
      discountedLtv: cumulativePV,
      simpleLtv,
      yearMarks,
      avgLifetime: churn > 0 ? 1 / churn : 0,
    };
  }, [state]);

  // Sensitivity to churn ±50%
  const churnBase = parseFloat(state.monthlyChurn) || 0;
  const churnSteps = [-50, -25, 0, 25, 50, 100].map((pct) =>
    Math.max(0.01, (churnBase * (100 + pct)) / 100)
  );
  const sensitivity = churnSteps.map((c) => {
    const arpu = parseFloat(state.arpu) || 0;
    const gm = (parseFloat(state.grossMargin) || 0) / 100;
    const exp = (parseFloat(state.expansion) || 0) / 100;
    const contr = (parseFloat(state.contraction) || 0) / 100;
    const r = Math.pow(1 + (parseFloat(state.annualDiscount) || 0) / 100, 1 / 12) - 1;
    const netExp = exp - contr;
    const cDec = c / 100;
    let sum = 0;
    for (let t = 1; t <= HORIZON_MONTHS; t++) {
      const ret = Math.pow(1 - cDec, t);
      const rev = arpu * Math.pow(1 + netExp, t - 1);
      sum += (rev * ret * gm) / Math.pow(1 + r, t);
    }
    return { churnPct: c, ltv: sum };
  });

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  // ─── Waterfall components ─────────────────────────────────────────
  // Decompose net LTV from gross → discount drag → churn drag → expansion lift → net.
  const waterfall = useMemo(() => {
    const arpu = parseFloat(state.arpu) || 0;
    const gm = (parseFloat(state.grossMargin) || 0) / 100;
    const churn = (parseFloat(state.monthlyChurn) || 0) / 100;
    const monthlyR =
      Math.pow(1 + (parseFloat(state.annualDiscount) || 0) / 100, 1 / 12) - 1;

    // Hypothetical gross: full horizon, no churn, no discount, no expansion
    const grossHorizon = arpu * gm * HORIZON_MONTHS;

    // Apply discount only (no churn, no expansion)
    let discOnly = 0;
    for (let t = 1; t <= HORIZON_MONTHS; t++) {
      discOnly += (arpu * gm) / Math.pow(1 + monthlyR, t);
    }
    const discountDrag = discOnly - grossHorizon; // negative

    // Apply discount + churn (no expansion) — this is "simple" baseline
    let churnApplied = 0;
    for (let t = 1; t <= HORIZON_MONTHS; t++) {
      const ret = Math.pow(1 - churn, t);
      churnApplied += (arpu * gm * ret) / Math.pow(1 + monthlyR, t);
    }
    const churnDrag = churnApplied - discOnly; // negative

    // Full model adds expansion — diff vs churn-only is expansion lift
    const expansionLift = model.discountedLtv - churnApplied;

    return {
      gross: grossHorizon,
      discountDrag,
      churnDrag,
      expansionLift,
      net: model.discountedLtv,
    };
  }, [state, model.discountedLtv]);

  // Payback period months at given monthly contribution baseline.
  // CAC reference multiples 3×/6×/9×/12× of monthly contribution; user
  // can interpret bars relative to their CAC.
  const paybackData = useMemo(() => {
    const arpu = parseFloat(state.arpu) || 0;
    const gm = (parseFloat(state.grossMargin) || 0) / 100;
    const monthlyContrib = arpu * gm;
    const cacRefs = [3, 6, 9, 12].map((mult) => ({
      cacMonths: mult,
      cac: monthlyContrib * mult,
      // Months to recoup CAC at constant monthly contribution
      payback: monthlyContrib > 0 ? mult : 0,
    }));
    return { monthlyContrib, cacRefs };
  }, [state]);

  // Scenario ledger: best/base/worst by ±30% churn shock.
  const scenarioLedger = useMemo(() => {
    const churn = (parseFloat(state.monthlyChurn) || 0) / 100;
    const arpu = parseFloat(state.arpu) || 0;
    const gm = (parseFloat(state.grossMargin) || 0) / 100;
    const exp = (parseFloat(state.expansion) || 0) / 100;
    const contr = (parseFloat(state.contraction) || 0) / 100;
    const r = Math.pow(1 + (parseFloat(state.annualDiscount) || 0) / 100, 1 / 12) - 1;
    const netExp = exp - contr;

    const compute = (chShock: number, expShock: number) => {
      const ch = Math.max(0.0001, churn * (1 + chShock));
      const ne = netExp + expShock;
      let sum = 0;
      for (let t = 1; t <= HORIZON_MONTHS; t++) {
        const ret = Math.pow(1 - ch, t);
        const rev = arpu * Math.pow(1 + ne, t - 1);
        sum += (rev * ret * gm) / Math.pow(1 + r, t);
      }
      const lifetime = ch > 0 ? 1 / ch : 0;
      return { ltv: sum, lifetime, churnPct: ch * 100, netExp: ne * 100 };
    };

    return {
      best: compute(-0.3, 0.005),
      base: compute(0, 0),
      worst: compute(0.3, -0.005),
    };
  }, [state]);

  return (
    <ToolShell
      category="Finance"
      title="Advanced Subscription LTV"
      description="Discounted LTV accounting for churn, expansion, contraction, and margin. Contribution LTV by year plus churn sensitivity."
    >
      <div
        data-tool-theme="finance"
        data-tool="subscription-ltv-advanced"
        className="space-y-6 text-app"
      >
        {/* ─── Hero: LTV waterfall ───────────────────────────────────── */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface px-6 py-6 shadow-sm">
          <span className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l border-t border-tool-accent/40" />
          <span className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r border-b border-tool-accent/30" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · LTV Waterfall
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                {fmt(waterfall.net)} discounted LTV
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Net of churn drag, expansion lift, and time-value discount over
                a {HORIZON_MONTHS}-month horizon.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-muted">
                <div className="text-[0.55rem] tracking-[0.2em] text-muted">
                  Avg lifetime
                </div>
                <div className="mt-0.5 text-base tabular-nums text-tool-accent">
                  {model.avgLifetime.toFixed(1)} mo
                </div>
              </div>
            </div>
          </div>

          {/* Waterfall visualization */}
          <div className="relative mt-5 overflow-hidden rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Gross → Discount → Churn → Expansion → Net
              </div>
              <div className="font-mono text-[0.55rem] tabular-nums text-muted">
                Per customer · USD
              </div>
            </div>
            {(() => {
              const max = Math.max(
                waterfall.gross,
                waterfall.net,
                waterfall.gross + Math.abs(waterfall.discountDrag) + Math.abs(waterfall.churnDrag)
              );
              // Running base for floating bars
              const running = waterfall.gross;
              const afterDisc = running + waterfall.discountDrag;
              const afterChurn = afterDisc + waterfall.churnDrag;
              const steps = [
                {
                  k: "Gross",
                  v: waterfall.gross,
                  base: 0,
                  top: waterfall.gross,
                  fill: "color-mix(in srgb, var(--tool-accent) 70%, transparent)",
                  kind: "absolute",
                },
                {
                  k: "Discount",
                  v: waterfall.discountDrag,
                  base: afterDisc,
                  top: running,
                  fill: "rgba(244,114,182,0.8)",
                  kind: "delta-down",
                },
                {
                  k: "Churn",
                  v: waterfall.churnDrag,
                  base: afterChurn,
                  top: afterDisc,
                  fill: "rgba(244,63,94,0.85)",
                  kind: "delta-down",
                },
                {
                  k: "Expansion",
                  v: waterfall.expansionLift,
                  base: afterChurn,
                  top: afterChurn + waterfall.expansionLift,
                  fill: "rgba(16,185,129,0.8)",
                  kind: waterfall.expansionLift >= 0 ? "delta-up" : "delta-down",
                },
                {
                  k: "Net LTV",
                  v: waterfall.net,
                  base: 0,
                  top: waterfall.net,
                  fill: "var(--tool-accent)",
                  kind: "absolute",
                },
              ];
              const chartH = 200;
              return (
                <div className="grid grid-cols-5 items-end gap-3" style={{ height: chartH + 56 }}>
                  {steps.map((s, i) => {
                    const topPct = max > 0 ? (s.top / max) * chartH : 0;
                    const basePct = max > 0 ? (s.base / max) * chartH : 0;
                    const barH = Math.max(2, Math.abs(topPct - basePct));
                    const bottom = Math.min(topPct, basePct);
                    return (
                      <div
                        key={s.k}
                        className="relative flex flex-col items-center"
                        style={{ height: chartH + 56 }}
                      >
                        <div className="relative w-full" style={{ height: chartH }}>
                          {/* Connector line to next bar */}
                          {i < steps.length - 1 && (
                            <span
                              className="pointer-events-none absolute right-[-6px] z-10 h-px w-3 border-t border-dashed border-app"
                              style={{ bottom: `${topPct}px` }}
                            />
                          )}
                          <div
                            className="absolute left-1/2 w-12 -translate-x-1/2 rounded-sm shadow-sm transition-all"
                            style={{
                              height: `${barH}px`,
                              bottom: `${bottom}px`,
                              backgroundColor: s.fill,
                            }}
                            title={`${s.k}: ${fmt(s.v)}`}
                          />
                        </div>
                        <div className="mt-2 text-center">
                          <div
                            className={`font-mono text-sm tabular-nums ${
                              s.kind === "absolute"
                                ? "text-app"
                                : s.v >= 0
                                ? "text-emerald-500"
                                : "text-rose-500"
                            }`}
                          >
                            {s.kind === "absolute"
                              ? fmt(s.v)
                              : `${s.v >= 0 ? "+" : ""}${fmt(s.v)}`}
                          </div>
                          <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                            {s.k}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Quick stat strip beneath waterfall */}
          <div className="relative mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-4">
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Discounted LTV
              </div>
              <div className="mt-1 text-lg tabular-nums text-tool-accent">
                {fmt(model.discountedLtv)}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Simple LTV
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmt(model.simpleLtv)}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Monthly contrib
              </div>
              <div className="mt-1 tabular-nums text-app">
                {fmt(paybackData.monthlyContrib)}
              </div>
            </div>
            <div className="bg-tool-surface p-3">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Avg lifetime
              </div>
              <div className="mt-1 tabular-nums text-app">
                {model.avgLifetime.toFixed(1)} mo
              </div>
            </div>
          </div>
        </header>

        {/* ─── Inputs + Cohort retention curve ───────────────────────── */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Inputs panel */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Customer economics
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Inputs · USD / %
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FinanceField label="Monthly ARPU" hint="$/cust">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    value={state.arpu}
                    onChange={(e) => setState((s) => ({ ...s, arpu: e.target.value }))}
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="10"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Gross margin" hint="%">
                <input
                  type="number"
                  value={state.grossMargin}
                  onChange={(e) =>
                    setState((s) => ({ ...s, grossMargin: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="1"
                />
              </FinanceField>
              <FinanceField label="Monthly logo churn" hint="%">
                <input
                  type="number"
                  value={state.monthlyChurn}
                  onChange={(e) =>
                    setState((s) => ({ ...s, monthlyChurn: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="0.1"
                />
              </FinanceField>
              <FinanceField label="Monthly expansion" hint="% MRR">
                <input
                  type="number"
                  value={state.expansion}
                  onChange={(e) =>
                    setState((s) => ({ ...s, expansion: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="0.1"
                />
              </FinanceField>
              <FinanceField label="Monthly contraction" hint="% MRR">
                <input
                  type="number"
                  value={state.contraction}
                  onChange={(e) =>
                    setState((s) => ({ ...s, contraction: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="0.1"
                />
              </FinanceField>
              <FinanceField label="Annual discount rate" hint="WACC %">
                <input
                  type="number"
                  value={state.annualDiscount}
                  onChange={(e) =>
                    setState((s) => ({ ...s, annualDiscount: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="0.5"
                />
              </FinanceField>
            </div>
          </div>

          {/* Cohort retention curve */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Cohort retention curves
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                {HORIZON_MONTHS} months · % surviving
              </span>
            </div>
            {(() => {
              const chartW = 600;
              const chartH = 200;
              const padL = 32;
              const padB = 22;
              const padT = 8;
              const padR = 8;
              const innerW = chartW - padL - padR;
              const innerH = chartH - padT - padB;
              const months = HORIZON_MONTHS;
              const xAt = (m: number) => padL + (m / months) * innerW;
              const yAt = (p: number) => padT + (1 - p) * innerH;

              // Three cohorts: base churn, +30% (worse), -30% (better)
              const baseCh = (parseFloat(state.monthlyChurn) || 0) / 100;
              const cohorts = [
                { label: "Best (-30% churn)", ch: Math.max(0.0001, baseCh * 0.7), color: "rgba(16,185,129,0.95)" },
                { label: "Base", ch: Math.max(0.0001, baseCh), color: "var(--tool-accent)" },
                { label: "Worst (+30% churn)", ch: Math.max(0.0001, baseCh * 1.3), color: "rgba(244,63,94,0.95)" },
              ];

              return (
                <div className="overflow-hidden rounded-xl border border-app bg-app-elevated p-3">
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    preserveAspectRatio="none"
                    className="h-52 w-full"
                    aria-label="Cohort retention curves"
                  >
                    {/* Y-axis grid + labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map((g) => (
                      <g key={g}>
                        <line
                          x1={padL}
                          x2={chartW - padR}
                          y1={yAt(g)}
                          y2={yAt(g)}
                          stroke="currentColor"
                          strokeOpacity={g === 0 ? 0.18 : 0.08}
                          strokeDasharray={g === 0 ? "" : "3 3"}
                        />
                        <text
                          x={padL - 6}
                          y={yAt(g) + 3}
                          textAnchor="end"
                          fontSize="9"
                          fontFamily="ui-monospace, monospace"
                          fill="currentColor"
                          fillOpacity="0.45"
                        >
                          {(g * 100).toFixed(0)}%
                        </text>
                      </g>
                    ))}
                    {/* X-axis ticks */}
                    {[0, 12, 24, 36, 48, 60].map((m) => (
                      <text
                        key={m}
                        x={xAt(m)}
                        y={chartH - 6}
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="ui-monospace, monospace"
                        fill="currentColor"
                        fillOpacity="0.4"
                      >
                        M{m}
                      </text>
                    ))}
                    {/* Curves */}
                    {cohorts.map((c, idx) => {
                      const pts: string[] = [];
                      for (let t = 0; t <= months; t++) {
                        const r = Math.pow(1 - c.ch, t);
                        pts.push(`${t === 0 ? "M" : "L"} ${xAt(t).toFixed(2)} ${yAt(r).toFixed(2)}`);
                      }
                      return (
                        <path
                          key={idx}
                          d={pts.join(" ")}
                          fill="none"
                          stroke={c.color}
                          strokeWidth={c.label === "Base" ? 2.5 : 1.6}
                          strokeLinecap="round"
                          strokeOpacity={c.label === "Base" ? 1 : 0.85}
                        />
                      );
                    })}
                  </svg>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {cohorts.map((c) => (
                      <div
                        key={c.label}
                        className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted"
                      >
                        <span
                          className="inline-block h-2 w-3 rounded-sm"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Year-by-year contribution strip */}
            <div className="mt-4">
              <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Contributed LTV by year
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {model.yearMarks.map((y, i) => {
                  const prev = i === 0 ? 0 : model.yearMarks[i - 1].cumPV;
                  const delta = y.cumPV - prev;
                  const totalForBar = model.yearMarks.reduce(
                    (a, yy, ii) => Math.max(a, yy.cumPV - (ii === 0 ? 0 : model.yearMarks[ii - 1].cumPV)),
                    0
                  );
                  const pct = totalForBar > 0 ? (delta / totalForBar) * 100 : 0;
                  return (
                    <div
                      key={y.year}
                      className="rounded-md border border-app bg-app-elevated p-2"
                    >
                      <div className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-muted">
                        Y{y.year}
                      </div>
                      <div className="mt-1 font-mono text-xs tabular-nums text-app">
                        {fmt(delta)}
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-app">
                        <div
                          className="h-full bg-tool-accent"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Sub-tab switcher ─────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
            Drill-down
          </span>
          <TabButton active={lowerTab === "payback"} onClick={() => setLowerTab("payback")}>
            Payback bars
          </TabButton>
          <TabButton active={lowerTab === "sensitivity"} onClick={() => setLowerTab("sensitivity")}>
            Churn sensitivity
          </TabButton>
          <TabButton active={lowerTab === "tiers"} onClick={() => setLowerTab("tiers")}>
            Tiered plans
          </TabButton>
        </div>

        {/* ─── Payback bars ─────────────────────────────────────────── */}
        {lowerTab === "payback" && (
          <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Payback period
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Months to recoup CAC · 3× / 6× / 9× / 12×
              </span>
            </div>
            {(() => {
              const maxMonths = 12;
              return (
                <div className="space-y-3">
                  {paybackData.cacRefs.map((r) => {
                    const pct = Math.min(100, (r.payback / maxMonths) * 100);
                    const recovered = r.payback < model.avgLifetime * 0.5;
                    return (
                      <div key={r.cacMonths} className="space-y-1">
                        <div className="flex items-baseline justify-between">
                          <div className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                            CAC ≈ {fmt(r.cac)}{" "}
                            <span className="text-muted">
                              ({r.cacMonths}× monthly contrib)
                            </span>
                          </div>
                          <div
                            className={`font-mono text-sm tabular-nums ${
                              recovered ? "text-emerald-500" : "text-tool-accent"
                            }`}
                          >
                            {r.payback.toFixed(1)} mo
                          </div>
                        </div>
                        <div className="relative h-3 w-full overflow-hidden rounded-md border border-app bg-app-elevated">
                          <div
                            className="h-full rounded-md"
                            style={{
                              width: `${pct.toFixed(1)}%`,
                              backgroundColor: recovered
                                ? "rgba(16,185,129,0.7)"
                                : "var(--tool-accent)",
                            }}
                          />
                          {/* Lifetime marker */}
                          {model.avgLifetime > 0 && model.avgLifetime <= maxMonths && (
                            <span
                              className="absolute top-0 h-full w-px bg-secondary"
                              style={{
                                left: `${(model.avgLifetime / maxMonths) * 100}%`,
                              }}
                              title={`Avg lifetime ${model.avgLifetime.toFixed(1)} mo`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-3 flex items-center gap-3 border-t border-app pt-3 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" />
                      Payback
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-px bg-secondary" />
                      Avg lifetime
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {/* ─── Churn sensitivity ────────────────────────────────────── */}
        {lowerTab === "sensitivity" && (
          <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Churn sensitivity
              </h2>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                ±50% / +100% shock
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-app">
              <table className="w-full font-mono text-xs">
                <thead className="bg-app-elevated text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.6rem] uppercase tracking-[0.16em]">
                      Monthly churn
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">
                      Discounted LTV
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">
                      vs base
                    </th>
                  </tr>
                </thead>
                <tbody className="text-secondary">
                  {sensitivity.map((row) => {
                    const base = model.discountedLtv;
                    const delta = base > 0 ? (row.ltv - base) / base : 0;
                    const isBase = Math.abs(delta) < 0.001;
                    return (
                      <tr
                        key={row.churnPct}
                        className={`border-t border-app ${isBase ? "bg-tool-accent-soft" : ""}`}
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {row.churnPct.toFixed(2)}%
                          {isBase && (
                            <span className="ml-2 rounded border border-tool-accent/40 px-1 text-[0.5rem] uppercase tracking-wider text-tool-accent">
                              base
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-app">
                          {fmt(row.ltv)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            delta > 0.001
                              ? "text-emerald-500"
                              : delta < -0.001
                              ? "text-rose-500"
                              : "text-muted"
                          }`}
                        >
                          {(delta * 100).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── Tiered plan model ────────────────────────────────────── */}
        {lowerTab === "tiers" && (
          <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
                  Tiered plan model
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Weighted LTV across plan tiers with independent churn. Uses
                  shared margin, expansion, contraction, and discount rate from
                  inputs above.
                </p>
              </div>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Multi-price points
              </span>
            </div>
            <div className="space-y-2">
              {tiers.map((t, idx) => (
                <div
                  key={t.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-app bg-app-elevated p-2 md:grid-cols-[1fr_1fr_1fr_1fr_2.25rem]"
                >
                  <input
                    value={t.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTiers((p) => p.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                    }}
                    className={fieldInput}
                    placeholder="Tier name"
                  />
                  <input
                    type="number"
                    value={t.price}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTiers((p) => p.map((x, i) => (i === idx ? { ...x, price: v } : x)));
                    }}
                    className={fieldInput}
                    placeholder="Price / mo"
                  />
                  <input
                    type="number"
                    value={t.mix}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTiers((p) => p.map((x, i) => (i === idx ? { ...x, mix: v } : x)));
                    }}
                    className={fieldInput}
                    placeholder="Mix %"
                  />
                  <input
                    type="number"
                    value={t.churn}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTiers((p) => p.map((x, i) => (i === idx ? { ...x, churn: v } : x)));
                    }}
                    className={fieldInput}
                    placeholder="Churn % / mo"
                  />
                  <button
                    type="button"
                    onClick={() => setTiers((p) => p.filter((_, i) => i !== idx))}
                    className="rounded-md border border-app font-mono text-sm text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                    aria-label="Remove tier"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setTiers((p) => [
                    ...p,
                    {
                      id: Math.random().toString(36).slice(2),
                      name: `Tier ${p.length + 1}`,
                      price: "99",
                      mix: "0",
                      churn: "2",
                    },
                  ])
                }
                className="w-full rounded-lg border border-dashed border-app px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                + Add tier
              </button>
            </div>

            {(() => {
              const gm = (parseFloat(state.grossMargin) || 0) / 100;
              const exp = (parseFloat(state.expansion) || 0) / 100;
              const contr = (parseFloat(state.contraction) || 0) / 100;
              const netExp = exp - contr;
              const r =
                Math.pow(1 + (parseFloat(state.annualDiscount) || 0) / 100, 1 / 12) - 1;
              const totalMix = tiers.reduce((a, t) => a + (parseFloat(t.mix) || 0), 0) || 1;
              const tierLtvs = tiers.map((t) => {
                const price = parseFloat(t.price) || 0;
                const c = (parseFloat(t.churn) || 0) / 100;
                const m = parseFloat(t.mix) || 0;
                let sum = 0;
                for (let tt = 1; tt <= HORIZON_MONTHS; tt++) {
                  const ret = Math.pow(1 - c, tt);
                  const rev = price * Math.pow(1 + netExp, tt - 1);
                  sum += (rev * ret * gm) / Math.pow(1 + r, tt);
                }
                return {
                  ...t,
                  ltv: sum,
                  mixPct: m / totalMix,
                  ratio: m > 0 ? sum / price : 0,
                };
              });
              const weighted = tierLtvs.reduce(
                (a, t) => a + t.ltv * t.mixPct,
                0
              );
              return (
                <div className="mt-4 overflow-hidden rounded-xl border border-app">
                  <table className="w-full font-mono text-xs">
                    <thead className="bg-app-elevated text-muted">
                      <tr>
                        <th className="px-3 py-2 text-left text-[0.6rem] uppercase tracking-[0.16em]">Tier</th>
                        <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">Price</th>
                        <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">Mix</th>
                        <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">Churn</th>
                        <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">Discounted LTV</th>
                        <th className="px-3 py-2 text-right text-[0.6rem] uppercase tracking-[0.16em]">LTV / price</th>
                      </tr>
                    </thead>
                    <tbody className="text-secondary">
                      {tierLtvs.map((t) => (
                        <tr key={t.id} className="border-t border-app">
                          <td className="px-3 py-2 text-app">{t.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            ${parseFloat(t.price).toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {(t.mixPct * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {parseFloat(t.churn).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-app">
                            {fmt(t.ltv)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">
                            {t.ratio.toFixed(1)}x
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-tool-accent/30 bg-tool-accent-soft">
                        <td
                          className="px-3 py-2.5 text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent"
                          colSpan={4}
                        >
                          Weighted blended LTV
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tool-accent">
                          {fmt(weighted)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        )}

        {/* ─── Scenario comparison ledger ─────────────────────────────── */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Scenario ledger
            </h2>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Best · Base · Worst
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(
              [
                { key: "best", label: "Best case", row: scenarioLedger.best, tone: "emerald", note: "−30% churn · +0.5pp expansion" },
                { key: "base", label: "Base case", row: scenarioLedger.base, tone: "accent", note: "Inputs as entered" },
                { key: "worst", label: "Worst case", row: scenarioLedger.worst, tone: "rose", note: "+30% churn · −0.5pp expansion" },
              ] as const
            ).map((s) => {
              const baseLtv = scenarioLedger.base.ltv;
              const delta = baseLtv > 0 ? (s.row.ltv - baseLtv) / baseLtv : 0;
              const accentBorder =
                s.tone === "emerald"
                  ? "border-emerald-500/40"
                  : s.tone === "rose"
                  ? "border-rose-500/40"
                  : "border-tool-accent/40";
              const accentText =
                s.tone === "emerald"
                  ? "text-emerald-500"
                  : s.tone === "rose"
                  ? "text-rose-500"
                  : "text-tool-accent";
              const accentBg =
                s.tone === "emerald"
                  ? "bg-emerald-500/[0.07]"
                  : s.tone === "rose"
                  ? "bg-rose-500/[0.07]"
                  : "bg-tool-accent-soft";
              return (
                <div
                  key={s.key}
                  className={`relative overflow-hidden rounded-xl border ${accentBorder} ${accentBg} p-4`}
                >
                  <div
                    className={`font-mono text-[0.55rem] uppercase tracking-[0.2em] ${accentText}`}
                  >
                    {s.label}
                  </div>
                  <div className="mt-2 font-tool-heading text-2xl tabular-nums text-app">
                    {fmt(s.row.ltv)}
                  </div>
                  {s.key !== "base" && (
                    <div
                      className={`mt-1 font-mono text-xs tabular-nums ${
                        delta > 0 ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {(delta * 100).toFixed(1)}% vs base
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-app pt-3 font-mono text-[0.6rem]">
                    <div>
                      <div className="text-[0.5rem] uppercase tracking-[0.18em] text-muted">
                        Churn
                      </div>
                      <div className="mt-0.5 tabular-nums text-secondary">
                        {s.row.churnPct.toFixed(2)}%/mo
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.5rem] uppercase tracking-[0.18em] text-muted">
                        Net exp.
                      </div>
                      <div className="mt-0.5 tabular-nums text-secondary">
                        {s.row.netExp >= 0 ? "+" : ""}
                        {s.row.netExp.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.5rem] uppercase tracking-[0.18em] text-muted">
                        Lifetime
                      </div>
                      <div className="mt-0.5 tabular-nums text-secondary">
                        {s.row.lifetime.toFixed(1)} mo
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.5rem] uppercase tracking-[0.18em] text-muted">
                        LTV / mo
                      </div>
                      <div className="mt-0.5 tabular-nums text-secondary">
                        {fmt(s.row.ltv / Math.max(1, s.row.lifetime))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                    {s.note}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <ScenarioBar<State & { tiers: Tier[] }>
          slug="subscription-ltv-advanced"
          state={{ ...state, tiers }}
          onLoad={(d) => {
            setState({ ...defaultState, ...d });
            if (d?.tiers) setTiers(d.tiers);
          }}
          exports={{
            csv: () =>
              toCsv([
                ["Metric", "Value"],
                ["Discounted LTV", model.discountedLtv.toFixed(0)],
                ["Simple LTV", model.simpleLtv.toFixed(0)],
                ["Avg lifetime months", model.avgLifetime.toFixed(2)],
                [],
                ["Month", "Retention", "Revenue", "Contribution", "PV"],
                ...model.schedule.map((s) => [
                  s.month,
                  s.retention.toFixed(4),
                  s.revenue.toFixed(2),
                  s.contrib.toFixed(2),
                  s.pv.toFixed(2),
                ]),
              ]),
            json: () => ({ state, tiers, model, sensitivity }),
            markdown: () =>
              `# LTV\n\n- Discounted LTV: **${fmt(model.discountedLtv)}**\n- Simple LTV: ${fmt(model.simpleLtv)}\n- Avg lifetime: ${model.avgLifetime.toFixed(1)} months\n`,
          }}
        />
      </div>
    </ToolShell>
  );
}
