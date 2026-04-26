"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface MonthRow {
  id: string;
  label: string;
  starting: string;
  newMrr: string;
  expansion: string;
  churn: string;
  contraction: string;
}

const LS_KEY = "solutions:saas-quick-ratio:v1";

interface State {
  starting: string;
  newMrr: string;
  expansion: string;
  churn: string;
  contraction: string;
}

const defaultState: State = {
  starting: "200000",
  newMrr: "30000",
  expansion: "10000",
  churn: "6000",
  contraction: "2000",
};

function verdict(qr: number): { label: string; blurb: string } {
  if (qr === Infinity || qr >= 4)
    return {
      label: "Excellent",
      blurb: "Growth dwarfs revenue loss. Pour fuel on the fire.",
    };
  if (qr >= 2)
    return {
      label: "Solid",
      blurb: "Net adding MRR meaningfully. Healthy SaaS.",
    };
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

const TREND_KEY = "solutions:saas-quick-ratio:trend:v1";

function buildDefaultTrend(): MonthRow[] {
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

function computeQR(r: MonthRow) {
  const n = parseFloat(r.newMrr) || 0;
  const e = parseFloat(r.expansion) || 0;
  const c = parseFloat(r.churn) || 0;
  const co = parseFloat(r.contraction) || 0;
  const gained = n + e;
  const lost = c + co;
  return lost === 0 ? (gained > 0 ? Infinity : 0) : gained / lost;
}

const fieldInput =
  "w-full rounded-md border border-app bg-surface px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-app-focus focus:ring-1 focus:ring-tool-accent";

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

export default function SaaSQuickRatioPage() {
  const [state, setState] = useState<State>(defaultState);
  const [trend, setTrend] = useState<MonthRow[]>(buildDefaultTrend());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
      const rawTrend = localStorage.getItem(TREND_KEY);
      if (rawTrend) {
        const parsed = JSON.parse(rawTrend);
        if (Array.isArray(parsed)) setTrend(parsed);
      }
    } catch {}
    const shared = readShareState<State>();
    if (shared) setState({ ...defaultState, ...shared });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(TREND_KEY, JSON.stringify(trend));
    } catch {}
  }, [trend, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
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
      // NRR = (Start + expansion - churn - contraction) / Start
      const nrr = s > 0 ? ((s + e - c - co) / s) * 100 : 0;
      const grr = s > 0 ? ((s - c - co) / s) * 100 : 0;
      return {
        newN: n,
        expN: e,
        churnN: c,
        contN: co,
        gained: g,
        lost: l,
        qr: q,
        net,
        nrr,
        grr,
        endingMrr: end,
        v: verdict(q),
      };
    }, [state]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  // ---- Visual derivations (no math change) ----
  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  // Dial scale: cap at 6 visually (4 is healthy band start, ≥6 reads as off-the-charts).
  const DIAL_MAX = 6;
  const dialQr = qr === Infinity ? DIAL_MAX : Math.max(0, Math.min(DIAL_MAX, qr));
  const dialPct = dialQr / DIAL_MAX;
  const arcLen = Math.PI * 80; // semicircle radius 80 → ≈ 251.3
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

  // Band colors lean on the foundation accent for the healthy band; risk
  // bands keep semantic violet/amber/rose so meaning carries even when the
  // theme accent is teal.
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
            chip: "bg-violet-500/10 text-violet-600 border-violet-500/30",
            dot: "bg-violet-500",
            stroke: "stroke-violet-500",
          }
        : band === "risk"
          ? {
              text: "text-amber-500",
              chip: "bg-amber-500/10 text-amber-600 border-amber-500/30",
              dot: "bg-amber-500",
              stroke: "stroke-amber-500",
            }
          : {
              text: "text-rose-500",
              chip: "bg-rose-500/10 text-rose-600 border-rose-500/30",
              dot: "bg-rose-500 animate-pulse",
              stroke: "stroke-rose-500",
            };

  // Bar scale for gained vs lost — pick a comparable max so bars share a baseline.
  const flowMax = Math.max(gained, lost, 1);
  const newBarW = (newN / flowMax) * 100;
  const expBarW = (expN / flowMax) * 100;
  const churnBarW = (churnN / flowMax) * 100;
  const contBarW = (contN / flowMax) * 100;

  // Trend line sparkline
  const trendQrs = trend.map((r) => {
    const q = computeQR(r);
    return q === Infinity ? DIAL_MAX : q;
  });
  const trendMax = Math.max(DIAL_MAX, ...trendQrs);
  const trendW = 600;
  const trendH = 140;
  const trendPad = 8;
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

  // Recommendation chip text
  const recommendation =
    band === "healthy"
      ? "Pour fuel on growth — CAC payback and hiring should expand."
      : band === "ok"
        ? "Healthy. Trim churn one notch and you're best-in-class."
        : band === "risk"
          ? "Retention is the bottleneck — work on churn before more spend."
          : "Stop net-new spend. Fix product/onboarding before pouring more in.";

  return (
    <ToolShell
      category="Finance"
      title="SaaS Quick Ratio"
      description="How fast you gain MRR relative to how fast you lose it. Plus net revenue retention."
    >
      <div
        data-tool-theme="finance"
        data-tool="saas-quick-ratio"
        className="space-y-6 text-app"
      >
        {/* ===== Hero with ratio dial ===== */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · SaaS health
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                SaaS Quick Ratio
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Gained MRR over lost MRR. ≥4 healthy, 2–4 ok, &lt;2 risk.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-surface px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`}
              />
              As of {asOfStamp}
            </div>
          </div>

          {/* Dial + verdict */}
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg
                  viewBox="0 0 200 120"
                  className="w-[260px] sm:w-[300px]"
                  aria-hidden
                >
                  {/* Color band track segments: shrink (0-1) rose, risk (1-2) amber, ok (2-4) violet, healthy (4-6) accent */}
                  {(() => {
                    const seg = (from: number, to: number, cls: string) => {
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
                    };
                    return (
                      <>
                        {seg(0, 1, "stroke-rose-500")}
                        {seg(1, 2, "stroke-amber-500")}
                        {seg(2, 4, "stroke-violet-500")}
                        {seg(4, 6, "stroke-tool-accent")}
                      </>
                    );
                  })()}
                  {/* Base subtle track */}
                  <path
                    d="M10 90 A 80 80 0 0 1 190 90"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Progress */}
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
                  {/* Threshold ticks @ 2 and 4 */}
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
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="var(--text-muted)"
                          strokeWidth="1.4"
                          strokeDasharray="2 2"
                        />
                        <text
                          x={x2}
                          y={y2 - 4}
                          textAnchor="middle"
                          fill="var(--text-muted)"
                          className="font-mono text-[7px] uppercase tracking-[0.2em]"
                        >
                          {t.label}
                        </text>
                      </g>
                    );
                  })}
                  {/* End ticks */}
                  <text
                    x="10"
                    y="108"
                    textAnchor="middle"
                    fill="var(--text-faint)"
                    className="font-mono text-[7px]"
                  >
                    0
                  </text>
                  <text
                    x="190"
                    y="108"
                    textAnchor="middle"
                    fill="var(--text-faint)"
                    className="font-mono text-[7px]"
                  >
                    {DIAL_MAX}+
                  </text>
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
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`}
                />
                {v.label}
              </div>
            </div>

            {/* Side text + recommendation chip */}
            <div className="space-y-4">
              <div>
                <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                  What it means
                </div>
                <p className="text-sm leading-relaxed text-secondary">{v.blurb}</p>
              </div>

              {/* Recommendation chip */}
              <div
                className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-card ${bandClasses.chip}`}
              >
                <span
                  className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${bandClasses.dot}`}
                />
                <div>
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] opacity-80">
                    Next move
                  </div>
                  <div className="mt-0.5 text-sm font-medium opacity-95">
                    {recommendation}
                  </div>
                </div>
              </div>

              {/* Mini KPI row */}
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-app bg-surface font-mono text-xs">
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                    Net new MRR
                  </div>
                  <div
                    className={`mt-0.5 tabular-nums font-semibold ${net >= 0 ? bandClasses.text : "text-rose-500"}`}
                  >
                    {fmt(net)}
                  </div>
                </div>
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                    NRR
                  </div>
                  <div className="mt-0.5 tabular-nums text-app">
                    {nrr.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                    GRR
                  </div>
                  <div className="mt-0.5 tabular-nums text-app">
                    {grr.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ===== Inputs + flow comparison ===== */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* Inputs */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                Monthly MRR flows
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Inputs · USD
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="Starting MRR" hint="Month start">
                <input
                  type="number"
                  value={state.starting}
                  onChange={(e) =>
                    setState((s) => ({ ...s, starting: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
              <FinanceField label="New MRR" hint="From new customers">
                <input
                  type="number"
                  value={state.newMrr}
                  onChange={(e) =>
                    setState((s) => ({ ...s, newMrr: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
              <FinanceField label="Expansion MRR" hint="Upsell, seat adds">
                <input
                  type="number"
                  value={state.expansion}
                  onChange={(e) =>
                    setState((s) => ({ ...s, expansion: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
              <FinanceField label="Churned MRR" hint="Cancellations">
                <input
                  type="number"
                  value={state.churn}
                  onChange={(e) =>
                    setState((s) => ({ ...s, churn: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
              <FinanceField label="Contraction MRR" hint="Downgrades, seat removals">
                <input
                  type="number"
                  value={state.contraction}
                  onChange={(e) =>
                    setState((s) => ({ ...s, contraction: e.target.value }))
                  }
                  className={fieldInput}
                  min="0"
                  step="100"
                />
              </FinanceField>
            </div>
          </div>

          {/* Side-by-side bars */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                Gained vs lost
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Numerator vs denominator
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Gained column */}
              <div className="rounded-xl border border-tool-accent/20 bg-tool-accent-soft p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                    Gained
                  </div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-tool-accent">
                    {fmt(gained)}
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between font-mono text-[0.7rem]">
                      <span className="text-secondary">New ARR</span>
                      <span className="tabular-nums text-app">{fmt(newN)}</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-tool-accent transition-all"
                        style={{ width: `${newBarW}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between font-mono text-[0.7rem]">
                      <span className="text-secondary">Expansion</span>
                      <span className="tabular-nums text-app">{fmt(expN)}</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-tool-accent/60 transition-all"
                        style={{ width: `${expBarW}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Lost column */}
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-rose-500">
                    Lost
                  </div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-rose-500">
                    {fmt(lost)}
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between font-mono text-[0.7rem]">
                      <span className="text-secondary">Churn</span>
                      <span className="tabular-nums text-app">{fmt(churnN)}</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-rose-500 transition-all"
                        style={{ width: `${churnBarW}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between font-mono text-[0.7rem]">
                      <span className="text-secondary">Contraction</span>
                      <span className="tabular-nums text-app">{fmt(contN)}</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-rose-500/60 transition-all"
                        style={{ width: `${contBarW}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ratio statement */}
            <div className="mt-4 flex items-center justify-between rounded-md border border-app bg-surface px-4 py-2.5 font-mono text-xs">
              <span className="text-muted">
                {fmt(gained)} ÷ {fmt(lost)}
              </span>
              <span className={`tabular-nums font-semibold ${bandClasses.text}`}>
                = {qr === Infinity ? "∞" : qr.toFixed(2)}
              </span>
            </div>

            {/* Stat row */}
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-surface font-mono text-xs sm:grid-cols-4">
              <div className="bg-tool-surface p-3">
                <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                  Ending MRR
                </div>
                <div className="mt-0.5 tabular-nums text-app">{fmt(endingMrr)}</div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                  Net new
                </div>
                <div
                  className={`mt-0.5 tabular-nums ${net >= 0 ? "text-app" : "text-rose-500"}`}
                >
                  {fmt(net)}
                </div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                  NRR
                </div>
                <div className="mt-0.5 tabular-nums text-app">{nrr.toFixed(1)}%</div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">
                  GRR
                </div>
                <div className="mt-0.5 tabular-nums text-app">{grr.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Trend line ===== */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
                12-month trend
              </h2>
              <p className="mt-0.5 text-[0.65rem] text-muted">
                Monthly quick ratio. Watch dips below the 2 line.
              </p>
            </div>
            <div className="hidden items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-tool-accent" />{" "}
                ≥4
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />{" "}
                2–4
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />{" "}
                1–2
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />{" "}
                &lt;1
              </span>
            </div>
          </div>

          {/* Line chart */}
          <div className="relative w-full overflow-hidden rounded-xl border border-app bg-surface p-3">
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
              {/* Threshold lines */}
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
              {/* Area + line */}
              <path d={trendArea} fill="url(#qrTrendFill)" className={bandClasses.text} />
              <path
                d={trendPath}
                fill="none"
                className={bandClasses.stroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Points */}
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
              {/* Threshold labels */}
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

            {/* Month labels under chart */}
            <div className="mt-1 grid grid-cols-12 gap-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted">
              {trend.map((r) => (
                <div key={r.id} className="truncate text-center">
                  {r.label}
                </div>
              ))}
            </div>
          </div>

          {/* Editable trend table */}
          <div className="mt-5 overflow-x-auto rounded-md border border-app">
            <table className="w-full font-mono text-xs">
              <thead className="bg-surface text-muted">
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
                      {(["newMrr", "expansion", "churn", "contraction"] as const).map(
                        (k) => (
                          <td key={k} className="px-2 py-1 text-right">
                            <input
                              type="number"
                              value={row[k]}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTrend((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, [k]: v } : r
                                  )
                                );
                              }}
                              className="w-20 rounded border border-app bg-surface px-1.5 py-1 text-right tabular-nums text-app focus:border-app-focus focus:outline-none focus:ring-1 focus:ring-tool-accent"
                            />
                          </td>
                        )
                      )}
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-semibold ${colorCls}`}
                      >
                        {q === Infinity ? "∞" : q.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[0.6rem] text-faint">
            Multiple consecutive months below 2 → retention investigation, not more
            marketing spend.
          </p>
        </section>

        {/* ===== Benchmarks reference ===== */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
              Benchmarks
            </h2>
            <span className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
              Scale VP · OpenView
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                cls: "border-amber-400/30 bg-amber-500/[0.06] text-amber-600",
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
            Source: Mamoon Hamid (Scale Venture Partners) 2015 + OpenView 2024 SaaS
            benchmarks.
          </p>
        </section>
      </div>

      <ScenarioBar<State>
        slug="saas-quick-ratio"
        state={state}
        onLoad={(d) => setState({ ...defaultState, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Metric", "Value"],
              ["Starting MRR", state.starting],
              ["New", state.newMrr],
              ["Expansion", state.expansion],
              ["Churn", state.churn],
              ["Contraction", state.contraction],
              ["Quick ratio", qr === Infinity ? "∞" : qr.toFixed(2)],
              ["NRR %", nrr.toFixed(1)],
              ["GRR %", grr.toFixed(1)],
              [],
              ["Month", "QR"],
              ...trend.map((r) => [
                r.label,
                (() => {
                  const q = computeQR(r);
                  return q === Infinity ? "∞" : q.toFixed(2);
                })(),
              ]),
            ]),
          json: () => ({ state, trend, qr, nrr, grr }),
          markdown: () =>
            `# SaaS quick ratio\n\n- Quick ratio: **${qr === Infinity ? "∞" : qr.toFixed(2)}**\n- NRR: ${nrr.toFixed(1)}%\n- GRR: ${grr.toFixed(1)}%\n- Verdict: ${v.label}\n`,
        }}
      />
    </ToolShell>
  );
}
