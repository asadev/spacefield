"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

interface EventMultiplier {
  id: string;
  week: number; // 1..12
  label: string;
  multiplier: number;
}

interface ForecastInputs {
  historyCsv: string; // one number per line
  weeklyGrowthPct: number;
  ticketsPerAgentPerWeek: number;
  currentAgents: number;
  events: EventMultiplier[];
}

const LS_KEY = "solutions:support-forecaster:v1";
const MODE_LS_KEY = "solutions:support-forecaster:mode:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultInputs(): ForecastInputs {
  return {
    historyCsv: "420\n435\n460\n480\n510\n540\n575\n600",
    weeklyGrowthPct: 3,
    ticketsPerAgentPerWeek: 120,
    currentAgents: 5,
    events: [
      { id: uid(), week: 4, label: "Product launch", multiplier: 1.4 },
      { id: uid(), week: 9, label: "Holiday push", multiplier: 1.25 },
    ],
  };
}

function parseHistory(csv: string): number[] {
  return csv
    .split(/\r?\n|,/)
    .map((x) => Number(x.trim()))
    .filter((n) => !isNaN(n) && n >= 0);
}

type TabKey = "forecast" | "backtest" | "staffing";

export default function SupportVolumeForecasterPage() {
  const [inputs, setInputs] = useState<ForecastInputs>(defaultInputs());
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("forecast");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setInputs(JSON.parse(raw));
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "forecast" || m === "backtest" || m === "staffing") setMode(m as TabKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(inputs));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [inputs, mode, hydrated]);

  const history = useMemo(() => parseHistory(inputs.historyCsv), [inputs.historyCsv]);
  const avgHistorical = history.length
    ? history.reduce((a, b) => a + b, 0) / history.length
    : 0;
  const lastHistorical = history.length ? history[history.length - 1] : 0;

  // Linear regression on history for trend (used in backtest)
  const regression = useMemo(() => {
    const n = history.length;
    if (n < 2) return { slope: 0, intercept: lastHistorical, r2: 0 };
    const xs = history.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = history.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (history[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    // r2
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const pred = intercept + slope * xs[i];
      ssRes += (history[i] - pred) ** 2;
      ssTot += (history[i] - meanY) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { slope, intercept, r2 };
  }, [history, lastHistorical]);

  // Moving average (window 3) for backtest
  const movingAvg = useMemo(() => {
    if (history.length < 3) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < history.length; i++) {
      const start = Math.max(0, i - 2);
      const slice = history.slice(start, i + 1);
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return out;
  }, [history]);

  // Compute residual stdev for confidence intervals.
  const historyStats = useMemo(() => {
    if (history.length < 4) return { stdev: 0, cv: 0 };
    const n = history.length;
    const mean = history.reduce((a, b) => a + b, 0) / n;
    const variance =
      history.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    const cv = mean > 0 ? stdev / mean : 0;
    return { stdev, cv };
  }, [history]);

  // Seasonality detection: compare first half vs second half of history
  const seasonality = useMemo(() => {
    if (history.length < 6) return null;
    const half = Math.floor(history.length / 2);
    const first = history.slice(0, half);
    const second = history.slice(half);
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
    const delta = ((avgSecond - avgFirst) / avgFirst) * 100;
    const impliedWeeklyGrowth =
      first.length > 0 ? (Math.pow(avgSecond / avgFirst, 1 / half) - 1) * 100 : 0;
    const diffs: number[] = [];
    for (let i = 1; i < history.length; i++) {
      diffs.push(Math.abs((history[i] - history[i - 1]) / history[i - 1]));
    }
    const avgDiff =
      diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    return {
      delta,
      impliedWeeklyGrowth,
      volatility: avgDiff * 100,
      firstHalfAvg: avgFirst,
      secondHalfAvg: avgSecond,
    };
  }, [history]);

  const forecast = useMemo(() => {
    const r = 1 + inputs.weeklyGrowthPct / 100;
    const base = lastHistorical || avgHistorical || 0;
    const weeks: {
      week: number;
      baseline: number;
      projected: number;
      event?: EventMultiplier;
      agentsNeeded: number;
      gap: number;
      ciLow: number;
      ciHigh: number;
    }[] = [];
    for (let w = 1; w <= 12; w++) {
      const baseline = base * Math.pow(r, w);
      const event = inputs.events.find((e) => e.week === w);
      const projected = event ? baseline * event.multiplier : baseline;
      const agentsNeeded = inputs.ticketsPerAgentPerWeek
        ? projected / inputs.ticketsPerAgentPerWeek
        : 0;
      const horizonFactor = Math.sqrt(w);
      const ciRange = 1.96 * historyStats.stdev * horizonFactor;
      weeks.push({
        week: w,
        baseline,
        projected,
        event,
        agentsNeeded,
        gap: agentsNeeded - inputs.currentAgents,
        ciLow: Math.max(0, projected - ciRange),
        ciHigh: projected + ciRange,
      });
    }
    return weeks;
  }, [history, inputs, lastHistorical, avgHistorical, historyStats]);

  const peak = forecast.reduce((acc, w) => (w.projected > acc.projected ? w : acc), forecast[0]);
  const maxAgents = Math.max(...forecast.map((f) => f.agentsNeeded));
  const firstGap = forecast.find((w) => w.gap > 0);

  // Backtest: predict each historical point from prior data using regression and moving avg
  const backtest = useMemo(() => {
    if (history.length < 4) return null;
    const linErrs: number[] = [];
    const maErrs: number[] = [];
    const points: { i: number; actual: number; lin: number; ma: number }[] = [];
    for (let i = 3; i < history.length; i++) {
      // refit regression on history[0..i-1]
      const xs = Array.from({ length: i }, (_, k) => k);
      const ys = history.slice(0, i);
      const meanX = xs.reduce((a, b) => a + b, 0) / i;
      const meanY = ys.reduce((a, b) => a + b, 0) / i;
      let num = 0;
      let den = 0;
      for (let k = 0; k < i; k++) {
        num += (xs[k] - meanX) * (ys[k] - meanY);
        den += (xs[k] - meanX) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      const intercept = meanY - slope * meanX;
      const lin = intercept + slope * i;
      const ma = (history[i - 1] + history[i - 2] + history[i - 3]) / 3;
      const actual = history[i];
      linErrs.push(Math.abs(actual - lin));
      maErrs.push(Math.abs(actual - ma));
      points.push({ i, actual, lin, ma });
    }
    const linMape =
      linErrs.length > 0
        ? (linErrs.reduce((a, b) => a + b, 0) /
            linErrs.length /
            (history.reduce((a, b) => a + b, 0) / history.length)) *
          100
        : 0;
    const maMape =
      maErrs.length > 0
        ? (maErrs.reduce((a, b) => a + b, 0) /
            maErrs.length /
            (history.reduce((a, b) => a + b, 0) / history.length)) *
          100
        : 0;
    return { points, linMape, maMape };
  }, [history]);

  // Combined chart points (history + forecast)
  const chartPoints = useMemo(() => {
    const hist = history.map((v, i) => ({
      x: i,
      hist: v,
      proj: null as number | null,
      ciLow: null as number | null,
      ciHigh: null as number | null,
    }));
    const fc = forecast.map((w, i) => ({
      x: history.length + i,
      hist: null as number | null,
      proj: w.projected,
      ciLow: w.ciLow,
      ciHigh: w.ciHigh,
    }));
    return [...hist, ...fc];
  }, [history, forecast]);

  // Display-only peak-hour heatmap
  const heatmap = useMemo(() => {
    const dayWeights = [0.6, 1.0, 1.05, 1.1, 1.05, 0.95, 0.55];
    const hourWeights = Array.from({ length: 24 }, (_, h) => {
      const peakHour = 12;
      const sigma = 4.5;
      return Math.exp(-((h - peakHour) ** 2) / (2 * sigma * sigma));
    });
    const dayTotal = dayWeights.reduce((a, b) => a + b, 0);
    const hourTotal = hourWeights.reduce((a, b) => a + b, 0);
    const peakWeekly = peak?.projected || 0;
    const cells: { d: number; h: number; v: number }[] = [];
    let max = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v =
          peakWeekly *
          (dayWeights[d] / dayTotal) *
          (hourWeights[h] / hourTotal);
        cells.push({ d, h, v });
        if (v > max) max = v;
      }
    }
    return { cells, max };
  }, [peak]);

  const addEvent = () => {
    setInputs({
      ...inputs,
      events: [
        ...inputs.events,
        { id: uid(), week: 1, label: "Event", multiplier: 1.2 },
      ],
    });
  };

  const hireTarget = firstGap ? Math.ceil(maxAgents - inputs.currentAgents) : 0;

  return (
    <div data-tool-theme="support" data-tool="support-volume-forecaster">
      <ToolShell
        category="Support & Ops"
        title="Support Volume Forecaster"
        description="12-week ticket volume forecast from historical data + growth rate + event multipliers. Computes agent gap."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                firstGap
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
              }`}
            >
              {firstGap ? `SHORTFALL W${firstGap.week}` : "STAFFED"}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              horizon:12w
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              forecast.console
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {history.length}h · {forecast.length}p
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Volume forecast · history → projection + 95% CI
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {history.length} weeks history
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {inputs.events.length} event{inputs.events.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    +{inputs.weeklyGrowthPct}% weekly
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-3">
                  <span className="font-mono text-4xl font-semibold tracking-tight text-app md:text-5xl">
                    {Math.round(peak?.projected || 0)}
                  </span>
                  <span className="font-mono text-sm font-medium text-tool-accent">
                    peak / wk
                  </span>
                  <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.65rem] text-muted">
                    W{peak?.week ?? "-"}
                  </span>
                </div>
              </div>

              {/* staffing dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${Math.min(100, (inputs.currentAgents / Math.max(maxAgents, 1)) * 100)}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {Math.round((inputs.currentAgents / Math.max(maxAgents, 1)) * 100)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Capacity coverage
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {inputs.currentAgents} / {maxAgents.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "forecast", label: "Forecast" },
                  { k: "backtest", label: "Backtest" },
                  { k: "staffing", label: "Staffing" },
                ] as { k: TabKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto">
              <StaffingChip
                firstGap={firstGap}
                hireTarget={hireTarget}
                peakWeek={peak?.week}
              />
            </div>
          </div>
        </section>

        {/* ============================== MAIN BODY ============================== */}
        {mode === "forecast" && (
          <>
            <ToolCard
              title="Volume forecast chart"
              subtitle="Historical solid · projected dashed · 95% CI band"
              className="mb-6"
            >
              <ForecastChart
                points={chartPoints}
                histLen={history.length}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.65rem] text-muted">
                <LegendDot label="Historical" solid />
                <LegendDot label="Projected" />
                <LegendBand label="95% CI" />
                <LegendChip color="bg-violet-500" label="Event week" />
              </div>
            </ToolCard>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="History avg" value={`${Math.round(avgHistorical)} / wk`} />
              <Stat
                label="Peak projected"
                value={`${Math.round(peak?.projected || 0)} (W${peak?.week || "-"})`}
                accent
              />
              <Stat label="Max agents needed" value={maxAgents.toFixed(1)} />
              <Stat
                label="First shortfall"
                value={firstGap ? `W${firstGap.week}` : "None"}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-4">
                <ToolCard title="Historical volume" subtitle="Weekly tickets, newest last">
                  <Field label="One number per line (or comma-separated)">
                    <textarea
                      value={inputs.historyCsv}
                      onChange={(e) =>
                        setInputs({ ...inputs, historyCsv: e.target.value })
                      }
                      rows={8}
                      className={`${inputCls("font-mono")} text-xs`}
                      spellCheck={false}
                    />
                  </Field>
                  <p className="mt-2 text-xs text-muted">
                    Parsed: {history.length} weeks. Last week: {lastHistorical}.
                  </p>
                </ToolCard>

                <ToolCard title="Growth & staffing" subtitle="Projection inputs">
                  <div className="space-y-3">
                    <Field label="Weekly growth rate (%)">
                      <input
                        type="number"
                        step="0.1"
                        value={inputs.weeklyGrowthPct}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            weeklyGrowthPct: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Tickets per agent per week">
                      <input
                        type="number"
                        value={inputs.ticketsPerAgentPerWeek}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            ticketsPerAgentPerWeek: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Current agent count">
                      <input
                        type="number"
                        value={inputs.currentAgents}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            currentAgents: Number(e.target.value) || 0,
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                </ToolCard>

                <ToolCard title="Event multipliers" subtitle="Launches, pushes, known outages">
                  <div className="space-y-2">
                    {inputs.events.map((e) => (
                      <div
                        key={e.id}
                        className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto]"
                      >
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={e.week}
                          onChange={(ev) =>
                            setInputs({
                              ...inputs,
                              events: inputs.events.map((x) =>
                                x.id === e.id
                                  ? { ...x, week: Number(ev.target.value) || 1 }
                                  : x
                              ),
                            })
                          }
                          placeholder="Week"
                          className={inputCls()}
                        />
                        <input
                          value={e.label}
                          onChange={(ev) =>
                            setInputs({
                              ...inputs,
                              events: inputs.events.map((x) =>
                                x.id === e.id ? { ...x, label: ev.target.value } : x
                              ),
                            })
                          }
                          placeholder="Label"
                          className={inputCls()}
                        />
                        <input
                          type="number"
                          step="0.05"
                          value={e.multiplier}
                          onChange={(ev) =>
                            setInputs({
                              ...inputs,
                              events: inputs.events.map((x) =>
                                x.id === e.id
                                  ? {
                                      ...x,
                                      multiplier: Number(ev.target.value) || 1,
                                    }
                                  : x
                              ),
                            })
                          }
                          placeholder="1.2"
                          className={inputCls()}
                        />
                        <button
                          onClick={() =>
                            setInputs({
                              ...inputs,
                              events: inputs.events.filter((x) => x.id !== e.id),
                            })
                          }
                          className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                          aria-label="Remove event"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addEvent}
                      className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                    >
                      + Event
                    </button>
                  </div>
                </ToolCard>
              </div>

              <div className="space-y-6">
                <ToolCard
                  title="12-week forecast"
                  subtitle="Volume, 95% CI, agent gap"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          <th className="py-2 pr-3 text-left">Week</th>
                          <th className="py-2 pr-3 text-left">Projected</th>
                          <th className="py-2 pr-3 text-left">95% CI</th>
                          <th className="py-2 pr-3 text-left">Event</th>
                          <th className="py-2 pr-3 text-left">Agents</th>
                          <th className="py-2 pr-3 text-left">Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.map((w) => (
                          <tr
                            key={w.week}
                            className={`border-t border-app ${
                              w.gap > 0 ? "bg-rose-500/[0.04]" : ""
                            }`}
                          >
                            <td className="py-2 pr-3 font-mono text-app">W{w.week}</td>
                            <td className="py-2 pr-3 font-mono tabular-nums text-app">
                              {Math.round(w.projected)}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs tabular-nums text-muted">
                              {Math.round(w.ciLow)}–{Math.round(w.ciHigh)}
                            </td>
                            <td className="py-2 pr-3 text-xs text-violet-500">
                              {w.event
                                ? `${w.event.label} ×${w.event.multiplier}`
                                : "—"}
                            </td>
                            <td className="py-2 pr-3 font-mono tabular-nums text-app">
                              {w.agentsNeeded.toFixed(1)}
                            </td>
                            <td
                              className={`py-2 pr-3 font-mono text-xs ${
                                w.gap > 0 ? "text-rose-500" : "text-emerald-500"
                              }`}
                            >
                              {w.gap > 0
                                ? `+${w.gap.toFixed(1)} short`
                                : `${Math.abs(w.gap).toFixed(1)} spare`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Baseline(w) = last_week × (1 + growth%)^w. Events multiply.
                    CI widens with horizon (√w scaling of residual stdev).
                  </p>
                </ToolCard>

                <ToolCard
                  title="Seasonal pattern detection"
                  subtitle="What your history implies"
                >
                  {seasonality === null ? (
                    <div className="rounded-lg border border-dashed border-app bg-app py-4 text-center text-xs text-faint">
                      Need at least 6 weeks of history to detect patterns.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat
                          label="1st-half avg"
                          value={`${Math.round(seasonality.firstHalfAvg)}`}
                        />
                        <Stat
                          label="2nd-half avg"
                          value={`${Math.round(seasonality.secondHalfAvg)}`}
                        />
                        <Stat
                          label="Half-over-half"
                          value={`${
                            seasonality.delta > 0 ? "+" : ""
                          }${seasonality.delta.toFixed(0)}%`}
                          accent={Math.abs(seasonality.delta) > 10}
                        />
                        <Stat
                          label="Volatility"
                          value={`±${seasonality.volatility.toFixed(1)}%`}
                        />
                      </div>
                      <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-xs text-app">
                        <span className="font-mono uppercase tracking-[0.15em] text-tool-accent">
                          Suggestion:
                        </span>{" "}
                        Implied weekly growth from your history is{" "}
                        <span className="font-semibold text-tool-accent">
                          {seasonality.impliedWeeklyGrowth > 0 ? "+" : ""}
                          {seasonality.impliedWeeklyGrowth.toFixed(2)}%
                        </span>
                        . You&apos;re using{" "}
                        <span className="font-semibold">
                          {inputs.weeklyGrowthPct}%
                        </span>
                        .{" "}
                        {Math.abs(
                          inputs.weeklyGrowthPct -
                            seasonality.impliedWeeklyGrowth
                        ) > 1
                          ? "Consider adjusting."
                          : "Your growth assumption is aligned."}
                      </div>
                      {seasonality.volatility > 15 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                          High week-to-week volatility (
                          {seasonality.volatility.toFixed(0)}%). Your CI bands
                          will be wide. Consider rolling-average smoothing
                          before forecasting, or flag likely holiday / launch
                          events.
                        </div>
                      )}
                    </div>
                  )}
                </ToolCard>
              </div>
            </div>
          </>
        )}

        {mode === "backtest" && (
          <ToolCard
            title="Backtest accuracy"
            subtitle="Linear regression vs 3-week moving average · MAPE on held-out points"
          >
            {backtest === null ? (
              <div className="rounded-lg border border-dashed border-app bg-app py-6 text-center text-xs text-faint">
                Need at least 4 weeks of history to backtest.
              </div>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="Linear MAPE" value={`${backtest.linMape.toFixed(1)}%`} accent />
                  <Stat label="MA(3) MAPE" value={`${backtest.maMape.toFixed(1)}%`} />
                  <Stat label="Regression R²" value={regression.r2.toFixed(3)} />
                  <Stat label="Slope / wk" value={`${regression.slope > 0 ? "+" : ""}${regression.slope.toFixed(1)}`} />
                </div>
                <BacktestChart points={backtest.points} />
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.65rem] text-muted">
                  <LegendDot label="Actual" solid />
                  <LegendDot label="Linear regression" />
                  <LegendChip color="bg-amber-500" label="Moving avg (3)" />
                </div>
                <p className="mt-3 text-xs text-muted">
                  Lower MAPE = better fit. If MA(3) beats linear, your data is
                  noisy / non-linear — favor smoothing over trend extrapolation.
                </p>
              </>
            )}
          </ToolCard>
        )}

        {mode === "staffing" && (
          <div className="space-y-6">
            <ToolCard
              title="Capacity vs requirement"
              subtitle={`Agents · 12 weeks · current = ${inputs.currentAgents}`}
            >
              <CapacityChart
                forecast={forecast}
                currentAgents={inputs.currentAgents}
              />
            </ToolCard>

            <ToolCard
              title="Peak-hour heatmap"
              subtitle={`W${peak?.week ?? "-"} · day × hour distribution`}
            >
              <Heatmap heatmap={heatmap} />
              <p className="mt-3 text-xs text-muted">
                Display-only spread of peak weekly volume across business hours.
                Use to time agent shifts — your real distribution may differ.
              </p>
            </ToolCard>
          </div>
        )}
      </ToolShell>
    </div>
  );
}

// ─── Visual helpers ──────────────────────────────────────────────────────

function StaffingChip({
  firstGap,
  hireTarget,
  peakWeek,
}: {
  firstGap?: { week: number; gap: number };
  hireTarget: number;
  peakWeek?: number;
}) {
  if (!firstGap) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-emerald-500">
        ✓ staffed · headroom
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-rose-500">
      hire +{hireTarget} before W{firstGap.week} · peak W{peakWeek ?? "-"}
    </span>
  );
}

function LegendDot({
  label,
  solid = false,
}: {
  label: string;
  solid?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6" viewBox="0 0 18 6">
        <line
          x1="0"
          x2="18"
          y1="3"
          y2="3"
          stroke="var(--tool-accent)"
          strokeWidth="1.6"
          strokeDasharray={solid ? undefined : "3 2"}
        />
      </svg>
      {label}
    </span>
  );
}

function LegendBand({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-4 rounded-sm bg-tool-accent-soft"
      />
      {label}
    </span>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function ForecastChart({
  points,
  histLen,
}: {
  points: {
    x: number;
    hist: number | null;
    proj: number | null;
    ciLow: number | null;
    ciHigh: number | null;
  }[];
  histLen: number;
}) {
  const w = 600;
  const h = 200;
  const padX = 12;
  const padY = 14;
  const allVals: number[] = [];
  points.forEach((p) => {
    if (p.hist != null) allVals.push(p.hist);
    if (p.proj != null) allVals.push(p.proj);
    if (p.ciHigh != null) allVals.push(p.ciHigh);
  });
  if (allVals.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-app bg-app text-xs text-faint">
        No data to chart.
      </div>
    );
  }
  const max = Math.max(...allVals) * 1.05;
  const min = 0;
  const xs = (i: number) =>
    padX + (i / Math.max(1, points.length - 1)) * (w - 2 * padX);
  const ys = (v: number) =>
    h - padY - ((v - min) / (max - min || 1)) * (h - 2 * padY);

  const histPath = points
    .filter((p) => p.hist != null)
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xs(p.x).toFixed(2)} ${ys(p.hist!).toFixed(2)}`
    )
    .join(" ");

  const projPoints = points.filter((p) => p.proj != null);
  const lastHist = points.filter((p) => p.hist != null).slice(-1)[0];
  const projWithBridge = lastHist
    ? [{ x: lastHist.x, hist: null, proj: lastHist.hist, ciLow: null, ciHigh: null }, ...projPoints]
    : projPoints;
  const projPath = projWithBridge
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xs(p.x).toFixed(2)} ${ys(p.proj!).toFixed(2)}`
    )
    .join(" ");

  const ciHighPath = projPoints
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xs(p.x).toFixed(2)} ${ys(p.ciHigh!).toFixed(2)}`
    )
    .join(" ");
  const ciLowPathReversed = [...projPoints]
    .reverse()
    .map((p) => `L ${xs(p.x).toFixed(2)} ${ys(p.ciLow!).toFixed(2)}`)
    .join(" ");
  const ciArea = `${ciHighPath} ${ciLowPathReversed} Z`;

  const eventDots: { x: number; y: number }[] = [];
  for (let i = 1; i < projPoints.length; i++) {
    const prev = projPoints[i - 1];
    const cur = projPoints[i];
    if (prev.proj != null && cur.proj != null) {
      const jump = cur.proj / prev.proj;
      if (jump > 1.15) {
        eventDots.push({ x: xs(cur.x), y: ys(cur.proj) });
      }
    }
  }

  const sepX = histLen > 0 ? xs(histLen - 0.5) : padX;

  return (
    <div className="relative overflow-hidden rounded-lg border border-app bg-app p-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[220px] w-full"
        role="img"
        aria-label="Volume forecast chart"
      >
        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={w - padX}
            y1={padY + (h - 2 * padY) * g}
            y2={padY + (h - 2 * padY) * g}
            stroke="var(--border)"
            strokeOpacity="0.6"
            strokeDasharray="1 2"
          />
        ))}
        {/* History/forecast separator */}
        <line
          x1={sepX}
          x2={sepX}
          y1={padY}
          y2={h - padY}
          stroke="var(--tool-accent)"
          strokeOpacity="0.4"
          strokeDasharray="2 3"
        />
        <text
          x={sepX + 4}
          y={padY + 10}
          fontSize="8"
          fill="var(--tool-accent)"
          fillOpacity="0.7"
          fontFamily="ui-monospace, monospace"
        >
          ↓ forecast
        </text>
        {/* CI band */}
        {projPoints.length > 0 && (
          <path d={ciArea} fill="var(--tool-accent)" fillOpacity="0.13" />
        )}
        {/* Historical line */}
        {histPath && (
          <path
            d={histPath}
            fill="none"
            stroke="var(--tool-accent)"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Projected line (dashed) */}
        {projPath && (
          <path
            d={projPath}
            fill="none"
            stroke="var(--tool-accent)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Historical dots */}
        {points
          .filter((p) => p.hist != null)
          .map((p) => (
            <circle
              key={`h-${p.x}`}
              cx={xs(p.x)}
              cy={ys(p.hist!)}
              r="2.2"
              fill="var(--tool-accent)"
            />
          ))}
        {/* Event jump markers */}
        {eventDots.map((d, i) => (
          <circle
            key={`ev-${i}`}
            cx={d.x}
            cy={d.y}
            r="3.5"
            fill="rgb(139 92 246)"
            stroke="var(--bg)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}

function BacktestChart({
  points,
}: {
  points: { i: number; actual: number; lin: number; ma: number }[];
}) {
  const w = 600;
  const h = 180;
  const padX = 12;
  const padY = 14;
  if (points.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-app bg-app text-xs text-faint">
        Not enough data.
      </div>
    );
  }
  const allVals = points.flatMap((p) => [p.actual, p.lin, p.ma]);
  const max = Math.max(...allVals) * 1.05;
  const min = Math.max(0, Math.min(...allVals) * 0.95);
  const xs = (i: number) =>
    padX + (i / Math.max(1, points.length - 1)) * (w - 2 * padX);
  const ys = (v: number) =>
    h - padY - ((v - min) / (max - min || 1)) * (h - 2 * padY);

  const path = (key: "actual" | "lin" | "ma") =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xs(i).toFixed(2)} ${ys(p[key]).toFixed(2)}`
      )
      .join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-app bg-app p-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[200px] w-full"
        role="img"
        aria-label="Backtest chart"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={w - padX}
            y1={padY + (h - 2 * padY) * g}
            y2={padY + (h - 2 * padY) * g}
            stroke="var(--border)"
            strokeOpacity="0.6"
            strokeDasharray="1 2"
          />
        ))}
        <path
          d={path("actual")}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path("lin")}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="1.4"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path("ma")}
          fill="none"
          stroke="rgb(245 158 11)"
          strokeWidth="1.4"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xs(i)}
            cy={ys(p.actual)}
            r="2.2"
            fill="var(--tool-accent)"
          />
        ))}
      </svg>
    </div>
  );
}

function CapacityChart({
  forecast,
  currentAgents,
}: {
  forecast: { week: number; agentsNeeded: number; gap: number }[];
  currentAgents: number;
}) {
  const max = Math.max(
    currentAgents,
    ...forecast.map((f) => f.agentsNeeded),
    1
  );
  return (
    <div>
      <div className="grid grid-cols-12 gap-1.5">
        {forecast.map((w) => {
          const reqPct = (w.agentsNeeded / max) * 100;
          const curPct = (currentAgents / max) * 100;
          const short = w.gap > 0;
          return (
            <div key={w.week} className="flex flex-col items-center gap-1">
              <div className="relative flex h-32 w-full items-end overflow-hidden rounded-md border border-app bg-app">
                <div
                  className={`w-full transition-all ${
                    short
                      ? "bg-rose-500/70"
                      : "bg-tool-accent"
                  }`}
                  style={{ height: `${reqPct}%` }}
                  title={`Need ${w.agentsNeeded.toFixed(1)} agents`}
                />
                {/* Current capacity threshold line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-app"
                  style={{
                    bottom: `${curPct}%`,
                    borderColor: "var(--tool-accent)",
                    opacity: 0.7,
                  }}
                  title={`Current capacity: ${currentAgents}`}
                />
                {short && (
                  <span className="absolute right-1 top-1 font-mono text-[0.55rem] text-rose-500">
                    +{w.gap.toFixed(1)}
                  </span>
                )}
              </div>
              <span className="font-mono text-[0.6rem] text-muted">
                W{w.week}
              </span>
              <span
                className={`font-mono text-[0.6rem] ${
                  short ? "text-rose-500" : "text-tool-accent"
                }`}
              >
                {w.agentsNeeded.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.65rem] text-muted">
        <LegendChip color="bg-tool-accent" label="Within capacity" />
        <LegendChip color="bg-rose-500" label="Short-staffed" />
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" viewBox="0 0 18 6">
            <line
              x1="0"
              x2="18"
              y1="3"
              y2="3"
              stroke="var(--tool-accent)"
              strokeOpacity="0.7"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          </svg>
          Current ({currentAgents} agents)
        </span>
      </div>
    </div>
  );
}

function Heatmap({
  heatmap,
}: {
  heatmap: { cells: { d: number; h: number; v: number }[]; max: number };
}) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  heatmap.cells.forEach((c) => {
    grid[c.d][c.h] = c.v;
  });
  const max = heatmap.max || 1;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-px font-mono text-[0.5rem] text-faint">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center">
              {h % 6 === 0 ? h.toString().padStart(2, "0") : ""}
            </div>
          ))}
        </div>
        {grid.map((row, d) => (
          <div
            key={d}
            className="mt-px grid grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-px"
          >
            <div className="font-mono text-[0.6rem] text-muted">{days[d]}</div>
            {row.map((v, h) => {
              const intensity = max > 0 ? v / max : 0;
              return (
                <div
                  key={h}
                  className="aspect-square rounded-[2px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--tool-accent) ${
                      Math.round(intensity * 88) + 4
                    }%, transparent)`,
                  }}
                  title={`${days[d]} ${h}:00 — ${v.toFixed(1)} tickets`}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-3 flex items-center gap-2 font-mono text-[0.6rem] text-faint">
          <span>low</span>
          <div
            className="h-2 w-32 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--tool-accent) 6%, transparent), var(--tool-accent))",
            }}
          />
          <span>peak</span>
        </div>
      </div>
    </div>
  );
}
