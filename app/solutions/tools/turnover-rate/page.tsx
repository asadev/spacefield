"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

// BLS JOLTS 2024 annualized quits + layoffs rates (approximate), used as a
// rough industry benchmark. These are not fill-for-fill official rates — they
// combine voluntary + involuntary exits consistent with how most HR teams
// calculate total turnover.
const BLS_BENCHMARKS: { key: string; label: string; rate: number }[] = [
  { key: "tech", label: "Technology / Information", rate: 13.2 },
  { key: "finance", label: "Finance & Insurance", rate: 13.0 },
  { key: "manufacturing", label: "Manufacturing", rate: 25.0 },
  { key: "healthcare", label: "Healthcare & Social Assistance", rate: 22.0 },
  { key: "retail", label: "Retail Trade", rate: 60.0 },
  { key: "hospitality", label: "Accommodation & Food Services", rate: 79.0 },
  { key: "professional", label: "Professional & Business Services", rate: 17.0 },
  { key: "construction", label: "Construction", rate: 35.0 },
  { key: "all", label: "All private (US average)", rate: 20.0 },
];

interface Period {
  id: string;
  label: string;
  separations: string;
  avgHead: string;
}

interface DeptRow {
  id: string;
  name: string;
  separations: string;
  headcount: string;
}

const TREND_KEY = "solutions:turnover-rate:trend:v1";
const DEPT_KEY = "solutions:turnover-rate:dept:v1";
const SPLIT_KEY = "solutions:turnover-rate:split:v1";
const PRIOR_KEY = "solutions:turnover-rate:prior:v1";

export default function TurnoverRatePage() {
  const [separations, setSeparations] = useState("18");
  const [startHead, setStartHead] = useState("120");
  const [endHead, setEndHead] = useState("130");
  const [periodMonths, setPeriodMonths] = useState("12");
  const [replacementCost, setReplacementCost] = useState("25000");
  const [industry, setIndustry] = useState("tech");

  const [periods, setPeriods] = useState<Period[]>([
    { id: "p1", label: "Q1", separations: "4", avgHead: "120" },
    { id: "p2", label: "Q2", separations: "5", avgHead: "122" },
    { id: "p3", label: "Q3", separations: "5", avgHead: "126" },
    { id: "p4", label: "Q4", separations: "4", avgHead: "128" },
  ]);

  // Visual-only state: department breakdown
  const [depts, setDepts] = useState<DeptRow[]>([
    { id: "d1", name: "Engineering", separations: "5", headcount: "55" },
    { id: "d2", name: "Sales", separations: "6", headcount: "32" },
    { id: "d3", name: "Customer Success", separations: "3", headcount: "18" },
    { id: "d4", name: "Operations", separations: "2", headcount: "15" },
    { id: "d5", name: "Marketing", separations: "2", headcount: "10" },
  ]);

  // Visual-only state: voluntary share (0..100). Involuntary = 100 - voluntary.
  const [voluntaryPct, setVoluntaryPct] = useState("72");

  // Visual-only state: prior-year annualized turnover rate for YoY delta arrow.
  const [priorYearRate, setPriorYearRate] = useState("16.0");

  // Load trend from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TREND_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setPeriods(parsed);
      }
      const rawDept = window.localStorage.getItem(DEPT_KEY);
      if (rawDept) {
        const parsed = JSON.parse(rawDept);
        if (Array.isArray(parsed) && parsed.length) setDepts(parsed);
      }
      const rawSplit = window.localStorage.getItem(SPLIT_KEY);
      if (rawSplit) setVoluntaryPct(rawSplit);
      const rawPrior = window.localStorage.getItem(PRIOR_KEY);
      if (rawPrior) setPriorYearRate(rawPrior);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TREND_KEY, JSON.stringify(periods));
    } catch {}
  }, [periods]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEPT_KEY, JSON.stringify(depts));
    } catch {}
  }, [depts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPLIT_KEY, voluntaryPct);
    } catch {}
  }, [voluntaryPct]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRIOR_KEY, priorYearRate);
    } catch {}
  }, [priorYearRate]);

  const { avgHead, rate, annualized, annualCost } = useMemo(() => {
    const s = parseFloat(separations) || 0;
    const avg = ((parseFloat(startHead) || 0) + (parseFloat(endHead) || 0)) / 2;
    const m = parseFloat(periodMonths) || 0;
    const r = parseFloat(replacementCost) || 0;
    const rate = avg > 0 ? (s / avg) * 100 : 0;
    const annualFactor = m > 0 ? 12 / m : 0;
    const annualizedRate = rate * annualFactor;
    const annualSeparations = s * annualFactor;
    return {
      avgHead: avg,
      rate,
      annualized: annualizedRate,
      annualCost: annualSeparations * r,
    };
  }, [separations, startHead, endHead, periodMonths, replacementCost]);

  const benchmark = BLS_BENCHMARKS.find((b) => b.key === industry)!;
  const delta = annualized - benchmark.rate;
  const verdict =
    delta <= -5
      ? { label: "Well below benchmark", tone: "good" as const }
      : delta <= 2
      ? { label: "In line with benchmark", tone: "neutral" as const }
      : delta <= 7
      ? { label: "Running hot", tone: "warn" as const }
      : { label: "Bleeding talent", tone: "bad" as const };

  const trendRows = periods.map((p) => {
    const sep = parseFloat(p.separations) || 0;
    const head = parseFloat(p.avgHead) || 0;
    const r = head > 0 ? (sep / head) * 100 : 0;
    return { ...p, rate: r };
  });
  const trendMax = Math.max(...trendRows.map((r) => r.rate), 1);

  // Sensitivity table: vary replacement cost and annualized rate
  const sens = useMemo(() => {
    const rateRange = [annualized * 0.7, annualized * 0.85, annualized, annualized * 1.15, annualized * 1.3];
    const rc = parseFloat(replacementCost) || 0;
    const rcRange = [rc * 0.7, rc * 0.85, rc, rc * 1.15, rc * 1.3];
    return { rateRange, rcRange };
  }, [annualized, replacementCost]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function updatePeriod(id: string, patch: Partial<Period>) {
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateDept(id: string, patch: Partial<DeptRow>) {
    setDepts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // ---- Derived visuals ----
  const priorRate = parseFloat(priorYearRate) || 0;
  const yoyDelta = annualized - priorRate;
  const yoyDirection: "up" | "down" | "flat" =
    Math.abs(yoyDelta) < 0.05 ? "flat" : yoyDelta > 0 ? "up" : "down";

  const vol = Math.max(0, Math.min(100, parseFloat(voluntaryPct) || 0));
  const invol = 100 - vol;

  const deptRows = depts.map((d) => {
    const sep = parseFloat(d.separations) || 0;
    const head = parseFloat(d.headcount) || 0;
    const r = head > 0 ? (sep / head) * 100 : 0;
    return { ...d, rate: r };
  });
  const deptMax = Math.max(...deptRows.map((d) => d.rate), 1);

  // SVG line-chart geometry for trend
  const lineW = 560;
  const lineH = 160;
  const padL = 36;
  const padR = 14;
  const padT = 18;
  const padB = 28;
  const innerW = lineW - padL - padR;
  const innerH = lineH - padT - padB;
  const lineYAxisMax = Math.max(trendMax, benchmark.rate * 1.1, 1);
  const xFor = (i: number) =>
    padL + (trendRows.length === 1 ? innerW / 2 : (i / (trendRows.length - 1)) * innerW);
  const yFor = (v: number) =>
    padT + innerH - (Math.min(v, lineYAxisMax) / lineYAxisMax) * innerH;
  const linePath = trendRows.length
    ? trendRows
        .map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(r.rate).toFixed(1)}`)
        .join(" ")
    : "";
  const areaPath = trendRows.length
    ? `${linePath} L ${xFor(trendRows.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xFor(0).toFixed(
        1
      )} ${(padT + innerH).toFixed(1)} Z`
    : "";
  const benchmarkY = yFor(benchmark.rate);

  // Benchmark panel: spread of all industries with current marker
  const benchSorted = [...BLS_BENCHMARKS]
    .filter((b) => b.key !== "all")
    .sort((a, b) => a.rate - b.rate);
  const benchSpreadMax = Math.max(...BLS_BENCHMARKS.map((b) => b.rate), annualized);

  return (
    <ToolShell
      category="HR & People"
      title="Employee Turnover Rate"
      description="Compute annualized turnover rate, benchmark against industry, and see your cost-of-churn sensitivity."
    >
      <div data-tool-theme="hr" data-tool="turnover-rate" className="space-y-5">
        {/* ============== HERO ============== */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface shadow-[0_8px_40px_-18px_var(--tool-accent)] backdrop-blur-xl">
          {/* Title bar */}
          <div className="flex items-center gap-3 border-b border-tool-accent-soft bg-tool-accent-soft px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-400/80 ring-1 ring-rose-500/30" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80 ring-1 ring-amber-500/30" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80 ring-1 ring-emerald-500/30" />
            </div>
            <div className="flex-1 text-center text-[0.7rem] font-medium tracking-wide text-secondary">
              Turnover Rate — Talent Attrition Diagnostic
            </div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
              v2026.Q2
            </div>
          </div>

          <div className="tool-hero relative grid grid-cols-1 gap-5 px-6 py-7 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,var(--tool-accent-soft),transparent_55%)] pointer-events-none" />

            {/* Big number */}
            <div className="relative flex flex-col justify-center">
              <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Annualized turnover rate
              </div>
              <div className="mt-1 flex items-end gap-3">
                <div className="font-mono text-7xl font-bold leading-none tracking-tight text-app tabular-nums sm:text-8xl">
                  {annualized.toFixed(1)}
                  <span className="text-4xl text-tool-accent sm:text-5xl">%</span>
                </div>
                <YoYBadge direction={yoyDirection} delta={yoyDelta} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-secondary">
                <Pill>{Math.round(avgHead).toLocaleString()} avg headcount</Pill>
                <Pill>{rate.toFixed(1)}% in period</Pill>
                <Pill>prior yr {priorRate.toFixed(1)}%</Pill>
              </div>
            </div>

            {/* Side stats */}
            <div className="relative grid grid-cols-2 gap-3">
              <HeroStat
                label="vs benchmark"
                sub={benchmark.label}
                value={`${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`}
                tone={verdict.tone}
              />
              <HeroStat
                label="Verdict"
                sub="vs industry"
                value={verdict.label}
                tone={verdict.tone}
              />
              <HeroStat
                label="Annual cost of churn"
                sub="separations × replacement"
                value={fmt(annualCost)}
                tone="accent"
                wide
              />
            </div>
          </div>
        </div>

        {/* ============== INPUTS GRID ============== */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
          <ToolCard title="Workforce" subtitle="Headcount + separations">
            <div className="space-y-4">
              <Field label="Separations in period">
                <input type="number" value={separations} onChange={(e) => setSeparations(e.target.value)} className={inputCls()} min="0" step="1" />
              </Field>
              <Field label="Period length (months)">
                <input type="number" value={periodMonths} onChange={(e) => setPeriodMonths(e.target.value)} className={inputCls()} min="1" step="1" />
              </Field>
              <Field label="Headcount at start">
                <input type="number" value={startHead} onChange={(e) => setStartHead(e.target.value)} className={inputCls()} min="0" step="1" />
              </Field>
              <Field label="Headcount at end">
                <input type="number" value={endHead} onChange={(e) => setEndHead(e.target.value)} className={inputCls()} min="0" step="1" />
              </Field>
              <Field label="Prior year annualized rate (%)" hint="For year-over-year delta arrow">
                <input
                  type="number"
                  value={priorYearRate}
                  onChange={(e) => setPriorYearRate(e.target.value)}
                  className={inputCls()}
                  min="0"
                  step="0.1"
                />
              </Field>
            </div>
          </ToolCard>

          <ToolCard title="Benchmark" subtitle="Industry context">
            <div className="space-y-4">
              <Field label="Industry" hint="BLS JOLTS 2024 annualized">
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls()}>
                  {BLS_BENCHMARKS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label} — {b.rate.toFixed(1)}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Replacement cost per employee ($)" hint="Recruiting + onboarding + lost productivity">
                <input type="number" value={replacementCost} onChange={(e) => setReplacementCost(e.target.value)} className={inputCls()} min="0" step="1000" />
              </Field>
            </div>
            <div className="mt-6 space-y-3">
              <Stat label="Average headcount" value={Math.round(avgHead).toLocaleString()} />
              <Stat label="Period turnover rate" value={`${rate.toFixed(1)}%`} />
              <Stat label="Annualized turnover rate" value={`${annualized.toFixed(1)}%`} accent />
              <Stat label={`Industry benchmark (${benchmark.label})`} value={`${benchmark.rate.toFixed(1)}%`} />
              <div className="rounded-md border border-tool-accent-soft bg-tool-accent-soft p-4">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">Delta vs industry</div>
                <div className={`mt-1.5 text-xl font-semibold tracking-tight ${toneText(verdict.tone)}`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)} pp — {verdict.label}
                </div>
              </div>
              <Stat label="Annual cost of churn" value={fmt(annualCost)} />
            </div>
          </ToolCard>
        </div>

        {/* ============== DEPARTMENT BREAKDOWN + SPLIT ============== */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* Department breakdown bars */}
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Department breakdown
                </div>
                <h3 className="text-sm font-semibold text-app">
                  Where people are leaving
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                {deptRows.length} depts
              </div>
            </div>
            <div className="space-y-2.5 px-5 py-4">
              {deptRows.map((d) => {
                const hot = d.rate > annualized * 1.15;
                const cool = d.rate < annualized * 0.85;
                const bar = hot
                  ? "bg-gradient-to-r from-rose-400/70 to-rose-500/55"
                  : cool
                  ? "bg-gradient-to-r from-emerald-400/70 to-emerald-500/55"
                  : "bg-gradient-to-r from-[var(--tool-accent-soft)] to-tool-accent";
                return (
                  <div key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="grid grid-cols-[120px_1fr_60px] items-center gap-3">
                      <input
                        value={d.name}
                        onChange={(e) => updateDept(d.id, { name: e.target.value })}
                        className={inputCls("px-2 py-1 text-xs")}
                      />
                      <div className="relative h-6 overflow-hidden rounded-full bg-tool-accent-soft ring-1 ring-inset ring-tool-accent/15">
                        <div
                          className={"h-full rounded-full transition-all " + bar}
                          style={{ width: `${(d.rate / deptMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-xs font-semibold tabular-nums text-app">
                        {d.rate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.6rem] text-muted">
                      <input
                        type="number"
                        value={d.separations}
                        onChange={(e) => updateDept(d.id, { separations: e.target.value })}
                        className={inputCls("w-14 px-1.5 py-0.5 text-center font-mono text-[0.7rem]")}
                        min="0"
                      />
                      <span>/</span>
                      <input
                        type="number"
                        value={d.headcount}
                        onChange={(e) => updateDept(d.id, { headcount: e.target.value })}
                        className={inputCls("w-14 px-1.5 py-0.5 text-center font-mono text-[0.7rem]")}
                        min="0"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() =>
                    setDepts((d) => [
                      ...d,
                      { id: `d${Date.now()}`, name: "New team", separations: "0", headcount: "10" },
                    ])
                  }
                  className="rounded-md border border-tool-accent-soft bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent transition hover:brightness-110"
                >
                  + Add department
                </button>
                {depts.length > 1 && (
                  <button
                    onClick={() => setDepts((d) => d.slice(0, -1))}
                    className="rounded-md border border-app px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
                  >
                    Remove last
                  </button>
                )}
              </div>
              <div className="pt-1 text-[0.6rem] text-muted">
                <span className="inline-flex items-center gap-1.5 mr-3">
                  <span className="h-2 w-2 rounded-sm bg-rose-500" /> hot ({">"}1.15× co-rate)
                </span>
                <span className="inline-flex items-center gap-1.5 mr-3">
                  <span className="h-2 w-2 rounded-sm bg-tool-accent" /> normal
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" /> cool ({"<"}0.85×)
                </span>
              </div>
            </div>
          </div>

          {/* Voluntary / involuntary stack */}
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Exit type split
                </div>
                <h3 className="text-sm font-semibold text-app">
                  Voluntary vs involuntary
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                {Math.round((vol / 100) * (parseFloat(separations) || 0))} / {Math.round((invol / 100) * (parseFloat(separations) || 0))}
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              {/* Stack bar */}
              <div>
                <div className="flex items-baseline justify-between text-[0.6rem] uppercase tracking-[0.18em]">
                  <span className="text-tool-accent">Voluntary {vol.toFixed(0)}%</span>
                  <span className="text-amber-500">Involuntary {invol.toFixed(0)}%</span>
                </div>
                <div className="mt-1.5 flex h-7 w-full overflow-hidden rounded-full ring-1 ring-inset ring-tool-accent/20">
                  <div
                    className="flex items-center justify-center bg-tool-accent text-[0.65rem] font-semibold text-white transition-all"
                    style={{ width: `${vol}%` }}
                    title="Voluntary"
                  >
                    {vol >= 12 ? `${vol.toFixed(0)}%` : ""}
                  </div>
                  <div
                    className="flex items-center justify-center bg-amber-400/85 text-[0.65rem] font-semibold text-amber-950 transition-all"
                    style={{ width: `${invol}%` }}
                    title="Involuntary"
                  >
                    {invol >= 12 ? `${invol.toFixed(0)}%` : ""}
                  </div>
                </div>
              </div>

              <Field label="Voluntary share (%)" hint="Quits, resignations, retirements">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={voluntaryPct}
                  onChange={(e) => setVoluntaryPct(e.target.value)}
                  className="w-full"
                  style={{ accentColor: "var(--tool-accent)" }}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <SplitCard
                  label="Voluntary"
                  count={Math.round((vol / 100) * (parseFloat(separations) || 0))}
                  rate={(annualized * vol) / 100}
                  tone="accent"
                />
                <SplitCard
                  label="Involuntary"
                  count={Math.round((invol / 100) * (parseFloat(separations) || 0))}
                  rate={(annualized * invol) / 100}
                  tone="amber"
                />
              </div>

              <p className="text-[0.6rem] text-muted">
                High voluntary share usually points to engagement, comp, or manager issues. High involuntary may point to hiring quality or performance management.
              </p>
            </div>
          </div>
        </div>

        {/* ============== TREND LINE CHART ============== */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
          <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
            <div>
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                Year-over-year trend
              </div>
              <h3 className="text-sm font-semibold text-app">
                Period turnover with benchmark line
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[0.6rem] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3.5 bg-tool-accent" /> your rate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3.5 border-t border-dashed border-amber-500" /> benchmark
              </span>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${lineW} ${lineH}`}
                className="block h-auto w-full min-w-[420px]"
                role="img"
                aria-label="Turnover rate trend across periods"
              >
                {/* y-axis gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const y = padT + innerH - t * innerH;
                  const v = lineYAxisMax * t;
                  return (
                    <g key={i}>
                      <line
                        x1={padL}
                        x2={lineW - padR}
                        y1={y}
                        y2={y}
                        stroke="var(--border)"
                        strokeWidth={1}
                        strokeDasharray={i === 0 ? "0" : "2 3"}
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        fill="var(--text-muted)"
                        className="font-mono text-[9px] tabular-nums"
                      >
                        {v.toFixed(0)}%
                      </text>
                    </g>
                  );
                })}

                {/* benchmark line */}
                <line
                  x1={padL}
                  x2={lineW - padR}
                  y1={benchmarkY}
                  y2={benchmarkY}
                  stroke="rgb(245 158 11)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.85}
                />
                <text
                  x={lineW - padR - 4}
                  y={benchmarkY - 4}
                  textAnchor="end"
                  fill="rgb(217 119 6)"
                  className="font-mono text-[9px]"
                >
                  bench {benchmark.rate.toFixed(1)}%
                </text>

                {/* area */}
                {trendRows.length > 1 && (
                  <path d={areaPath} fill="var(--tool-accent)" opacity={0.12} />
                )}

                {/* line */}
                {trendRows.length > 0 && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--tool-accent)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* points */}
                {trendRows.map((r, i) => (
                  <g key={r.id}>
                    <circle
                      cx={xFor(i)}
                      cy={yFor(r.rate)}
                      r={4}
                      fill="var(--surface)"
                      stroke="var(--tool-accent)"
                      strokeWidth={2}
                    />
                    <text
                      x={xFor(i)}
                      y={yFor(r.rate) - 9}
                      textAnchor="middle"
                      fill="var(--text)"
                      className="font-mono text-[9px] font-semibold tabular-nums"
                    >
                      {r.rate.toFixed(1)}
                    </text>
                  </g>
                ))}

                {/* x-axis labels */}
                {trendRows.map((r, i) => (
                  <text
                    key={`xl-${r.id}`}
                    x={xFor(i)}
                    y={lineH - 8}
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    className="font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    {r.label}
                  </text>
                ))}
              </svg>
            </div>

            {/* Editable rows */}
            <div className="space-y-2 border-t border-tool-accent-soft pt-3">
              <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                Edit periods
              </div>
              {periods.map((p) => (
                <div key={p.id} className="grid grid-cols-[90px_1fr_1fr] gap-2">
                  <input
                    value={p.label}
                    onChange={(e) => updatePeriod(p.id, { label: e.target.value })}
                    className={inputCls()}
                    placeholder="Label"
                  />
                  <input
                    type="number"
                    value={p.separations}
                    onChange={(e) => updatePeriod(p.id, { separations: e.target.value })}
                    className={inputCls()}
                    placeholder="Separations"
                    min="0"
                  />
                  <input
                    type="number"
                    value={p.avgHead}
                    onChange={(e) => updatePeriod(p.id, { avgHead: e.target.value })}
                    className={inputCls()}
                    placeholder="Avg headcount"
                    min="0"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() =>
                    setPeriods((p) => [
                      ...p,
                      { id: `p${Date.now()}`, label: `P${p.length + 1}`, separations: "0", avgHead: String(avgHead || 100) },
                    ])
                  }
                  className="rounded-md border border-tool-accent-soft bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent hover:brightness-110"
                >
                  + Add period
                </button>
                {periods.length > 1 && (
                  <button
                    onClick={() => setPeriods((p) => p.slice(0, -1))}
                    className="rounded-md border border-app px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
                  >
                    Remove last
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============== BENCHMARK COMPARISON PANEL ============== */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
          <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
            <div>
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                Industry benchmark spread
              </div>
              <h3 className="text-sm font-semibold text-app">
                Where you sit · BLS JOLTS 2024
              </h3>
            </div>
            <div className="font-mono text-[0.65rem] tabular-nums text-muted">
              you {annualized.toFixed(1)}%
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-1.5">
              {benchSorted.map((b) => {
                const isYou = b.key === industry;
                return (
                  <div key={b.key} className="grid grid-cols-[180px_1fr_50px] items-center gap-3">
                    <div
                      className={
                        "truncate text-xs " +
                        (isYou ? "font-semibold text-tool-accent" : "text-secondary")
                      }
                    >
                      {b.label}
                    </div>
                    <div className="relative h-4 overflow-hidden rounded bg-tool-accent-soft ring-1 ring-inset ring-tool-accent/15">
                      <div
                        className={
                          "h-full rounded " +
                          (isYou
                            ? "bg-gradient-to-r from-[var(--tool-accent-soft)] to-tool-accent"
                            : "bg-app-elevated")
                        }
                        style={{ width: `${(b.rate / benchSpreadMax) * 100}%` }}
                      />
                      {isYou && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-app"
                          style={{ left: `${(annualized / benchSpreadMax) * 100}%`, backgroundColor: "var(--text)" }}
                          title="Your rate"
                        />
                      )}
                    </div>
                    <div
                      className={
                        "text-right font-mono text-xs tabular-nums " +
                        (isYou ? "font-bold text-tool-accent" : "text-muted")
                      }
                    >
                      {b.rate.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BenchStat label="Your rate" value={`${annualized.toFixed(1)}%`} accent />
              <BenchStat label={benchmark.label} value={`${benchmark.rate.toFixed(1)}%`} />
              <BenchStat
                label="Delta"
                value={`${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`}
                tone={verdict.tone}
              />
            </div>
          </div>
        </div>

        {/* ============== SENSITIVITY ============== */}
        <ToolCard title="Cost-of-churn sensitivity" subtitle="Rate × replacement cost">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="p-2 text-left"> </th>
                  {sens.rcRange.map((rc, i) => (
                    <th key={i} className="p-2 text-right font-normal">{fmt(rc)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sens.rateRange.map((r, i) => (
                  <tr key={i} className="border-t border-app">
                    <td className="p-2 text-secondary">{r.toFixed(1)}%</td>
                    {sens.rcRange.map((rc, j) => {
                      const cost = (r / 100) * avgHead * rc;
                      const isCenter = i === 2 && j === 2;
                      return (
                        <td
                          key={j}
                          className={`p-2 text-right ${isCenter ? "bg-tool-accent-soft text-tool-accent font-medium" : "text-app"}`}
                        >
                          {fmt(cost)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[0.6rem] text-faint">
            Rows: annualized turnover rate scenarios (±15%, ±30%). Columns: replacement cost scenarios. Highlighted cell = your current assumption.
          </div>
        </ToolCard>

        <p className="text-[0.6rem] text-faint">
          Source: U.S. Bureau of Labor Statistics, JOLTS 2024 annualized quits + layoffs by industry.
        </p>
      </div>
    </ToolShell>
  );
}

/* ----- sub-components ----- */

type Tone = "good" | "warn" | "bad" | "neutral" | "accent";

function toneText(tone: Tone): string {
  return tone === "good"
    ? "text-emerald-500"
    : tone === "warn"
    ? "text-amber-500"
    : tone === "bad"
    ? "text-rose-500"
    : tone === "accent"
    ? "text-tool-accent"
    : "text-app";
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent-soft bg-surface px-2.5 py-1 text-[0.7rem] font-medium text-secondary backdrop-blur">
      {children}
    </span>
  );
}

function YoYBadge({ direction, delta }: { direction: "up" | "down" | "flat"; delta: number }) {
  const cls =
    direction === "up"
      ? "border-rose-400/40 bg-rose-500/10 text-rose-500"
      : direction === "down"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-500"
      : "border-app bg-surface text-secondary";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "▬";
  return (
    <div className={`mb-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${cls}`}>
      <span className="text-sm leading-none">{arrow}</span>
      <span className="font-mono tabular-nums">
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(1)} pp YoY
      </span>
    </div>
  );
}

function HeroStat({
  label,
  sub,
  value,
  tone = "neutral",
  wide = false,
}: {
  label: string;
  sub: string;
  value: string;
  tone?: Tone;
  wide?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border border-tool-accent-soft bg-surface p-3 backdrop-blur " +
        (wide ? "col-span-2" : "")
      }
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
          {label}
        </span>
        <span className="text-[0.55rem] text-faint">{sub}</span>
      </div>
      <div className={"mt-1 font-mono text-lg font-semibold tabular-nums " + toneText(tone)}>
        {value}
      </div>
    </div>
  );
}

function SplitCard({
  label,
  count,
  rate,
  tone,
}: {
  label: string;
  count: number;
  rate: number;
  tone: "accent" | "amber";
}) {
  const cls =
    tone === "accent"
      ? "border-tool-accent-soft bg-tool-accent-soft text-tool-accent"
      : "border-amber-400/40 bg-amber-500/10 text-amber-600";
  return (
    <div className={"rounded-xl border p-3 " + cls}>
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{count}</div>
      <div className="text-[0.6rem] opacity-80">{rate.toFixed(1)}% annualized share</div>
    </div>
  );
}

function BenchStat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: Tone;
}) {
  const valueCls = accent ? "text-tool-accent" : toneText(tone ?? "neutral");
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (accent
          ? "border-tool-accent-soft bg-tool-accent-soft"
          : "border-tool-accent-soft bg-surface")
      }
    >
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
        {label}
      </div>
      <div className={"mt-1 font-mono text-lg font-semibold tabular-nums " + valueCls}>
        {value}
      </div>
    </div>
  );
}
