"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// Standard mortgage payment formula:
// M = P * r(1+r)^n / ((1+r)^n - 1)
function monthlyPayment(principal: number, annualRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

// Total interest paid over full term.
function totalInterest(principal: number, payment: number, months: number) {
  return Math.max(0, payment * months - principal);
}

interface Inputs {
  balance: string;
  currentRate: string;
  remainingMonths: string;
  newRate: string;
  newTermYears: string;
  closingCosts: string;
  rollCosts: boolean;
  appraisal: string;
  homeValue: string;
  dropPMI: boolean;
  currentPMIMonthly: string;
}

const DEFAULTS: Inputs = {
  balance: "320000",
  currentRate: "6.75",
  remainingMonths: "312",
  newRate: "5.25",
  newTermYears: "30",
  closingCosts: "6500",
  rollCosts: true,
  appraisal: "600",
  homeValue: "425000",
  dropPMI: false,
  currentPMIMonthly: "120",
};

type Mode = "compare" | "breakeven" | "schedule";

export default function MortgageRefiPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [mode, setMode] = useState<Mode>("compare");
  const chartRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  const {
    balance,
    currentRate,
    remainingMonths,
    newRate,
    newTermYears,
    closingCosts,
    rollCosts,
  } = inputs;
  const setBalance = (v: string) => setInputs((s) => ({ ...s, balance: v }));
  const setCurrentRate = (v: string) =>
    setInputs((s) => ({ ...s, currentRate: v }));
  const setRemainingMonths = (v: string) =>
    setInputs((s) => ({ ...s, remainingMonths: v }));
  const setNewRate = (v: string) => setInputs((s) => ({ ...s, newRate: v }));
  const setNewTermYears = (v: string) =>
    setInputs((s) => ({ ...s, newTermYears: v }));
  const setClosingCosts = (v: string) =>
    setInputs((s) => ({ ...s, closingCosts: v }));
  const setRollCosts = (v: boolean) =>
    setInputs((s) => ({ ...s, rollCosts: v }));

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const result = useMemo(() => {
    const bal = parseFloat(balance) || 0;
    const cr = parseFloat(currentRate) || 0;
    const rm = parseInt(remainingMonths) || 0;
    const nr = parseFloat(newRate) || 0;
    const nty = parseFloat(newTermYears) || 0;
    const cc = parseFloat(closingCosts) || 0;

    const newPrincipal = rollCosts ? bal + cc : bal;
    const newMonths = Math.round(nty * 12);

    const currentPmt = monthlyPayment(bal, cr, rm);
    const newPmt = monthlyPayment(newPrincipal, nr, newMonths);

    const currentRemainingInterest = totalInterest(bal, currentPmt, rm);
    const newTotalInterest = totalInterest(newPrincipal, newPmt, newMonths);

    const monthlySavings = currentPmt - newPmt;
    const outOfPocket = rollCosts ? 0 : cc;

    // Break-even months: how many months of savings to recover closing costs (paid or rolled).
    const breakEvenMonths = monthlySavings > 0 ? cc / monthlySavings : Infinity;

    // Total lifetime savings = interest avoided over remaining term - cost of capital added by refi
    // Compare "what I would have paid going forward" vs "what I will pay now"
    const currentRemainingPmtTotal = currentPmt * rm;
    const newLifetimePmtTotal = newPmt * newMonths + (rollCosts ? 0 : cc);
    const lifetimeSavings = currentRemainingPmtTotal - newLifetimePmtTotal;

    const worthIt =
      monthlySavings > 0 &&
      breakEvenMonths <= rm &&
      breakEvenMonths < 60; // usually want < 5 yrs break-even

    let verdict: { label: string; tone: "good" | "mid" | "bad"; reason: string };
    if (monthlySavings <= 0) {
      verdict = {
        label: "Skip it",
        tone: "bad",
        reason: "New monthly payment is higher than current. Refinancing costs money with no monthly relief.",
      };
    } else if (breakEvenMonths > rm) {
      verdict = {
        label: "Not worth it",
        tone: "bad",
        reason: `Break-even (${breakEvenMonths.toFixed(0)} mo) is longer than your remaining term (${rm} mo). You'd never recover the closing costs.`,
      };
    } else if (breakEvenMonths > 60) {
      verdict = {
        label: "Marginal",
        tone: "mid",
        reason: `Break-even (${breakEvenMonths.toFixed(0)} mo) is over 5 years. Only worth it if you're certain you'll stay in the home.`,
      };
    } else if (newMonths > rm + 60) {
      verdict = {
        label: "Check fine print",
        tone: "mid",
        reason: `Lower payment, but you're extending the loan by ${((newMonths - rm) / 12).toFixed(1)} years. Cash-flow helps today, costs more total.`,
      };
    } else {
      verdict = {
        label: "Go for it",
        tone: "good",
        reason: `Recover costs in ${breakEvenMonths.toFixed(0)} months, then pure savings.`,
      };
    }

    return {
      currentPmt,
      newPmt,
      monthlySavings,
      breakEvenMonths,
      lifetimeSavings,
      currentRemainingInterest,
      newTotalInterest,
      worthIt,
      verdict,
      newPrincipal,
      outOfPocket,
      newMonths,
      rm,
      cc,
    };
  }, [balance, currentRate, remainingMonths, newRate, newTermYears, closingCosts, rollCosts]);

  const verdictTone = {
    good: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-500",
    mid: "border-amber-500/30 bg-amber-500/[0.08] text-amber-500",
    bad: "border-rose-500/30 bg-rose-500/[0.08] text-rose-500",
  }[result.verdict.tone];

  const savingsPositive = result.monthlySavings > 0;
  const lifetimePositive = result.lifetimeSavings > 0;

  // Break-even bar geometry: cap visual at 84 months (7y); marker at break-even.
  const beCap = 84;
  const beVal = isFinite(result.breakEvenMonths) ? result.breakEvenMonths : beCap;
  const beClamped = Math.min(beVal, beCap);
  const bePct = (beClamped / beCap) * 100;
  const beOver = !isFinite(result.breakEvenMonths) || result.breakEvenMonths > beCap;

  // LTV side card
  const bal = parseFloat(balance) || 0;
  const hv = parseFloat(inputs.homeValue) || 0;
  const ltv = hv > 0 ? (bal / hv) * 100 : 0;
  const wouldDrop = ltv < 80;
  const pmi = parseFloat(inputs.currentPMIMonthly) || 0;
  const app = parseFloat(inputs.appraisal) || 0;
  const pmiSavings = wouldDrop ? pmi * 12 : 0;

  // Cumulative savings series for the schedule chart (clamped to first 120 months / 10y).
  const series = useMemo(() => {
    const horizon = Math.min(Math.max(result.rm, result.newMonths), 120);
    const points: { month: number; cum: number }[] = [];
    let cum = result.outOfPocket > 0 ? -result.outOfPocket : 0;
    for (let i = 1; i <= horizon; i++) {
      cum += result.monthlySavings;
      points.push({ month: i, cum });
    }
    return points;
  }, [result.rm, result.newMonths, result.monthlySavings, result.outOfPocket]);

  // Draw cumulative savings chart, reading --tool-accent at draw time.
  useEffect(() => {
    if (mode !== "schedule") return;
    const cv = chartRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth;
    const cssH = cv.clientHeight;
    cv.width = Math.floor(cssW * dpr);
    cv.height = Math.floor(cssH * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    if (series.length === 0) return;

    const pad = { l: 44, r: 12, t: 14, b: 26 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    const minV = Math.min(0, ...series.map((p) => p.cum));
    const maxV = Math.max(0, ...series.map((p) => p.cum));
    const span = maxV - minV || 1;
    const xAt = (i: number) => pad.l + (i / (series.length - 1)) * w;
    const yAt = (v: number) => pad.t + (1 - (v - minV) / span) * h;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--tool-accent").trim() || "#3b82f6";
    const border = styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.1)";
    const muted = styles.getPropertyValue("--text-muted").trim() || "rgba(255,255,255,0.5)";

    // grid + zero baseline
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + h);
    ctx.lineTo(pad.l + w, pad.t + h);
    ctx.stroke();

    const zeroY = yAt(0);
    ctx.strokeStyle = muted;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // fill under curve (from zero baseline)
    ctx.beginPath();
    ctx.moveTo(xAt(0), zeroY);
    series.forEach((p, i) => ctx.lineTo(xAt(i), yAt(p.cum)));
    ctx.lineTo(xAt(series.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;

    // line
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.cum);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // break-even marker
    if (isFinite(result.breakEvenMonths) && result.breakEvenMonths < series.length) {
      const beIdx = Math.round(result.breakEvenMonths) - 1;
      if (beIdx >= 0 && beIdx < series.length) {
        const x = xAt(beIdx);
        ctx.strokeStyle = accent;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, yAt(0), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // axis labels
    ctx.fillStyle = muted;
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmt(maxV), pad.l - 6, pad.t + 8);
    ctx.fillText(fmt(minV), pad.l - 6, pad.t + h);
    ctx.textAlign = "center";
    ctx.fillText(`${series.length} mo`, pad.l + w, pad.t + h + 16);
    ctx.fillText("0", pad.l, pad.t + h + 16);
  }, [mode, series, result.breakEvenMonths]);

  return (
    <ToolShell
      category="Finance"
      title="Mortgage Refinance Calculator"
      description="Does refinancing actually save money? Compare rate, payment, break-even, and lifetime cost."
    >
      <div data-tool-theme="finance" data-tool="mortgage-refi">
        {/* HERO: monthly savings big number */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              refi
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${verdictTone}`}
            >
              {result.verdict.label}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              mortgage.refi
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {fmt(result.currentPmt)} → {fmt(result.newPmt)}
              </span>
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent/80">
                  {savingsPositive ? "Save per month" : "Cost per month"}
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className={`font-mono text-4xl font-medium tabular-nums tracking-tight md:text-5xl ${
                      savingsPositive ? "text-app" : "text-rose-500"
                    }`}
                  >
                    {(result.monthlySavings >= 0 ? "+" : "") + fmt(result.monthlySavings)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">
                    / month
                  </span>
                </div>
                <div className="mt-1 font-mono text-[0.7rem] tabular-nums text-faint">
                  {fmt(result.currentPmt)} → {fmt(result.newPmt)} · refi delta
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs tabular-nums ${
                    lifetimePositive
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-rose-500/30 bg-rose-500/[0.08] text-rose-500"
                  }`}
                >
                  <span className="text-[0.55rem] uppercase tracking-[0.18em] opacity-70">
                    Lifetime
                  </span>
                  {(result.lifetimeSavings >= 0 ? "+" : "") + fmt(result.lifetimeSavings)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-xs tabular-nums text-tool-accent">
                  <span className="text-[0.55rem] uppercase tracking-[0.18em] opacity-70">
                    Break-even
                  </span>
                  {isFinite(result.breakEvenMonths) && savingsPositive
                    ? `${result.breakEvenMonths.toFixed(0)} mo`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* mode segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "compare", label: "Compare" },
                  { k: "breakeven", label: "Break-even" },
                  { k: "schedule", label: "Schedule" },
                ] as { k: Mode; label: string }[]
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
            <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {result.verdict.reason.length > 80
                ? result.verdict.reason.slice(0, 80) + "…"
                : result.verdict.reason}
            </span>
          </div>
        </section>

        {/* Inputs grid: side-by-side current vs new */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolCard title="Current loan" subtitle="Where you are">
            <div className="space-y-4">
              <Field label="Remaining balance ($)">
                <input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="1000"
                />
              </Field>
              <Field label="Current rate (%)">
                <input
                  type="number"
                  value={currentRate}
                  onChange={(e) => setCurrentRate(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  step="0.05"
                />
              </Field>
              <Field label="Remaining term (months)">
                <input
                  type="number"
                  value={remainingMonths}
                  onChange={(e) => setRemainingMonths(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="1"
                  step="1"
                />
              </Field>
            </div>
          </ToolCard>

          <ToolCard title="Refinance offer" subtitle="Where you&apos;re going">
            <div className="space-y-4">
              <Field label="New rate (%)">
                <input
                  type="number"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  step="0.05"
                />
              </Field>
              <Field label="New term (years)">
                <input
                  type="number"
                  value={newTermYears}
                  onChange={(e) => setNewTermYears(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="1"
                  step="1"
                />
              </Field>
              <Field label="Closing costs ($)">
                <input
                  type="number"
                  value={closingCosts}
                  onChange={(e) => setClosingCosts(e.target.value)}
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="100"
                />
              </Field>
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={rollCosts}
                  onChange={(e) => setRollCosts(e.target.checked)}
                  className="h-4 w-4 accent-tool-accent"
                />
                Roll closing costs into loan
              </label>
            </div>
          </ToolCard>
        </div>

        {/* MODE: COMPARE — side-by-side ledger */}
        {mode === "compare" && (
          <ToolCard title="Old vs new" subtitle="Side-by-side ledger" className="mt-6">
            <div className="overflow-hidden rounded-lg border border-app">
              {/* Header row */}
              <div className="grid grid-cols-3 gap-px bg-app text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                <div className="bg-app-elevated px-4 py-2">Metric</div>
                <div className="bg-app-elevated px-4 py-2 text-right">Keep current</div>
                <div className="bg-app-elevated px-4 py-2 text-right">Refinance</div>
              </div>

              {/* Rate */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-app font-mono text-xs tabular-nums">
                <div className="bg-app-elevated px-4 py-2.5 text-secondary">Rate</div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-app">
                  {(parseFloat(currentRate) || 0).toFixed(2)}%
                </div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-tool-accent">
                  {(parseFloat(newRate) || 0).toFixed(2)}%
                </div>
              </div>

              {/* Payment */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-app font-mono text-xs tabular-nums">
                <div className="bg-app-elevated px-4 py-2.5 text-secondary">Monthly payment</div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-app">
                  {fmt(result.currentPmt)}
                </div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-tool-accent">
                  {fmt(result.newPmt)}
                </div>
              </div>

              {/* Term */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-app font-mono text-xs tabular-nums">
                <div className="bg-app-elevated px-4 py-2.5 text-secondary">Term remaining</div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-app">
                  {result.rm} mo
                </div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-tool-accent">
                  {result.newMonths} mo
                </div>
              </div>

              {/* Total interest */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-app font-mono text-xs tabular-nums">
                <div className="bg-app-elevated px-4 py-2.5 text-secondary">Total interest</div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-app">
                  {fmt(result.currentRemainingInterest)}
                </div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-tool-accent">
                  {fmt(result.newTotalInterest)}
                </div>
              </div>

              {/* Out of pocket */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-app font-mono text-xs tabular-nums">
                <div className="bg-app-elevated px-4 py-2.5 text-secondary">Out of pocket</div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-app">
                  {fmt(0)}
                </div>
                <div className="bg-app-elevated px-4 py-2.5 text-right text-tool-accent">
                  {fmt(result.outOfPocket)}
                </div>
              </div>

              {/* Lifetime cost */}
              <div className="grid grid-cols-3 gap-px border-t border-app bg-tool-accent-soft font-mono text-xs tabular-nums">
                <div className="bg-tool-accent-soft px-4 py-3 font-medium text-tool-accent">
                  Lifetime payments
                </div>
                <div className="bg-tool-accent-soft px-4 py-3 text-right text-app">
                  {fmt(result.currentPmt * result.rm)}
                </div>
                <div className="bg-tool-accent-soft px-4 py-3 text-right text-app">
                  {fmt(result.newPmt * result.newMonths + result.outOfPocket)}
                </div>
              </div>
            </div>

            {/* Compact stat strip */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Current payment" value={fmt(result.currentPmt)} />
              <Stat label="New payment" value={fmt(result.newPmt)} />
              <Stat
                label="Monthly savings"
                value={(result.monthlySavings >= 0 ? "+" : "") + fmt(result.monthlySavings)}
                accent={savingsPositive}
              />
              <Stat
                label="Lifetime savings"
                value={(result.lifetimeSavings >= 0 ? "+" : "") + fmt(result.lifetimeSavings)}
                accent={lifetimePositive}
              />
            </div>
          </ToolCard>
        )}

        {/* MODE: BREAK-EVEN — runway bar */}
        {mode === "breakeven" && (
          <ToolCard title="Break-even runway" subtitle="When you recover closing costs" className="mt-6">
            <div className="rounded-lg border border-app bg-app p-4">
              <div className="mb-2 flex items-baseline justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em]">
                <span className="text-tool-accent">Recovery timeline</span>
                <span className="text-muted">0 — {beCap} mo cap (7y)</span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full border border-app bg-tool-accent-soft">
                {savingsPositive && (
                  <div
                    className="absolute inset-y-0 left-0 bg-tool-accent/40"
                    style={{ width: `${bePct}%` }}
                  />
                )}
                <div
                  className="absolute inset-y-0 w-px bg-muted"
                  style={{ left: `${(60 / beCap) * 100}%` }}
                  title="5-year mark"
                />
                {savingsPositive && !beOver && (
                  <div
                    className="absolute -top-1 h-5 w-1 rounded-sm bg-tool-accent shadow-[0_0_0_2px_var(--bg)]"
                    style={{ left: `calc(${bePct}% - 2px)` }}
                  />
                )}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[0.6rem] tabular-nums text-muted">
                <span>0 mo</span>
                <span className="text-faint">| 5y mark</span>
                <span>{beOver ? `>${beCap} mo` : `${beCap} mo`}</span>
              </div>
            </div>

            <div className={`mt-4 rounded-lg border p-4 ${verdictTone}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] opacity-70">
                    Verdict
                  </div>
                  <div className="mt-1 text-base font-semibold">{result.verdict.label}</div>
                </div>
                <p className="max-w-xl text-xs opacity-90">{result.verdict.reason}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="Break-even"
                value={
                  isFinite(result.breakEvenMonths) && savingsPositive
                    ? `${result.breakEvenMonths.toFixed(0)} mo`
                    : "—"
                }
                accent={savingsPositive}
              />
              <Stat label="Closing costs" value={fmt(result.cc)} />
              <Stat
                label="Out of pocket"
                value={fmt(result.outOfPocket)}
              />
            </div>
          </ToolCard>
        )}

        {/* MODE: SCHEDULE — cumulative savings chart */}
        {mode === "schedule" && (
          <ToolCard title="Cumulative savings" subtitle="Net position month by month" className="mt-6">
            <div className="rounded-lg border border-app bg-app p-2">
              <canvas
                ref={chartRef}
                className="h-64 w-full"
                style={{ height: "260px", width: "100%" }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="Break-even at"
                value={
                  isFinite(result.breakEvenMonths) && savingsPositive
                    ? `${result.breakEvenMonths.toFixed(0)} mo`
                    : "—"
                }
                accent={savingsPositive}
              />
              <Stat
                label="Year-1 net"
                value={(series[11]?.cum ?? 0) >= 0 ? `+${fmt(series[11]?.cum ?? 0)}` : fmt(series[11]?.cum ?? 0)}
                accent={(series[11]?.cum ?? 0) >= 0}
              />
              <Stat
                label="Year-5 net"
                value={(series[59]?.cum ?? 0) >= 0 ? `+${fmt(series[59]?.cum ?? 0)}` : fmt(series[59]?.cum ?? 0)}
                accent={(series[59]?.cum ?? 0) >= 0}
              />
            </div>
          </ToolCard>
        )}

        {/* Extras */}
        <ToolCard title="Extras" subtitle="Appraisal & PMI drop" className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Appraisal cost ($)">
              <input
                type="number"
                value={inputs.appraisal}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, appraisal: e.target.value }))
                }
                className={`${inputCls()} font-mono tabular-nums`}
                step="25"
              />
            </Field>
            <Field label="Current home value ($)">
              <input
                type="number"
                value={inputs.homeValue}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, homeValue: e.target.value }))
                }
                className={`${inputCls()} font-mono tabular-nums`}
                step="1000"
              />
            </Field>
            <Field label="Current PMI ($ / mo)">
              <input
                type="number"
                value={inputs.currentPMIMonthly}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, currentPMIMonthly: e.target.value }))
                }
                className={`${inputCls()} font-mono tabular-nums`}
                step="5"
              />
            </Field>
          </div>
          <div className="mt-4 rounded-lg border border-app bg-app px-4 py-3 font-mono text-xs tabular-nums text-secondary">
            Current LTV:{" "}
            <span
              className={
                wouldDrop ? "text-emerald-500" : "text-amber-500"
              }
            >
              {ltv.toFixed(1)}%
            </span>
            {" · "}
            {wouldDrop
              ? `Under 80% — refi appraisal (${fmt(app)}) may drop PMI, saving ${fmt(pmiSavings)}/yr.`
              : `At or above 80% — PMI likely continues until LTV < 80%.`}
          </div>
        </ToolCard>

        <p className="mt-6 text-[0.65rem] leading-relaxed text-faint">
          Assumes fixed-rate loans, no pre-payment penalty, and closing costs either
          paid out-of-pocket or rolled into principal. Lifetime savings compares
          remaining payments on the current loan against total payments on the new
          loan — a longer new term may lower your monthly even when it raises lifetime cost.
        </p>
      </div>

      <ScenarioBar<Inputs>
        slug="mortgage-refi"
        state={inputs}
        onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Metric", "Value"],
              ["Current payment", result.currentPmt.toFixed(2)],
              ["New payment", result.newPmt.toFixed(2)],
              ["Monthly savings", result.monthlySavings.toFixed(2)],
              ["Break-even months", result.breakEvenMonths.toFixed(1)],
              ["Lifetime savings", result.lifetimeSavings.toFixed(2)],
              ["Verdict", result.verdict.label],
            ]),
          json: () => ({ inputs, result }),
          markdown: () =>
            `# Refi analysis\n\n| | Current | New |\n|---|---|---|\n| Rate | ${currentRate}% | ${newRate}% |\n| Payment | ${fmt(result.currentPmt)} | ${fmt(result.newPmt)} |\n\n**Monthly savings:** ${fmt(result.monthlySavings)}\n**Break-even:** ${result.breakEvenMonths.toFixed(0)} months\n**Verdict:** ${result.verdict.label} — ${result.verdict.reason}\n`,
        }}
      />
    </ToolShell>
  );
}
