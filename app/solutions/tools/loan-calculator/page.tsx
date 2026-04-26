"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

// 30-year historical Freddie Mac PMMS 30-yr fixed averages (annual, %),
// 1996-2025. Sourced from Freddie Mac Primary Mortgage Market Survey
// archive, rounded to one decimal. Used as a reference band under the main
// output so the user can eyeball where today's rate sits historically.
const HISTORICAL_30Y: { year: number; rate: number }[] = [
  { year: 1996, rate: 7.8 },
  { year: 1997, rate: 7.6 },
  { year: 1998, rate: 6.9 },
  { year: 1999, rate: 7.4 },
  { year: 2000, rate: 8.1 },
  { year: 2001, rate: 7.0 },
  { year: 2002, rate: 6.5 },
  { year: 2003, rate: 5.8 },
  { year: 2004, rate: 5.8 },
  { year: 2005, rate: 5.9 },
  { year: 2006, rate: 6.4 },
  { year: 2007, rate: 6.3 },
  { year: 2008, rate: 6.0 },
  { year: 2009, rate: 5.0 },
  { year: 2010, rate: 4.7 },
  { year: 2011, rate: 4.5 },
  { year: 2012, rate: 3.7 },
  { year: 2013, rate: 4.0 },
  { year: 2014, rate: 4.2 },
  { year: 2015, rate: 3.9 },
  { year: 2016, rate: 3.6 },
  { year: 2017, rate: 4.0 },
  { year: 2018, rate: 4.5 },
  { year: 2019, rate: 3.9 },
  { year: 2020, rate: 3.1 },
  { year: 2021, rate: 3.0 },
  { year: 2022, rate: 5.3 },
  { year: 2023, rate: 6.8 },
  { year: 2024, rate: 6.7 },
  { year: 2025, rate: 6.5 },
];

type LoanType = "mortgage" | "auto" | "personal" | "student" | "custom";

const LOAN_TYPES: { k: LoanType; label: string }[] = [
  { k: "mortgage", label: "Mortgage" },
  { k: "auto", label: "Auto" },
  { k: "personal", label: "Personal" },
  { k: "student", label: "Student" },
  { k: "custom", label: "Custom" },
];

const LOAN_PRESETS: Record<LoanType, Partial<Inputs>> = {
  mortgage: { principal: "250000", rate: "6.5", years: "25", extra: "0" },
  auto: { principal: "35000", rate: "7.5", years: "5", extra: "0" },
  personal: { principal: "15000", rate: "11", years: "3", extra: "0" },
  student: { principal: "40000", rate: "5.5", years: "10", extra: "0" },
  custom: {},
};

interface Inputs {
  principal: string;
  rate: string;
  years: string;
  extra: string;
  cadence: "monthly" | "biweekly";
  loanType: LoanType;
}

interface ScheduleRow {
  period: number;
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

interface Result {
  periodic: number;
  periodsPerYear: number;
  totalInterest: number;
  totalPaid: number;
  payoffMonths: number;
  interestSaved: number;
  monthsSaved: number;
  schedule: ScheduleRow[];
}

function amortize(
  principal: number,
  annualRate: number,
  years: number,
  extraMonthly: number,
  cadence: "monthly" | "biweekly"
): Result {
  const periodsPerYear = cadence === "biweekly" ? 26 : 12;
  const n = Math.round(years * 12);
  const monthlyRate = annualRate / 100 / 12;
  if (n === 0 || principal <= 0) {
    return {
      periodic: 0,
      periodsPerYear,
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
  // Biweekly: half the monthly payment, but 26/year = ~13 monthly payments.
  const periodic = cadence === "biweekly" ? fullMonthly / 2 : fullMonthly;

  // Baseline interest without extra payments (monthly only).
  const baselineInterest = fullMonthly * n - principal;

  // Simulate month-by-month, treating biweekly as +8.33% monthly equivalent.
  const periodicMonthly =
    cadence === "biweekly" ? fullMonthly * (26 / 24) : fullMonthly;

  let balance = principal;
  const schedule: ScheduleRow[] = [];
  let totalInterest = 0;
  let month = 0;
  const maxMonths = n + 12; // safety
  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = balance * monthlyRate;
    let paid = periodicMonthly + extraMonthly;
    if (paid > balance + interest) paid = balance + interest;
    const principalPaid = paid - interest;
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    schedule.push({
      period: month,
      month,
      interest,
      principal: principalPaid,
      balance,
    });
  }

  return {
    periodic,
    periodsPerYear,
    totalInterest,
    totalPaid: principal + totalInterest,
    payoffMonths: month,
    interestSaved: Math.max(0, baselineInterest - totalInterest),
    monthsSaved: Math.max(0, n - month),
    schedule,
  };
}

const DEFAULTS: Inputs = {
  principal: "250000",
  rate: "6.5",
  years: "25",
  extra: "0",
  cadence: "monthly",
  loanType: "mortgage",
};

export default function LoanCalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [showFormula, setShowFormula] = useState(false);

  // Load from share URL on mount.
  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setInputs({ ...DEFAULTS, ...shared });
  }, []);

  // cmd/ctrl+enter → copy main result.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const val = document
          .getElementById("loan-monthly")
          ?.textContent?.trim();
        if (val && navigator.clipboard) navigator.clipboard.writeText(val);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const principal = parseFloat(inputs.principal) || 0;
  const rate = parseFloat(inputs.rate) || 0;
  const years = parseFloat(inputs.years) || 0;
  const extra = parseFloat(inputs.extra) || 0;

  const result = useMemo(
    () => amortize(principal, rate, years, extra, inputs.cadence),
    [principal, rate, years, extra, inputs.cadence]
  );

  // Scenario comparison: same loan, +1% / -1% / +extra 200.
  const scenarios = useMemo(() => {
    const base = result;
    const higher = amortize(principal, rate + 1, years, extra, inputs.cadence);
    const lower = amortize(principal, rate - 1, years, extra, inputs.cadence);
    const aggressive = amortize(
      principal,
      rate,
      years,
      extra + 200,
      inputs.cadence
    );
    return [
      { label: "Base", r: base },
      { label: "Rate +1%", r: higher },
      { label: "Rate -1%", r: lower },
      { label: "+$200/mo extra", r: aggressive },
    ];
  }, [principal, rate, years, extra, inputs.cadence, result]);

  // Rate sensitivity grid.
  const sensitivity = useMemo(() => {
    const rates = [-1, -0.5, 0, 0.5, 1].map((d) => rate + d);
    const terms = [15, 20, 25, 30];
    return { rates, terms };
  }, [rate]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const yearly = useMemo(
    () => result.schedule.filter((s) => s.month % 12 === 0),
    [result.schedule]
  );

  const histAvg =
    HISTORICAL_30Y.reduce((a, b) => a + b.rate, 0) / HISTORICAL_30Y.length;
  const histMin = Math.min(...HISTORICAL_30Y.map((x) => x.rate));
  const histMax = Math.max(...HISTORICAL_30Y.map((x) => x.rate));

  const csvExport = () =>
    toCsv([
      ["Month", "Interest", "Principal", "Balance"],
      ...result.schedule.map((s) => [
        s.month,
        s.interest.toFixed(2),
        s.principal.toFixed(2),
        s.balance.toFixed(2),
      ]),
    ]);

  const markdownExport = () =>
    [
      `# Loan summary`,
      ``,
      `- Principal: ${fmt(principal)}`,
      `- Rate: ${rate}%`,
      `- Term: ${years} years (${inputs.cadence})`,
      `- Extra per month: ${fmt(extra)}`,
      ``,
      `## Result`,
      ``,
      `- Periodic payment: ${fmt(result.periodic)}`,
      `- Total interest: ${fmt(result.totalInterest)}`,
      `- Total paid: ${fmt(result.totalPaid)}`,
      `- Payoff in ${Math.floor(result.payoffMonths / 12)}y ${result.payoffMonths % 12}m`,
      `- Interest saved vs baseline: ${fmt(result.interestSaved)}`,
    ].join("\n");

  const sliderCls =
    "w-full appearance-none bg-transparent accent-tool-accent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-tool-accent-soft [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-tool-accent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-tool-accent/30";

  const applyLoanType = (k: LoanType) => {
    const preset = LOAN_PRESETS[k];
    setInputs((s) => ({ ...s, loanType: k, ...preset }));
  };

  const interestPct =
    result.totalPaid > 0 ? (result.totalInterest / result.totalPaid) * 100 : 0;
  const principalPct = 100 - interestPct;

  // Stacked principal-vs-interest chart by year.
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

    // Aggregate by year.
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

    const padL = 40;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const innerW = cssW - padL - padR;
    const innerH = cssH - padT - padB;

    const maxTotal = Math.max(
      ...yearlyAgg.map((y) => y.principal + y.interest),
      1
    );
    const barW = innerW / yearlyAgg.length;
    const gap = Math.max(1, barW * 0.18);

    // axis
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + innerH);
    ctx.lineTo(padL + innerW, padT + innerH);
    ctx.stroke();

    // y-axis labels
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

    // bars
    yearlyAgg.forEach((y, i) => {
      const x = padL + i * barW + gap / 2;
      const w = barW - gap;
      const totalH = ((y.principal + y.interest) / maxTotal) * innerH;
      const intH = (y.interest / maxTotal) * innerH;
      const prinH = totalH - intH;

      // interest (top, soft)
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x, padT + innerH - totalH, w, intH);
      ctx.globalAlpha = 1;

      // principal (bottom, solid)
      ctx.fillStyle = accent;
      ctx.fillRect(x, padT + innerH - prinH, w, prinH);
    });

    // x-axis year labels (sparse)
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
    <ToolShell
      category="Finance"
      title="Loan / EMI Calculator"
      description="Monthly or biweekly payment, full amortization, extra-payment savings, rate sensitivity. Works for mortgages, business loans, car loans."
    >
      <div data-tool-theme="finance" data-tool="loan-calculator">
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {inputs.loanType}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              loan.statement
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {fmt(principal).replace(/[$,]/g, "")}@{rate.toFixed(2)}%·{years}y
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {inputs.cadence}
            </div>
          </div>

          <div className="relative p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Statement of payment
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    id="loan-monthly"
                    className="font-mono text-3xl font-medium tabular-nums tracking-tight text-app md:text-4xl"
                  >
                    {fmt(result.periodic)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">
                    / {inputs.cadence === "biweekly" ? "biweekly" : "monthly"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    Total interest {fmt(result.totalInterest)}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {Math.floor(result.payoffMonths / 12)}y {result.payoffMonths % 12}m payoff
                  </span>
                </div>
                <div className="mt-2 text-[0.7rem] text-muted">
                  {fmt(principal)} · {rate.toFixed(2)}% · {years}y
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-6 gap-y-1 font-mono text-xs tabular-nums">
                <div className="text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Total int.
                </div>
                <div className="text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Total paid
                </div>
                <div className="text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Payoff
                </div>
                <div className="text-secondary">{fmt(result.totalInterest)}</div>
                <div className="text-secondary">{fmt(result.totalPaid)}</div>
                <div className="text-secondary">
                  {Math.floor(result.payoffMonths / 12)}y {result.payoffMonths % 12}m
                </div>
              </div>
            </div>
          </div>

          {/* Loan type segmented pills */}
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
                  style={
                    inputs.loanType === t.k ? { color: "var(--bg)" } : undefined
                  }
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
          <ToolCard title="Loan terms" subtitle="Inputs">
            <div className="space-y-5">
              <Field label="Principal ($)" hint={fmt(principal)}>
                <input
                  type="number"
                  value={inputs.principal}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, principal: e.target.value }))
                  }
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="1000"
                />
                <input
                  type="range"
                  min={0}
                  max={2000000}
                  step={5000}
                  value={principal}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, principal: e.target.value }))
                  }
                  className={`${sliderCls} mt-2`}
                />
              </Field>
              <Field
                label="Annual interest rate (%)"
                hint={`30y hist avg ~${histAvg.toFixed(1)}%`}
              >
                <input
                  type="number"
                  value={inputs.rate}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, rate: e.target.value }))
                  }
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="0.1"
                />
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.05}
                  value={rate}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, rate: e.target.value }))
                  }
                  className={`${sliderCls} mt-2`}
                />
              </Field>
              <Field label="Term (years)" hint={`${years}y`}>
                <input
                  type="number"
                  value={inputs.years}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, years: e.target.value }))
                  }
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="1"
                />
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={years}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, years: e.target.value }))
                  }
                  className={`${sliderCls} mt-2`}
                />
              </Field>
              <Field label="Extra payment per month ($)" hint="Optional">
                <input
                  type="number"
                  value={inputs.extra}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, extra: e.target.value }))
                  }
                  className={`${inputCls()} font-mono tabular-nums`}
                  min="0"
                  step="50"
                />
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={25}
                  value={extra}
                  onChange={(e) =>
                    setInputs((s) => ({ ...s, extra: e.target.value }))
                  }
                  className={`${sliderCls} mt-2`}
                />
              </Field>
            </div>

            <div className="mt-6 space-y-3">
              <Stat
                label={
                  inputs.cadence === "biweekly"
                    ? "Biweekly payment"
                    : "Monthly payment"
                }
                value={fmt(result.periodic)}
                accent
              />
              <Stat label="Total interest" value={fmt(result.totalInterest)} />
              <Stat label="Total paid" value={fmt(result.totalPaid)} />
              {(extra > 0 || inputs.cadence === "biweekly") && (
                <>
                  <Stat label="Interest saved" value={fmt(result.interestSaved)} />
                  <Stat
                    label="Months saved"
                    value={`${result.monthsSaved} mo`}
                  />
                </>
              )}
            </div>
          </ToolCard>

          <div className="space-y-6">
            <ToolCard
              title="Principal vs interest"
              subtitle="Yearly composition"
            >
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
                  className="block h-48 w-full"
                  aria-label="Stacked principal vs interest by year"
                />
              </div>
            </ToolCard>

            <ToolCard title="Scenarios" subtitle="Side-by-side">
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
                      {fmt(s.r.periodic)}
                    </div>
                    <div className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                      Int: {fmt(s.r.totalInterest)}
                    </div>
                    <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                      Payoff: {Math.floor(s.r.payoffMonths / 12)}y{" "}
                      {s.r.payoffMonths % 12}m
                    </div>
                  </div>
                ))}
              </div>
            </ToolCard>

            <ToolCard title="Rate sensitivity" subtitle="2-variable grid">
              <div className="overflow-x-auto rounded-lg border border-app bg-app-elevated">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      <th className="px-3 py-2 text-left">Rate \ Term</th>
                      {sensitivity.terms.map((t) => (
                        <th key={t} className="px-3 py-2 text-right">
                          {t}y
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.rates.map((r) => {
                      const isCurrent = Math.abs(r - rate) < 0.01;
                      return (
                        <tr
                          key={r}
                          className={`border-t border-app ${
                            isCurrent ? "bg-tool-accent-soft" : ""
                          }`}
                        >
                          <td
                            className={`px-3 py-2 font-mono tabular-nums ${
                              isCurrent ? "text-tool-accent" : "text-secondary"
                            }`}
                          >
                            {r.toFixed(2)}%
                          </td>
                          {sensitivity.terms.map((t) => {
                            const { periodic } = amortize(
                              principal,
                              r,
                              t,
                              0,
                              "monthly"
                            );
                            return (
                              <td
                                key={t}
                                className={`px-3 py-2 text-right font-mono tabular-nums ${
                                  isCurrent ? "text-app" : "text-secondary"
                                }`}
                              >
                                {fmt(periodic)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ToolCard>

            <ToolCard title="Amortization" subtitle="Year-end snapshot">
              {result.schedule.length === 0 ? (
                <div className="text-sm text-muted">
                  Enter a positive principal and term to see the schedule.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                  <div className="grid grid-cols-5 gap-px bg-app font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                    <div className="bg-app-elevated px-3 py-2">Year</div>
                    <div className="bg-app-elevated px-3 py-2 text-right">
                      Month
                    </div>
                    <div className="bg-app-elevated px-3 py-2 text-right">
                      Interest
                    </div>
                    <div className="bg-app-elevated px-3 py-2 text-right">
                      Principal
                    </div>
                    <div className="bg-app-elevated px-3 py-2 text-right">
                      Balance
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {yearly.map((row) => (
                      <div
                        key={row.month}
                        className="grid grid-cols-5 gap-px border-t border-app bg-app-elevated font-mono text-xs tabular-nums text-secondary"
                      >
                        <div className="px-3 py-2 text-tool-accent">
                          {Math.ceil(row.month / 12)}
                        </div>
                        <div className="px-3 py-2 text-right">{row.month}</div>
                        <div className="px-3 py-2 text-right">
                          {fmt(row.interest)}
                        </div>
                        <div className="px-3 py-2 text-right">
                          {fmt(row.principal)}
                        </div>
                        <div className="px-3 py-2 text-right text-app">
                          {fmt(row.balance)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ToolCard>

            <ToolCard
              title="Historical 30-yr fixed"
              subtitle="Freddie Mac PMMS, 1996–2025"
            >
              <div className="mb-2 flex items-baseline justify-between font-mono text-[0.65rem] tabular-nums text-muted">
                <span>
                  Range {histMin.toFixed(1)}%–{histMax.toFixed(1)}%, avg{" "}
                  {histAvg.toFixed(1)}%
                </span>
                <span className="text-tool-accent">
                  Your rate: {rate.toFixed(2)}%
                </span>
              </div>
              <div className="flex h-16 items-end gap-[2px]">
                {HISTORICAL_30Y.map((h) => {
                  const pct = (h.rate / histMax) * 100;
                  const active = Math.abs(h.rate - rate) < 0.25;
                  return (
                    <div
                      key={h.year}
                      title={`${h.year}: ${h.rate}%`}
                      className={`flex-1 rounded-t-sm transition-colors ${
                        active ? "bg-tool-accent" : "bg-tool-accent-soft"
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[0.55rem] text-faint">
                <span>1996</span>
                <span>2025</span>
              </div>
              <p className="mt-3 text-[0.65rem] text-muted">
                Source: Freddie Mac Primary Mortgage Market Survey (annual avg,
                30-year fixed, conforming). Historical context only.
              </p>
            </ToolCard>

            <ToolCard title="Formula" subtitle="Methodology">
              <button
                type="button"
                onClick={() => setShowFormula((v) => !v)}
                className="text-xs text-tool-accent hover:opacity-80"
              >
                {showFormula ? "Hide" : "Show"} the math
              </button>
              {showFormula && (
                <div className="mt-3 space-y-2 text-xs text-secondary">
                  <p>
                    Standard fully amortizing payment:{" "}
                    <span className="font-mono text-tool-accent">
                      M = P · r(1+r)<sup>n</sup> / ((1+r)<sup>n</sup> − 1)
                    </span>
                  </p>
                  <p>
                    P = principal, r = monthly rate (annual/12), n = total
                    months. Biweekly cadence pays half of M every two weeks
                    (26/yr ≈ 13 monthly payments), which shortens payoff by
                    several years on a 30-year term.
                  </p>
                  <p>
                    Extra payments are applied entirely to principal in the
                    month received, compounding interest savings over the
                    remaining term.
                  </p>
                </div>
              )}
            </ToolCard>
          </div>
        </div>
      </div>

      <ScenarioBar<Inputs>
        slug="loan-calculator"
        state={inputs}
        onLoad={(d) => setInputs({ ...DEFAULTS, ...d })}
        exports={{
          csv: csvExport,
          json: () => ({ inputs, result }),
          markdown: markdownExport,
        }}
      />
    </ToolShell>
  );
}
