"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type PresetKey = "custom" | "promotional" | "newsletter" | "transactional";

const PRESETS: Record<
  PresetKey,
  { openRate: string; ctr: string; conversionRate: string; aov: string; costPer1k: string }
> = {
  custom: { openRate: "22", ctr: "2.5", conversionRate: "2", aov: "85", costPer1k: "1.5" },
  promotional: { openRate: "18", ctr: "2.0", conversionRate: "2.5", aov: "75", costPer1k: "2" },
  newsletter: { openRate: "28", ctr: "3.2", conversionRate: "1.2", aov: "110", costPer1k: "1" },
  transactional: { openRate: "55", ctr: "8", conversionRate: "10", aov: "50", costPer1k: "0.5" },
};

// Industry benchmarks — Mailchimp Email Benchmarks 2024 + Campaign Monitor 2024
// open/click are aggregate post Apple MPP adjustment.
type Industry =
  | "retail"
  | "saas"
  | "nonprofit"
  | "media"
  | "finance"
  | "b2b"
  | "ecomm"
  | "travel"
  | "restaurant"
  | "education";

const INDUSTRY_BENCH: Record<
  Industry,
  { label: string; open: number; click: number; unsub: number }
> = {
  retail: { label: "Retail / E-comm", open: 18.0, click: 2.25, unsub: 0.25 },
  saas: { label: "SaaS / Software", open: 21.3, click: 2.0, unsub: 0.19 },
  nonprofit: { label: "Nonprofit", open: 26.6, click: 2.79, unsub: 0.18 },
  media: { label: "Media / Publishing", open: 22.1, click: 4.62, unsub: 0.11 },
  finance: { label: "Finance / Banking", open: 27.1, click: 2.59, unsub: 0.2 },
  b2b: { label: "B2B Services", open: 20.0, click: 2.1, unsub: 0.28 },
  ecomm: { label: "E-commerce / DTC", open: 17.0, click: 2.0, unsub: 0.27 },
  travel: { label: "Travel / Hospitality", open: 20.2, click: 2.25, unsub: 0.2 },
  restaurant: { label: "Restaurants / F&B", open: 19.8, click: 1.34, unsub: 0.22 },
  education: { label: "Education", open: 28.5, click: 3.38, unsub: 0.2 },
};

const STORAGE = "solutions:email-roi:v1";

type ViewKey = "snapshot" | "funnel" | "sensitivity";

export default function EmailRoiPage() {
  const [preset, setPreset] = useState<PresetKey>("custom");
  const [industry, setIndustry] = useState<Industry>("saas");
  const [listSize, setListSize] = useState("50000");
  const [openRate, setOpenRate] = useState(PRESETS.custom.openRate);
  const [ctr, setCtr] = useState(PRESETS.custom.ctr);
  const [conversionRate, setConversionRate] = useState(PRESETS.custom.conversionRate);
  const [aov, setAov] = useState(PRESETS.custom.aov);
  const [costPer1k, setCostPer1k] = useState(PRESETS.custom.costPer1k);

  // 12-month projection inputs
  const [sendsPerMonth, setSendsPerMonth] = useState("4");
  const [listGrowthPct, setListGrowthPct] = useState("2.5");
  const [monthlyChurnPct, setMonthlyChurnPct] = useState("0.5");

  const [view, setView] = useState<ViewKey>("snapshot");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.preset) setPreset(p.preset);
      if (p.industry) setIndustry(p.industry);
      if (p.listSize) setListSize(p.listSize);
      if (p.openRate) setOpenRate(p.openRate);
      if (p.ctr) setCtr(p.ctr);
      if (p.conversionRate) setConversionRate(p.conversionRate);
      if (p.aov) setAov(p.aov);
      if (p.costPer1k) setCostPer1k(p.costPer1k);
      if (p.sendsPerMonth) setSendsPerMonth(p.sendsPerMonth);
      if (p.listGrowthPct) setListGrowthPct(p.listGrowthPct);
      if (p.monthlyChurnPct) setMonthlyChurnPct(p.monthlyChurnPct);
      if (p.view === "snapshot" || p.view === "funnel" || p.view === "sensitivity")
        setView(p.view);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          preset, industry, listSize, openRate, ctr, conversionRate,
          aov, costPer1k, sendsPerMonth, listGrowthPct, monthlyChurnPct, view,
        })
      );
    } catch {}
  }, [preset, industry, listSize, openRate, ctr, conversionRate, aov, costPer1k, sendsPerMonth, listGrowthPct, monthlyChurnPct, view]);

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    const p = PRESETS[k];
    setOpenRate(p.openRate);
    setCtr(p.ctr);
    setConversionRate(p.conversionRate);
    setAov(p.aov);
    setCostPer1k(p.costPer1k);
  };

  const applyIndustry = () => {
    const b = INDUSTRY_BENCH[industry];
    setOpenRate(b.open.toFixed(1));
    setCtr(b.click.toFixed(2));
  };

  const { sent, opens, clicks, conversions, revenue, cost, profit, roi } = useMemo(() => {
    const s = Math.max(0, parseFloat(listSize) || 0);
    const oR = (parseFloat(openRate) || 0) / 100;
    const cR = (parseFloat(ctr) || 0) / 100;
    const cvR = (parseFloat(conversionRate) || 0) / 100;
    const a = parseFloat(aov) || 0;
    const c1k = parseFloat(costPer1k) || 0;
    const opens = s * oR;
    const clicks = opens * cR;
    const conv = clicks * cvR;
    const rev = conv * a;
    const cost = (s / 1000) * c1k;
    const profit = rev - cost;
    const roi = cost > 0 ? (profit / cost) * 100 : 0;
    return { sent: s, opens, clicks, conversions: conv, revenue: rev, cost, profit, roi };
  }, [listSize, openRate, ctr, conversionRate, aov, costPer1k]);

  // 12-month projection
  const projection = useMemo(() => {
    const spm = Math.max(0, parseFloat(sendsPerMonth) || 0);
    const grow = (parseFloat(listGrowthPct) || 0) / 100;
    const churn = (parseFloat(monthlyChurnPct) || 0) / 100;
    const a = parseFloat(aov) || 0;
    const c1k = parseFloat(costPer1k) || 0;
    const oR = (parseFloat(openRate) || 0) / 100;
    const cR = (parseFloat(ctr) || 0) / 100;
    const cvR = (parseFloat(conversionRate) || 0) / 100;

    let list = parseFloat(listSize) || 0;
    const rows: Array<{ month: number; list: number; revenue: number; cost: number; profit: number }> = [];
    let totalRev = 0, totalCost = 0;
    for (let m = 1; m <= 12; m++) {
      list = list * (1 + grow - churn);
      const monthRev = list * spm * oR * cR * cvR * a;
      const monthCost = (list / 1000) * c1k * spm;
      totalRev += monthRev;
      totalCost += monthCost;
      rows.push({ month: m, list, revenue: monthRev, cost: monthCost, profit: monthRev - monthCost });
    }
    return { rows, totalRev, totalCost, totalProfit: totalRev - totalCost };
  }, [sendsPerMonth, listGrowthPct, monthlyChurnPct, listSize, openRate, ctr, conversionRate, aov, costPer1k]);

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmtNum = (n: number) => Math.round(n).toLocaleString();

  // ROI multiple — every $1 of spend returns $X
  const roiMultiple = cost > 0 ? revenue / cost : 0;

  const verdict = roi >= 300 ? "Excellent" : roi >= 100 ? "Healthy" : roi >= 0 ? "Marginal" : "Losing money";

  const b = INDUSTRY_BENCH[industry];
  const openBenchDelta = parseFloat(openRate) - b.open;
  const clickBenchDelta = parseFloat(ctr) - b.click;

  const maxRev = Math.max(...projection.rows.map((r) => r.revenue), 1);

  // Funnel stages with opacity ramp on --tool-accent
  const safeSent = Math.max(sent, 1);
  const stages = [
    { key: "sent", label: "Sent", value: sent, ofPrev: null as number | null, opacity: 1.0 },
    { key: "opened", label: "Opened", value: opens, ofPrev: sent > 0 ? (opens / sent) * 100 : 0, opacity: 0.78 },
    { key: "clicked", label: "Clicked", value: clicks, ofPrev: opens > 0 ? (clicks / opens) * 100 : 0, opacity: 0.55 },
    { key: "converted", label: "Converted", value: conversions, ofPrev: clicks > 0 ? (conversions / clicks) * 100 : 0, opacity: 0.32 },
  ];
  const overallConv = sent > 0 ? (conversions / sent) * 100 : 0;

  // Sensitivity: ±20% sweep on each input, holding others fixed
  const sensitivity = useMemo(() => {
    const baseS = Math.max(0, parseFloat(listSize) || 0);
    const baseO = (parseFloat(openRate) || 0) / 100;
    const baseC = (parseFloat(ctr) || 0) / 100;
    const baseV = (parseFloat(conversionRate) || 0) / 100;
    const baseA = parseFloat(aov) || 0;
    const baseK = parseFloat(costPer1k) || 0;
    const calc = (s: number, o: number, c: number, v: number, a: number, k: number) => {
      const rev = s * o * c * v * a;
      const cst = (s / 1000) * k;
      const prof = rev - cst;
      const r = cst > 0 ? (prof / cst) * 100 : 0;
      return { rev, cst, prof, roi: r };
    };
    const base = calc(baseS, baseO, baseC, baseV, baseA, baseK);
    const sweep = [
      { key: "List size", lo: calc(baseS * 0.8, baseO, baseC, baseV, baseA, baseK), hi: calc(baseS * 1.2, baseO, baseC, baseV, baseA, baseK) },
      { key: "Open rate", lo: calc(baseS, baseO * 0.8, baseC, baseV, baseA, baseK), hi: calc(baseS, baseO * 1.2, baseC, baseV, baseA, baseK) },
      { key: "Click rate", lo: calc(baseS, baseO, baseC * 0.8, baseV, baseA, baseK), hi: calc(baseS, baseO, baseC * 1.2, baseV, baseA, baseK) },
      { key: "Conversion", lo: calc(baseS, baseO, baseC, baseV * 0.8, baseA, baseK), hi: calc(baseS, baseO, baseC, baseV * 1.2, baseA, baseK) },
      { key: "AOV", lo: calc(baseS, baseO, baseC, baseV, baseA * 0.8, baseK), hi: calc(baseS, baseO, baseC, baseV, baseA * 1.2, baseK) },
      { key: "Send cost / k", lo: calc(baseS, baseO, baseC, baseV, baseA, baseK * 1.2), hi: calc(baseS, baseO, baseC, baseV, baseA, baseK * 0.8) },
    ];
    return { base, sweep };
  }, [listSize, openRate, ctr, conversionRate, aov, costPer1k]);

  return (
    <ToolShell
      category="Marketing"
      title="Email Campaign ROI"
      description="Project revenue, profit, ROI and 12-month trajectory for an email program. Industry benchmarks, funnel chart, list-growth modeling."
    >
      <div data-tool-theme="marketing" data-tool="email-roi" className="space-y-6">
        {/* Verdict hero — ROI multiple + revenue chip */}
        <section className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              campaign.roi
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {INDUSTRY_BENCH[industry].label}
            </span>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {verdict}
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Return on every dollar spent
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="font-mono text-6xl font-semibold tracking-tight text-app md:text-7xl">
                    {roiMultiple.toFixed(1)}
                  </span>
                  <span className="font-mono text-3xl text-tool-accent md:text-4xl">×</span>
                  <span className="text-sm text-muted">per $1 spent</span>
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {fmtNum(sent)} sent <span className="text-faint">→</span> {fmtNum(conversions)} converted
                  <span className="mx-2 text-faint">·</span>
                  {overallConv.toFixed(2)}% end-to-end
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 font-mono text-sm font-semibold text-tool-accent">
                  {fmtMoney(revenue)} <span className="text-xs font-normal opacity-70">revenue</span>
                </span>
                <span className="rounded-lg border border-app bg-app px-3 py-2 font-mono text-sm font-semibold text-app">
                  {profit >= 0 ? "+" : ""}{fmtMoney(profit)} <span className="text-xs font-normal text-muted">profit</span>
                </span>
                <span className="rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs text-secondary">
                  {roi.toFixed(0)}% ROI
                </span>
              </div>
            </div>
          </div>

          {/* Segmented view tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "snapshot", label: "Snapshot" },
                  { k: "funnel", label: "Funnel" },
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
              Litmus 2024 median: $36 / $1
            </div>
          </div>
        </section>

        {/* Inputs (always visible) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          <ToolCard title="Campaign inputs" subtitle="Funnel assumptions">
            <div className="mb-4">
              <div className="mb-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-secondary">Campaign preset</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => applyPreset(k)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                      preset === k
                        ? "border-tool-accent bg-tool-accent text-app-elevated"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                    }`}
                    style={preset === k ? { color: "var(--bg)" } : undefined}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-tool-accent bg-tool-accent-soft p-3">
              <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                Industry benchmark (Mailchimp 2024)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value as Industry)}
                  className={inputCls("!w-auto flex-1 text-xs")}
                >
                  {(Object.keys(INDUSTRY_BENCH) as Industry[]).map((k) => (
                    <option key={k} value={k}>
                      {INDUSTRY_BENCH[k].label} — {INDUSTRY_BENCH[k].open}% open / {INDUSTRY_BENCH[k].click}% click
                    </option>
                  ))}
                </select>
                <button
                  onClick={applyIndustry}
                  className="rounded-lg border border-tool-accent bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-app-elevated transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="List size">
                <input type="number" value={listSize} onChange={(e) => setListSize(e.target.value)} className={inputCls()} min="0" step="1000" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Open rate (%)" hint={openBenchDelta >= 0 ? `+${openBenchDelta.toFixed(1)} vs bench` : `${openBenchDelta.toFixed(1)} vs bench`}>
                  <input type="number" value={openRate} onChange={(e) => setOpenRate(e.target.value)} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
                <Field label="Click rate (%)" hint={clickBenchDelta >= 0 ? `+${clickBenchDelta.toFixed(1)} vs bench` : `${clickBenchDelta.toFixed(1)} vs bench`}>
                  <input type="number" value={ctr} onChange={(e) => setCtr(e.target.value)} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
                <Field label="Conversion rate (%)" hint="of clicks">
                  <input type="number" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
                <Field label="Avg order value ($)">
                  <input type="number" value={aov} onChange={(e) => setAov(e.target.value)} className={inputCls()} min="0" step="1" />
                </Field>
                <Field label="Send cost per 1,000 ($)">
                  <input type="number" value={costPer1k} onChange={(e) => setCostPer1k(e.target.value)} className={inputCls()} min="0" step="0.1" />
                </Field>
              </div>
            </div>
          </ToolCard>

          {/* Right pane swaps with the active view */}
          {view === "snapshot" && (
            <ToolCard title="Single send — projected outcome" subtitle="Snapshot">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Revenue" value={fmtMoney(revenue)} />
                <Stat label="Cost" value={fmtMoney(cost)} />
                <Stat label="Profit" value={fmtMoney(profit)} />
                <Stat label="ROI" value={`${roi.toFixed(0)}%`} accent />
              </div>

              <div className="mt-5 rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>By campaign type</span>
                  <span>Net per send (current list)</span>
                </div>
                <div className="space-y-2">
                  {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
                    const p = PRESETS[k];
                    const oR = (parseFloat(p.openRate) || 0) / 100;
                    const cR = (parseFloat(p.ctr) || 0) / 100;
                    const cvR = (parseFloat(p.conversionRate) || 0) / 100;
                    const a = parseFloat(p.aov) || 0;
                    const c1k = parseFloat(p.costPer1k) || 0;
                    const s = Math.max(0, parseFloat(listSize) || 0);
                    const rev = s * oR * cR * cvR * a;
                    const cst = (s / 1000) * c1k;
                    const prof = rev - cst;
                    const r = cst > 0 ? (prof / cst) * 100 : 0;
                    const isActive = preset === k;
                    return (
                      <div
                        key={k}
                        className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                          isActive
                            ? "border-tool-accent bg-tool-accent-soft"
                            : "border-app bg-app hover:border-tool-accent"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-sm ${isActive ? "bg-tool-accent" : "bg-app-elevated border border-app"}`} />
                        <span className={`font-mono uppercase tracking-[0.15em] text-[0.6rem] ${isActive ? "text-tool-accent" : "text-secondary"}`}>
                          {k}
                        </span>
                        <span className={`tabular-nums ${prof >= 0 ? "text-app" : "text-rose-500"}`}>{fmtMoney(prof)}</span>
                        <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[0.55rem] tabular-nums ${
                          r >= 100
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : r >= 0
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-500"
                        }`}>
                          {r.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ToolCard>
          )}

          {view === "funnel" && (
            <ToolCard title="Email funnel" subtitle={`${overallConv.toFixed(2)}% end-to-end conversion`}>
              <div className="space-y-2.5">
                {stages.map((s, i) => {
                  const widthPct = Math.max(2, (s.value / safeSent) * 100);
                  return (
                    <div
                      key={s.key}
                      className="rounded-xl border border-app bg-app-elevated p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-semibold"
                            style={{
                              backgroundColor: "var(--tool-accent)",
                              opacity: s.opacity,
                              color: "var(--bg)",
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
                            {s.label}
                          </span>
                          {s.ofPrev !== null && (
                            <span className="rounded-full border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] text-tool-accent">
                              {s.ofPrev.toFixed(1)}% of prev
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-lg font-semibold tabular-nums text-app">
                          {fmtNum(s.value)}
                        </div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full border border-app bg-app">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: "var(--tool-accent)",
                            opacity: s.opacity,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-app bg-app-elevated p-3 text-xs">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Revenue</div>
                  <div className="mt-0.5 font-mono font-semibold text-app">{fmtMoney(revenue)}</div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Cost</div>
                  <div className="mt-0.5 font-mono font-semibold text-app">{fmtMoney(cost)}</div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Profit</div>
                  <div className={`mt-0.5 font-mono font-semibold ${profit >= 0 ? "text-tool-accent" : "text-rose-500"}`}>
                    {fmtMoney(profit)}
                  </div>
                </div>
              </div>
            </ToolCard>
          )}

          {view === "sensitivity" && (
            <ToolCard title="Sensitivity sweep" subtitle="±20% on each input, others fixed">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      <th className="pb-2 text-left">Input</th>
                      <th className="pb-2 text-right">−20% ROI</th>
                      <th className="pb-2 text-right">Base</th>
                      <th className="pb-2 text-right">+20% ROI</th>
                      <th className="pb-2 pl-3 text-left">Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.sweep.map((row) => {
                      const lo = row.lo.roi;
                      const hi = row.hi.roi;
                      const base = sensitivity.base.roi;
                      const span = Math.max(Math.abs(hi - base), Math.abs(base - lo), 1);
                      return (
                        <tr key={row.key} className="border-t border-app">
                          <td className="py-2 text-secondary">{row.key}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-rose-500">{lo.toFixed(0)}%</td>
                          <td className="py-2 text-right font-mono tabular-nums text-app">{base.toFixed(0)}%</td>
                          <td className="py-2 text-right font-mono tabular-nums text-tool-accent">{hi.toFixed(0)}%</td>
                          <td className="py-2 pl-3 w-28">
                            <div className="h-1.5 overflow-hidden rounded-full border border-app bg-app">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, (Math.abs(hi - lo) / Math.max(span, 1)) * 50 + 20)}%`,
                                  backgroundColor: "var(--tool-accent)",
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 font-mono text-[0.6rem] text-muted">
                Highest spread = your biggest lever. Tune that input first.
              </p>
            </ToolCard>
          )}
        </div>

        {/* Stage rows + ledger — always visible */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-app bg-app-elevated p-6">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-tool-accent">
              Stage rows
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-app">
              Per-step volumes
            </h2>
            <div className="mt-4 space-y-2">
              {stages.map((s, i) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[0.6rem] font-semibold"
                      style={{
                        backgroundColor: "var(--tool-accent)",
                        opacity: s.opacity,
                        color: "var(--bg)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.ofPrev !== null && (
                      <span className="rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] text-tool-accent">
                        {s.ofPrev.toFixed(1)}%
                      </span>
                    )}
                    <span className="font-mono text-sm font-semibold tabular-nums text-app">
                      {fmtNum(s.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-tool-accent">Revenue vs cost ledger</div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Single send</div>
            </div>

            <div className="space-y-3">
              <LedgerRow
                label="Revenue"
                value={fmtMoney(revenue)}
                sub={`${fmtNum(conversions)} conversions × ${fmtMoney(parseFloat(aov) || 0)} AOV`}
                tone="positive"
                bar={revenue > 0 ? 100 : 0}
              />
              <LedgerRow
                label="Cost"
                value={`-${fmtMoney(cost)}`}
                sub={`${fmtNum(sent / 1000)}k sends × ${fmtMoney(parseFloat(costPer1k) || 0)}/k`}
                tone="negative"
                bar={revenue > 0 ? Math.min(100, (cost / Math.max(revenue, 1)) * 100) : 0}
              />
              <div className="my-2 h-px bg-app" />
              <LedgerRow
                label="Profit"
                value={fmtMoney(profit)}
                sub={`Net of send cost`}
                tone={profit >= 0 ? "positive" : "negative"}
                bar={revenue > 0 ? Math.max(0, Math.min(100, (profit / Math.max(revenue, 1)) * 100)) : 0}
                emphasize
              />
            </div>
          </div>
        </div>

        {/* 12-month projection */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          <ToolCard title="12-month projection inputs" subtitle="List growth + cadence">
            <div className="space-y-4">
              <Field label="Sends per month">
                <input type="number" value={sendsPerMonth} onChange={(e) => setSendsPerMonth(e.target.value)} className={inputCls()} min="0" step="1" />
              </Field>
              <Field label="List growth / month (%)" hint="new signups">
                <input type="number" value={listGrowthPct} onChange={(e) => setListGrowthPct(e.target.value)} className={inputCls()} step="0.1" />
              </Field>
              <Field label="List churn / month (%)" hint="unsubs + bounces">
                <input type="number" value={monthlyChurnPct} onChange={(e) => setMonthlyChurnPct(e.target.value)} className={inputCls()} step="0.1" />
              </Field>
              <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-3 text-xs">
                <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">12-month totals</div>
                <div className="flex justify-between py-0.5"><span className="text-secondary">Revenue</span><span className="font-mono font-semibold tabular-nums text-app">{fmtMoney(projection.totalRev)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-secondary">Cost</span><span className="font-mono tabular-nums text-app">{fmtMoney(projection.totalCost)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-secondary">Profit</span><span className={`font-mono font-semibold tabular-nums ${projection.totalProfit >= 0 ? "text-tool-accent" : "text-rose-500"}`}>{fmtMoney(projection.totalProfit)}</span></div>
              </div>
            </div>
          </ToolCard>

          <ToolCard title="Monthly revenue curve" subtitle="List-growth compounded">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="pb-2 text-left">M</th>
                    <th className="pb-2 text-right">List</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 pl-3 text-left">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.map((r) => (
                    <tr key={r.month} className="border-t border-app">
                      <td className="py-1.5 font-mono text-secondary">M{r.month}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-secondary">{fmtNum(r.list)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-app">{fmtMoney(r.revenue)}</td>
                      <td className={`py-1.5 text-right font-mono tabular-nums ${r.profit >= 0 ? "text-tool-accent" : "text-rose-500"}`}>{fmtMoney(r.profit)}</td>
                      <td className="py-1.5 pl-3 w-32">
                        <div className="h-1.5 overflow-hidden rounded-full border border-app bg-app">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(r.revenue / maxRev) * 100}%`,
                              backgroundColor: "var(--tool-accent)",
                              opacity: 0.85,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-mono text-[0.6rem] text-muted">
              Benchmarks: Mailchimp Email Benchmarks 2024, Litmus 2024 State of Email.
            </p>
          </ToolCard>
        </div>
      </div>
    </ToolShell>
  );
}

function LedgerRow({
  label,
  value,
  sub,
  tone,
  bar,
  emphasize,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "positive" | "negative";
  bar: number;
  emphasize?: boolean;
}) {
  const valueColor =
    tone === "positive"
      ? emphasize ? "text-tool-accent" : "text-app"
      : "text-rose-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className={`font-mono text-[0.6rem] uppercase tracking-[0.18em] ${emphasize ? "text-tool-accent" : "text-muted"}`}>
            {label}
          </div>
          <div className="text-[0.65rem] text-faint">{sub}</div>
        </div>
        <div className={`font-mono tabular-nums ${emphasize ? "text-2xl font-semibold" : "text-lg"} ${valueColor}`}>
          {value}
        </div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-app bg-app">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, bar)}%`,
            backgroundColor: tone === "positive" ? "var(--tool-accent)" : "rgb(244 63 94)",
            opacity: tone === "positive" ? (emphasize ? 1 : 0.7) : 0.7,
          }}
        />
      </div>
    </div>
  );
}
