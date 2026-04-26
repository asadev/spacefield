"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import { PROVIDER_SLAS } from "../../_lib/supportData";

type Period = "month" | "quarter" | "year";

const PERIOD_MIN: Record<Period, number> = {
  month: 30 * 24 * 60,
  quarter: 90 * 24 * 60,
  year: 365 * 24 * 60,
};

const TIERS = [99, 99.5, 99.9, 99.95, 99.99];

const BURN_LS_KEY = "solutions:sla-calculator:burn:v1";

interface BurnEntry {
  label: string; // e.g. "Jan"
  minutes: number;
}

function allowedDowntimeMinutes(targetPct: number, period: Period): number {
  const total = PERIOD_MIN[period];
  return total * (1 - targetPct / 100);
}

function fmtMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(1)}m`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(2)}h`;
  const d = h / 24;
  return `${d.toFixed(2)}d`;
}

function defaultBurn(): BurnEntry[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  return months.map((m) => ({ label: m, minutes: 0 }));
}

// Display-only: map 5 SLA tiers → priority-style rows (P0..P3)
const TIER_PRIORITY: Record<
  number,
  { p: string; label: string; tone: "amber" | "emerald" | "lime" }
> = {
  99: { p: "P3", label: "Standard", tone: "amber" },
  99.5: { p: "P2", label: "Elevated", tone: "amber" },
  99.9: { p: "P1", label: "High", tone: "lime" },
  99.95: { p: "P0+", label: "Premium", tone: "emerald" },
  99.99: { p: "P0", label: "Mission-critical", tone: "emerald" },
};

export default function SlaCalculatorPage() {
  const [target, setTarget] = useState<number>(99.9);
  const [period, setPeriod] = useState<Period>("month");
  const [mode, setMode] = useState<"forward" | "reverse">("forward");
  const [actualMin, setActualMin] = useState<string>("");

  const [burn, setBurn] = useState<BurnEntry[]>(defaultBurn());
  const [burnHydrated, setBurnHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BURN_LS_KEY);
      if (raw) setBurn(JSON.parse(raw));
    } catch {}
    setBurnHydrated(true);
  }, []);

  useEffect(() => {
    if (!burnHydrated) return;
    try {
      localStorage.setItem(BURN_LS_KEY, JSON.stringify(burn));
    } catch {}
  }, [burn, burnHydrated]);

  const allowed = useMemo(
    () => allowedDowntimeMinutes(target, period),
    [target, period]
  );

  const actualValue = Number(actualMin);
  const breach = mode === "reverse" && actualValue > allowed;
  const excess = mode === "reverse" ? actualValue - allowed : 0;
  const actualUptime =
    mode === "reverse" && actualValue >= 0
      ? 100 - (actualValue / PERIOD_MIN[period]) * 100
      : null;

  // Display-only derived: traffic-light status
  const trafficLight: "green" | "amber" | "red" = useMemo(() => {
    if (mode === "reverse" && actualMin !== "") {
      if (breach) return "red";
      if (allowed > 0 && actualValue / allowed >= 0.75) return "amber";
      return "green";
    }
    return "green";
  }, [mode, actualMin, breach, actualValue, allowed]);

  // Display-only derived: monthly burn aggregations for chips
  const monthlyBudget = allowedDowntimeMinutes(target, "month");
  const breachCount = useMemo(
    () => burn.filter((b) => b.minutes > monthlyBudget).length,
    [burn, monthlyBudget]
  );
  const totalBurn = useMemo(
    () => burn.reduce((a, b) => a + b.minutes, 0),
    [burn]
  );
  const totalBudget = monthlyBudget * burn.length;
  const aggUptime =
    burn.length > 0
      ? 100 - (totalBurn / (PERIOD_MIN.month * burn.length)) * 100
      : 100;

  return (
    <div data-tool-theme="support" data-tool="sla-calculator" className="min-h-full">
      <ToolShell
        category="Support & Ops"
        title="SLA Calculator"
        description="Service level math. Compute allowed downtime for any uptime target, or enter actual downtime and check if you breached."
      >
        {/* Console chrome + traffic-light hero */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface backdrop-blur-sm">
          {/* macOS chrome */}
          <div className="flex items-center gap-2 border-b border-app bg-app-elevated/40 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-rose-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
            <div className="ml-3 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              <span className="text-tool-accent">●</span>
              sla.console
              <span className="text-faint">/</span>
              <span>
                {target}% · {period}
              </span>
            </div>
            <div className="ml-auto font-mono text-[0.65rem] text-faint">
              {new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {/* Hero — traffic-light + targets vs actuals */}
          <div className="tool-hero relative grid gap-6 px-6 py-7 md:grid-cols-[auto_1fr_auto]">
            <TrafficLight status={trafficLight} />

            <div className="flex flex-col justify-center">
              <div className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                Target vs actual
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold text-app">
                  {target.toFixed(2)}
                </span>
                <span className="text-lg font-medium text-tool-accent">%</span>
                <span className="text-xs uppercase tracking-[0.2em] text-faint">
                  uptime · {period}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <TargetActualRow
                  label="Allowed downtime"
                  target={fmtMinutes(allowed)}
                  actual={
                    mode === "reverse" && actualMin !== ""
                      ? fmtMinutes(actualValue)
                      : "—"
                  }
                  breach={mode === "reverse" && breach}
                />
                <TargetActualRow
                  label="Achieved uptime"
                  target={`${target.toFixed(2)}%`}
                  actual={
                    actualUptime !== null
                      ? `${actualUptime.toFixed(4)}%`
                      : "—"
                  }
                  breach={actualUptime !== null && actualUptime < target}
                />
              </div>
            </div>

            {/* Chip stack */}
            <div className="grid grid-cols-2 gap-2 self-center md:grid-cols-1">
              <Chip
                label="Breaches"
                value={String(breachCount)}
                state={breachCount > 0 ? "bad" : "good"}
              />
              <Chip
                label="Uptime"
                value={`${aggUptime.toFixed(3)}%`}
                state={aggUptime >= target ? "good" : "bad"}
              />
              <Chip
                label="Budget"
                value={fmtMinutes(monthlyBudget)}
                state="warn"
              />
              <Chip
                label="Months"
                value={String(burn.length)}
                state="neutral"
              />
            </div>
          </div>
        </div>

        {/* Mode selector — state buttons */}
        <div className="mt-5 flex flex-wrap gap-2">
          <StateButton
            active={mode === "forward"}
            onClick={() => setMode("forward")}
          >
            Target → downtime budget
          </StateButton>
          <StateButton
            active={mode === "reverse"}
            onClick={() => setMode("reverse")}
          >
            Actual downtime → breached?
          </StateButton>
        </div>

        {/* Inputs + verdict */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <ToolCard title="Inputs" subtitle="SLA parameters">
            <div className="space-y-4">
              <Field label="Uptime target (%)">
                <select
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className={inputCls()}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t.toFixed(2)}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Measurement period">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className={inputCls()}
                >
                  <option value="month">Monthly (30 days)</option>
                  <option value="quarter">Quarterly (90 days)</option>
                  <option value="year">Yearly (365 days)</option>
                </select>
              </Field>
              {mode === "reverse" && (
                <Field label="Actual downtime (minutes)" hint="this period">
                  <input
                    type="number"
                    value={actualMin}
                    onChange={(e) => setActualMin(e.target.value)}
                    placeholder="e.g. 25"
                    className={inputCls()}
                  />
                </Field>
              )}
            </div>
          </ToolCard>

          <ToolCard
            title={mode === "forward" ? "Downtime budget" : "Breach check"}
            subtitle={`${target}% over ${period}`}
          >
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Allowed" value={fmtMinutes(allowed)} accent />
              <Stat label="In minutes" value={`${allowed.toFixed(2)} min`} />
              <Stat label="In hours" value={`${(allowed / 60).toFixed(2)} h`} />
              <Stat
                label="Per week avg"
                value={`${(allowed / (PERIOD_MIN[period] / (7 * 24 * 60))).toFixed(
                  2
                )} min`}
              />
            </div>
            {mode === "reverse" && actualMin !== "" && (
              <div className="mt-5 space-y-3">
                <div
                  className={`rounded-md border p-4 ${
                    breach
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                      : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  <div className="text-[0.55rem] uppercase tracking-[0.22em] opacity-70">
                    Verdict
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {breach ? "SLA BREACHED" : "Within SLA"}
                  </div>
                  <div className="mt-1 text-xs opacity-80">
                    {breach
                      ? `Over budget by ${fmtMinutes(excess)}.`
                      : `Used ${fmtMinutes(actualValue)} of ${fmtMinutes(
                          allowed
                        )} budget.`}
                  </div>
                </div>
                {actualUptime !== null && (
                  <div className="text-xs text-secondary">
                    Achieved uptime:{" "}
                    <span className="text-app">
                      {actualUptime.toFixed(4)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </ToolCard>
        </div>

        {/* By-priority breakdown — each tier as a row with target chip + bar */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-app bg-tool-surface backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-app px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                By priority
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              target · monthly · quarterly · yearly
            </span>
          </div>
          <div className="space-y-3 p-5">
            {TIERS.map((t) => {
              const meta = TIER_PRIORITY[t] || {
                p: "P?",
                label: `${t}%`,
                tone: "lime" as const,
              };
              const isActive = t === target;
              const monthAllowed = allowedDowntimeMinutes(t, "month");
              const quarterAllowed = allowedDowntimeMinutes(t, "quarter");
              const yearAllowed = allowedDowntimeMinutes(t, "year");
              const periodAllowed = allowedDowntimeMinutes(t, period);
              const periodMax = allowedDowntimeMinutes(99, period);
              const pct = periodMax > 0 ? (periodAllowed / periodMax) * 100 : 0;
              const showActual =
                isActive && mode === "reverse" && actualMin !== "";
              const actualPct =
                showActual && periodMax > 0
                  ? Math.min(100, (actualValue / periodMax) * 100)
                  : 0;
              return (
                <div
                  key={t}
                  className={`space-y-2 rounded-lg border p-3 transition-colors ${
                    isActive
                      ? "border-tool-accent/40 bg-tool-accent-soft"
                      : "border-app bg-app-elevated/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PriorityChip p={meta.p} tone={meta.tone} />
                      <span className="font-medium text-app">
                        {t.toFixed(2)}%
                      </span>
                      <span className="text-[0.65rem] text-faint">
                        · {meta.label}
                      </span>
                      {isActive && (
                        <span className="rounded-full border border-tool-accent/40 bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                          active
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 font-mono text-xs">
                      <span className="text-faint">target</span>
                      <span className="text-tool-accent">
                        {fmtMinutes(periodAllowed)}
                      </span>
                      {showActual && (
                        <>
                          <span className="text-faint">actual</span>
                          <span
                            className={
                              actualValue > periodAllowed
                                ? "text-rose-400"
                                : "text-emerald-400"
                            }
                          >
                            {fmtMinutes(actualValue)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* target vs actual bar */}
                  <div className="relative h-3 overflow-hidden rounded-full bg-app-elevated">
                    <div
                      className="h-full rounded-full bg-tool-accent"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                    {showActual && (
                      <div
                        className="absolute inset-y-0 w-px bg-rose-300 shadow-[0_0_6px_rgba(252,165,165,0.7)]"
                        style={{ left: `${actualPct}%` }}
                        title={`Actual ${fmtMinutes(actualValue)}`}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[0.65rem]">
                    <PeriodCell label="mo" value={fmtMinutes(monthAllowed)} />
                    <PeriodCell label="qtr" value={fmtMinutes(quarterAllowed)} />
                    <PeriodCell label="yr" value={fmtMinutes(yearAllowed)} />
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-[0.65rem] text-faint">
              Formula: allowed downtime = period × (1 − target). 99.9% of 30 days
              is 43.2 min; 99.99% of a year is 52.6 min.
            </p>
          </div>
        </section>

        {/* Provider SLAs + Burn tracker */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          {/* Provider SLAs */}
          <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Cloud provider SLAs
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                contractual commits
              </span>
            </div>
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                      <th className="py-2 pr-4 text-left">Provider</th>
                      <th className="py-2 pr-4 text-left">Service</th>
                      <th className="py-2 pr-4 text-left">SLA</th>
                      <th className="py-2 pr-4 text-left">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROVIDER_SLAS.map((p, i) => (
                      <tr key={i} className="border-t border-app">
                        <td className="py-2 pr-4 text-app">{p.provider}</td>
                        <td className="py-2 pr-4 text-secondary">
                          {p.service}
                        </td>
                        <td className="py-2 pr-4 font-mono tabular-nums text-tool-accent">
                          {p.sla.toFixed(p.sla === 100 ? 0 : 2)}%
                        </td>
                        <td className="py-2 pr-4 text-xs text-faint">
                          {p.note || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-faint">
                Source: published provider SLA docs 2024–2025. Monthly service
                commitment for the headline service. Read the fine print — most
                exclude scheduled maintenance.
              </p>
            </div>
          </section>

          {/* Burn tracker */}
          <section className="overflow-hidden rounded-2xl border border-app bg-tool-surface backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Cumulative burn tracker
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                vs {monthlyBudget.toFixed(1)}m/mo
              </span>
            </div>
            <div className="p-5">
              <div className="space-y-2">
                {burn.map((b, idx) => {
                  const over = b.minutes > monthlyBudget;
                  const warn =
                    !over && b.minutes > monthlyBudget * 0.75 && b.minutes > 0;
                  return (
                    <div
                      key={idx}
                      className="grid items-center gap-2 md:grid-cols-[1fr_1fr_1.5fr_auto]"
                    >
                      <input
                        value={b.label}
                        onChange={(e) => {
                          const next = [...burn];
                          next[idx] = { ...b, label: e.target.value };
                          setBurn(next);
                        }}
                        className={inputCls()}
                      />
                      <input
                        type="number"
                        value={b.minutes}
                        min={0}
                        onChange={(e) => {
                          const next = [...burn];
                          next[idx] = {
                            ...b,
                            minutes: Number(e.target.value) || 0,
                          };
                          setBurn(next);
                        }}
                        placeholder="min"
                        className={inputCls()}
                      />
                      <div className="h-3 overflow-hidden rounded-full bg-app-elevated">
                        <div
                          className={`h-full ${
                            over
                              ? "bg-rose-400/70"
                              : warn
                              ? "bg-amber-400/70"
                              : "bg-emerald-400/60"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              (b.minutes / Math.max(1, monthlyBudget)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          over ? "text-rose-400" : "text-secondary"
                        }`}
                      >
                        {b.minutes > 0
                          ? `${((b.minutes / monthlyBudget) * 100).toFixed(0)}%`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setBurn([
                      ...burn,
                      { label: `Month ${burn.length + 1}`, minutes: 0 },
                    ])
                  }
                  className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent/40 hover:text-tool-accent"
                >
                  + Month
                </button>
                <button
                  onClick={() => {
                    if (confirm("Clear all burn entries?")) setBurn(defaultBurn());
                  }}
                  className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-rose-400/40 hover:text-rose-400"
                >
                  Reset
                </button>
              </div>

              {(() => {
                const yearlyBudget = allowedDowntimeMinutes(target, "year");
                const pct = totalBudget > 0 ? (totalBurn / totalBudget) * 100 : 0;
                return (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <Stat label="Total burn" value={fmtMinutes(totalBurn)} accent />
                    <Stat label="Budget used" value={`${pct.toFixed(1)}%`} />
                    <Stat
                      label="Yearly budget"
                      value={fmtMinutes(yearlyBudget)}
                    />
                  </div>
                );
              })()}
            </div>
          </section>
        </div>
      </ToolShell>
    </div>
  );
}

// ---- Visual helpers ----

function TrafficLight({ status }: { status: "green" | "amber" | "red" }) {
  const config = {
    green: {
      label: "Within SLA",
      sub: "All clear",
      tone: "var(--tool-accent)",
    },
    amber: {
      label: "Near budget",
      sub: "≥ 75% used",
      tone: "#f59e0b",
    },
    red: {
      label: "SLA breached",
      sub: "Over budget",
      tone: "#ef4444",
    },
  }[status];
  return (
    <div className="relative flex h-[140px] w-[100px] flex-col items-center justify-center gap-2 rounded-2xl border border-app bg-app-elevated p-3">
      <span
        className={`h-7 w-7 rounded-full border-2 transition-all ${
          status === "red"
            ? "border-rose-400/40 bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.55)]"
            : "border-rose-400/15 bg-rose-500/15"
        }`}
      />
      <span
        className={`h-7 w-7 rounded-full border-2 transition-all ${
          status === "amber"
            ? "border-amber-400/40 bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.55)]"
            : "border-amber-400/15 bg-amber-500/15"
        }`}
      />
      <span
        className={`h-7 w-7 rounded-full border-2 transition-all ${
          status === "green"
            ? "border-emerald-400/40 bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.55)]"
            : "border-emerald-400/15 bg-emerald-500/15"
        }`}
      />
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full text-center">
        <div
          className="font-mono text-[0.6rem] uppercase tracking-[0.18em]"
          style={{ color: config.tone }}
        >
          {config.label}
        </div>
        <div className="text-[0.55rem] text-faint">{config.sub}</div>
      </div>
    </div>
  );
}

function TargetActualRow({
  label,
  target,
  actual,
  breach,
}: {
  label: string;
  target: string;
  actual: string;
  breach: boolean;
}) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated/40 p-2.5">
      <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2 text-sm">
        <span className="font-mono text-tool-accent">{target}</span>
        <span className="text-[0.6rem] text-faint">vs</span>
        <span
          className={`font-mono ${
            actual === "—"
              ? "text-faint"
              : breach
              ? "text-rose-400"
              : "text-emerald-400"
          }`}
        >
          {actual}
        </span>
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
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
        active
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "good" | "warn" | "bad" | "neutral";
}) {
  const map: Record<string, string> = {
    good: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    bad: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    neutral: "border-app bg-app-elevated text-secondary",
  };
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-right ${map[state]}`}>
      <div className="text-[0.55rem] uppercase tracking-[0.2em] opacity-80">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function PriorityChip({
  p,
  tone,
}: {
  p: string;
  tone: "amber" | "emerald" | "lime";
}) {
  const map: Record<string, string> = {
    amber: "border-amber-400/40 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
    lime: "border-lime-400/40 bg-lime-500/10 text-lime-300",
  };
  return (
    <span
      className={`inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded-md border px-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] ${map[tone]}`}
    >
      {p}
    </span>
  );
}

function PeriodCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-app bg-app-elevated/40 px-2 py-1">
      <span className="text-faint">{label}</span>
      <span className="font-mono text-secondary">{value}</span>
    </div>
  );
}
