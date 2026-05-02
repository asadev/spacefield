"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Finance Calculators — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Consolidates four finance / SaaS-ratio calculators into a single sidebar-
   driven app:
     • Loan / EMI            — monthly payment + amortization + sensitivity
     • Compound Interest     — investment growth with contributions, taxes
     • Rule of 40            — SaaS health score with FCF/EBITDA toggle
     • SaaS Quick Ratio      — gain/lose ratio + NRR + GRR + 12-month trend
   Logic ported verbatim from the standalone tool pages; ToolShell / hero
   CTAs / breadcrumbs / ScenarioBar are dropped in favour of an OS-native
   two-column layout sized for the workspace window. Foundation tokens only.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

/* ───────────────────────── Shared mini primitives ───────────────────────── */

const fmtUSD = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const fmtCompactUSD = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return fmtUSD(n);
};

const fieldInput =
  "w-full rounded-md border border-app bg-app px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function Field({
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
        {hint && <span className="text-[0.55rem] italic text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/** Plain number input bound to a string state. */
function NumInput({
  label,
  hint,
  value,
  onChange,
  min,
  step,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  step?: string;
  prefix?: string;
  suffix?: string;
}) {
  const inner = (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={prefix ? fieldInput + " pl-7" : suffix ? fieldInput + " pr-7" : fieldInput}
      min={min}
      step={step}
    />
  );
  return (
    <Field label={label} hint={hint}>
      {prefix || suffix ? (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">
              {prefix}
            </span>
          )}
          {inner}
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
              {suffix}
            </span>
          )}
        </div>
      ) : (
        inner
      )}
    </Field>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-app bg-app px-3 py-2">
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <span
        className={`font-mono text-sm tabular-nums ${accent ? "text-tool-accent" : "text-app"}`}
      >
        {value}
      </span>
    </div>
  );
}

function PaneHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 border-b border-app pb-4">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-app">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs text-secondary">{description}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-5">
      <h3 className="mb-3 font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Loan / EMI pane
═══════════════════════════════════════════════════════════════════════════ */

const HISTORICAL_30Y: { year: number; rate: number }[] = [
  { year: 1996, rate: 7.8 }, { year: 1997, rate: 7.6 }, { year: 1998, rate: 6.9 },
  { year: 1999, rate: 7.4 }, { year: 2000, rate: 8.1 }, { year: 2001, rate: 7.0 },
  { year: 2002, rate: 6.5 }, { year: 2003, rate: 5.8 }, { year: 2004, rate: 5.8 },
  { year: 2005, rate: 5.9 }, { year: 2006, rate: 6.4 }, { year: 2007, rate: 6.3 },
  { year: 2008, rate: 6.0 }, { year: 2009, rate: 5.0 }, { year: 2010, rate: 4.7 },
  { year: 2011, rate: 4.5 }, { year: 2012, rate: 3.7 }, { year: 2013, rate: 4.0 },
  { year: 2014, rate: 4.2 }, { year: 2015, rate: 3.9 }, { year: 2016, rate: 3.6 },
  { year: 2017, rate: 4.0 }, { year: 2018, rate: 4.5 }, { year: 2019, rate: 3.9 },
  { year: 2020, rate: 3.1 }, { year: 2021, rate: 3.0 }, { year: 2022, rate: 5.3 },
  { year: 2023, rate: 6.8 }, { year: 2024, rate: 6.7 }, { year: 2025, rate: 6.5 },
];

type LoanType = "mortgage" | "auto" | "personal" | "student" | "custom";

interface LoanInputs {
  principal: string;
  rate: string;
  years: string;
  extra: string;
  cadence: "monthly" | "biweekly";
  loanType: LoanType;
}

interface LoanScheduleRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

interface LoanResult {
  periodic: number;
  totalInterest: number;
  totalPaid: number;
  payoffMonths: number;
  interestSaved: number;
  monthsSaved: number;
  schedule: LoanScheduleRow[];
}

const LOAN_TYPES: { k: LoanType; label: string }[] = [
  { k: "mortgage", label: "Mortgage" },
  { k: "auto", label: "Auto" },
  { k: "personal", label: "Personal" },
  { k: "student", label: "Student" },
  { k: "custom", label: "Custom" },
];

const LOAN_PRESETS: Record<LoanType, Partial<LoanInputs>> = {
  mortgage: { principal: "250000", rate: "6.5", years: "25", extra: "0" },
  auto: { principal: "35000", rate: "7.5", years: "5", extra: "0" },
  personal: { principal: "15000", rate: "11", years: "3", extra: "0" },
  student: { principal: "40000", rate: "5.5", years: "10", extra: "0" },
  custom: {},
};

const LOAN_DEFAULTS: LoanInputs = {
  principal: "250000",
  rate: "6.5",
  years: "25",
  extra: "0",
  cadence: "monthly",
  loanType: "mortgage",
};

function amortize(
  principal: number,
  annualRate: number,
  years: number,
  extraMonthly: number,
  cadence: "monthly" | "biweekly"
): LoanResult {
  const n = Math.round(years * 12);
  const monthlyRate = annualRate / 100 / 12;
  if (n === 0 || principal <= 0) {
    return {
      periodic: 0,
      totalInterest: 0,
      totalPaid: 0,
      payoffMonths: 0,
      interestSaved: 0,
      monthsSaved: 0,
      schedule: [],
    };
  }

  const fullMonthly =
    monthlyRate === 0
      ? principal / n
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);
  const periodic = cadence === "biweekly" ? fullMonthly / 2 : fullMonthly;
  const baselineInterest = fullMonthly * n - principal;
  const periodicMonthly =
    cadence === "biweekly" ? fullMonthly * (26 / 24) : fullMonthly;

  let balance = principal;
  const schedule: LoanScheduleRow[] = [];
  let totalInterest = 0;
  let month = 0;
  const maxMonths = n + 12;
  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = balance * monthlyRate;
    let paid = periodicMonthly + extraMonthly;
    if (paid > balance + interest) paid = balance + interest;
    const principalPaid = paid - interest;
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    schedule.push({ month, interest, principal: principalPaid, balance });
  }

  return {
    periodic,
    totalInterest,
    totalPaid: principal + totalInterest,
    payoffMonths: month,
    interestSaved: Math.max(0, baselineInterest - totalInterest),
    monthsSaved: Math.max(0, n - month),
    schedule,
  };
}

function LoanPane() {
  const [inputs, setInputs] = useState<LoanInputs>(LOAN_DEFAULTS);

  const principal = parseFloat(inputs.principal) || 0;
  const rate = parseFloat(inputs.rate) || 0;
  const years = parseFloat(inputs.years) || 0;
  const extra = parseFloat(inputs.extra) || 0;

  const result = useMemo(
    () => amortize(principal, rate, years, extra, inputs.cadence),
    [principal, rate, years, extra, inputs.cadence]
  );

  const scenarios = useMemo(
    () => [
      { label: "Base", r: result },
      { label: "Rate +1%", r: amortize(principal, rate + 1, years, extra, inputs.cadence) },
      { label: "Rate -1%", r: amortize(principal, rate - 1, years, extra, inputs.cadence) },
      { label: "+$200/mo", r: amortize(principal, rate, years, extra + 200, inputs.cadence) },
    ],
    [principal, rate, years, extra, inputs.cadence, result]
  );

  const sensRates = [-1, -0.5, 0, 0.5, 1].map((d) => rate + d);
  const sensTerms = [15, 20, 25, 30];

  const yearly = useMemo(
    () => result.schedule.filter((s) => s.month % 12 === 0),
    [result.schedule]
  );

  const histAvg =
    HISTORICAL_30Y.reduce((a, b) => a + b.rate, 0) / HISTORICAL_30Y.length;
  const histMin = Math.min(...HISTORICAL_30Y.map((x) => x.rate));
  const histMax = Math.max(...HISTORICAL_30Y.map((x) => x.rate));

  const applyLoanType = (k: LoanType) =>
    setInputs((s) => ({ ...s, loanType: k, ...LOAN_PRESETS[k] }));

  const interestPct =
    result.totalPaid > 0 ? (result.totalInterest / result.totalPaid) * 100 : 0;
  const principalPct = 100 - interestPct;

  // Stacked principal-vs-interest chart by year (canvas)
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (result.schedule.length === 0) return;

    const yearlyAgg: { year: number; principal: number; interest: number }[] = [];
    let cur = { year: 1, principal: 0, interest: 0 };
    result.schedule.forEach((row) => {
      const yr = Math.ceil(row.month / 12);
      if (yr !== cur.year) {
        yearlyAgg.push(cur);
        cur = { year: yr, principal: 0, interest: 0 };
      }
      cur.principal += row.principal;
      cur.interest += row.interest;
    });
    yearlyAgg.push(cur);

    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--tool-accent").trim() || "#6366f1";
    const muted = styles.getPropertyValue("--text-muted").trim() || "#888";
    const border = styles.getPropertyValue("--border").trim() || "#222";

    const padL = 40, padR = 12, padT = 12, padB = 24;
    const innerW = cssW - padL - padR;
    const innerH = cssH - padT - padB;
    const maxTotal = Math.max(...yearlyAgg.map((y) => y.principal + y.interest), 1);
    const barW = innerW / yearlyAgg.length;
    const gap = Math.max(1, barW * 0.18);

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + innerH);
    ctx.lineTo(padL + innerW, padT + innerH);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = (maxTotal / 4) * i;
      const y = padT + innerH - (v / maxTotal) * innerH;
      ctx.fillText(
        v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`,
        padL - 6,
        y
      );
      ctx.strokeStyle = border;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + innerW, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    yearlyAgg.forEach((y, i) => {
      const x = padL + i * barW + gap / 2;
      const w = barW - gap;
      const totalH = ((y.principal + y.interest) / maxTotal) * innerH;
      const intH = (y.interest / maxTotal) * innerH;
      const prinH = totalH - intH;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x, padT + innerH - totalH, w, intH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.fillRect(x, padT + innerH - prinH, w, prinH);
    });

    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const stride = Math.max(1, Math.ceil(yearlyAgg.length / 8));
    yearlyAgg.forEach((y, i) => {
      if (i % stride !== 0 && i !== yearlyAgg.length - 1) return;
      const x = padL + i * barW + barW / 2;
      ctx.fillText(`Y${y.year}`, x, padT + innerH + 4);
    });
  }, [result.schedule]);

  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="Finance"
        title="Loan / EMI Calculator"
        description="Monthly or biweekly payment, full amortization, extra-payment savings, rate sensitivity. Mortgages, business loans, car loans."
      />

      {/* Result strip */}
      <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              {inputs.cadence === "biweekly" ? "Biweekly payment" : "Monthly payment"}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-medium tabular-nums tracking-tight text-app md:text-4xl">
                {fmtUSD(result.periodic)}
              </span>
              <span className="text-xs uppercase tracking-[0.18em] text-muted">
                / {inputs.cadence}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                Total interest {fmtUSD(result.totalInterest)}
              </span>
              <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                Paid {fmtUSD(result.totalPaid)}
              </span>
              <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                {Math.floor(result.payoffMonths / 12)}y {result.payoffMonths % 12}m payoff
              </span>
            </div>
            <div className="mt-2 text-[0.7rem] text-muted">
              {fmtUSD(principal)} · {rate.toFixed(2)}% · {years}y
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {LOAN_TYPES.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => applyLoanType(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  inputs.loanType === t.k
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={inputs.loanType === t.k ? { color: "var(--bg)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(["monthly", "biweekly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setInputs((s) => ({ ...s, cadence: c }))}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] capitalize transition-colors ${
                  inputs.cadence === c
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.5fr]">
        <Card title="Loan terms">
          <div className="space-y-4">
            <NumInput
              label="Principal ($)"
              hint={fmtUSD(principal)}
              value={inputs.principal}
              onChange={(v) => setInputs((s) => ({ ...s, principal: v }))}
              min="0"
              step="1000"
            />
            <NumInput
              label="Annual rate (%)"
              hint={`30y avg ~${histAvg.toFixed(1)}%`}
              value={inputs.rate}
              onChange={(v) => setInputs((s) => ({ ...s, rate: v }))}
              min="0"
              step="0.1"
            />
            <NumInput
              label="Term (years)"
              hint={`${years}y`}
              value={inputs.years}
              onChange={(v) => setInputs((s) => ({ ...s, years: v }))}
              min="0"
              step="1"
            />
            <NumInput
              label="Extra payment / month"
              hint="Optional"
              value={inputs.extra}
              onChange={(v) => setInputs((s) => ({ ...s, extra: v }))}
              min="0"
              step="50"
            />
          </div>

          <div className="mt-5 space-y-2">
            <Stat
              label={inputs.cadence === "biweekly" ? "Biweekly" : "Monthly"}
              value={fmtUSD(result.periodic)}
              accent
            />
            <Stat label="Total interest" value={fmtUSD(result.totalInterest)} />
            <Stat label="Total paid" value={fmtUSD(result.totalPaid)} />
            {(extra > 0 || inputs.cadence === "biweekly") && (
              <>
                <Stat label="Interest saved" value={fmtUSD(result.interestSaved)} />
                <Stat label="Months saved" value={`${result.monthsSaved} mo`} />
              </>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Principal vs interest · yearly composition">
            <div className="mb-3 flex items-center gap-3 text-[0.65rem]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-tool-accent" />
                <span className="font-mono uppercase tracking-[0.16em] text-secondary">
                  Principal {principalPct.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-tool-accent-soft" />
                <span className="font-mono uppercase tracking-[0.16em] text-secondary">
                  Interest {interestPct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-app bg-app p-3">
              <canvas
                ref={chartRef}
                className="block h-44 w-full"
                aria-label="Stacked principal vs interest by year"
              />
            </div>
          </Card>

          <Card title="Scenarios · side-by-side">
            <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              {scenarios.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-app bg-app p-3 transition-colors hover:border-tool-accent"
                >
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    {s.label}
                  </div>
                  <div className="mt-1 font-mono text-sm tabular-nums text-app">
                    {fmtUSD(s.r.periodic)}
                  </div>
                  <div className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                    Int: {fmtUSD(s.r.totalInterest)}
                  </div>
                  <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                    {Math.floor(s.r.payoffMonths / 12)}y {s.r.payoffMonths % 12}m
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Rate sensitivity · 2-variable grid">
            <div className="overflow-x-auto rounded-lg border border-app bg-app-elevated">
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    <th className="px-3 py-2 text-left">Rate \ Term</th>
                    {sensTerms.map((t) => (
                      <th key={t} className="px-3 py-2 text-right">
                        {t}y
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensRates.map((r) => {
                    const isCurrent = Math.abs(r - rate) < 0.01;
                    return (
                      <tr
                        key={r}
                        className={`border-t border-app ${isCurrent ? "bg-tool-accent-soft" : ""}`}
                      >
                        <td
                          className={`px-3 py-2 font-mono tabular-nums ${
                            isCurrent ? "text-tool-accent" : "text-secondary"
                          }`}
                        >
                          {r.toFixed(2)}%
                        </td>
                        {sensTerms.map((t) => {
                          const { periodic } = amortize(principal, r, t, 0, "monthly");
                          return (
                            <td
                              key={t}
                              className={`px-3 py-2 text-right font-mono tabular-nums ${
                                isCurrent ? "text-app" : "text-secondary"
                              }`}
                            >
                              {fmtUSD(periodic)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Amortization · year-end snapshot">
            {result.schedule.length === 0 ? (
              <div className="text-sm text-muted">
                Enter a positive principal and term to see the schedule.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                <div className="grid grid-cols-5 gap-px bg-app font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                  <div className="bg-app-elevated px-3 py-2">Year</div>
                  <div className="bg-app-elevated px-3 py-2 text-right">Month</div>
                  <div className="bg-app-elevated px-3 py-2 text-right">Interest</div>
                  <div className="bg-app-elevated px-3 py-2 text-right">Principal</div>
                  <div className="bg-app-elevated px-3 py-2 text-right">Balance</div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {yearly.map((row) => (
                    <div
                      key={row.month}
                      className="grid grid-cols-5 gap-px border-t border-app bg-app-elevated font-mono text-xs tabular-nums text-secondary"
                    >
                      <div className="px-3 py-2 text-tool-accent">{Math.ceil(row.month / 12)}</div>
                      <div className="px-3 py-2 text-right">{row.month}</div>
                      <div className="px-3 py-2 text-right">{fmtUSD(row.interest)}</div>
                      <div className="px-3 py-2 text-right">{fmtUSD(row.principal)}</div>
                      <div className="px-3 py-2 text-right text-app">{fmtUSD(row.balance)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="Historical 30-yr fixed · Freddie Mac PMMS 1996–2025">
            <div className="mb-2 flex items-baseline justify-between font-mono text-[0.65rem] tabular-nums text-muted">
              <span>
                {histMin.toFixed(1)}%–{histMax.toFixed(1)}%, avg {histAvg.toFixed(1)}%
              </span>
              <span className="text-tool-accent">You: {rate.toFixed(2)}%</span>
            </div>
            <div className="flex h-12 items-end gap-[2px]">
              {HISTORICAL_30Y.map((h) => (
                <div
                  key={h.year}
                  title={`${h.year}: ${h.rate}%`}
                  className={`flex-1 rounded-t-sm transition-colors ${
                    Math.abs(h.rate - rate) < 0.25 ? "bg-tool-accent" : "bg-tool-accent-soft"
                  }`}
                  style={{ height: `${(h.rate / histMax) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[0.55rem] text-faint">
              <span>1996</span>
              <span>2025</span>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Compound interest pane
═══════════════════════════════════════════════════════════════════════════ */

const CI_BENCHMARKS: { label: string; rate: number; note: string }[] = [
  { label: "S&P 500 real 1928-2024", rate: 6.9, note: "Stern / Damodaran" },
  { label: "S&P 500 nominal 1928-2024", rate: 9.8, note: "Stern / Damodaran" },
  { label: "10-yr US Treasury 1928-2024", rate: 4.6, note: "Stern / Damodaran" },
  { label: "60/40 portfolio (real)", rate: 5.4, note: "Vanguard 2024" },
  { label: "Gold real 1928-2024", rate: 0.9, note: "Stern / Damodaran" },
  { label: "US inflation avg 1928-2024", rate: 3.1, note: "BLS CPI-U" },
];

interface CIInputs {
  principal: string;
  monthly: string;
  rate: string;
  years: string;
  freq: string;
  inflation: string;
  taxRate: string;
  useReal: boolean;
  useTax: boolean;
}

const CI_DEFAULTS: CIInputs = {
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

const FREQ_OPTIONS: { v: string; label: string }[] = [
  { v: "365", label: "Daily" },
  { v: "12", label: "Monthly" },
  { v: "4", label: "Quarterly" },
  { v: "1", label: "Annually" },
];

function grow(
  principal: number,
  monthly: number,
  annualRate: number,
  years: number,
  compoundsPerYear: number,
  taxDrag: number
) {
  const rate = annualRate / 100;
  const n = compoundsPerYear;
  const periodRate = rate / n;
  const periods = Math.round(years * n);
  const monthlyPerPeriod = (monthly * 12) / n;

  const snapshots: { year: number; balance: number; contributions: number }[] = [];
  let balance = principal;
  let contributions = principal;

  for (let p = 1; p <= periods; p++) {
    const earnings = balance * periodRate;
    const taxed = earnings * (1 - taxDrag);
    balance = balance + taxed + monthlyPerPeriod;
    contributions += monthlyPerPeriod;
    if (p % n === 0) snapshots.push({ year: p / n, balance, contributions });
  }
  return {
    final: balance,
    contributed: contributions,
    earned: balance - contributions,
    snapshots,
  };
}

function CompoundInterestPane() {
  const [inputs, setInputs] = useState<CIInputs>(CI_DEFAULTS);

  const principal = parseFloat(inputs.principal) || 0;
  const monthly = parseFloat(inputs.monthly) || 0;
  const nominalRate = parseFloat(inputs.rate) || 0;
  const years = parseFloat(inputs.years) || 0;
  const freq = parseInt(inputs.freq) || 12;
  const inflation = parseFloat(inputs.inflation) || 0;
  const taxRate = parseFloat(inputs.taxRate) || 0;

  const realRate = ((1 + nominalRate / 100) / (1 + inflation / 100) - 1) * 100;
  const effectiveRate = inputs.useReal ? realRate : nominalRate;
  const taxDrag = inputs.useTax ? taxRate / 100 : 0;

  const result = useMemo(
    () => grow(principal, monthly, effectiveRate, years, freq, taxDrag),
    [principal, monthly, effectiveRate, years, freq, taxDrag]
  );

  const scenarios = useMemo(
    () => [
      { label: "Conservative", rate: 4, r: grow(principal, monthly, 4, years, freq, taxDrag) },
      { label: "Base", rate: effectiveRate, r: result },
      { label: "Aggressive", rate: 10, r: grow(principal, monthly, 10, years, freq, taxDrag) },
    ],
    [principal, monthly, years, freq, taxDrag, result, effectiveRate]
  );

  const peakBalance = Math.max(1, ...result.snapshots.map((s) => s.balance));
  const multiple = principal > 0 ? result.final / principal : 0;
  const earnedPct = result.final > 0 ? (result.earned / result.final) * 100 : 0;

  const curvePath = useMemo(() => {
    if (result.snapshots.length === 0)
      return { line: "", area: "", contribLine: "", contribArea: "" };
    const pts = result.snapshots;
    const n = pts.length;
    const xAt = (i: number) => (i / Math.max(1, n - 1)) * 100;
    const yAt = (v: number) => 100 - (v / peakBalance) * 100;
    const lineCoords = pts.map((s, i) => `${xAt(i)},${yAt(s.balance)}`);
    const line = "M" + lineCoords.join(" L");
    const area = "M" + `${xAt(0)},100 L` + lineCoords.join(" L") + ` L${xAt(n - 1)},100 Z`;
    const contribCoords = pts.map((s, i) => `${xAt(i)},${yAt(s.contributions)}`);
    const contribLine = "M" + contribCoords.join(" L");
    const contribArea =
      "M" + `${xAt(0)},100 L` + contribCoords.join(" L") + ` L${xAt(n - 1)},100 Z`;
    return { line, area, contribLine, contribArea };
  }, [result.snapshots, peakBalance]);

  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="Finance"
        title="Compound Interest Calculator"
        description="Model investment growth with contributions, compounding, inflation drag, and taxes. Curve + scenarios + benchmarks."
      />

      {/* Future-value strip */}
      <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            {inputs.useReal ? "REAL" : "NOMINAL"}
          </span>
          {inputs.useTax && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-amber-500">
              AFTER-TAX
            </span>
          )}
          <span className="ml-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            {effectiveRate.toFixed(2)}% · {years || 0}y · {freq}cpy
          </span>
        </div>

        <div className="p-5">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Future value · year {years || 0}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight text-tool-accent sm:text-6xl">
              {fmtCompactUSD(result.final)}
            </span>
            <span className="font-mono text-base tabular-nums text-muted">
              {multiple > 0 && principal > 0 ? `× ${multiple.toFixed(1)} principal` : ""}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
              + {fmtUSD(result.earned)} earned
            </span>
            <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
              Contributed {fmtUSD(result.contributed)}
            </span>
            <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
              {effectiveRate.toFixed(2)}% ·{" "}
              {freq === 1 ? "annually" : freq === 4 ? "quarterly" : freq === 12 ? "monthly" : "daily"}
            </span>
            <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
              {earnedPct.toFixed(0)}% interest share
            </span>
          </div>
          <div className="mt-4 border-t border-dashed border-app pt-3 font-mono text-xs text-secondary">
            <span className="text-faint">//</span> Real rate ≈{" "}
            <span className="font-semibold text-app">{realRate.toFixed(2)}%</span> via Fisher:
            (1+nom)/(1+inf) − 1.
          </div>
        </div>

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
                style={inputs.freq === f.v ? { color: "var(--bg)" } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInputs((s) => ({ ...s, useReal: !s.useReal }))}
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

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <Card title="Terms · USD inputs">
          <div className="space-y-4">
            <NumInput
              label="Starting principal"
              prefix="$"
              value={inputs.principal}
              onChange={(v) => setInputs((s) => ({ ...s, principal: v }))}
              min="0"
              step="100"
            />
            <NumInput
              label="Monthly contribution"
              prefix="$"
              value={inputs.monthly}
              onChange={(v) => setInputs((s) => ({ ...s, monthly: v }))}
              min="0"
              step="50"
            />
            <div className="grid grid-cols-2 gap-3">
              <NumInput
                label="Annual rate"
                hint="nominal %"
                value={inputs.rate}
                onChange={(v) => setInputs((s) => ({ ...s, rate: v }))}
                step="0.1"
              />
              <NumInput
                label="Years"
                value={inputs.years}
                onChange={(v) => setInputs((s) => ({ ...s, years: v }))}
                min="0"
                step="1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumInput
                label="Inflation"
                hint="Fisher %"
                value={inputs.inflation}
                onChange={(v) => setInputs((s) => ({ ...s, inflation: v }))}
                step="0.1"
              />
              <NumInput
                label="Tax on gains"
                hint="drag %"
                value={inputs.taxRate}
                onChange={(v) => setInputs((s) => ({ ...s, taxRate: v }))}
                step="0.1"
              />
            </div>
          </div>
        </Card>

        <Card title="Growth curve · contributions vs interest">
          <p className="mb-3 text-[0.7rem] text-muted">
            Year-end balances. Lower band is what you put in; the gap is what compounding made.
          </p>
          {result.snapshots.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-app bg-app font-mono text-xs text-faint">
              Enter positive years to see the growth curve.
            </div>
          ) : (
            <>
              <div className="relative h-64 w-full overflow-hidden rounded-lg border border-app bg-app">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-14 flex-col justify-between border-r border-app px-1.5 py-2 font-mono text-[0.55rem] tabular-nums text-faint">
                  <span>{fmtCompactUSD(peakBalance)}</span>
                  <span>{fmtCompactUSD(peakBalance * 0.66)}</span>
                  <span>{fmtCompactUSD(peakBalance * 0.33)}</span>
                  <span>$0</span>
                </div>
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 ml-14 h-full w-[calc(100%-3.5rem)]"
                >
                  <defs>
                    <linearGradient id="ci-int-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" className="text-tool-accent" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" className="text-tool-accent" />
                    </linearGradient>
                    <linearGradient id="ci-con-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" className="text-tool-accent" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" className="text-tool-accent" />
                    </linearGradient>
                  </defs>
                  <g stroke="var(--border)" strokeWidth="0.15" vectorEffect="non-scaling-stroke">
                    <line x1="0" y1="33" x2="100" y2="33" />
                    <line x1="0" y1="66" x2="100" y2="66" />
                  </g>
                  <path d={curvePath.area} fill="url(#ci-int-fill)" className="text-tool-accent" />
                  <path d={curvePath.contribArea} fill="url(#ci-con-fill)" className="text-tool-accent" />
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
                    className="text-tool-accent"
                  />
                </svg>
                <div className="pointer-events-none absolute inset-x-14 bottom-1 flex justify-between font-mono text-[0.55rem] tabular-nums text-faint">
                  <span>Yr 0</span>
                  <span>Yr {Math.round((result.snapshots.length || 0) / 2)}</span>
                  <span>Yr {result.snapshots.length}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[3rem_1fr_6rem_4rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span>Year</span>
                <span>Bar</span>
                <span className="text-right">Balance</span>
                <span className="text-right">% int.</span>
              </div>
              <div className="mt-2 max-h-56 space-y-[2px] overflow-y-auto pr-1 font-mono text-[0.7rem]">
                {result.snapshots.map((s) => {
                  const intPctSnap =
                    s.balance > 0 ? ((s.balance - s.contributions) / s.balance) * 100 : 0;
                  return (
                    <div
                      key={s.year}
                      className="grid grid-cols-[3rem_1fr_6rem_4rem] items-center gap-2 rounded-md px-1 py-0.5 text-secondary"
                    >
                      <span className="tabular-nums text-faint">Yr {s.year.toString().padStart(2, "0")}</span>
                      <div className="relative h-2.5 overflow-hidden rounded bg-app">
                        <div
                          className="absolute left-0 top-0 h-full bg-tool-accent opacity-70"
                          style={{ width: `${(s.balance / peakBalance) * 100}%` }}
                        />
                      </div>
                      <span className="text-right tabular-nums text-app">{fmtUSD(s.balance)}</span>
                      <span className="text-right tabular-nums text-tool-accent">
                        {intPctSnap.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </section>

      <Card title="Scenarios · 4% / base / 10%">
        <p className="mb-3 text-[0.7rem] text-muted">
          Same principal, monthly, and horizon — different rate regime.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {scenarios.map((s) => {
            const isBase = s.label === "Base";
            return (
              <div
                key={s.label}
                className={`relative overflow-hidden rounded-xl border p-4 ${
                  isBase ? "border-tool-accent bg-tool-accent-soft" : "border-app bg-app"
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                  <span className={isBase ? "text-tool-accent" : "text-muted"}>{s.label}</span>
                  <span className="tabular-nums text-faint">{s.rate.toFixed(1)}%</span>
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-app">
                  {fmtCompactUSD(s.r.final)}
                </div>
                <div className="mt-1 font-mono text-[0.7rem] tabular-nums text-muted">
                  Earned {fmtUSD(s.r.earned)}
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded bg-app-elevated">
                  <div
                    className="h-full bg-tool-accent"
                    style={{
                      width: `${Math.min(100, (s.r.final / Math.max(...scenarios.map((x) => x.r.final), 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Benchmark returns · long-run context">
        <ul className="divide-y divide-[color:var(--border)] font-mono text-xs">
          {CI_BENCHMARKS.map((b) => (
            <li key={b.label} className="flex items-center justify-between gap-3 py-2">
              <span className="text-secondary">{b.label}</span>
              <span className="flex items-baseline gap-3">
                <span className="tabular-nums text-app">{b.rate.toFixed(1)}%</span>
                <span className="text-[0.55rem] text-faint">{b.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.6rem] leading-relaxed text-faint">
          Past performance is not a forecast. 95-year windows smooth out regimes you&apos;ll
          actually live through.
        </p>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Rule of 40 pane
═══════════════════════════════════════════════════════════════════════════ */

const R40_LS_KEY = "solutions:rule-of-40:v1";

type MarginKind = "fcf" | "ebitda";

interface R40State {
  growth: string;
  margin: string;
  marginKind: MarginKind;
}

const R40_DEFAULT: R40State = { growth: "35", margin: "10", marginKind: "fcf" };

const R40_BENCHMARKS: { name: string; growth: number; margin: number; note: string }[] = [
  { name: "Snowflake", growth: 28, margin: 34, note: "Hyper-growth + strong FCF" },
  { name: "CrowdStrike", growth: 29, margin: 26, note: "Best-in-class" },
  { name: "ServiceNow", growth: 22, margin: 32, note: "Durable compounder" },
  { name: "Datadog", growth: 26, margin: 28, note: "Developer platform" },
  { name: "Cloudflare", growth: 28, margin: 12, note: "Infra growth" },
  { name: "Zscaler", growth: 26, margin: 23, note: "Security growth" },
  { name: "HubSpot", growth: 21, margin: 18, note: "SMB marketing" },
  { name: "MongoDB", growth: 22, margin: 8, note: "DBaaS" },
  { name: "Salesforce", growth: 9, margin: 32, note: "Mature SaaS cash machine" },
  { name: "Zoom", growth: 3, margin: 35, note: "Margin over growth" },
  { name: "Okta", growth: 12, margin: 19, note: "Recovering" },
  { name: "Box", growth: 5, margin: 25, note: "Slow & steady" },
];

function r40Verdict(score: number): {
  label: string;
  band: "world" | "strong" | "average" | "weak" | "losing";
} {
  if (score >= 60) return { label: "World-class", band: "world" };
  if (score >= 40) return { label: "Strong", band: "strong" };
  if (score >= 20) return { label: "Average", band: "average" };
  if (score >= 0) return { label: "Weak", band: "weak" };
  return { label: "Losing ground", band: "losing" };
}

function R40TabButton({
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

function RuleOf40Pane() {
  const [state, setState] = useState<R40State>(R40_DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<"peers" | "table">("peers");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(R40_LS_KEY);
      if (raw) setState({ ...R40_DEFAULT, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(R40_LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const { growthN, marginN, score, v } = useMemo(() => {
    const g = parseFloat(state.growth) || 0;
    const m = parseFloat(state.margin) || 0;
    const s = g + m;
    return { growthN: g, marginN: m, score: s, v: r40Verdict(s) };
  }, [state]);

  const healthy = score >= 40;
  const bandClasses = healthy
    ? {
        text: "text-tool-accent",
        chip: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
        dot: "bg-tool-accent",
        fill: "bg-tool-accent",
      }
    : v.band === "losing"
    ? {
        text: "text-rose-500",
        chip: "bg-rose-500/10 text-rose-500 border-rose-500/30",
        dot: "bg-rose-500 animate-pulse",
        fill: "bg-rose-500",
      }
    : {
        text: "text-amber-500",
        chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
        dot: "bg-amber-500",
        fill: "bg-amber-500",
      };

  const STACK_MAX = 60;
  const stackPos = (val: number) => Math.max(0, Math.min(100, (val / STACK_MAX) * 100));
  const growthStack = stackPos(Math.max(0, growthN));
  const marginPosStack = stackPos(Math.max(0, marginN));
  const marginNegStack = stackPos(Math.max(0, -marginN));
  const thresholdPct = (40 / STACK_MAX) * 100;
  const sumPos = Math.max(0, growthN) + Math.max(0, marginN);
  const growthShare = sumPos === 0 ? 0 : Math.max(0, growthN) / sumPos;
  const marginShare = 1 - growthShare;

  const peerScores = useMemo(
    () => R40_BENCHMARKS.map((b) => b.growth + b.margin).sort((a, b) => a - b),
    []
  );
  const userPercentile = useMemo(() => {
    const below = peerScores.filter((s) => s <= score).length;
    return Math.round((below / peerScores.length) * 100);
  }, [peerScores, score]);

  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="SaaS · health"
        title="Rule of 40"
        description="Growth + margin should clear 40. The line between premium SaaS and the rest. FCF or EBITDA toggle, peer percentile."
      />

      {/* Combined-score block */}
      <section className="overflow-hidden rounded-xl border border-app bg-app-elevated px-6 py-6">
        <div className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
          Combined score · Growth + Margin
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span
            className={`text-6xl font-semibold tabular-nums leading-none tracking-tight sm:text-7xl ${bandClasses.text}`}
          >
            {score.toFixed(0)}
          </span>
          <span className="font-mono text-2xl tabular-nums text-muted">/ 40</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] ${bandClasses.chip}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
            {v.label}
          </span>
          <span className="font-mono text-[0.65rem] tabular-nums text-secondary">
            {growthN.toFixed(1)}%<span className="text-muted"> growth</span>
            {" + "}
            {marginN.toFixed(1)}%
            <span className="text-muted"> {state.marginKind === "fcf" ? "FCF" : "EBITDA"}</span>
          </span>
        </div>

        <div className="relative mt-6">
          <div className="mb-1.5 flex items-baseline justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            <span>Stacked composition</span>
            <span className="tabular-nums text-secondary">0 — 40 — 60+</span>
          </div>
          <div className="relative h-6 overflow-hidden rounded-full border border-app bg-app">
            {marginN < 0 && (
              <div
                className="absolute top-0 h-full bg-rose-500/55"
                style={{ width: `${marginNegStack}%`, left: 0 }}
              />
            )}
            <div
              className="absolute left-0 top-0 h-full bg-tool-accent transition-all"
              style={{ width: `${growthStack}%` }}
            />
            {marginN > 0 && (
              <div
                className="absolute top-0 h-full bg-tool-accent/55 transition-all"
                style={{ width: `${marginPosStack}%`, left: `${growthStack}%` }}
              />
            )}
            <div
              className="absolute top-0 h-full w-px bg-app-elevated"
              style={{ left: `${thresholdPct}%` }}
            />
            <div
              className="absolute -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent"
              style={{ left: `${thresholdPct}%`, top: "-1.1rem" }}
            >
              40
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" />
              Growth · {(growthShare * 100).toFixed(0)}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent/55" />
              Margin · {(marginShare * 100).toFixed(0)}%
            </span>
            {marginN < 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/55" />
                Margin drag
              </span>
            )}
            <span className="ml-auto text-secondary">
              {healthy
                ? "Above the 40 line. Premium SaaS multiples live here."
                : score >= 20
                ? "Below the bar — push growth or margin without breaking the other."
                : score >= 0
                ? "Both levers underperforming."
                : "Burning growth and margin together."}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="01 · Inputs">
          <div className="space-y-4">
            <NumInput
              label="Revenue growth YoY"
              hint="%"
              suffix="%"
              value={state.growth}
              onChange={(v) => setState((s) => ({ ...s, growth: v }))}
              step="1"
            />

            <div>
              <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                Margin type
              </div>
              <div className="flex gap-2">
                {(["fcf", "ebitda"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setState((s) => ({ ...s, marginKind: k }))}
                    className={`flex-1 rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
                      state.marginKind === k
                        ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
                    }`}
                  >
                    {k === "fcf" ? "FCF margin" : "EBITDA margin"}
                  </button>
                ))}
              </div>
            </div>

            <NumInput
              label={`${state.marginKind === "fcf" ? "FCF" : "EBITDA"} margin`}
              hint="can be negative"
              suffix="%"
              value={state.margin}
              onChange={(v) => setState((s) => ({ ...s, margin: v }))}
              step="1"
            />

            <div className="flex items-center justify-between rounded-md border border-dashed border-app bg-app px-3 py-2 font-mono text-[0.7rem]">
              <span className="text-muted">Growth + margin</span>
              <span className={`tabular-nums font-semibold ${bandClasses.text}`}>
                {score.toFixed(1)} {healthy ? "≥" : "<"} 40
              </span>
            </div>
          </div>
        </Card>

        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-app">
              02 · Peer analysis · Public SaaS Q4 2024
            </h3>
            <div className="flex items-center gap-2">
              <R40TabButton active={analysisTab === "peers"} onClick={() => setAnalysisTab("peers")}>
                Percentile
              </R40TabButton>
              <R40TabButton active={analysisTab === "table"} onClick={() => setAnalysisTab("table")}>
                Table
              </R40TabButton>
            </div>
          </div>

          {analysisTab === "peers" ? (
            <PeerPercentileChart
              peerScores={peerScores}
              userScore={score}
              userPercentile={userPercentile}
              bandClasses={bandClasses}
              benchmarks={R40_BENCHMARKS}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-app">
              <table className="w-full font-mono text-xs">
                <thead className="bg-app text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                      Company
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                      Growth
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                      Margin
                    </th>
                    <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                      R40
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...R40_BENCHMARKS]
                    .sort((a, b) => b.growth + b.margin - (a.growth + a.margin))
                    .map((b) => {
                      const r40 = b.growth + b.margin;
                      return (
                        <tr key={b.name} className="border-t border-app text-secondary">
                          <td className="px-3 py-2 font-sans font-medium text-app">{b.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.growth}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.margin}%</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              r40 >= 40 ? "text-tool-accent" : "text-muted"
                            }`}
                          >
                            {r40}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
            Source: company earnings (10-Q/10-K), Clouded Judgement Q4 2024 · TTM revenue growth &
            FCF margin
          </p>
        </div>
      </section>

      <p className="text-[0.65rem] leading-relaxed text-muted">
        Rule of 40 = revenue growth (%) + profitability margin (%). Above 40 is the bar public
        markets pay premium multiples for. FCF is the harder, cleaner test; EBITDA is the friendlier
        one.
      </p>
    </div>
  );
}

function PeerPercentileChart({
  peerScores,
  userScore,
  userPercentile,
  bandClasses,
  benchmarks,
}: {
  peerScores: number[];
  userScore: number;
  userPercentile: number;
  bandClasses: { text: string; chip: string; dot: string; fill: string };
  benchmarks: { name: string; growth: number; margin: number }[];
}) {
  const lo = Math.min(0, peerScores[0] ?? 0, userScore);
  const hi = Math.max(80, peerScores[peerScores.length - 1] ?? 80, userScore);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          Where you sit vs {peerScores.length} listed peers
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] ${bandClasses.chip}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
          P{userPercentile}
        </span>
      </div>

      <div className="relative h-14">
        <div className="absolute inset-x-0 top-7 h-1 rounded-full bg-app" />
        <div
          className="absolute top-7 h-1 rounded-r-full bg-tool-accent/30"
          style={{ left: `${pos(40)}%`, right: 0 }}
        />
        <div
          className="absolute top-3 h-9 w-px bg-tool-accent/60"
          style={{ left: `${pos(40)}%` }}
        />
        <div
          className="absolute top-0 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent"
          style={{ left: `${pos(40)}%` }}
        >
          R40
        </div>
        {benchmarks.map((b) => {
          const score = b.growth + b.margin;
          const isHealthy = score >= 40;
          return (
            <div
              key={b.name}
              title={`${b.name}: ${score} (G ${b.growth}% / M ${b.margin}%)`}
              className={`absolute top-7 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                isHealthy ? "bg-tool-accent/70" : "bg-app-elevated border border-app"
              }`}
              style={{ left: `${pos(score)}%` }}
            />
          );
        })}
        <div
          className={`absolute top-7 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${bandClasses.fill} ring-4 ring-app shadow`}
          style={{ left: `${pos(userScore)}%` }}
        />
        <div
          className={`absolute top-11 -translate-x-1/2 whitespace-nowrap font-mono text-[0.6rem] font-semibold ${bandClasses.text}`}
          style={{ left: `${pos(userScore)}%` }}
        >
          You · {userScore.toFixed(0)}
        </div>
        <div className="absolute -bottom-3 left-0 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {lo.toFixed(0)}
        </div>
        <div className="absolute -bottom-3 right-0 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {hi.toFixed(0)}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          <span>Peer distribution</span>
          <span className="tabular-nums text-secondary">
            {peerScores.filter((s) => s >= 40).length}/{peerScores.length} above 40
          </span>
        </div>
        {(() => {
          const bins = 8;
          const binW = span / bins;
          const counts = new Array(bins).fill(0);
          for (const s of peerScores) {
            const idx = Math.min(bins - 1, Math.max(0, Math.floor((s - lo) / binW)));
            counts[idx]++;
          }
          const peak = Math.max(...counts, 1);
          const userBin = Math.min(bins - 1, Math.max(0, Math.floor((userScore - lo) / binW)));
          return (
            <div className="flex h-16 items-end gap-1 rounded-md border border-app bg-app p-2">
              {counts.map((c, i) => {
                const binStart = lo + i * binW;
                const isHealthyBin = binStart + binW / 2 >= 40;
                const isUserBin = i === userBin;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t transition-colors ${
                      isUserBin
                        ? bandClasses.fill
                        : isHealthyBin
                        ? "bg-tool-accent/45"
                        : "bg-app-elevated"
                    }`}
                    style={{ height: `${(c / peak) * 100}%`, minHeight: c > 0 ? "4px" : 0 }}
                    title={`${binStart.toFixed(0)}–${(binStart + binW).toFixed(0)}: ${c} peers`}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SaaS Quick Ratio pane
═══════════════════════════════════════════════════════════════════════════ */

const QR_LS_KEY = "solutions:saas-quick-ratio:v1";
const QR_TREND_KEY = "solutions:saas-quick-ratio:trend:v1";

interface QRMonthRow {
  id: string;
  label: string;
  starting: string;
  newMrr: string;
  expansion: string;
  churn: string;
  contraction: string;
}

interface QRState {
  starting: string;
  newMrr: string;
  expansion: string;
  churn: string;
  contraction: string;
}

const QR_DEFAULT: QRState = {
  starting: "200000",
  newMrr: "30000",
  expansion: "10000",
  churn: "6000",
  contraction: "2000",
};

function qrVerdict(qr: number): { label: string; blurb: string } {
  if (qr === Infinity || qr >= 4)
    return { label: "Excellent", blurb: "Growth dwarfs revenue loss. Pour fuel on the fire." };
  if (qr >= 2)
    return { label: "Solid", blurb: "Net adding MRR meaningfully. Healthy SaaS." };
  if (qr >= 1)
    return {
      label: "Break-even",
      blurb: "Gaining barely faster than you're losing. Churn is the enemy.",
    };
  return {
    label: "Shrinking",
    blurb: "More MRR leaves than arrives. Retention work, not marketing.",
  };
}

function buildQRDefaultTrend(): QRMonthRow[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      id: `m${i}`,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      starting: "",
      newMrr: "25000",
      expansion: "8000",
      churn: "5000",
      contraction: "1500",
    };
  });
}

function computeQR(r: QRMonthRow) {
  const n = parseFloat(r.newMrr) || 0;
  const e = parseFloat(r.expansion) || 0;
  const c = parseFloat(r.churn) || 0;
  const co = parseFloat(r.contraction) || 0;
  const gained = n + e;
  const lost = c + co;
  return lost === 0 ? (gained > 0 ? Infinity : 0) : gained / lost;
}

function SaaSQuickRatioPane() {
  const [state, setState] = useState<QRState>(QR_DEFAULT);
  const [trend, setTrend] = useState<QRMonthRow[]>(buildQRDefaultTrend());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QR_LS_KEY);
      if (raw) setState({ ...QR_DEFAULT, ...JSON.parse(raw) });
      const rawTrend = localStorage.getItem(QR_TREND_KEY);
      if (rawTrend) {
        const parsed = JSON.parse(rawTrend);
        if (Array.isArray(parsed)) setTrend(parsed);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(QR_TREND_KEY, JSON.stringify(trend));
    } catch {}
  }, [trend, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(QR_LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const { newN, expN, churnN, contN, gained, lost, qr, net, nrr, grr, endingMrr, v } =
    useMemo(() => {
      const s = parseFloat(state.starting) || 0;
      const n = parseFloat(state.newMrr) || 0;
      const e = parseFloat(state.expansion) || 0;
      const c = parseFloat(state.churn) || 0;
      const co = parseFloat(state.contraction) || 0;
      const g = n + e;
      const l = c + co;
      const q = l === 0 ? (g > 0 ? Infinity : 0) : g / l;
      const net = g - l;
      const end = s + net;
      const nrr = s > 0 ? ((s + e - c - co) / s) * 100 : 0;
      const grr = s > 0 ? ((s - c - co) / s) * 100 : 0;
      return {
        newN: n, expN: e, churnN: c, contN: co,
        gained: g, lost: l, qr: q, net, nrr, grr,
        endingMrr: end, v: qrVerdict(q),
      };
    }, [state]);

  const DIAL_MAX = 6;
  const dialQr = qr === Infinity ? DIAL_MAX : Math.max(0, Math.min(DIAL_MAX, qr));
  const dialPct = dialQr / DIAL_MAX;
  const arcLen = Math.PI * 80;
  const dialOffset = arcLen * (1 - dialPct);
  const tick2Pct = 2 / DIAL_MAX;
  const tick4Pct = 4 / DIAL_MAX;

  type Band = "healthy" | "ok" | "risk" | "shrink";
  const band: Band =
    qr === Infinity || qr >= 4
      ? "healthy"
      : qr >= 2
      ? "ok"
      : qr >= 1
      ? "risk"
      : "shrink";

  const bandClasses =
    band === "healthy"
      ? {
          text: "text-tool-accent",
          chip: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
          dot: "bg-tool-accent",
          stroke: "stroke-tool-accent",
        }
      : band === "ok"
      ? {
          text: "text-violet-500",
          chip: "bg-violet-500/10 text-violet-500 border-violet-500/30",
          dot: "bg-violet-500",
          stroke: "stroke-violet-500",
        }
      : band === "risk"
      ? {
          text: "text-amber-500",
          chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
          dot: "bg-amber-500",
          stroke: "stroke-amber-500",
        }
      : {
          text: "text-rose-500",
          chip: "bg-rose-500/10 text-rose-500 border-rose-500/30",
          dot: "bg-rose-500 animate-pulse",
          stroke: "stroke-rose-500",
        };

  const flowMax = Math.max(gained, lost, 1);
  const newBarW = (newN / flowMax) * 100;
  const expBarW = (expN / flowMax) * 100;
  const churnBarW = (churnN / flowMax) * 100;
  const contBarW = (contN / flowMax) * 100;

  // Trend sparkline
  const trendQrs = trend.map((r) => {
    const q = computeQR(r);
    return q === Infinity ? DIAL_MAX : q;
  });
  const trendMax = Math.max(DIAL_MAX, ...trendQrs);
  const trendW = 600, trendH = 140, trendPad = 8;
  const innerW = trendW - trendPad * 2;
  const innerH = trendH - trendPad * 2;
  const stepX = trendQrs.length > 1 ? innerW / (trendQrs.length - 1) : 0;
  const trendPoints = trendQrs.map((q, i) => {
    const x = trendPad + i * stepX;
    const y = trendPad + innerH * (1 - q / trendMax);
    return { x, y };
  });
  const trendPath = trendPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const trendArea =
    trendPath +
    ` L${trendPad + (trendQrs.length - 1) * stepX},${trendPad + innerH} L${trendPad},${trendPad + innerH} Z`;
  const yAt = (q: number) =>
    trendPad + innerH * (1 - Math.max(0, Math.min(trendMax, q)) / trendMax);
  const y2 = yAt(2);
  const y4 = yAt(4);

  const recommendation =
    band === "healthy"
      ? "Pour fuel on growth — CAC payback and hiring should expand."
      : band === "ok"
      ? "Healthy. Trim churn one notch and you're best-in-class."
      : band === "risk"
      ? "Retention is the bottleneck — work on churn before more spend."
      : "Stop net-new spend. Fix product/onboarding before pouring more in.";

  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="SaaS · health"
        title="SaaS Quick Ratio"
        description="Gained MRR over lost MRR. Plus net revenue retention, gross retention, and a 12-month trend. ≥4 healthy, 2–4 ok, <2 risk."
      />

      {/* Hero with ratio dial */}
      <header className="overflow-hidden rounded-xl border border-app bg-app-elevated px-6 py-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex flex-col items-center">
            <div className="relative">
              <svg viewBox="0 0 200 120" className="w-[260px] sm:w-[300px]" aria-hidden>
                {/* Color band track segments */}
                {(
                  [
                    [0, 1, "stroke-rose-500"],
                    [1, 2, "stroke-amber-500"],
                    [2, 4, "stroke-violet-500"],
                    [4, 6, "stroke-tool-accent"],
                  ] as const
                ).map(([from, to, cls]) => {
                  const start = arcLen * (1 - to / DIAL_MAX);
                  const len = arcLen * ((to - from) / DIAL_MAX);
                  return (
                    <path
                      key={`${from}-${to}`}
                      d="M10 90 A 80 80 0 0 1 190 90"
                      fill="none"
                      className={cls}
                      strokeWidth="14"
                      strokeLinecap="butt"
                      strokeDasharray={`${len} ${arcLen}`}
                      strokeDashoffset={start}
                      opacity="0.18"
                    />
                  );
                })}
                <path
                  d="M10 90 A 80 80 0 0 1 190 90"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M10 90 A 80 80 0 0 1 190 90"
                  fill="none"
                  className={bandClasses.stroke}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={arcLen}
                  strokeDashoffset={dialOffset}
                  style={{ transition: "stroke-dashoffset 400ms ease" }}
                />
                {[
                  { pct: tick2Pct, label: "2" },
                  { pct: tick4Pct, label: "4" },
                ].map((t) => {
                  const angle = Math.PI * (1 - t.pct);
                  const x1 = 100 + Math.cos(angle) * 70;
                  const y1 = 90 - Math.sin(angle) * 70;
                  const x2 = 100 + Math.cos(angle) * 92;
                  const y2 = 90 - Math.sin(angle) * 92;
                  return (
                    <g key={t.label}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-muted)" strokeWidth="1.4" strokeDasharray="2 2" />
                      <text x={x2} y={y2 - 4} textAnchor="middle" fill="var(--text-muted)" className="font-mono text-[7px] uppercase tracking-[0.2em]">
                        {t.label}
                      </text>
                    </g>
                  );
                })}
                <text x="10" y="108" textAnchor="middle" fill="var(--text-faint)" className="font-mono text-[7px]">0</text>
                <text x="190" y="108" textAnchor="middle" fill="var(--text-faint)" className="font-mono text-[7px]">{DIAL_MAX}+</text>
              </svg>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
                <div
                  className={`font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight sm:text-6xl ${bandClasses.text}`}
                >
                  {qr === Infinity ? "∞" : qr.toFixed(2)}
                </div>
                <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Quick ratio
                </div>
              </div>
            </div>
            <div
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] ${bandClasses.chip}`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
              {v.label}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-secondary">{v.blurb}</p>
            <div
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${bandClasses.chip}`}
            >
              <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${bandClasses.dot}`} />
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] opacity-80">
                  Next move
                </div>
                <div className="mt-0.5 text-sm font-medium opacity-95">{recommendation}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Monthly MRR flows · USD inputs">
          <div className="space-y-4">
            <NumInput
              label="Starting MRR"
              hint="Month start"
              value={state.starting}
              onChange={(v) => setState((s) => ({ ...s, starting: v }))}
              min="0"
              step="100"
            />
            <NumInput
              label="New MRR"
              hint="From new customers"
              value={state.newMrr}
              onChange={(v) => setState((s) => ({ ...s, newMrr: v }))}
              min="0"
              step="100"
            />
            <NumInput
              label="Expansion MRR"
              hint="Upsell, seat adds"
              value={state.expansion}
              onChange={(v) => setState((s) => ({ ...s, expansion: v }))}
              min="0"
              step="100"
            />
            <NumInput
              label="Churned MRR"
              hint="Cancellations"
              value={state.churn}
              onChange={(v) => setState((s) => ({ ...s, churn: v }))}
              min="0"
              step="100"
            />
            <NumInput
              label="Contraction MRR"
              hint="Downgrades, seat removals"
              value={state.contraction}
              onChange={(v) => setState((s) => ({ ...s, contraction: v }))}
              min="0"
              step="100"
            />
          </div>
        </Card>

        <Card title="Gained vs lost · numerator vs denominator">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {(
              [
                {
                  side: "gained" as const,
                  total: gained,
                  rows: [
                    { name: "New ARR", val: newN, w: newBarW, barCls: "bg-tool-accent" },
                    { name: "Expansion", val: expN, w: expBarW, barCls: "bg-tool-accent/60" },
                  ],
                },
                {
                  side: "lost" as const,
                  total: lost,
                  rows: [
                    { name: "Churn", val: churnN, w: churnBarW, barCls: "bg-rose-500" },
                    { name: "Contraction", val: contN, w: contBarW, barCls: "bg-rose-500/60" },
                  ],
                },
              ] as const
            ).map((col) => {
              const accentCls =
                col.side === "gained"
                  ? "border-tool-accent/20 bg-tool-accent-soft"
                  : "border-rose-500/20 bg-rose-500/[0.06]";
              const titleCls =
                col.side === "gained" ? "text-tool-accent" : "text-rose-500";
              return (
                <div key={col.side} className={`rounded-xl border p-4 ${accentCls}`}>
                  <div className="flex items-baseline justify-between">
                    <div
                      className={`font-mono text-[0.6rem] uppercase tracking-[0.2em] ${titleCls}`}
                    >
                      {col.side === "gained" ? "Gained" : "Lost"}
                    </div>
                    <div
                      className={`font-mono text-lg font-semibold tabular-nums ${titleCls}`}
                    >
                      {fmtUSD(col.total)}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {col.rows.map((r) => (
                      <div key={r.name}>
                        <div className="mb-1 flex items-baseline justify-between font-mono text-[0.7rem]">
                          <span className="text-secondary">{r.name}</span>
                          <span className="tabular-nums text-app">{fmtUSD(r.val)}</span>
                        </div>
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-app">
                          <div
                            className={`absolute left-0 top-0 h-full rounded-full transition-all ${r.barCls}`}
                            style={{ width: `${r.w}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-md border border-app bg-app px-4 py-2.5 font-mono text-xs">
            <span className="text-muted">
              {fmtUSD(gained)} ÷ {fmtUSD(lost)}
            </span>
            <span className={`tabular-nums font-semibold ${bandClasses.text}`}>
              = {qr === Infinity ? "∞" : qr.toFixed(2)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-xs sm:grid-cols-4">
            {(
              [
                ["Ending MRR", fmtUSD(endingMrr), "text-app"],
                ["Net new", fmtUSD(net), net >= 0 ? "text-app" : "text-rose-500"],
                ["NRR", `${nrr.toFixed(1)}%`, "text-app"],
                ["GRR", `${grr.toFixed(1)}%`, "text-app"],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="bg-app-elevated p-3">
                <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">{label}</div>
                <div className={`mt-0.5 tabular-nums ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card title="12-month trend · monthly quick ratio">
        <p className="mb-3 text-[0.65rem] text-muted">
          Watch dips below the 2 line. Multiple consecutive months below 2 → retention investigation,
          not more marketing spend.
        </p>
        <div className="relative w-full overflow-hidden rounded-xl border border-app bg-app p-3">
          <svg
            viewBox={`0 0 ${trendW} ${trendH}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="qrTrendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line
              x1={trendPad}
              x2={trendW - trendPad}
              y1={y4}
              y2={y4}
              className="stroke-tool-accent/40"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={trendPad}
              x2={trendW - trendPad}
              y1={y2}
              y2={y2}
              className="stroke-amber-500/40"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <path d={trendArea} fill="url(#qrTrendFill)" className={bandClasses.text} />
            <path
              d={trendPath}
              fill="none"
              className={bandClasses.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {trendPoints.map((p, i) => {
              const q = trendQrs[i];
              const cls =
                q >= 4
                  ? "fill-tool-accent"
                  : q >= 2
                  ? "fill-violet-500"
                  : q >= 1
                  ? "fill-amber-500"
                  : "fill-rose-500";
              return <circle key={i} cx={p.x} cy={p.y} r={2.5} className={cls} />;
            })}
            <text
              x={trendW - trendPad - 2}
              y={y4 - 3}
              textAnchor="end"
              className="fill-tool-accent font-mono text-[8px] uppercase tracking-[0.2em]"
            >
              4
            </text>
            <text
              x={trendW - trendPad - 2}
              y={y2 - 3}
              textAnchor="end"
              className="fill-amber-500 font-mono text-[8px] uppercase tracking-[0.2em]"
            >
              2
            </text>
          </svg>

          <div className="mt-1 grid grid-cols-12 gap-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted">
            {trend.map((r) => (
              <div key={r.id} className="truncate text-center">
                {r.label}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-md border border-app">
          <table className="w-full font-mono text-xs">
            <thead className="bg-app text-muted">
              <tr className="text-[0.55rem] uppercase tracking-[0.18em]">
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">New</th>
                <th className="px-3 py-2 text-right font-medium">Expansion</th>
                <th className="px-3 py-2 text-right font-medium">Churn</th>
                <th className="px-3 py-2 text-right font-medium">Contraction</th>
                <th className="px-3 py-2 text-right font-medium">QR</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((row, idx) => {
                const q = computeQR(row);
                const colorCls =
                  q === Infinity || q >= 4
                    ? "text-tool-accent"
                    : q >= 2
                    ? "text-violet-500"
                    : q >= 1
                    ? "text-amber-500"
                    : "text-rose-500";
                return (
                  <tr key={row.id} className="border-t border-app">
                    <td className="px-3 py-1.5 text-secondary">{row.label}</td>
                    {(["newMrr", "expansion", "churn", "contraction"] as const).map((k) => (
                      <td key={k} className="px-2 py-1 text-right">
                        <input
                          type="number"
                          value={row[k]}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTrend((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, [k]: val } : r))
                            );
                          }}
                          className="w-20 rounded border border-app bg-app px-1.5 py-1 text-right tabular-nums text-app focus:border-tool-accent focus:outline-none focus:ring-1 focus:ring-tool-accent"
                        />
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${colorCls}`}>
                      {q === Infinity ? "∞" : q.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Benchmarks · Scale VP · OpenView">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              range: "4+",
              label: "Best-in-class",
              note: "Pour fuel on growth",
              cls: "border-tool-accent/30 bg-tool-accent-soft text-tool-accent",
            },
            {
              range: "2 – 4",
              label: "Solid",
              note: "Healthy growth",
              cls: "border-violet-400/30 bg-violet-500/[0.06] text-violet-500",
            },
            {
              range: "1 – 2",
              label: "Treading water",
              note: "Churn is the bottleneck",
              cls: "border-amber-400/30 bg-amber-500/[0.06] text-amber-500",
            },
            {
              range: "< 1",
              label: "Shrinking",
              note: "Retention work, not marketing",
              cls: "border-rose-400/30 bg-rose-500/[0.06] text-rose-500",
            },
          ].map((b) => (
            <div key={b.range} className={`rounded-xl border px-4 py-3 ${b.cls}`}>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] opacity-80">
                Quick ratio {b.range}
              </div>
              <div className="mt-1 text-sm font-semibold">{b.label}</div>
              <div className="mt-0.5 text-xs opacity-80">{b.note}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[0.6rem] text-faint">
          Source: Mamoon Hamid (Scale Venture Partners) 2015 + OpenView 2024 SaaS benchmarks.
        </p>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar + main shell
═══════════════════════════════════════════════════════════════════════════ */

type Calculator = "loan" | "compound" | "rule40" | "quickRatio";

const CALCULATORS: { k: Calculator; name: string; icon: string; hint: string }[] = [
  { k: "loan", name: "Loan / EMI", icon: "$", hint: "EMI · amortization" },
  { k: "compound", name: "Compound Interest", icon: "%", hint: "growth · curve" },
  { k: "rule40", name: "Rule of 40", icon: "40", hint: "SaaS · health" },
  { k: "quickRatio", name: "SaaS Quick Ratio", icon: "÷", hint: "MRR · NRR · GRR" },
];

export default function FinanceCalculatorsApp(_props: NativeAppProps) {
  const [active, setActive] = useState<Calculator>("loan");
  const narrow = (_props.width ?? 0) < 640;

  return (
    <div
      data-tool-theme="finance"
      data-tool="finance-calculators"
      className="flex h-full w-full overflow-hidden bg-app text-app"
      style={{ height: _props.height ?? "100%" }}
    >
      {/* Sidebar */}
      <aside
        className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-app bg-app-elevated p-2"
        style={{ width: narrow ? 96 : 220 }}
      >
        <div className="mb-1 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          {narrow ? "fin" : "finance calculators"}
        </div>
        {CALCULATORS.map((c) => {
          const isActive = active === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setActive(c.k)}
              className={`group flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent bg-transparent text-secondary hover:border-app hover:bg-app hover:text-app"
              }`}
              title={c.name}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[0.6rem] font-semibold ${
                  isActive
                    ? "border-tool-accent bg-tool-accent text-app-elevated"
                    : "border-app bg-app text-secondary group-hover:border-tool-accent group-hover:text-tool-accent"
                }`}
                style={isActive ? { color: "var(--bg)" } : undefined}
              >
                {c.icon}
              </span>
              {!narrow && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{c.name}</div>
                  <div className="truncate font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                    {c.hint}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </aside>

      {/* Right pane */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[1100px]">
          {active === "loan" && <LoanPane />}
          {active === "compound" && <CompoundInterestPane />}
          {active === "rule40" && <RuleOf40Pane />}
          {active === "quickRatio" && <SaaSQuickRatioPane />}
        </div>
      </main>
    </div>
  );
}
