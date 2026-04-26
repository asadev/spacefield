"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Industry =
  | "saas_smb"
  | "saas_enterprise"
  | "consumer_sub"
  | "ecomm"
  | "marketplace"
  | "fintech"
  | "custom";

// LTV:CAC benchmarks sourced from Bessemer Venture Partners State of the Cloud 2024,
// OpenView SaaS Benchmarks 2024, and a16z consumer subscription notes.
const INDUSTRY_BENCH: Record<
  Industry,
  { label: string; healthy: number; excellent: number; paybackMonths: number; note: string }
> = {
  saas_smb: {
    label: "SaaS — SMB / Mid-market",
    healthy: 3.0,
    excellent: 5.0,
    paybackMonths: 12,
    note: "OpenView 2024: median LTV:CAC 3.5x, payback 12-15 months.",
  },
  saas_enterprise: {
    label: "SaaS — Enterprise",
    healthy: 5.0,
    excellent: 7.0,
    paybackMonths: 18,
    note: "Bessemer Cloud 100: top-quartile enterprise SaaS 7x+, payback 18-24 months.",
  },
  consumer_sub: {
    label: "Consumer subscription",
    healthy: 1.5,
    excellent: 3.0,
    paybackMonths: 6,
    note: "a16z: consumer subs run 1.5-3x LTV:CAC, payback < 6 months.",
  },
  ecomm: {
    label: "E-commerce / DTC",
    healthy: 2.0,
    excellent: 3.5,
    paybackMonths: 3,
    note: "Shopify Plus benchmarks: DTC targets 2-4x, first-order profitability goal.",
  },
  marketplace: {
    label: "Marketplace",
    healthy: 3.0,
    excellent: 5.0,
    paybackMonths: 9,
    note: "a16z marketplace notes: 3x floor due to take-rate economics.",
  },
  fintech: {
    label: "Fintech",
    healthy: 3.0,
    excellent: 5.0,
    paybackMonths: 12,
    note: "Fintech: CAC varies wildly; payback the bigger constraint.",
  },
  custom: {
    label: "Custom / other",
    healthy: 3.0,
    excellent: 5.0,
    paybackMonths: 12,
    note: "Generic LTV:CAC ≥ 3:1 healthy, 1:1 breakeven.",
  },
};

interface CohortInputs {
  name: string;
  spend: string;
  customers: string;
  arpu: string;
  gm: string;
  churn: string;
}

const STORAGE_KEY = "solutions:cac-ltv:inputs:v1";
const VIEW_KEY = "solutions:cac-ltv:view:v1";

type ViewKey = "snapshot" | "cohort" | "sensitivity";

function emptyCohort(name: string): CohortInputs {
  return { name, spend: "100000", customers: "250", arpu: "60", gm: "75", churn: "3" };
}

function compute(c: CohortInputs) {
  const s = parseFloat(c.spend) || 0;
  const n = parseFloat(c.customers) || 0;
  const revenue = parseFloat(c.arpu) || 0;
  const gm = (parseFloat(c.gm) || 0) / 100;
  const churn = (parseFloat(c.churn) || 0) / 100;
  const cac = n > 0 ? s / n : 0;
  const cm = revenue * gm;
  const life = churn > 0 ? 1 / churn : 0;
  const ltv = cm * life;
  const ratio = cac > 0 ? ltv / cac : 0;
  const payback = cm > 0 ? cac / cm : 0;
  return { cac, cm, life, ltv, ratio, payback };
}

export default function CacLtvPage() {
  const [industry, setIndustry] = useState<Industry>("saas_smb");
  const [view, setView] = useState<ViewKey>("snapshot");
  const [cohorts, setCohorts] = useState<CohortInputs[]>([
    emptyCohort("Current"),
    { name: "Last quarter", spend: "80000", customers: "200", arpu: "58", gm: "72", churn: "3.5" },
    { name: "Benchmark target", spend: "100000", customers: "320", arpu: "65", gm: "78", churn: "2.5" },
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.industry) setIndustry(p.industry);
        if (Array.isArray(p.cohorts) && p.cohorts.length) setCohorts(p.cohorts);
      }
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "snapshot" || v === "cohort" || v === "sensitivity") setView(v);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ industry, cohorts }));
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [industry, cohorts, view]);

  const updateCohort = (idx: number, patch: Partial<CohortInputs>) =>
    setCohorts((c) => c.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const primary = cohorts[0];
  const primaryResult = useMemo(() => compute(primary), [primary]);

  const bench = INDUSTRY_BENCH[industry];
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const ratio = primaryResult.ratio;
  const verdict =
    ratio >= bench.excellent
      ? "Excellent"
      : ratio >= bench.healthy
      ? "Healthy"
      : ratio >= 1
      ? "Marginal"
      : "Broken";
  // Health badge keeps semantic colors (1:1 fail / 3:1 healthy / 5:1+ great)
  const verdictTone =
    ratio >= bench.excellent
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : ratio >= bench.healthy
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      : ratio >= 1
      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
      : "border-rose-500/30 bg-rose-500/10 text-rose-500";

  // Payback chip color
  const paybackOk = primaryResult.payback > 0 && primaryResult.payback <= bench.paybackMonths;
  const paybackChipCls = paybackOk
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
    : primaryResult.payback <= bench.paybackMonths * 1.5
    ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
    : "border-rose-500/30 bg-rose-500/10 text-rose-500";

  // Stacked bar normalization for LTV vs CAC visualization
  const barMax = Math.max(primaryResult.ltv, primaryResult.cac, 1);
  const ltvWidth = (primaryResult.ltv / barMax) * 100;
  const cacWidth = (primaryResult.cac / barMax) * 100;

  // ±20% sensitivity on primary cohort key drivers
  const sensitivity = useMemo(() => {
    const drivers: Array<{ key: keyof CohortInputs; label: string }> = [
      { key: "spend", label: "Spend" },
      { key: "customers", label: "Customers" },
      { key: "arpu", label: "ARPU" },
      { key: "gm", label: "Gross margin" },
      { key: "churn", label: "Churn" },
    ];
    return drivers.map((d) => {
      const base = parseFloat(primary[d.key] as string) || 0;
      const low = { ...primary, [d.key]: String(base * 0.8) };
      const high = { ...primary, [d.key]: String(base * 1.2) };
      return {
        label: d.label,
        low: compute(low).ratio,
        high: compute(high).ratio,
      };
    });
  }, [primary]);

  // LTV-vs-CAC chart — read CSS var --tool-accent at draw time
  const chartRef = useRef<HTMLCanvasElement>(null);
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
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--tool-accent").trim() || "rgb(139 92 246)";
    const accentSoft = styles.getPropertyValue("--tool-accent-soft").trim() || "rgba(139,92,246,0.15)";
    const borderCol = styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.08)";
    const textMuted = styles.getPropertyValue("--text-muted").trim() || "rgba(255,255,255,0.55)";

    // Plot retention curve: contribution margin per month accumulating to LTV vs flat CAC line
    const padL = 36;
    const padR = 12;
    const padT = 14;
    const padB = 22;
    const W = cssW - padL - padR;
    const H = cssH - padT - padB;

    const months = Math.max(12, Math.ceil(primaryResult.life * 1.5) || 12);
    const churn = (parseFloat(primary.churn) || 0) / 100;
    const cm = primaryResult.cm;
    const cac = primaryResult.cac;

    // Build cumulative LTV curve under exponential retention: sum of cm * (1-churn)^t
    const points: { t: number; v: number }[] = [];
    let cum = 0;
    for (let t = 0; t <= months; t++) {
      const survival = churn > 0 ? Math.pow(1 - churn, t) : 1;
      if (t > 0) cum += cm * survival;
      points.push({ t, v: cum });
    }
    const yMax = Math.max(cac * 1.5, primaryResult.ltv, cm, 1);

    // axes
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + H);
    ctx.lineTo(padL + W, padT + H);
    ctx.stroke();

    // y gridlines
    ctx.fillStyle = textMuted;
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = padT + (H * i) / 4;
      const val = yMax * (1 - i / 4);
      ctx.strokeStyle = borderCol;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + W, y);
      ctx.stroke();
      ctx.fillText(`$${Math.round(val).toLocaleString()}`, padL - 4, y);
    }

    // CAC reference line (dashed)
    if (cac > 0 && cac <= yMax) {
      const y = padT + H - (cac / yMax) * H;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = textMuted;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = textMuted;
      ctx.textAlign = "left";
      ctx.fillText(`CAC ${fmt(cac)}`, padL + 4, y - 7);
    }

    // Filled area under cumulative curve in soft accent
    ctx.fillStyle = accentSoft;
    ctx.beginPath();
    ctx.moveTo(padL, padT + H);
    points.forEach((p) => {
      const x = padL + (p.t / months) * W;
      const y = padT + H - (Math.min(p.v, yMax) / yMax) * H;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(padL + W, padT + H);
    ctx.closePath();
    ctx.fill();

    // Curve line in accent
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padL + (p.t / months) * W;
      const y = padT + H - (Math.min(p.v, yMax) / yMax) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // x-axis ticks
    ctx.fillStyle = textMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const ticks = [0, Math.floor(months / 2), months];
    ticks.forEach((t) => {
      const x = padL + (t / months) * W;
      ctx.fillText(`${t}m`, x, padT + H + 4);
    });
  }, [primary, primaryResult, view, industry]);

  return (
    <div data-tool-theme="sales" data-tool="cac-ltv">
      <ToolShell
        category="Marketing"
        title="CAC / LTV Calculator"
        description="Customer acquisition cost, lifetime value, payback period, and the LTV:CAC ratio — with industry benchmarks and multi-cohort comparison."
      >
        {/* ============================== HERO ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${verdictTone}`}
            >
              {verdict}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {bench.label}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              unit.economics
              <span className="text-faint">/</span>
              <span className="text-secondary">cac-ltv.calc</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[auto_1fr] lg:items-center lg:p-6">
            <div className="flex flex-col items-start">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                LTV : CAC ratio
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="font-mono text-6xl font-bold tracking-tight text-app">
                  {ratio.toFixed(2)}
                </div>
                <div className="font-mono text-2xl text-faint">:1</div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-lg border px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${paybackChipCls}`}
                >
                  Payback {primaryResult.payback.toFixed(1)} mo
                  <span className="ml-1.5 opacity-70">/ &lt; {bench.paybackMonths}</span>
                </span>
                <span className="rounded-lg border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                  {bench.healthy}x healthy · {bench.excellent}x great
                </span>
              </div>
            </div>

            <div>
              <p className="max-w-xl text-sm text-secondary">{bench.note}</p>

              {/* Side-by-side LTV vs CAC bars */}
              <div className="mt-5 space-y-2.5">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.16em]">
                    <span className="text-tool-accent">LTV</span>
                    <span className="text-secondary">{fmt(primaryResult.ltv)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className="h-full rounded-full bg-tool-accent"
                      style={{ width: `${ltvWidth}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.16em]">
                    <span className="text-muted">CAC</span>
                    <span className="text-secondary">{fmt(primaryResult.cac)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className="h-full rounded-full bg-tool-accent-soft"
                      style={{ width: `${cacWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Segmented view tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "snapshot", label: "Snapshot" },
                  { k: "cohort", label: "Cohort" },
                  { k: "sensitivity", label: "Sensitivity" },
                ] as { k: ViewKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setView(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    view === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={view === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              ◉ autosaved
            </div>
          </div>
        </section>

        {/* ============================== SNAPSHOT ============================== */}
        {view === "snapshot" && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
              <ToolCard title="Inputs — primary cohort" subtitle="Acquisition + economics">
                <div className="space-y-4">
                  <Field label="Industry benchmark">
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value as Industry)}
                      className={inputCls()}
                    >
                      {(Object.keys(INDUSTRY_BENCH) as Industry[]).map((k) => (
                        <option key={k} value={k}>
                          {INDUSTRY_BENCH[k].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Marketing + sales spend ($)">
                    <input
                      type="number"
                      value={primary.spend}
                      onChange={(e) => updateCohort(0, { spend: e.target.value })}
                      className={inputCls()}
                      min="0"
                      step="1000"
                    />
                  </Field>
                  <Field label="New customers acquired">
                    <input
                      type="number"
                      value={primary.customers}
                      onChange={(e) => updateCohort(0, { customers: e.target.value })}
                      className={inputCls()}
                      min="0"
                      step="1"
                    />
                  </Field>
                  <Field label="ARPU — monthly revenue per customer ($)">
                    <input
                      type="number"
                      value={primary.arpu}
                      onChange={(e) => updateCohort(0, { arpu: e.target.value })}
                      className={inputCls()}
                      min="0"
                      step="1"
                    />
                  </Field>
                  <Field label="Gross margin (%)">
                    <input
                      type="number"
                      value={primary.gm}
                      onChange={(e) => updateCohort(0, { gm: e.target.value })}
                      className={inputCls()}
                      min="0"
                      max="100"
                      step="1"
                    />
                  </Field>
                  <Field label="Monthly churn (%)">
                    <input
                      type="number"
                      value={primary.churn}
                      onChange={(e) => updateCohort(0, { churn: e.target.value })}
                      className={inputCls()}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </Field>
                </div>
              </ToolCard>

              <ToolCard title="Unit economics" subtitle="The numbers that matter">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="CAC" value={fmt(primaryResult.cac)} />
                  <Stat label="Contribution / month" value={fmt(primaryResult.cm)} />
                  <Stat label="Avg lifetime (months)" value={primaryResult.life.toFixed(1)} />
                  <Stat label="LTV" value={fmt(primaryResult.ltv)} />
                  <Stat label="Payback (months)" value={primaryResult.payback.toFixed(1)} />
                  <Stat label="LTV : CAC" value={ratio.toFixed(2) + ":1"} accent />
                </div>

                <div className="mt-5 rounded-xl border border-app bg-tool-accent-soft p-4">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    {bench.label} benchmark
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className="absolute inset-y-0 left-0 bg-rose-500/30"
                      style={{ width: `${Math.min(100, (1 / (bench.excellent * 1.25)) * 100)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-amber-500/30"
                      style={{
                        left: `${(1 / (bench.excellent * 1.25)) * 100}%`,
                        width: `${((bench.healthy - 1) / (bench.excellent * 1.25)) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 bg-emerald-500/40"
                      style={{
                        left: `${(bench.healthy / (bench.excellent * 1.25)) * 100}%`,
                        width: `${100 - (bench.healthy / (bench.excellent * 1.25)) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute -top-0.5 h-3 w-0.5 bg-tool-accent"
                      style={{ left: `${Math.min(99, (ratio / (bench.excellent * 1.25)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-muted">
                    <span>Broken &lt; 1x</span>
                    <span>Healthy {bench.healthy}x</span>
                    <span>Excellent {bench.excellent}x+</span>
                  </div>
                  <p className="mt-3 text-xs text-secondary">{bench.note}</p>
                  <p className="mt-1 text-xs text-muted">
                    Target payback: &lt; {bench.paybackMonths} months. Yours: {primaryResult.payback.toFixed(1)}.
                  </p>
                </div>

                <p className="mt-4 text-sm">
                  <span className="text-muted">Verdict: </span>
                  <span
                    className={`font-semibold ${
                      ratio >= bench.healthy
                        ? "text-emerald-500"
                        : ratio >= 1
                        ? "text-amber-500"
                        : "text-rose-500"
                    }`}
                  >
                    {verdict}
                  </span>
                  <span className="text-muted"> — {bench.note}</span>
                </p>
              </ToolCard>
            </div>

            {/* LTV vs CAC chart */}
            <div className="mt-6">
              <ToolCard
                title="LTV vs CAC over retention"
                subtitle="Cumulative contribution margin under exponential retention"
              >
                <div className="relative h-64 w-full">
                  <canvas ref={chartRef} className="h-full w-full" />
                </div>
                <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  Curve: cum. contribution margin · Dashed: CAC line · Crossover = payback
                </p>
              </ToolCard>
            </div>
          </>
        )}

        {/* ============================== COHORT ============================== */}
        {view === "cohort" && (
          <ToolCard title="Channel / cohort breakdown" subtitle="Side-by-side — edit inline">
            <div className="space-y-2">
              <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-2 px-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span>Cohort</span>
                <span className="text-right">CAC</span>
                <span className="text-right">LTV</span>
                <span className="text-right">Ratio</span>
                <span className="text-right">Payback</span>
              </div>
              {cohorts.map((c, i) => {
                const r = compute(c);
                const color =
                  r.ratio >= bench.healthy
                    ? "text-emerald-500"
                    : r.ratio >= 1
                    ? "text-amber-500"
                    : "text-rose-500";
                const rowFill = Math.min(100, (r.ratio / (bench.excellent * 1.25)) * 100);
                return (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-xl border border-app bg-app-elevated px-3 py-2.5 transition-colors hover:border-tool-accent"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-tool-accent-soft"
                      style={{ width: `${rowFill}%` }}
                      aria-hidden
                    />
                    <div className="relative grid grid-cols-[1.4fr_repeat(4,1fr)] items-center gap-2 text-sm">
                      <input
                        value={c.name}
                        onChange={(e) => updateCohort(i, { name: e.target.value })}
                        className={inputCls("!px-2 !py-1 text-xs")}
                      />
                      <span className="text-right text-app">{fmt(r.cac)}</span>
                      <span className="text-right text-app">{fmt(r.ltv)}</span>
                      <span className={`text-right font-semibold ${color}`}>{r.ratio.toFixed(2)}x</span>
                      <span className="text-right text-app">{r.payback.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cohorts.slice(1).map((c, idx) => {
                const i = idx + 1;
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-app bg-app-elevated p-3 text-xs"
                  >
                    <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      {c.name}
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-muted">Spend</span>
                        <input
                          value={c.spend}
                          onChange={(e) => updateCohort(i, { spend: e.target.value })}
                          className={inputCls("!px-2 !py-1 text-xs !w-20")}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-muted">Cust.</span>
                        <input
                          value={c.customers}
                          onChange={(e) => updateCohort(i, { customers: e.target.value })}
                          className={inputCls("!px-2 !py-1 text-xs !w-20")}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-muted">ARPU</span>
                        <input
                          value={c.arpu}
                          onChange={(e) => updateCohort(i, { arpu: e.target.value })}
                          className={inputCls("!px-2 !py-1 text-xs !w-20")}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-muted">GM %</span>
                        <input
                          value={c.gm}
                          onChange={(e) => updateCohort(i, { gm: e.target.value })}
                          className={inputCls("!px-2 !py-1 text-xs !w-20")}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-muted">Churn %</span>
                        <input
                          value={c.churn}
                          onChange={(e) => updateCohort(i, { churn: e.target.value })}
                          className={inputCls("!px-2 !py-1 text-xs !w-20")}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </ToolCard>
        )}

        {/* ============================== SENSITIVITY ============================== */}
        {view === "sensitivity" && (
          <ToolCard title="Payback sensitivity" subtitle="±20% on each driver → LTV:CAC">
            <p className="mb-4 text-xs text-secondary">
              How much does the primary cohort&rsquo;s ratio move when each input swings ±20%?
              Biggest bars = your highest-leverage levers.
            </p>
            <div className="space-y-3">
              {sensitivity.map((s) => {
                const maxRange = bench.excellent * 1.3;
                return (
                  <div key={s.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-secondary">{s.label}</span>
                      <span className="text-muted">
                        {s.low.toFixed(2)}x – {s.high.toFixed(2)}x
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full border border-app bg-app">
                      <div
                        className="absolute inset-y-0 bg-tool-accent"
                        style={{
                          left: `${(Math.min(s.low, s.high) / maxRange) * 100}%`,
                          width: `${(Math.abs(s.high - s.low) / maxRange) * 100}%`,
                          opacity: 0.5,
                        }}
                      />
                      <div
                        className="absolute -top-0.5 h-3 w-0.5 bg-tool-accent"
                        style={{ left: `${Math.min(99, (ratio / maxRange) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              Source: Bessemer Venture Partners State of the Cloud 2024, OpenView 2024 SaaS Benchmarks.
            </p>
          </ToolCard>
        )}
      </ToolShell>
    </div>
  );
}
