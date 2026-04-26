"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

const CURRENCIES: Record<string, { code: string; symbol: string; locale: string }> = {
  USD: { code: "USD", symbol: "$", locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB" },
  AED: { code: "AED", symbol: "AED", locale: "en-AE" },
  INR: { code: "INR", symbol: "₹", locale: "en-IN" },
  PKR: { code: "PKR", symbol: "₨", locale: "en-PK" },
};

// Monthly future value with contributions at end of month.
// FV = P*(1+r)^n + C * [((1+r)^n - 1) / r]
// Solve for n given target FV when r>0:
//   n = log( (FV*r + C) / (P*r + C) ) / log(1+r)
function solveMonthsToGoal(target: number, principal: number, monthly: number, annualRate: number) {
  if (target <= principal) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) {
    if (monthly <= 0) return Infinity;
    return (target - principal) / monthly;
  }
  const num = target * r + monthly;
  const den = principal * r + monthly;
  if (num <= 0 || den <= 0 || num / den <= 1) return Infinity;
  const n = Math.log(num / den) / Math.log(1 + r);
  return n > 0 ? n : 0;
}

function buildTimeline(principal: number, monthly: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12;
  const snapshots: { month: number; balance: number; contributed: number; interest: number }[] = [];
  let balance = principal;
  let contributed = principal;
  const checkpoints = Math.min(Math.ceil(months), 600);
  for (let m = 1; m <= checkpoints; m++) {
    balance = balance * (1 + r) + monthly;
    contributed += monthly;
    snapshots.push({
      month: m,
      balance,
      contributed,
      interest: Math.max(0, balance - contributed),
    });
  }
  return snapshots;
}

// Back-solve required monthly contribution to hit target in N months.
// FV = P*(1+r)^n + C * [((1+r)^n - 1) / r]   →   C = (FV - P*(1+r)^n) / [((1+r)^n - 1) / r]
function solveMonthlyForTargetDate(target: number, principal: number, annualRate: number, months: number) {
  if (months <= 0) return Infinity;
  if (target <= principal) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return (target - principal) / months;
  const grow = Math.pow(1 + r, months);
  const num = target - principal * grow;
  const den = (grow - 1) / r;
  if (den <= 0) return Infinity;
  return Math.max(0, num / den);
}

interface Inputs {
  currency: string;
  target: string;
  principal: string;
  monthly: string;
  rate: string;
  inflation: string;
  mode: ModeKey;
  targetDateMonths: string;
}

type ModeKey = "plan" | "project" | "target";

const DEFAULTS: Inputs = {
  currency: "AED",
  target: "180000",
  principal: "20000",
  monthly: "2500",
  rate: "5",
  inflation: "3",
  mode: "plan",
  targetDateMonths: "60",
};

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

export default function SavingsGoalPlannerPage() {
  const [state, setState] = useState<Inputs>(DEFAULTS);

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setState({ ...DEFAULTS, ...shared });
  }, []);

  const { currency, target, principal, monthly, rate, mode } = state;
  const setCurrency = (v: string) => setState((s) => ({ ...s, currency: v }));
  const setTarget = (v: string) => setState((s) => ({ ...s, target: v }));
  const setPrincipal = (v: string) => setState((s) => ({ ...s, principal: v }));
  const setMonthly = (v: string) => setState((s) => ({ ...s, monthly: v }));
  const setRate = (v: string) => setState((s) => ({ ...s, rate: v }));
  const setMode = (v: ModeKey) => setState((s) => ({ ...s, mode: v }));

  const cur = CURRENCIES[currency];
  const fmt = (n: number) =>
    n.toLocaleString(cur.locale, {
      style: "currency",
      currency: cur.code,
      maximumFractionDigits: 0,
    });

  const { months, timeline, reachable } = useMemo(() => {
    const t = parseFloat(target) || 0;
    const p = parseFloat(principal) || 0;
    const m = parseFloat(monthly) || 0;
    const r = parseFloat(rate) || 0;
    const n = solveMonthsToGoal(t, p, m, r);
    const reachable = isFinite(n);
    const horizon = reachable ? Math.min(n, 600) : 240;
    const timeline = buildTimeline(p, m, r, Math.max(1, Math.ceil(horizon)));
    return { months: n, timeline, reachable };
  }, [target, principal, monthly, rate]);

  const progress = useMemo(() => {
    const t = parseFloat(target) || 0;
    const p = parseFloat(principal) || 0;
    if (t <= 0) return 0;
    return Math.min(100, (p / t) * 100);
  }, [target, principal]);

  const years = months / 12;
  const targetNum = parseFloat(target) || 0;
  const principalNum = parseFloat(principal) || 0;
  const monthlyNum = parseFloat(monthly) || 0;
  const peak = Math.max(targetNum, ...timeline.map((s) => s.balance), 1);

  // Sample 12 evenly spaced points for the timeline so bars stay readable.
  const sampled = useMemo(() => {
    if (timeline.length <= 12) return timeline;
    const step = Math.floor(timeline.length / 12);
    const out: typeof timeline = [];
    for (let i = step; i < timeline.length; i += step) out.push(timeline[i]);
    if (out[out.length - 1]?.month !== timeline[timeline.length - 1].month) {
      out.push(timeline[timeline.length - 1]);
    }
    return out.slice(0, 12);
  }, [timeline]);

  const monthsCeil = isFinite(months) ? Math.ceil(months) : 0;

  // Target-mode back-solve
  const targetDateMonthsNum = Math.max(1, parseFloat(state.targetDateMonths) || 0);
  const requiredMonthly = useMemo(
    () =>
      solveMonthlyForTargetDate(
        targetNum,
        principalNum,
        parseFloat(rate) || 0,
        targetDateMonthsNum
      ),
    [targetNum, principalNum, rate, targetDateMonthsNum]
  );

  return (
    <div data-tool-theme="finance" data-tool="savings-goal-planner">
      <ToolShell
        category="Finance"
        title="Savings Goal Planner"
        description="How long to hit the number — with real compounding, not napkin math."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {cur.code}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {reachable ? `${monthsCeil}mo` : "∞"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              finance.savings-plan
              <span className="text-faint">/</span>
              <span className="text-secondary">
                target.{targetNum.toString()}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">◉ live</div>
          </div>

          {/* Hero — large mono target $ + months chip */}
          <div className="relative p-5">
            <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Finance · Goal Plan
                </div>
                <div className="mt-3 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                  Target
                </div>
                <h1 className="mt-1 font-mono text-4xl font-semibold tracking-tight text-app sm:text-5xl">
                  {fmt(targetNum)}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-secondary">
                  {reachable && monthsCeil > 0 ? (
                    <>
                      Save{" "}
                      <span className="font-mono font-semibold text-tool-accent">
                        {fmt(monthlyNum)}
                      </span>{" "}
                      /month for{" "}
                      <span className="font-mono font-semibold text-tool-accent">
                        {monthsCeil}
                      </span>{" "}
                      months and you hit it.
                    </>
                  ) : reachable ? (
                    <>You&apos;re already there. Set a bigger target.</>
                  ) : (
                    <>
                      Not reachable on these numbers. Increase the monthly
                      contribution, the return, or lower the goal.
                    </>
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 font-mono text-[0.65rem]">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 uppercase tracking-[0.15em] text-tool-accent">
                    {reachable ? `${monthsCeil} months to goal` : "unreachable"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 uppercase tracking-[0.15em] text-secondary">
                    {reachable ? `${years.toFixed(1)} yrs` : "—"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 uppercase tracking-[0.15em] text-secondary">
                    {progress.toFixed(1)}% banked
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 uppercase tracking-[0.15em] text-secondary">
                    {rate}% return
                  </span>
                </div>
              </div>

              {/* Progress ring — uses --tool-accent */}
              <div className="relative mx-auto h-52 w-52 shrink-0 sm:h-56 sm:w-56">
                <ProgressRing progress={progress} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Progress
                  </div>
                  <div className="font-mono text-3xl font-semibold tabular-nums text-app">
                    {progress.toFixed(0)}%
                  </div>
                  <div className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                    {fmt(principalNum)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "plan", label: "Plan" },
                  { k: "project", label: "Project" },
                  { k: "target", label: "Target" },
                ] as { k: ModeKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
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
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {mode === "plan" && "input → solve months"}
              {mode === "project" && "growth · contributions vs balance"}
              {mode === "target" && "back-solve · required monthly"}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* Inputs panel */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-4 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              Inputs · Your goal
            </div>
            <div className="space-y-4">
              <FinanceField label="Currency">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={fieldInput}
                >
                  {Object.keys(CURRENCIES).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </FinanceField>
              <FinanceField label={`Target amount (${cur.symbol})`}>
                <input
                  type="number"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={fieldInput}
                  min="0"
                  step="1000"
                />
              </FinanceField>
              <FinanceField label={`Current savings (${cur.symbol})`}>
                <input
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
              <FinanceField
                label={`Monthly contribution (${cur.symbol})`}
                hint="end of month"
              >
                <input
                  type="number"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  className={fieldInput}
                  min="0"
                  step="50"
                />
              </FinanceField>
              <FinanceField label="Expected annual return (%)" hint="compounded monthly">
                <input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className={fieldInput}
                  step="0.1"
                />
              </FinanceField>

              {mode === "target" && (
                <FinanceField
                  label="Target date (months)"
                  hint="when you want it"
                >
                  <input
                    type="number"
                    value={state.targetDateMonths}
                    onChange={(e) =>
                      setState((s) => ({ ...s, targetDateMonths: e.target.value }))
                    }
                    className={fieldInput}
                    min="1"
                    step="1"
                  />
                </FinanceField>
              )}
            </div>
          </section>

          {/* Right column */}
          <div className="space-y-6">
            {mode === "target" && (
              <section className="rounded-xl border border-app bg-app-elevated p-5">
                <div className="mb-4 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  Back-solve · Required monthly
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-4">
                    <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                      Required /mo
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                      {isFinite(requiredMonthly) ? fmt(requiredMonthly) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-app bg-app p-4">
                    <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      In months
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-app">
                      {targetDateMonthsNum}
                    </div>
                  </div>
                  <div className="rounded-xl border border-app bg-app p-4">
                    <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Vs current
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-app">
                      {monthlyNum > 0 && isFinite(requiredMonthly)
                        ? `${(requiredMonthly / monthlyNum).toFixed(2)}×`
                        : "—"}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-secondary">
                  Hit{" "}
                  <span className="font-mono tabular-nums text-tool-accent">
                    {fmt(targetNum)}
                  </span>{" "}
                  in{" "}
                  <span className="font-mono tabular-nums text-tool-accent">
                    {targetDateMonthsNum} months
                  </span>{" "}
                  by saving{" "}
                  <span className="font-mono font-semibold tabular-nums text-tool-accent">
                    {isFinite(requiredMonthly) ? fmt(requiredMonthly) : "—"}
                  </span>{" "}
                  per month at {rate}% return.
                </p>
              </section>
            )}

            {/* Stat row */}
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  Time to goal
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  Projection
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-4">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    Months
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                    {reachable ? monthsCeil : "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-app bg-app p-4">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Years
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-app">
                    {reachable ? years.toFixed(1) : "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-app bg-app p-4">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Banked
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-app">
                    {progress.toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Linear progress ledger */}
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  <span>Progress ledger</span>
                  <span className="tabular-nums">
                    {fmt(principalNum)} / {fmt(targetNum)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-tool-accent-soft">
                  <div
                    className="h-full rounded-full bg-tool-accent transition-[width] duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {!reachable && (
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                  Contributions and return aren&apos;t enough to reach this
                  target. Increase monthly savings, bump the expected return, or
                  lower the goal.
                </p>
              )}
            </section>

            {/* Projection chart */}
            {mode !== "target" && (
              <section className="rounded-xl border border-app bg-app-elevated p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    {mode === "project" ? "Projection chart" : "Timeline"}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm bg-tool-accent" />
                      Contributed
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm bg-tool-accent-soft" />
                      Balance
                    </span>
                  </div>
                </div>

                {mode === "project" ? (
                  <ProjectionChart
                    timeline={timeline}
                    targetNum={targetNum}
                    fmt={fmt}
                  />
                ) : sampled.length === 0 ? (
                  <div className="text-sm text-muted">
                    Enter positive values to chart growth.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sampled.map((s) => {
                      const hit = targetNum > 0 && s.balance >= targetNum;
                      return (
                        <div
                          key={s.month}
                          className="flex items-center gap-3 font-mono text-[0.7rem] tabular-nums text-secondary"
                        >
                          <span className="w-12 text-muted">M{s.month}</span>
                          <div className="relative h-5 flex-1 overflow-hidden rounded bg-app">
                            <div
                              className="absolute left-0 top-0 h-full bg-tool-accent-soft"
                              style={{ width: `${(s.balance / peak) * 100}%` }}
                            />
                            <div
                              className="absolute left-0 top-0 h-full bg-tool-accent"
                              style={{ width: `${(s.contributed / peak) * 100}%` }}
                            />
                            {targetNum > 0 && (
                              <div
                                aria-hidden
                                className="absolute top-0 h-full w-px bg-app"
                                style={{ left: `${(targetNum / peak) * 100}%` }}
                              />
                            )}
                          </div>
                          <span
                            className={`w-24 text-right ${
                              hit ? "text-tool-accent" : "text-app"
                            }`}
                          >
                            {fmt(s.balance)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Scenarios */}
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-4 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Scenarios · Contribution impact
              </div>
              {(() => {
                const p = parseFloat(principal) || 0;
                const m = parseFloat(monthly) || 0;
                const r = parseFloat(rate) || 0;
                const t = parseFloat(target) || 0;
                const variants = [
                  { label: "Half", m: m / 2 },
                  { label: "Current", m, current: true },
                  { label: "1.5x", m: m * 1.5 },
                  { label: "2x", m: m * 2 },
                ];
                return (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {variants.map((v) => {
                      const n = solveMonthsToGoal(t, p, v.m, r);
                      return (
                        <div
                          key={v.label}
                          className={`rounded-xl border p-3 ${
                            v.current
                              ? "border-tool-accent bg-tool-accent-soft"
                              : "border-app bg-app"
                          }`}
                        >
                          <div
                            className={`text-[0.55rem] uppercase tracking-[0.18em] ${
                              v.current ? "text-tool-accent" : "text-muted"
                            }`}
                          >
                            {v.label}
                          </div>
                          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-app">
                            {fmt(v.m)}
                            <span className="text-faint"> /mo</span>
                          </div>
                          <div className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                            {isFinite(n)
                              ? `${Math.ceil(n)} mo · ${(n / 12).toFixed(1)}y`
                              : "unreachable"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>

            {/* Inflation */}
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-4 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Inflation-adjusted · Purchasing power
              </div>
              {(() => {
                const inf = parseFloat(state.inflation) || 0;
                const t = parseFloat(target) || 0;
                const y = months / 12;
                const realTarget = t / Math.pow(1 + inf / 100, y);
                return (
                  <div className="space-y-3 text-sm text-secondary">
                    <p>
                      At{" "}
                      <span className="font-mono tabular-nums">{inf}%</span>{" "}
                      inflation over{" "}
                      <span className="font-mono tabular-nums">
                        {isFinite(y) ? `${y.toFixed(1)} years` : "—"}
                      </span>
                      , your{" "}
                      <span className="font-mono tabular-nums">{fmt(t)}</span>{" "}
                      target buys what{" "}
                      <span className="font-mono font-semibold tabular-nums text-tool-accent">
                        {fmt(realTarget)}
                      </span>{" "}
                      buys today.
                    </p>
                    <FinanceField label="Inflation assumption (%)">
                      <input
                        type="number"
                        value={state.inflation}
                        onChange={(e) =>
                          setState((s) => ({ ...s, inflation: e.target.value }))
                        }
                        className={fieldInput}
                        step="0.1"
                      />
                    </FinanceField>
                  </div>
                );
              })()}
            </section>

            <p className="text-[0.65rem] leading-relaxed text-muted">
              Assumes end-of-month contributions, monthly compounding, and a
              constant annual return. Real returns vary year to year — use a
              conservative expected return (equity long-term average sits around
              6–8% real per Stern / Damodaran 1928–2024 data).
            </p>
          </div>
        </div>

        <ScenarioBar<Inputs>
          slug="savings-goal-planner"
          state={state}
          onLoad={(d) => setState({ ...DEFAULTS, ...d })}
          exports={{
            csv: () =>
              toCsv([
                ["Month", "Balance", "Contributed", "Interest"],
                ...timeline.map((t) => [
                  t.month,
                  t.balance.toFixed(2),
                  t.contributed.toFixed(2),
                  t.interest.toFixed(2),
                ]),
              ]),
            json: () => ({ state, months, timeline }),
            markdown: () =>
              `# Savings plan\n\n- Target: ${fmt(targetNum)}\n- Current: ${fmt(parseFloat(principal) || 0)}\n- Monthly: ${fmt(parseFloat(monthly) || 0)}\n- Return: ${rate}%\n\n**Reach goal in ${isFinite(months) ? Math.ceil(months) : "—"} months** (${years.toFixed(1)} years).\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}

/* ============================== Sub-components ============================== */

function ProgressRing({ progress }: { progress: number }) {
  const ringRadius = 88;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDash = (progress / 100) * ringCircumference;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
      <circle
        cx="100"
        cy="100"
        r={ringRadius}
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
      />
      <circle
        cx="100"
        cy="100"
        r={ringRadius}
        fill="none"
        stroke="var(--tool-accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${ringDash} ${ringCircumference}`}
        className="transition-[stroke-dasharray] duration-700"
      />
    </svg>
  );
}

function ProjectionChart({
  timeline,
  targetNum,
  fmt,
}: {
  timeline: { month: number; balance: number; contributed: number; interest: number }[];
  targetNum: number;
  fmt: (n: number) => string;
}) {
  const [accent, setAccent] = useState<string>("currentColor");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--tool-accent")
      .trim();
    if (v) setAccent(v);
  }, []);

  if (timeline.length === 0) {
    return (
      <div className="text-sm text-muted">Enter positive values to chart growth.</div>
    );
  }

  const W = 600;
  const H = 200;
  const padX = 28;
  const padY = 14;
  const peak = Math.max(targetNum, ...timeline.map((s) => s.balance), 1);
  const xAt = (m: number) =>
    padX + ((m - 1) / Math.max(1, timeline.length - 1)) * (W - padX * 2);
  const yAt = (v: number) => H - padY - (v / peak) * (H - padY * 2);

  const balancePath = timeline
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xAt(s.month)} ${yAt(s.balance)}`)
    .join(" ");
  const contribPath = timeline
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xAt(s.month)} ${yAt(s.contributed)}`)
    .join(" ");
  const fillPath =
    `M ${xAt(timeline[0].month)} ${H - padY} ` +
    timeline.map((s) => `L ${xAt(s.month)} ${yAt(s.balance)}`).join(" ") +
    ` L ${xAt(timeline[timeline.length - 1].month)} ${H - padY} Z`;

  const targetY = targetNum > 0 ? yAt(targetNum) : null;

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
        <defs>
          <linearGradient id="sgp-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={W - padX}
            y1={padY + g * (H - padY * 2)}
            y2={padY + g * (H - padY * 2)}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
        ))}
        {/* fill under balance */}
        <path d={fillPath} fill="url(#sgp-fill)" />
        {/* contributed line */}
        <path
          d={contribPath}
          fill="none"
          stroke={accent}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        {/* balance line */}
        <path d={balancePath} fill="none" stroke={accent} strokeWidth="2" />
        {/* target line */}
        {targetY !== null && (
          <>
            <line
              x1={padX}
              x2={W - padX}
              y1={targetY}
              y2={targetY}
              stroke={accent}
              strokeOpacity="0.6"
              strokeDasharray="4 3"
            />
            <text
              x={W - padX}
              y={targetY - 4}
              textAnchor="end"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              fill={accent}
            >
              target {fmt(targetNum)}
            </text>
          </>
        )}
      </svg>
      <div className="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
        <span>M1</span>
        <span>M{timeline[Math.floor(timeline.length / 2)].month}</span>
        <span>M{timeline[timeline.length - 1].month}</span>
      </div>
    </div>
  );
}
