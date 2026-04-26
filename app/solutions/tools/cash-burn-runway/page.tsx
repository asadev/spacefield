"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface Cost {
  id: string;
  name: string;
  amount: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

interface Inputs {
  cash: string;
  revenue: string;
  growth: string;
  grossMargin: string;
  debtPrincipal: string;
  debtMonths: string;
  costs: Cost[];
}

const DEFAULTS: Inputs = {
  cash: "450000",
  revenue: "28000",
  growth: "0",
  grossMargin: "75",
  debtPrincipal: "0",
  debtMonths: "24",
  costs: [
    { id: "c1", name: "Salaries", amount: "45000" },
    { id: "c2", name: "Rent & utilities", amount: "4500" },
    { id: "c3", name: "Software / tools", amount: "2800" },
    { id: "c4", name: "Marketing", amount: "6000" },
    { id: "c5", name: "Other", amount: "3200" },
  ],
};

// Local, finance-flavored input class. Tabular-num for bank-statement precision.
const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

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
          <span className="text-[0.55rem] italic text-muted">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

// Sub-tab style "state buttons" for switching projection views.
type ProjectionTab = "chart" | "burn" | "ledger";

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

export default function CashBurnRunwayPage() {
  const [state, setState] = useState<Inputs>(DEFAULTS);
  const [projectionTab, setProjectionTab] = useState<ProjectionTab>("chart");
  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setState({ ...DEFAULTS, ...shared });
  }, []);
  const { cash, revenue, growth, costs } = state;
  const setCash = (v: string) => setState((s) => ({ ...s, cash: v }));
  const setRevenue = (v: string) => setState((s) => ({ ...s, revenue: v }));
  const setGrowth = (v: string) => setState((s) => ({ ...s, growth: v }));
  const setCosts = (updater: (p: Cost[]) => Cost[]) =>
    setState((s) => ({ ...s, costs: updater(s.costs) }));
  const grossMarginPct = (parseFloat(state.grossMargin) || 0) / 100;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const totalCosts = costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const baseRevenue = parseFloat(revenue) || 0;
  const growthPct = (parseFloat(growth) || 0) / 100;
  const startCash = parseFloat(cash) || 0;

  // Gross margin applies to revenue — this is the "contribution" that
  // actually flows to cover fixed opex.
  const contributionRevenue = baseRevenue * grossMarginPct;
  const netBurn = totalCosts - contributionRevenue;
  const runwayStatic = netBurn > 0 ? startCash / netBurn : Infinity;

  // Optional senior debt amortization: adds a monthly payment to opex
  // until the loan is repaid. Useful for venture-debt modeling.
  const debtPrincipal = parseFloat(state.debtPrincipal) || 0;
  const debtTerm = parseFloat(state.debtMonths) || 0;
  const debtMonthly = debtTerm > 0 && debtPrincipal > 0 ? debtPrincipal / debtTerm : 0;

  const projection = useMemo(() => {
    const rows: { month: number; revenue: number; costs: number; net: number; cash: number }[] = [];
    let bal = startCash;
    let rev = baseRevenue;
    let zeroMonth: number | null = null;
    for (let m = 1; m <= 24; m++) {
      const debtPmt = m <= debtTerm ? debtMonthly : 0;
      const net = rev * grossMarginPct - totalCosts - debtPmt;
      bal += net;
      rows.push({
        month: m,
        revenue: rev,
        costs: totalCosts + debtPmt,
        net,
        cash: bal,
      });
      if (bal < 0 && zeroMonth === null) zeroMonth = m;
      rev = rev * (1 + growthPct);
    }
    return { rows, zeroMonth };
  }, [startCash, baseRevenue, totalCosts, growthPct, grossMarginPct, debtMonthly, debtTerm]);

  // Dynamic runway with growth: the month the cash balance first goes below zero.
  // If growth keeps the company above zero over the 24-month window, runway is effectively infinite.
  const runwayDynamic = projection.zeroMonth ?? Infinity;

  const zeroDate = useMemo(() => {
    if (!isFinite(runwayDynamic)) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + Math.ceil(runwayDynamic));
    return d;
  }, [runwayDynamic]);

  const addCost = () => setCosts((p) => [...p, { id: uid(), name: "New line item", amount: "1000" }]);
  const removeCost = (id: string) => setCosts((p) => p.filter((c) => c.id !== id));
  const updateCost = (id: string, key: keyof Cost, value: string) =>
    setCosts((p) => p.map((c) => (c.id === id ? { ...c, [key]: value } : c)));

  // Health band: >12 green, 6-12 amber, <6 red.
  const runwayForBand = isFinite(runwayDynamic) ? runwayDynamic : 999;
  const healthBand: "healthy" | "caution" | "alarm" | "infinite" = !isFinite(runwayDynamic)
    ? "infinite"
    : runwayForBand < 6
      ? "alarm"
      : runwayForBand < 12
        ? "caution"
        : "healthy";

  const bandLabel = {
    healthy: "Healthy",
    caution: "Caution",
    alarm: "Red zone",
    infinite: "Profitable",
  }[healthBand];

  // Tone-driven chips: healthy/infinite use the tool accent; caution amber; alarm rose.
  const bandClasses = {
    healthy: {
      dot: "bg-tool-accent",
      text: "text-tool-accent",
      chip: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
      number: "text-tool-accent",
      stroke: "var(--tool-accent)",
    },
    caution: {
      dot: "bg-amber-500",
      text: "text-amber-500",
      chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      number: "text-amber-500",
      stroke: "rgb(245 158 11)",
    },
    alarm: {
      dot: "bg-rose-500 animate-pulse",
      text: "text-rose-500",
      chip: "bg-rose-500/10 text-rose-500 border-rose-500/30",
      number: "text-rose-500",
      stroke: "rgb(244 63 94)",
    },
    infinite: {
      dot: "bg-tool-accent",
      text: "text-tool-accent",
      chip: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
      number: "text-tool-accent",
      stroke: "var(--tool-accent)",
    },
  }[healthBand];

  const runwayDisplay = !isFinite(runwayDynamic)
    ? "∞"
    : runwayForBand.toFixed(runwayForBand < 10 ? 1 : 0);
  const runwayUnit = !isFinite(runwayDynamic)
    ? "profitable"
    : runwayForBand < 2
      ? "month"
      : "months";

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  // Dial geometry — 24-month max scale, half-arc gauge.
  // The arc sweeps from 9 o'clock → 3 o'clock (180°) so we can show 0..24+
  // months across the top half of a circle.
  const DIAL_MAX = 24;
  const dialPct = !isFinite(runwayDynamic)
    ? 1
    : Math.max(0, Math.min(1, runwayForBand / DIAL_MAX));
  const arcR = 84;
  const arcCx = 110;
  const arcCy = 110;
  const arcStart = polarPoint(arcCx, arcCy, arcR, 180);
  const arcEnd = polarPoint(arcCx, arcCy, arcR, 360);
  const arcFillEnd = polarPoint(arcCx, arcCy, arcR, 180 + dialPct * 180);
  const trackPath = `M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;
  const fillPath =
    dialPct <= 0
      ? ""
      : `M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${
          dialPct > 0.5 ? 1 : 0
        } 1 ${arcFillEnd.x} ${arcFillEnd.y}`;

  // Cash-balance line chart (24 months) with soft area fill underneath.
  const chartW = 720;
  const chartH = 220;
  const chartPadL = 48;
  const chartPadR = 16;
  const chartPadT = 16;
  const chartPadB = 28;
  const chartInnerW = chartW - chartPadL - chartPadR;
  const chartInnerH = chartH - chartPadT - chartPadB;
  const cashSeries = projection.rows.map((r) => r.cash);
  const cashMax = Math.max(startCash, ...cashSeries, 0);
  const cashMin = Math.min(0, ...cashSeries);
  const cashRange = Math.max(1, cashMax - cashMin);
  const xAt = (m: number) =>
    chartPadL + (m / 24) * chartInnerW;
  const yAt = (v: number) =>
    chartPadT + (1 - (v - cashMin) / cashRange) * chartInnerH;
  const linePoints = [
    { m: 0, v: startCash },
    ...projection.rows.map((r) => ({ m: r.month, v: r.cash })),
  ];
  const linePath = linePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.m)} ${yAt(p.v)}`)
    .join(" ");
  const areaPath =
    linePath +
    ` L ${xAt(24)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`;
  const zeroLineY = yAt(0);

  // Monthly burn-rate bars: each month's net change in cash. Negative = burn.
  // We surface the absolute burn (or surplus) per month, sized against the
  // largest single-month swing so the bars compare visually.
  const burnSeries = projection.rows.map((r) => -r.net); // positive = burning
  const burnAbsMax = Math.max(1, ...burnSeries.map((b) => Math.abs(b)));

  // Cash-out chip: relative months + month-year.
  const cashOutChip = (() => {
    if (!isFinite(runwayDynamic) || !zeroDate) {
      return {
        relative: "no zero date in 24mo",
        date: "—",
      };
    }
    const months = Math.ceil(runwayDynamic);
    const rel =
      months <= 1 ? "this month" : `in ${months} months`;
    return {
      relative: rel,
      date: zeroDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
    };
  })();

  return (
    <ToolShell
      category="Finance"
      title="Cash Burn & Runway"
      description="Net burn, months of runway, zero-cash date. Stress-test revenue growth. The startup survival dashboard."
    >
      <div
        data-tool-theme="finance"
        data-tool="cash-burn-runway"
        className="space-y-6 text-app"
      >
        {/* In-tool header — finance ledger chrome */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface px-6 py-5 shadow-sm">
          <span className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l border-t border-tool-accent/40" />
          <span className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r border-b border-tool-accent/30" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Treasury
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Cash Burn & Runway
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Bank-statement precision. Net burn, months left, zero-cash date.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>
        </header>

        {/* Runway dial hero — radial gauge + supporting stats */}
        <section
          className={`relative overflow-hidden rounded-2xl border bg-tool-surface px-6 py-8 shadow-sm ${
            healthBand === "alarm"
              ? "border-rose-500/30"
              : healthBand === "caution"
                ? "border-amber-500/30"
                : "border-tool-accent/25"
          }`}
        >
          {/* Faint ledger ruling behind the dial */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-8">
            {/* Dial */}
            <div className="flex flex-col items-center">
              <svg
                viewBox="0 0 220 140"
                className="h-44 w-[17rem] max-w-full"
                role="img"
                aria-label={`Runway gauge: ${runwayDisplay} ${runwayUnit}`}
              >
                {/* Track */}
                <path
                  d={trackPath}
                  fill="none"
                  stroke="currentColor"
                  className="text-app opacity-[0.10]"
                  strokeWidth={14}
                  strokeLinecap="round"
                />
                {/* Fill */}
                {fillPath && (
                  <path
                    d={fillPath}
                    fill="none"
                    stroke={bandClasses.stroke}
                    strokeWidth={14}
                    strokeLinecap="round"
                  />
                )}
                {/* Tick marks at 6 / 12 / 18 mo */}
                {[6, 12, 18].map((m) => {
                  const ang = 180 + (m / DIAL_MAX) * 180;
                  const pIn = polarPoint(arcCx, arcCy, arcR - 10, ang);
                  const pOut = polarPoint(arcCx, arcCy, arcR + 10, ang);
                  return (
                    <g key={m}>
                      <line
                        x1={pIn.x}
                        y1={pIn.y}
                        x2={pOut.x}
                        y2={pOut.y}
                        stroke="currentColor"
                        className="text-app opacity-30"
                        strokeWidth={1}
                      />
                      <text
                        x={polarPoint(arcCx, arcCy, arcR + 20, ang).x}
                        y={polarPoint(arcCx, arcCy, arcR + 20, ang).y + 3}
                        textAnchor="middle"
                        className="fill-current text-[0.55rem] uppercase tracking-[0.18em] text-muted"
                        style={{ fontFamily: "ui-monospace, monospace" }}
                      >
                        {m}
                      </text>
                    </g>
                  );
                })}
                {/* Center text — number + unit */}
                <text
                  x={arcCx}
                  y={arcCy - 4}
                  textAnchor="middle"
                  className={`fill-current font-semibold tabular-nums ${bandClasses.number}`}
                  style={{
                    fontSize: 36,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {runwayDisplay}
                </text>
                <text
                  x={arcCx}
                  y={arcCy + 16}
                  textAnchor="middle"
                  className="fill-current text-muted"
                  style={{
                    fontSize: 10,
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  {runwayUnit}
                </text>
              </svg>
              <div className="mt-2 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Runway · with growth
                <span
                  className={`ml-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold tracking-[0.15em] ${bandClasses.chip}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
                  {bandLabel}
                </span>
              </div>
            </div>

            {/* Supporting stats */}
            <div className="flex-1 min-w-[20rem]">
              <p className="mb-4 max-w-md text-sm text-secondary">
                {healthBand === "infinite" ? (
                  <>Growth covers burn through month 24. You&apos;re running at contribution-positive.</>
                ) : healthBand === "alarm" ? (
                  <span className="font-medium text-rose-500">
                    Under 6 months. Start a raise cycle or cut costs now.
                  </span>
                ) : healthBand === "caution" ? (
                  <>Below 12 months. Typical raise cycles run 6-9 months — begin positioning.</>
                ) : (
                  <>Enough room to operate. Typical pre-seed default target: 18-24 months.</>
                )}
              </p>

              {/* Cash-out chip */}
              <div
                className={`mb-4 inline-flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs ${
                  isFinite(runwayDynamic)
                    ? "border-app bg-app-elevated"
                    : "border-tool-accent/30 bg-tool-accent-soft text-tool-accent"
                }`}
              >
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Cash-out
                </span>
                <span className={`font-semibold tabular-nums ${bandClasses.text}`}>
                  {cashOutChip.date}
                </span>
                <span className="text-secondary">·</span>
                <span className="text-secondary">{cashOutChip.relative}</span>
              </div>

              <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Net burn / mo
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {netBurn > 0 ? fmt(netBurn) : fmt(0)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Static runway
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {isFinite(runwayStatic) ? runwayStatic.toFixed(1) + " mo" : "∞"}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Cash @ M24
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {fmt(projection.rows[23]?.cash ?? startCash)}
                  </div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Contribution / mo
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {fmt(contributionRevenue)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Side-by-side inputs */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Treasury panel — cash + revenue */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Treasury
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Inputs · USD
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="Current cash balance">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="1000"
                  />
                </div>
              </FinanceField>
              <FinanceField label="Monthly revenue">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    $
                  </span>
                  <input
                    type="number"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    className={fieldInput + " pl-7"}
                    min="0"
                    step="500"
                  />
                </div>
              </FinanceField>
              <div className="grid grid-cols-2 gap-3">
                <FinanceField label="MoM growth" hint="%">
                  <input
                    type="number"
                    value={growth}
                    onChange={(e) => setGrowth(e.target.value)}
                    className={fieldInput}
                    step="0.5"
                  />
                </FinanceField>
                <FinanceField label="Gross margin" hint="%">
                  <input
                    type="number"
                    value={state.grossMargin}
                    onChange={(e) =>
                      setState((s) => ({ ...s, grossMargin: e.target.value }))
                    }
                    className={fieldInput}
                    step="1"
                  />
                </FinanceField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FinanceField label="Senior debt" hint="principal">
                  <input
                    type="number"
                    value={state.debtPrincipal}
                    onChange={(e) =>
                      setState((s) => ({ ...s, debtPrincipal: e.target.value }))
                    }
                    className={fieldInput}
                    step="10000"
                  />
                </FinanceField>
                <FinanceField label="Term" hint="months">
                  <input
                    type="number"
                    value={state.debtMonths}
                    onChange={(e) =>
                      setState((s) => ({ ...s, debtMonths: e.target.value }))
                    }
                    className={fieldInput}
                    step="1"
                  />
                </FinanceField>
              </div>
            </div>
          </div>

          {/* Opex ledger — line items */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Monthly opex
              </h2>
              <div className="flex items-center gap-3 font-mono text-[0.65rem] tabular-nums">
                <span className="text-muted">Total</span>
                <span className="text-app">{fmt(totalCosts)}</span>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_8rem_2rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span>Line item</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            <div className="mt-2 space-y-1.5">
              {costs.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_8rem_2rem] items-center gap-2"
                >
                  <input
                    value={c.name}
                    onChange={(e) => updateCost(c.id, "name", e.target.value)}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated"
                    placeholder="Line item"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                      $
                    </span>
                    <input
                      type="number"
                      value={c.amount}
                      onChange={(e) => updateCost(c.id, "amount", e.target.value)}
                      className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated"
                      min="0"
                      step="100"
                    />
                  </div>
                  <button
                    onClick={() => removeCost(c.id)}
                    className="rounded-md border border-transparent text-sm text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                    aria-label={`Remove ${c.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addCost}
              className="mt-3 rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
            >
              + Add line item
            </button>

            {netBurn > 0 && (
              <div className="mt-4 rounded-md border border-dashed border-app bg-app-elevated px-3 py-2 font-mono text-[0.7rem] text-secondary">
                <span className="text-muted">Net burn:</span>{" "}
                <span className="tabular-nums text-app">{fmt(totalCosts)}</span>{" "}
                opex −{" "}
                <span className="tabular-nums text-app">
                  {fmt(contributionRevenue)}
                </span>{" "}
                contribution ={" "}
                <span className={`tabular-nums font-semibold ${bandClasses.text}`}>
                  {fmt(netBurn)}
                </span>
                /mo
              </div>
            )}
          </div>
        </section>

        {/* Cash-balance chart + tabbed projection views */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Cash balance · next 24 months
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Projection at current burn and growth rate.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TabButton
                active={projectionTab === "chart"}
                onClick={() => setProjectionTab("chart")}
              >
                Chart
              </TabButton>
              <TabButton
                active={projectionTab === "burn"}
                onClick={() => setProjectionTab("burn")}
              >
                Burn bars
              </TabButton>
              <TabButton
                active={projectionTab === "ledger"}
                onClick={() => setProjectionTab("ledger")}
              >
                Ledger
              </TabButton>
            </div>
          </header>

          {projectionTab === "chart" && (
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="block w-full min-w-[640px]"
                role="img"
                aria-label="Cash balance over 24 months"
              >
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p) => {
                  const y = chartPadT + p * chartInnerH;
                  return (
                    <line
                      key={p}
                      x1={chartPadL}
                      x2={chartW - chartPadR}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      className="text-app opacity-[0.08]"
                      strokeWidth={1}
                    />
                  );
                })}

                {/* Y-axis labels */}
                {[1, 0.5, 0].map((p) => {
                  const v = cashMin + p * cashRange;
                  const y = chartPadT + (1 - p) * chartInnerH;
                  return (
                    <text
                      key={p}
                      x={chartPadL - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-current text-muted"
                      style={{
                        fontSize: 9,
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {compactCurrency(v)}
                    </text>
                  );
                })}

                {/* X-axis ticks */}
                {[0, 6, 12, 18, 24].map((m) => (
                  <text
                    key={m}
                    x={xAt(m)}
                    y={chartH - 8}
                    textAnchor="middle"
                    className="fill-current text-muted"
                    style={{
                      fontSize: 9,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    M{m.toString().padStart(2, "0")}
                  </text>
                ))}

                {/* Zero line (only when range crosses zero) */}
                {cashMin < 0 && (
                  <line
                    x1={chartPadL}
                    x2={chartW - chartPadR}
                    y1={zeroLineY}
                    y2={zeroLineY}
                    stroke="rgb(244 63 94)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}

                {/* Soft area fill */}
                <path
                  d={areaPath}
                  fill="var(--tool-accent)"
                  opacity={0.12}
                />
                {/* Line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--tool-accent)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Zero-month marker */}
                {projection.zeroMonth !== null && (
                  <g>
                    <line
                      x1={xAt(projection.zeroMonth)}
                      x2={xAt(projection.zeroMonth)}
                      y1={chartPadT}
                      y2={chartH - chartPadB}
                      stroke="rgb(244 63 94)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={xAt(projection.zeroMonth)}
                      cy={zeroLineY}
                      r={4}
                      fill="rgb(244 63 94)"
                    />
                    <text
                      x={xAt(projection.zeroMonth) + 6}
                      y={chartPadT + 12}
                      className="fill-current text-rose-500"
                      style={{
                        fontSize: 10,
                        fontFamily: "ui-monospace, monospace",
                        letterSpacing: "0.1em",
                      }}
                    >
                      $0 · M{projection.zeroMonth}
                    </text>
                  </g>
                )}

                {/* Endpoint dot */}
                <circle
                  cx={xAt(24)}
                  cy={yAt(projection.rows[23]?.cash ?? startCash)}
                  r={3.5}
                  fill="var(--tool-accent)"
                />
              </svg>
            </div>
          )}

          {projectionTab === "burn" && (
            <div className="space-y-1 font-mono text-[0.7rem]">
              <div className="mb-2 flex items-center justify-end gap-3 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 bg-rose-500/70" /> Burn
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 bg-tool-accent/70" /> Surplus
                </span>
              </div>
              {projection.rows.map((r) => {
                const burn = -r.net; // positive = burning cash
                const pct = (Math.abs(burn) / burnAbsMax) * 50;
                const burning = burn > 0;
                return (
                  <div
                    key={r.month}
                    className="flex items-center gap-3 rounded-sm px-1 py-0.5 text-secondary"
                  >
                    <span className="w-8 tabular-nums text-muted">
                      M{r.month.toString().padStart(2, "0")}
                    </span>
                    <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-app-elevated">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-app" />
                      {burning ? (
                        <div
                          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-rose-500/70"
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div
                          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-tool-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`w-24 text-right tabular-nums ${
                        burning ? "text-rose-500" : "text-tool-accent"
                      }`}
                    >
                      {burning ? "-" : "+"}
                      {fmt(Math.abs(burn))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {projectionTab === "ledger" && (
            <div className="overflow-hidden rounded-md border border-app">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="bg-app-elevated text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Costs</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">Cash</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {projection.rows.map((r) => {
                    const isZeroMonth = projection.zeroMonth === r.month;
                    return (
                      <tr
                        key={r.month}
                        className={`border-t border-app ${
                          isZeroMonth
                            ? "bg-rose-500/10 text-rose-500"
                            : "text-app"
                        }`}
                      >
                        <td className="px-3 py-1.5 text-secondary">
                          M{r.month.toString().padStart(2, "0")}
                        </td>
                        <td className="px-3 py-1.5 text-right">{fmt(r.revenue)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(r.costs)}</td>
                        <td
                          className={`px-3 py-1.5 text-right ${
                            r.net < 0 ? "text-rose-500" : "text-tool-accent"
                          }`}
                        >
                          {r.net >= 0 ? "+" : ""}
                          {fmt(r.net)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          {fmt(r.cash)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Benchmarks */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Runway benchmarks
            </h2>
            <span className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              By stage · 2024-25
            </span>
          </div>
          <ul className="divide-y divide-app font-mono text-xs">
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Pre-seed (default)</span>
              <span className="tabular-nums text-app">18-24 mo</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Seed after round</span>
              <span className="tabular-nums text-app">24-30 mo</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Series A</span>
              <span className="tabular-nums text-app">24-36 mo</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Growth / bridge</span>
              <span className="tabular-nums text-app">12-18 mo</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Red-zone alert</span>
              <span className="tabular-nums text-rose-500">&lt; 9 mo</span>
            </li>
          </ul>
          <p className="mt-3 text-[0.6rem] leading-relaxed text-muted">
            Sources: Carta State of Private Markets 2024, Peter Walker / OpenView benchmarks. Raise
            cycles run ~6-9 months — start at 12m out.
          </p>
        </section>

        <p className="text-[0.65rem] leading-relaxed text-muted">
          Gross margin applied to revenue; costs held flat; revenue compounds at the MoM rate.
          Optional senior-debt timeline layers amortization on top of opex. Ignores seasonality,
          one-time costs, taxes, and working-capital changes. For a real board deck, pair this with
          a full operating model.
        </p>
      </div>

      <ScenarioBar<Inputs>
        slug="cash-burn-runway"
        state={state}
        onLoad={(d) => setState({ ...DEFAULTS, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Month", "Revenue", "Costs", "Net", "Cash"],
              ...projection.rows.map((r) => [
                r.month,
                r.revenue.toFixed(0),
                r.costs.toFixed(0),
                r.net.toFixed(0),
                r.cash.toFixed(0),
              ]),
            ]),
          json: () => ({ state, projection, netBurn, runwayStatic, runwayDynamic }),
          markdown: () =>
            `# Runway\n\n- Cash: ${fmt(startCash)}\n- Net burn: ${fmt(netBurn)}/mo\n- Static runway: ${isFinite(runwayStatic) ? runwayStatic.toFixed(1) + " mo" : "∞"}\n- With growth: ${isFinite(runwayDynamic) ? runwayDynamic.toFixed(0) + " mo" : "∞"}\n- Zero-cash date: ${zeroDate ? zeroDate.toLocaleDateString() : "—"}\n`,
        }}
      />
    </ToolShell>
  );
}

// Polar-coordinate helper for the radial dial. SVG y-axis is inverted, so we
// negate the sin component to draw arcs that curve upward.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// Compact currency for chart axis labels: $1.2M / $450K / $0.
function compactCurrency(v: number) {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}K`;
  return `${sign}$${Math.round(a)}`;
}
