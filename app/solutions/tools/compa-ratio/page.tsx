"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

interface BulkRow {
  name: string;
  salary: number;
  midpoint: number;
  ratio: number;
}

const BINS = [
  { label: "<80%", min: 0, max: 0.8 },
  { label: "80–90%", min: 0.8, max: 0.9 },
  { label: "90–100%", min: 0.9, max: 1.0 },
  { label: "100–110%", min: 1.0, max: 1.1 },
  { label: "110–120%", min: 1.1, max: 1.2 },
  { label: ">120%", min: 1.2, max: Infinity },
];

function bandFor(ratio: number): { label: string; tone: "low" | "mid" | "high" } {
  if (ratio < 0.9) return { label: "Below band", tone: "low" };
  if (ratio > 1.1) return { label: "Above band", tone: "high" };
  return { label: "At market", tone: "mid" };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

type View = "single" | "bulk";

export default function CompaRatioPage() {
  const [view, setView] = useState<View>("single");
  const [salary, setSalary] = useState("85000");
  const [midpoint, setMidpoint] = useState("95000");
  const [csv, setCsv] = useState(
    "Name,Salary,Midpoint\nAlex,90000,95000\nJordan,110000,100000\nSam,72000,95000\nMorgan,98000,95000\nPriya,125000,100000"
  );

  const single = useMemo(() => {
    const s = parseFloat(salary) || 0;
    const m = parseFloat(midpoint) || 0;
    const ratio = m > 0 ? s / m : 0;
    const gapDollar = s - m;
    const gapPct = m > 0 ? ((s - m) / m) * 100 : 0;
    return { s, m, ratio, gapDollar, gapPct, band: bandFor(ratio) };
  }, [salary, midpoint]);

  const bulk = useMemo<BulkRow[]>(() => {
    if (!csv.trim()) return [];
    const lines = csv.trim().split(/\r?\n/);
    const rows: BulkRow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const parts = parseCsvLine(line);
      if (i === 0 && /name/i.test(parts[0])) continue;
      const name = parts[0] || `Row ${i + 1}`;
      const sal = parseFloat(parts[1]);
      const mid = parseFloat(parts[2]);
      if (!Number.isFinite(sal) || !Number.isFinite(mid) || mid <= 0) continue;
      rows.push({ name, salary: sal, midpoint: mid, ratio: sal / mid });
    }
    return rows;
  }, [csv]);

  const histogram = useMemo(() => {
    const counts = BINS.map(() => 0);
    for (const r of bulk) {
      for (let i = 0; i < BINS.length; i++) {
        if (r.ratio >= BINS[i].min && r.ratio < BINS[i].max) {
          counts[i]++;
          break;
        }
      }
    }
    const max = Math.max(1, ...counts);
    return BINS.map((b, i) => ({ ...b, count: counts[i], pct: (counts[i] / max) * 100 }));
  }, [bulk]);

  const bulkStats = useMemo(() => {
    if (bulk.length === 0) return null;
    const ratios = bulk.map((r) => r.ratio).sort((a, b) => a - b);
    const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const median = ratios[Math.floor(ratios.length / 2)];
    const inBand = bulk.filter((r) => r.ratio >= 0.9 && r.ratio <= 1.1).length;
    const below = bulk.filter((r) => r.ratio < 0.9).length;
    const above = bulk.filter((r) => r.ratio > 1.1).length;
    return {
      count: bulk.length,
      avg,
      median,
      inBandPct: (inBand / bulk.length) * 100,
      belowPct: (below / bulk.length) * 100,
      abovePct: (above / bulk.length) * 100,
    };
  }, [bulk]);

  const HEALTHY_IN_BAND_PCT = 85;

  // Outliers: above 1.2 and below 0.8
  const outliersHigh = useMemo(
    () => bulk.filter((r) => r.ratio > 1.2).sort((a, b) => b.ratio - a.ratio),
    [bulk]
  );
  const outliersLow = useMemo(
    () => bulk.filter((r) => r.ratio < 0.8).sort((a, b) => a.ratio - b.ratio),
    [bulk]
  );

  function csvForEquity(rows: BulkRow[]): string {
    const lines = ["Name,Current Salary,Midpoint,Compa-Ratio,Suggested Salary (1.00),Adjustment ($),Adjustment (%)"];
    for (const r of rows) {
      const suggested = r.midpoint;
      const adj = suggested - r.salary;
      const adjPct = r.salary > 0 ? (adj / r.salary) * 100 : 0;
      lines.push(
        [
          `"${r.name}"`,
          r.salary.toFixed(0),
          r.midpoint.toFixed(0),
          r.ratio.toFixed(3),
          suggested.toFixed(0),
          adj.toFixed(0),
          adjPct.toFixed(1),
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  function downloadEquityPlan() {
    const below = bulk.filter((r) => r.ratio < 0.9);
    const csvOut = csvForEquity(below.length ? below : bulk);
    const blob = new Blob([csvOut], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "equity-plan.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // ----- Dial geometry (single employee) -----
  // Clamp ratio to 0.6..1.4 for display, with band 0.8..1.2 emphasized.
  const dialMin = 0.6;
  const dialMax = 1.4;
  const dialRatio = Math.max(dialMin, Math.min(dialMax, single.ratio || dialMin));
  const dialPct = ((dialRatio - dialMin) / (dialMax - dialMin)) * 100;
  // Position of band edges (0.8 and 1.2) on the visual track
  const bandLowPct = ((0.8 - dialMin) / (dialMax - dialMin)) * 100;
  const bandHighPct = ((1.2 - dialMin) / (dialMax - dialMin)) * 100;

  // Band tone tied to the foundation accent for in-band; semantic for out-of-band.
  const bandTone =
    single.ratio < 0.8
      ? "amber"
      : single.ratio < 0.9
      ? "amber"
      : single.ratio <= 1.1
      ? "accent"
      : single.ratio <= 1.2
      ? "accent"
      : "rose";

  const dialPinTextClass =
    bandTone === "amber"
      ? "text-amber-600"
      : bandTone === "rose"
      ? "text-rose-500"
      : "text-tool-accent";

  const dialPinBg =
    bandTone === "amber"
      ? "bg-amber-500"
      : bandTone === "rose"
      ? "bg-rose-500"
      : "bg-tool-accent";

  // ----- Pay-band horizontal chart with employees as dots -----
  // Domain: 0.6..1.4 across all employees + single
  const chartMin = 0.6;
  const chartMax = 1.4;
  const dotPos = (r: number) =>
    Math.max(0, Math.min(100, ((Math.max(chartMin, Math.min(chartMax, r)) - chartMin) / (chartMax - chartMin)) * 100));

  return (
    <ToolShell
      category="HR & People"
      title="Compa-Ratio Calculator"
      description="See how salaries sit against market midpoint. Single-employee view plus bulk CSV distribution."
    >
      <div data-tool-theme="hr" data-tool="compa-ratio" className="space-y-5 text-app">
        {/* Hero — title + key chips + sub-tab buttons */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                HR · Pay equity diagnostic
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Compa-ratio
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Salary versus market midpoint. Healthy band sits at 0.9–1.1; outliers fall outside 0.8 / 1.2.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated/60 px-2.5 py-1.5 text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Target 1.000
              </span>
              {bulkStats && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated/60 px-2.5 py-1.5 text-muted">
                  Roster {bulkStats.count}
                </span>
              )}
            </div>
          </div>

          {/* Sub-tabs — state buttons */}
          <div className="mt-5 flex flex-wrap gap-2">
            <StateButton active={view === "single"} onClick={() => setView("single")}>
              Single employee
            </StateButton>
            <StateButton active={view === "bulk"} onClick={() => setView("bulk")}>
              Bulk distribution
            </StateButton>
          </div>
        </header>

        {/* SINGLE VIEW */}
        {view === "single" && (
          <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
            {/* Section header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Compa-ratio dial
                </div>
                <h2 className="text-sm font-semibold text-app">
                  0.8–1.2 healthy band · live readout
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip glyph="$">{fmt(single.s)}</Chip>
                <Chip glyph="◉">mid {fmt(single.m)}</Chip>
                <Chip glyph="▣">{single.band.label}</Chip>
              </div>
            </div>

            {/* Dial */}
            <div className="px-5 py-7 sm:px-8">
              <div className="relative pt-12 pb-12">
                {/* Pin on top with current ratio */}
                <div
                  className="absolute top-0 z-10 -translate-x-1/2"
                  style={{ left: `${dialPct}%` }}
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "rounded-md px-2 py-0.5 font-mono text-[0.7rem] font-bold tabular-nums text-white shadow-card " +
                        dialPinBg
                      }
                    >
                      {single.ratio ? single.ratio.toFixed(3) : "–"}
                    </span>
                    <span className={"h-2.5 w-0.5 " + dialPinBg} />
                    <span className={"h-2 w-2 -translate-y-1 rotate-45 " + dialPinBg} />
                  </div>
                </div>

                {/* Multi-band track */}
                <div className="relative h-3 overflow-hidden rounded-full ring-1 ring-inset ring-tool-accent">
                  {/* Below 0.8 -> amber */}
                  <div
                    className="absolute inset-y-0 left-0 bg-amber-400/45"
                    style={{ width: `${bandLowPct}%` }}
                  />
                  {/* 0.8-1.2 -> healthy band uses tool accent */}
                  <div
                    className="absolute inset-y-0 bg-tool-accent-soft"
                    style={{ left: `${bandLowPct}%`, width: `${bandHighPct - bandLowPct}%` }}
                  />
                  {/* 0.9-1.1 -> sweet spot uses solid tool accent */}
                  <div
                    className="absolute inset-y-0 bg-tool-accent opacity-60"
                    style={{
                      left: `${((0.9 - dialMin) / (dialMax - dialMin)) * 100}%`,
                      width: `${((1.1 - 0.9) / (dialMax - dialMin)) * 100}%`,
                    }}
                  />
                  {/* Above 1.2 -> rose */}
                  <div
                    className="absolute inset-y-0 right-0 bg-rose-500/55"
                    style={{ width: `${100 - bandHighPct}%` }}
                  />
                </div>

                {/* Tick markers */}
                {[
                  { v: 0.6, label: "0.60" },
                  { v: 0.8, label: "0.80", emph: true },
                  { v: 0.9, label: "0.90" },
                  { v: 1.0, label: "1.00", strong: true },
                  { v: 1.1, label: "1.10" },
                  { v: 1.2, label: "1.20", emph: true },
                  { v: 1.4, label: "1.40" },
                ].map((t) => {
                  const pos = ((t.v - dialMin) / (dialMax - dialMin)) * 100;
                  return (
                    <div
                      key={t.label}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${pos}%`, top: "2.6rem" }}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={
                            t.strong
                              ? "h-6 w-[3px] rounded-full bg-tool-accent"
                              : t.emph
                              ? "h-5 w-0.5 rounded-full bg-tool-accent opacity-70"
                              : "h-3 w-px rounded-full bg-app"
                          }
                        />
                        <div
                          className={
                            "mt-1.5 font-mono text-[0.65rem] tabular-nums " +
                            (t.strong
                              ? "font-bold text-tool-accent"
                              : t.emph
                              ? "font-semibold text-secondary"
                              : "text-faint")
                          }
                        >
                          {t.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inputs row */}
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Employee salary ($)">
                  <input
                    type="number"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    className={inputCls}
                    min="0"
                    step="1000"
                  />
                </Field>
                <Field label="Market midpoint ($)">
                  <input
                    type="number"
                    value={midpoint}
                    onChange={(e) => setMidpoint(e.target.value)}
                    className={inputCls}
                    min="0"
                    step="1000"
                  />
                </Field>
              </div>

              {/* Stat cards */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="Ratio" sub="salary ÷ mid" value={single.ratio ? single.ratio.toFixed(3) : "–"} emphasized />
                <Kpi label="Band" sub="vs healthy" value={single.band.label} />
                <Kpi label="Gap $" sub="salary − mid" value={fmt(single.gapDollar)} />
                <Kpi
                  label="Gap %"
                  sub="of midpoint"
                  value={`${single.gapPct >= 0 ? "+" : ""}${single.gapPct.toFixed(1)}%`}
                />
              </div>

              <p className={"mt-3 text-xs font-medium " + dialPinTextClass}>
                {single.ratio < 0.8 && "Well below band — retention risk."}
                {single.ratio >= 0.8 && single.ratio < 0.9 && "Below healthy band — review for adjustment."}
                {single.ratio >= 0.9 && single.ratio <= 1.1 && "Inside healthy 0.9–1.1 band."}
                {single.ratio > 1.1 && single.ratio <= 1.2 && "Above midpoint — premium territory."}
                {single.ratio > 1.2 && "Above 1.20 — band creep, justify with evidence."}
              </p>
            </div>
          </section>
        )}

        {/* BULK VIEW */}
        {view === "bulk" && (
          <>
            {/* CSV input + summary */}
            <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
              <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-5 py-3">
                <div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Bulk distribution
                  </div>
                  <h3 className="text-sm font-semibold text-app">
                    CSV: Name, Salary, Midpoint
                  </h3>
                </div>
                {bulkStats && (
                  <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                    {bulkStats.count} employees
                  </div>
                )}
              </div>

              <div className="space-y-4 px-5 py-4">
                <Field label="Paste CSV">
                  <textarea
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    className={inputCls + " min-h-[140px] font-mono text-xs"}
                  />
                </Field>

                {bulkStats && (
                  <div className="grid grid-cols-3 gap-3">
                    <Kpi label="Avg" sub="mean ratio" value={bulkStats.avg.toFixed(3)} />
                    <Kpi label="Median" sub="p50 ratio" value={bulkStats.median.toFixed(3)} emphasized />
                    <Kpi label="In band" sub="0.9–1.1" value={`${bulkStats.inBandPct.toFixed(0)}%`} />
                  </div>
                )}

                {bulkStats && (
                  <div className="rounded-xl border border-app bg-tool-accent-soft p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                        Band health
                      </div>
                      <div className="text-[0.6rem] text-muted">
                        Healthy target: {HEALTHY_IN_BAND_PCT}%+ in 0.9–1.1
                      </div>
                    </div>
                    <div className="mt-2 flex h-5 w-full overflow-hidden rounded text-[0.55rem] font-medium">
                      <div
                        className="flex items-center justify-center bg-amber-400/55 text-amber-900"
                        style={{ width: `${bulkStats.belowPct}%` }}
                        title="Below band"
                      >
                        {bulkStats.belowPct > 8 ? `${bulkStats.belowPct.toFixed(0)}%` : ""}
                      </div>
                      <div
                        className="flex items-center justify-center bg-tool-accent text-white"
                        style={{ width: `${bulkStats.inBandPct}%` }}
                        title="In band"
                      >
                        {bulkStats.inBandPct > 8 ? `${bulkStats.inBandPct.toFixed(0)}%` : ""}
                      </div>
                      <div
                        className="flex items-center justify-center bg-rose-500/55 text-rose-50"
                        style={{ width: `${bulkStats.abovePct}%` }}
                        title="Above band"
                      >
                        {bulkStats.abovePct > 8 ? `${bulkStats.abovePct.toFixed(0)}%` : ""}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-secondary">
                      {bulkStats.inBandPct >= HEALTHY_IN_BAND_PCT
                        ? `Healthy distribution — ${bulkStats.inBandPct.toFixed(0)}% in band.`
                        : `Only ${bulkStats.inBandPct.toFixed(0)}% in 0.9–1.1. Review outliers.`}
                    </p>
                    <button
                      onClick={downloadEquityPlan}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-tool-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-card transition hover:brightness-110"
                    >
                      <span aria-hidden>↓</span> Export equity plan CSV
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Pay-band horizontal chart with employees as dots */}
            {bulk.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
                <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-5 py-3">
                  <div>
                    <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                      Pay band
                    </div>
                    <h3 className="text-sm font-semibold text-app">
                      Employees plotted on the band
                    </h3>
                  </div>
                  <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                    {bulk.length} dots · domain 0.6–1.4
                  </div>
                </div>
                <div className="px-5 pb-6 pt-8 sm:px-8">
                  <div className="relative h-24">
                    {/* Track segments */}
                    <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-inset ring-tool-accent">
                      <div
                        className="absolute inset-y-0 left-0 bg-amber-400/45"
                        style={{ width: `${((0.8 - chartMin) / (chartMax - chartMin)) * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 bg-tool-accent opacity-60"
                        style={{
                          left: `${((0.9 - chartMin) / (chartMax - chartMin)) * 100}%`,
                          width: `${((1.1 - 0.9) / (chartMax - chartMin)) * 100}%`,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 right-0 bg-rose-500/55"
                        style={{ width: `${((chartMax - 1.2) / (chartMax - chartMin)) * 100}%` }}
                      />
                    </div>

                    {/* Midpoint line */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-tool-accent"
                      style={{ left: `${((1.0 - chartMin) / (chartMax - chartMin)) * 100}%` }}
                    />

                    {/* Employee dots */}
                    {bulk.map((r, i) => {
                      const tone = bandFor(r.ratio).tone;
                      const dotColor =
                        r.ratio > 1.2
                          ? "bg-rose-500 ring-rose-300/60"
                          : tone === "high"
                          ? "bg-tool-accent ring-tool-accent"
                          : tone === "low" && r.ratio < 0.8
                          ? "bg-amber-500 ring-amber-300/60"
                          : tone === "low"
                          ? "bg-amber-400 ring-amber-300/60"
                          : "bg-tool-accent ring-tool-accent";
                      // Stagger vertically to reduce overlap
                      const offset = ((i % 3) - 1) * 14;
                      return (
                        <div
                          key={i}
                          className="group absolute"
                          style={{
                            left: `${dotPos(r.ratio)}%`,
                            top: `calc(50% + ${offset}px)`,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <span
                            className={
                              "block h-3 w-3 rounded-full ring-2 shadow-card " + dotColor
                            }
                          />
                          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-app-elevated px-1.5 py-0.5 font-mono text-[0.6rem] tabular-nums text-app opacity-0 shadow-card transition group-hover:opacity-100 border border-app">
                            {r.name} · {r.ratio.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Axis labels */}
                  <div className="mt-4 flex justify-between font-mono text-[0.6rem] tabular-nums text-muted">
                    <span>0.60</span>
                    <span>0.80</span>
                    <span className="font-semibold text-tool-accent">1.00</span>
                    <span>1.20</span>
                    <span>1.40</span>
                  </div>

                  {/* Legend */}
                  <div className="mt-3 flex flex-wrap gap-3 text-[0.65rem] text-muted">
                    <Legend dot="bg-amber-500 ring-amber-300/60">Below 0.9</Legend>
                    <Legend dot="bg-tool-accent ring-tool-accent">In band 0.9–1.1</Legend>
                    <Legend dot="bg-tool-accent ring-tool-accent">Above 1.1</Legend>
                    <Legend dot="bg-rose-500 ring-rose-300/60">Above 1.2 (outlier)</Legend>
                  </div>
                </div>
              </section>
            )}

            {/* Outliers list */}
            {bulk.length > 0 && (outliersHigh.length > 0 || outliersLow.length > 0) && (
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <OutlierPanel
                  tone="high"
                  title="Band creep / over-paid"
                  caption="Outliers · above 1.20"
                  rows={outliersHigh}
                  emptyText="None — no employees above 1.20."
                  fmt={fmt}
                />
                <OutlierPanel
                  tone="low"
                  title="Retention risk / under-paid"
                  caption="Outliers · below 0.80"
                  rows={outliersLow}
                  emptyText="None — no employees below 0.80."
                  fmt={fmt}
                />
              </section>
            )}

            {/* Histogram */}
            {bulk.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
                <div className="border-b border-app bg-tool-accent-soft px-5 py-3">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Histogram
                  </div>
                  <h3 className="text-sm font-semibold text-app">Compa-ratio bins</h3>
                </div>
                <div className="space-y-2 px-5 py-4">
                  {histogram.map((b) => {
                    const inBand = b.min >= 0.9 && b.max <= 1.1;
                    const below = b.max <= 0.9;
                    const barClass = inBand
                      ? "bg-tool-accent"
                      : below
                      ? "bg-amber-400/70"
                      : "bg-rose-500/65";
                    return (
                      <div key={b.label} className="flex items-center gap-3">
                        <div className="w-20 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted">
                          {b.label}
                        </div>
                        <div className="flex-1 overflow-hidden rounded-full bg-app-elevated/60">
                          <div
                            className={"h-5 rounded-full " + barClass}
                            style={{ width: `${b.pct}%` }}
                          />
                        </div>
                        <div className="w-10 text-right font-mono text-sm tabular-nums text-app">
                          {b.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Individual rows */}
            {bulk.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
                <div className="border-b border-app bg-tool-accent-soft px-5 py-3">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Roster
                  </div>
                  <h3 className="text-sm font-semibold text-app">
                    Individual rows · {bulk.length} employees
                  </h3>
                </div>
                <div className="overflow-x-auto px-5 py-4">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[0.65rem] uppercase tracking-[0.15em] text-muted">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Salary</th>
                        <th className="py-2 pr-4">Midpoint</th>
                        <th className="py-2 pr-4">Ratio</th>
                        <th className="py-2 pr-4">Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulk.map((r, idx) => {
                        const band = bandFor(r.ratio);
                        const tone =
                          band.tone === "low"
                            ? "text-amber-600"
                            : band.tone === "high"
                            ? "text-tool-accent"
                            : "text-tool-accent";
                        return (
                          <tr key={idx} className="border-t border-app">
                            <td className="py-2 pr-4 text-app">{r.name}</td>
                            <td className="py-2 pr-4 font-mono tabular-nums text-secondary">
                              {fmt(r.salary)}
                            </td>
                            <td className="py-2 pr-4 font-mono tabular-nums text-secondary">
                              {fmt(r.midpoint)}
                            </td>
                            <td className="py-2 pr-4 font-mono font-semibold tabular-nums text-app">
                              {r.ratio.toFixed(3)}
                            </td>
                            <td className={`py-2 pr-4 ${tone}`}>{band.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {/* Methodology footnote */}
        <div className="rounded-2xl border border-app bg-tool-surface p-5 text-xs text-secondary">
          <div className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
            Methodology
          </div>
          <p>
            Band health target: WorldatWork / Radford Tech Compensation Survey 2024 guidance — a healthy pay band typically has 85%+ of employees within 0.9–1.1 compa-ratio. Outliers below 0.80 signal retention risk; outliers above 1.20 indicate band creep that should be justified with documented evidence.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}

/* ── Visual sub-components (presentational only) ───────────────────────── */

const inputCls =
  "w-full rounded-md border border-app bg-app-elevated/60 px-2.5 py-1.5 text-sm text-app outline-none transition focus:border-app-focus focus:ring-2 focus:ring-tool-accent placeholder:text-faint";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chip({ children, glyph }: { children: React.ReactNode; glyph?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated/60 px-2.5 py-1 text-[0.7rem] font-medium text-secondary">
      {glyph && <span className="text-tool-accent">{glyph}</span>}
      {children}
    </span>
  );
}

function Kpi({
  label,
  sub,
  value,
  emphasized = false,
}: {
  label: string;
  sub: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated/40")
      }
    >
      <div className="flex items-baseline justify-between">
        <span
          className={
            "text-[0.6rem] font-bold uppercase tracking-[0.2em] " +
            (emphasized ? "text-tool-accent" : "text-muted")
          }
        >
          {label}
        </span>
        <span className="text-[0.6rem] text-faint">{sub}</span>
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-lg font-semibold text-app")
        }
      >
        {value}
      </div>
    </div>
  );
}

function StateButton({
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
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated/60 text-secondary hover:border-tool-accent hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={"h-2.5 w-2.5 rounded-full ring-2 " + dot} />
      {children}
    </span>
  );
}

function OutlierPanel({
  tone,
  title,
  caption,
  rows,
  emptyText,
  fmt,
}: {
  tone: "high" | "low";
  title: string;
  caption: string;
  rows: BulkRow[];
  emptyText: string;
  fmt: (n: number) => string;
}) {
  const accent = tone === "high" ? "text-rose-500" : "text-amber-600";
  const ratioCls =
    tone === "high"
      ? "text-rose-500"
      : "text-amber-600";
  return (
    <div className="overflow-hidden rounded-2xl border border-app bg-tool-surface shadow-card">
      <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-5 py-3">
        <div>
          <div className={"text-[0.6rem] font-semibold uppercase tracking-[0.22em] " + accent}>
            {caption}
          </div>
          <h3 className="text-sm font-semibold text-app">{title}</h3>
        </div>
        <div className={"font-mono text-[0.65rem] tabular-nums " + accent}>
          {rows.length}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-4 text-xs text-muted">{emptyText}</div>
      ) : (
        <div className="divide-y divide-app">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
              <div className="flex-1 truncate text-app">{r.name}</div>
              <div className="font-mono text-xs tabular-nums text-muted">
                {fmt(r.salary)} / {fmt(r.midpoint)}
              </div>
              <div className={"w-16 text-right font-mono text-xs font-bold tabular-nums " + ratioCls}>
                {r.ratio.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
