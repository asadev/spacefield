"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { Field, inputCls } from "../../_components/ToolCard";
import {
  INDUSTRY_DOWNTIME_COSTS,
  GARTNER_AVG_DOWNTIME_COST_PER_MIN,
} from "../../_lib/supportData";

interface CostInputs {
  revenuePerMin: number;
  affectedPct: number;
  supportSurge: number;
  reputationalMultiplier: number;
  currentSlaPct: number;
  nextSlaPct: number;
  nextTierCost: number; // annual $ to upgrade
  peakHourMultiplier: number; // weight for peak-hour outages
  peakHoursPerDay: number; // how many peak hours per day
}

const LS_KEY = "solutions:uptime-cost:v1";

function defaultInputs(): CostInputs {
  return {
    revenuePerMin: 120,
    affectedPct: 80,
    supportSurge: 1500,
    reputationalMultiplier: 1.5,
    currentSlaPct: 99.9,
    nextSlaPct: 99.95,
    nextTierCost: 40000,
    peakHourMultiplier: 2.5,
    peakHoursPerDay: 6,
  };
}

function costOfOutage(i: CostInputs, minutes: number): number {
  const revLoss = i.revenuePerMin * (i.affectedPct / 100) * minutes;
  const supportCost = i.supportSurge * (minutes / 60);
  return (revLoss + supportCost) * i.reputationalMultiplier;
}

function allowedMinPerYear(pct: number): number {
  return 365 * 24 * 60 * (1 - pct / 100);
}

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

// Display helpers — visual only, no math change.
function fmtMinutes(min: number): string {
  if (min >= 60 * 24) {
    const days = min / (60 * 24);
    return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
  }
  if (min >= 60) {
    const hrs = min / 60;
    return `${hrs.toFixed(hrs >= 10 ? 0 : 1)}h`;
  }
  if (min >= 1) return `${min.toFixed(min >= 10 ? 0 : 1)}m`;
  return `${(min * 60).toFixed(0)}s`;
}

const NINES_TIERS = [
  { pct: 99, label: "99%", nines: "2 nines" },
  { pct: 99.9, label: "99.9%", nines: "3 nines" },
  { pct: 99.99, label: "99.99%", nines: "4 nines" },
  { pct: 99.999, label: "99.999%", nines: "5 nines" },
  { pct: 99.9999, label: "99.9999%", nines: "6 nines" },
];

// Quick-pick SLA tier pills (segmented control).
const SLA_PICKS: { pct: number; label: string }[] = [
  { pct: 99, label: "99" },
  { pct: 99.9, label: "99.9" },
  { pct: 99.99, label: "99.99" },
  { pct: 99.999, label: "99.999" },
];

export default function UptimeCostPage() {
  const [inputs, setInputs] = useState<CostInputs>(defaultInputs());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setInputs(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(inputs));
    } catch {}
  }, [inputs, hydrated]);

  const rows = useMemo(
    () => [1, 15, 60, 240].map((m) => ({ m, cost: costOfOutage(inputs, m) })),
    [inputs]
  );

  const currentBudget = allowedMinPerYear(inputs.currentSlaPct);
  const nextBudget = allowedMinPerYear(inputs.nextSlaPct);
  const annualCurrent = costOfOutage(inputs, currentBudget);
  const annualNext = costOfOutage(inputs, nextBudget);
  const savings = annualCurrent - annualNext;
  const roi = savings - inputs.nextTierCost;
  const paybackMonths =
    savings > 0 ? (inputs.nextTierCost / savings) * 12 : Infinity;

  // 9s table rows — derived from existing helpers, no math change.
  const ninesRows = useMemo(
    () =>
      NINES_TIERS.map((t) => {
        const minPerYear = allowedMinPerYear(t.pct);
        const minPerMonth = minPerYear / 12;
        const annualCost = costOfOutage(inputs, minPerYear);
        return {
          ...t,
          minPerYear,
          minPerMonth,
          annualCost,
        };
      }),
    [inputs]
  );

  const maxNinesCost = useMemo(
    () => ninesRows.reduce((m, r) => Math.max(m, r.annualCost), 0),
    [ninesRows]
  );

  const peakCost = costOfOutage(inputs, 60) * inputs.peakHourMultiplier;
  const offPeakCost = costOfOutage(inputs, 60);

  return (
    <ToolShell
      category="Support & Ops"
      title="Uptime Cost Calculator"
      description="Estimate the cost of downtime. Compare annual cost at your current SLA vs upgrading to the next tier."
    >
      <div data-tool-theme="support" data-tool="uptime-cost-calculator">
        {/* ─── Hero: cost-impact big number ───────────────────────────── */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
            <div>
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Annual cost of downtime
                <span className="text-faint">/</span>
                <span className="text-muted">@ {inputs.currentSlaPct}% SLA</span>
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold tracking-tight text-tool-accent md:text-6xl">
                  {fmtMoney(annualCurrent)}
                </span>
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  {Math.round(currentBudget).toLocaleString()} min/yr
                </span>
              </div>
              <p className="mt-3 max-w-lg text-sm text-secondary">
                Built from your revenue/min, affected users, support surge and a
                reputational drag of{" "}
                <span className="text-tool-accent">
                  {inputs.reputationalMultiplier.toFixed(1)}×
                </span>
                . That&apos;s the downtime budget your current SLA tier permits.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <HeroStat label="Per minute" value={fmtMoney(costOfOutage(inputs, 1))} />
              <HeroStat label="1h outage" value={fmtMoney(costOfOutage(inputs, 60))} />
              <HeroStat
                label="Net of upgrade"
                value={fmtMoney(roi)}
                tone={roi > 0 ? "good" : "bad"}
              />
            </div>
          </div>
        </section>

        {/* ─── SLA tier picker (segmented pills) ───────────────────────── */}
        <section className="mb-5 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-app">
                SLA tier · current
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              quick-pick
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app">
              {SLA_PICKS.map((p) => {
                const active = Math.abs(inputs.currentSlaPct - p.pct) < 0.0001;
                return (
                  <button
                    key={p.pct}
                    onClick={() =>
                      setInputs({ ...inputs, currentSlaPct: p.pct })
                    }
                    className={`px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] transition-colors ${
                      active
                        ? "bg-tool-accent text-app-elevated"
                        : "text-secondary hover:text-app"
                    }`}
                    style={active ? { color: "var(--bg)" } : undefined}
                  >
                    {p.label}%
                  </button>
                );
              })}
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              or set custom in inputs →
            </span>
            <span className="ml-auto rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              budget · {Math.round(currentBudget).toLocaleString()} min/yr
            </span>
          </div>
        </section>

        {/* ─── Inputs + Cost-by-duration ─────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <PanelCard label="Inputs" sublabel="Business economics">
            <div className="space-y-3">
              <Field label="Revenue per minute ($)">
                <input
                  type="number"
                  value={inputs.revenuePerMin}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      revenuePerMin: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
              <Field label="Affected user % during outage">
                <input
                  type="number"
                  value={inputs.affectedPct}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      affectedPct: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
              <Field label="Support surge cost per hour ($)">
                <input
                  type="number"
                  value={inputs.supportSurge}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      supportSurge: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
              <Field label="Reputational multiplier" hint="brand / churn drag">
                <input
                  type="number"
                  step="0.1"
                  value={inputs.reputationalMultiplier}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      reputationalMultiplier: Number(e.target.value) || 1,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current SLA %">
                  <input
                    type="number"
                    step="0.01"
                    value={inputs.currentSlaPct}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        currentSlaPct: Number(e.target.value) || 0,
                      })
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="Next tier SLA %">
                  <input
                    type="number"
                    step="0.01"
                    value={inputs.nextSlaPct}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        nextSlaPct: Number(e.target.value) || 0,
                      })
                    }
                    className={inputCls()}
                  />
                </Field>
              </div>
              <Field label="Annual cost to upgrade ($)">
                <input
                  type="number"
                  value={inputs.nextTierCost}
                  onChange={(e) =>
                    setInputs({
                      ...inputs,
                      nextTierCost: Number(e.target.value) || 0,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
            </div>
          </PanelCard>

          <div className="space-y-5">
            <PanelCard label="Cost of an outage" sublabel="By duration">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {rows.map((r) => (
                  <MiniStat
                    key={r.m}
                    label={r.m < 60 ? `${r.m} min` : `${Math.round(r.m / 60)}h`}
                    value={fmtMoney(r.cost)}
                    accent={r.m === 60}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs text-faint">
                Cost = (revenue/min × affected %) × minutes + (support surge ×
                hours), multiplied by reputational factor.
              </p>
            </PanelCard>

            <PanelCard label="SLA tier comparison" sublabel="Annual math">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat
                  label={`${inputs.currentSlaPct}% budget`}
                  value={`${Math.round(currentBudget)} min/yr`}
                />
                <MiniStat
                  label={`${inputs.nextSlaPct}% budget`}
                  value={`${Math.round(nextBudget)} min/yr`}
                />
                <MiniStat
                  label="Annual cost @ current"
                  value={fmtMoney(annualCurrent)}
                />
                <MiniStat
                  label="Annual cost @ next"
                  value={fmtMoney(annualNext)}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MiniStat label="Savings" value={fmtMoney(savings)} accent />
                <MiniStat
                  label="Upgrade cost"
                  value={fmtMoney(inputs.nextTierCost)}
                />
                <MiniStat
                  label="Net gain"
                  value={fmtMoney(roi)}
                  accent={roi > 0}
                />
              </div>

              <div
                className={`mt-5 rounded-lg border p-4 ${
                  roi > 0
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-500"
                }`}
              >
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] opacity-80">
                  Verdict
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight">
                  {roi > 0
                    ? "Upgrade pays for itself."
                    : "Upgrade costs more than it saves."}
                </div>
                <div className="mt-1 text-xs opacity-80">
                  {isFinite(paybackMonths) && paybackMonths > 0
                    ? `Payback in ~${paybackMonths.toFixed(1)} months.`
                    : "No payback — savings don't cover the upgrade."}
                </div>
              </div>
            </PanelCard>
          </div>
        </div>

        {/* ─── 9s Table ────────────────────────────────────────────────── */}
        <section className="mt-5 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-app">
                The 9s — what each SLA actually costs you
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              budget · cost @ your inputs
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  <th className="px-5 py-3 text-left font-medium">SLA tier</th>
                  <th className="px-3 py-3 text-right font-medium">
                    Downtime / year
                  </th>
                  <th className="px-3 py-3 text-right font-medium">
                    Downtime / month
                  </th>
                  <th className="px-3 py-3 text-left font-medium">
                    Cost impact
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    Annual $
                  </th>
                </tr>
              </thead>
              <tbody>
                {ninesRows.map((r) => {
                  const isCurrent =
                    Math.abs(r.pct - inputs.currentSlaPct) < 0.0001;
                  const isNext =
                    Math.abs(r.pct - inputs.nextSlaPct) < 0.0001;
                  const barPct =
                    maxNinesCost > 0 ? (r.annualCost / maxNinesCost) * 100 : 0;
                  return (
                    <tr
                      key={r.pct}
                      className={`border-b border-app last:border-b-0 transition-colors ${
                        isCurrent
                          ? "bg-tool-accent-soft"
                          : isNext
                          ? "bg-app"
                          : "hover:bg-app"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {isCurrent && (
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                          )}
                          <div>
                            <div
                              className={`font-mono text-base font-semibold ${
                                isCurrent ? "text-tool-accent" : "text-app"
                              }`}
                            >
                              {r.label}
                            </div>
                            <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                              {r.nines}
                            </div>
                          </div>
                          {isCurrent && (
                            <span className="ml-2 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                              current
                            </span>
                          )}
                          {isNext && !isCurrent && (
                            <span className="ml-2 rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                              next
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="font-mono tabular-nums text-app">
                          {fmtMinutes(r.minPerYear)}
                        </div>
                        <div className="font-mono text-[0.6rem] text-faint">
                          {Math.round(r.minPerYear).toLocaleString()} min
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="font-mono tabular-nums text-secondary">
                          {fmtMinutes(r.minPerMonth)}
                        </div>
                        <div className="font-mono text-[0.6rem] text-faint">
                          {Math.round(r.minPerMonth).toLocaleString()} min
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-app">
                          <div
                            className={`h-full rounded-full ${
                              isCurrent
                                ? "bg-tool-accent"
                                : "bg-tool-accent-soft"
                            }`}
                            style={{ width: `${Math.max(2, barPct)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span
                          className={`font-mono tabular-nums ${
                            isCurrent
                              ? "font-semibold text-tool-accent"
                              : "text-app"
                          }`}
                        >
                          {fmtMoney(r.annualCost)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-app px-5 py-3 font-mono text-[0.65rem] text-faint">
            Highlighted band = your current SLA. Bars scale within your inputs —
            each extra 9 cuts the downtime budget by 10×.
          </div>
        </section>

        {/* ─── Peak vs off-peak ────────────────────────────────────────── */}
        <PanelCard
          className="mt-5"
          label="Peak vs off-peak"
          sublabel="Outage cost varies by hour of day"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Peak-hour multiplier">
              <input
                type="number"
                step="0.1"
                value={inputs.peakHourMultiplier}
                onChange={(e) =>
                  setInputs({
                    ...inputs,
                    peakHourMultiplier: Number(e.target.value) || 1,
                  })
                }
                className={inputCls()}
              />
            </Field>
            <Field label="Peak hours per day">
              <input
                type="number"
                min={0}
                max={24}
                value={inputs.peakHoursPerDay}
                onChange={(e) =>
                  setInputs({
                    ...inputs,
                    peakHoursPerDay: Math.min(
                      24,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  })
                }
                className={inputCls()}
              />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat
              label="1h outage @ peak"
              value={fmtMoney(peakCost)}
              accent
            />
            <MiniStat
              label="1h outage @ off-peak"
              value={fmtMoney(offPeakCost)}
            />
          </div>
          <p className="mt-3 text-xs text-faint">
            A 1-hour outage during peak load costs{" "}
            <span className="text-tool-accent">
              {inputs.peakHourMultiplier.toFixed(1)}×
            </span>{" "}
            a quiet-hour outage. Weight your risk accordingly when scheduling
            deploys / maintenance.
          </p>
        </PanelCard>

        {/* ─── Benchmarks + cumulative projection ──────────────────────── */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <PanelCard
            label="Gartner 2024 industry benchmarks"
            sublabel="Downtime cost per minute by sector"
          >
            <div className="mb-4 rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                Gartner headline
              </div>
              <div className="mt-1 font-mono text-lg text-tool-accent">
                ${GARTNER_AVG_DOWNTIME_COST_PER_MIN.toLocaleString()}/min
              </div>
              <div className="text-xs text-secondary">
                average across mid-enterprise orgs. Your model says{" "}
                <span className="text-tool-accent">
                  {fmtMoney(costOfOutage(inputs, 1))}
                </span>
                /min.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                    <th className="py-2 pr-4 text-left font-medium">
                      Industry
                    </th>
                    <th className="py-2 pr-4 text-left font-medium">$/min</th>
                    <th className="py-2 pr-4 text-left font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {INDUSTRY_DOWNTIME_COSTS.map((c, i) => (
                    <tr key={i} className="border-t border-app">
                      <td className="py-2 pr-4 text-app">{c.industry}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums text-tool-accent">
                        ${c.perMin.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-xs text-faint">
                        {c.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-faint">
              Source: Gartner 2024 Downtime Cost Study + ITIC 2024 Cost of
              Downtime report. Averages across mid-enterprise orgs.
            </p>
          </PanelCard>

          <PanelCard
            label="Cumulative yearly projection"
            sublabel="Cost accumulation at your current SLA"
          >
            {(() => {
              const allowedYear = allowedMinPerYear(inputs.currentSlaPct);
              const perQuarter = allowedYear / 4;
              const quarters = [1, 2, 3, 4].map((q) => {
                const cumMin = perQuarter * q;
                const cumCost = costOfOutage(inputs, cumMin);
                return { q, cumMin, cumCost };
              });
              return (
                <div className="space-y-2.5">
                  {quarters.map((row) => (
                    <div
                      key={row.q}
                      className="grid items-center gap-3 md:grid-cols-[auto_1fr_auto_auto]"
                    >
                      <span className="w-12 font-mono text-sm text-secondary">
                        Q{row.q}
                      </span>
                      <div className="h-3 overflow-hidden rounded-full bg-app">
                        <div
                          className="h-full bg-tool-accent"
                          style={{ width: `${(row.q / 4) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-faint">
                        {Math.round(row.cumMin)} min
                      </span>
                      <span className="font-mono text-sm font-semibold text-app">
                        {fmtMoney(row.cumCost)}
                      </span>
                    </div>
                  ))}
                  <p className="mt-4 text-xs text-faint">
                    Assumes downtime is evenly distributed. Real-world outages
                    cluster — use Gartner&apos;s 80/20 heuristic (80% of cost
                    from top 20% of outages) as a second data point.
                  </p>
                </div>
              );
            })()}
          </PanelCard>
        </div>
      </div>
    </ToolShell>
  );
}

// ─── Visual helpers (display only) ────────────────────────────────────────

function PanelCard({
  label,
  sublabel,
  className = "",
  children,
}: {
  label: string;
  sublabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-app bg-app-elevated ${className}`}
    >
      <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
          <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-app">
            {label}
          </h2>
        </div>
        {sublabel && (
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            {sublabel}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app"
      }`}
    >
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg font-semibold tracking-tight ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const cls =
    tone === "good"
      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
      : tone === "bad"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
      : "border-app bg-app text-app";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] opacity-80">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tracking-tight">
        {value}
      </div>
    </div>
  );
}
