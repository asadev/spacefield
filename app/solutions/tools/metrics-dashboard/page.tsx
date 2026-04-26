"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

interface Metric {
  id: string;
  name: string;
  unit: string; // "%", "$", "users"
  target: number;
  higherIsBetter: boolean;
}

interface MetricPoint {
  metricId: string;
  date: string; // YYYY-MM-DD
  value: number;
}

interface MetricsState {
  metrics: Metric[];
  points: MetricPoint[];
}

const LS_KEY = "solutions:metrics-dashboard:v1";
const NAMESPACE = "metrics";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;
const MAX_METRICS = 12;

type ViewKey = "overview" | "north-stars" | "supporting" | "alerts";
type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<RangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

const uid = () => Math.random().toString(36).slice(2, 9);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultState(): MetricsState {
  const a = uid();
  const b = uid();
  const c = uid();
  const points: MetricPoint[] = [];
  const base: Record<string, number[]> = {
    [a]: [78, 80, 82, 79, 83, 86],
    [b]: [120, 150, 142, 180, 215, 240],
    [c]: [0.12, 0.14, 0.13, 0.16, 0.18, 0.2],
  };
  const now = new Date();
  Object.entries(base).forEach(([metricId, vals]) => {
    vals.forEach((v, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (vals.length - i - 1) * 7);
      points.push({ metricId, date: d.toISOString().slice(0, 10), value: v });
    });
  });

  return {
    metrics: [
      { id: a, name: "NPS", unit: "score", target: 80, higherIsBetter: true },
      { id: b, name: "Weekly signups", unit: "users", target: 200, higherIsBetter: true },
      { id: c, name: "Churn rate", unit: "%", target: 0.1, higherIsBetter: false },
    ],
    points,
  };
}

function latestForMetric(
  points: MetricPoint[],
  metricId: string
): MetricPoint | null {
  const xs = points
    .filter((p) => p.metricId === metricId)
    .sort((a, b) => a.date.localeCompare(b.date));
  return xs[xs.length - 1] ?? null;
}

function seriesFor(points: MetricPoint[], metricId: string): MetricPoint[] {
  return points
    .filter((p) => p.metricId === metricId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function filterByRange(series: MetricPoint[], range: RangeKey): MetricPoint[] {
  const days = RANGE_DAYS[range];
  if (days === null) return series;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return series.filter((p) => p.date >= cutoffIso);
}

function alertCount(series: MetricPoint[], m: Metric): number {
  // Number of trailing periods where the metric misses the target.
  let n = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const p = series[i];
    const miss = m.higherIsBetter ? p.value < m.target : p.value > m.target;
    if (miss) n += 1;
    else break;
  }
  return n;
}

export default function MetricsDashboardPage() {
  return (
    <div data-tool-theme="growth" data-tool="metrics-dashboard">
      <ToolShell
        category="Data & Developer"
        title="Metrics Dashboard"
        description="Team-aware KPI tracker. Define up to 12 metrics, log values over time, watch sparklines against targets. Personal mode is local; team mode syncs."
      >
        <MetricsInner />
      </ToolShell>
    </div>
  );
}

function MetricsInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<MetricsState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("overview");
  const [range, setRange] = useState<RangeKey>("90d");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<MetricsState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        if (data && Array.isArray(data.metrics) && Array.isArray(data.points)) {
          setState(data);
        } else {
          setState(defaultState());
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          const parsed = raw ? (JSON.parse(raw) as MetricsState) : null;
          if (parsed && Array.isArray(parsed.metrics) && Array.isArray(parsed.points)) {
            setState(parsed);
          } else {
            setState(defaultState());
          }
        } catch {
          setState(defaultState());
        }
      }
      lastSig.current = null;
      setHydrated(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(current.id, NAMESPACE, DATA_KEY, state);
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {
          /* ignore */
        }
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const addMetric = () => {
    if (state.metrics.length >= MAX_METRICS) return;
    setState((s) => ({
      ...s,
      metrics: [
        ...s.metrics,
        {
          id: uid(),
          name: "New metric",
          unit: "",
          target: 0,
          higherIsBetter: true,
        },
      ],
    }));
  };

  const updateMetric = (id: string, patch: Partial<Metric>) =>
    setState((s) => ({
      ...s,
      metrics: s.metrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  const removeMetric = (id: string) => {
    if (!confirm("Delete this metric and its history?")) return;
    setState((s) => ({
      metrics: s.metrics.filter((m) => m.id !== id),
      points: s.points.filter((p) => p.metricId !== id),
    }));
  };

  const logPoint = (metricId: string, date: string, value: number) => {
    setState((s) => ({
      ...s,
      points: [
        ...s.points.filter((p) => !(p.metricId === metricId && p.date === date)),
        { metricId, date, value },
      ],
    }));
  };

  const removePoint = (metricId: string, date: string) => {
    setState((s) => ({
      ...s,
      points: s.points.filter((p) => !(p.metricId === metricId && p.date === date)),
    }));
  };

  const alerts = useMemo(() => {
    return state.metrics
      .map((m) => ({
        metric: m,
        streak: alertCount(seriesFor(state.points, m.id), m),
      }))
      .filter((x) => x.streak >= 3);
  }, [state]);

  const northStars = state.metrics.slice(0, 3);
  const subMetrics = state.metrics.slice(3, 9);
  const breakdownMetrics = state.metrics.slice(9);

  const onTargetCount = state.metrics.reduce((acc, m) => {
    const latest = latestForMetric(state.points, m.id);
    if (!latest) return acc;
    const hit = m.higherIsBetter
      ? latest.value >= m.target
      : latest.value <= m.target;
    return acc + (hit ? 1 : 0);
  }, 0);

  const renderCard = (m: Metric) => (
    <MetricCard
      key={m.id}
      metric={m}
      series={filterByRange(seriesFor(state.points, m.id), range)}
      fullSeries={seriesFor(state.points, m.id)}
      onChange={(p) => updateMetric(m.id, p)}
      onRemove={() => removeMetric(m.id)}
      onLog={(date, value) => logPoint(m.id, date, value)}
      onRemovePoint={(date) => removePoint(m.id, date)}
    />
  );

  const views: { k: ViewKey; label: string }[] = [
    { k: "overview", label: "Overview" },
    { k: "north-stars", label: "North stars" },
    { k: "supporting", label: "Supporting" },
    { k: "alerts", label: `Alerts${alerts.length > 0 ? ` · ${alerts.length}` : ""}` },
  ];

  const ranges: { k: RangeKey; label: string }[] = [
    { k: "7d", label: "7d" },
    { k: "30d", label: "30d" },
    { k: "90d", label: "90d" },
    { k: "all", label: "All" },
  ];

  return (
    <>
      <WorkspaceSwitcher />

      {/* Command-center masthead */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            {current.kind === "team" ? "team" : "personal"}
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            kpi.dashboard
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            metrics
            <span className="text-faint">/</span>
            <span className="text-secondary">{view}</span>
            <span className="text-faint">·</span>
            <span className="text-secondary">{range}</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing ? "◐ saving…" : syncedAt ? `◉ saved ${syncedAt}` : hydrated ? "◉ ready" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                {current.kind === "team" ? "Team command center" : "Personal command center"}
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                {state.metrics.length === 0
                  ? "No metrics tracked yet"
                  : `${onTargetCount} of ${state.metrics.length} on target`}
              </h2>
              <p className="mt-1 text-xs text-muted">
                Sparklines show every data point in range. Dashed line is the target.
              </p>
            </div>

            {/* on-target dial */}
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
                    strokeDasharray={`${
                      state.metrics.length > 0 ? (onTargetCount / state.metrics.length) * 100 : 0
                    }, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                  {state.metrics.length > 0
                    ? `${Math.round((onTargetCount / state.metrics.length) * 100)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  On target
                </div>
                <div className="text-sm font-semibold text-app">
                  {onTargetCount} / {state.metrics.length}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Metrics" value={`${state.metrics.length} / ${MAX_METRICS}`} accent />
            <Stat label="Data points" value={String(state.points.length)} />
            <Stat label="On target" value={`${onTargetCount} / ${state.metrics.length}`} />
            <Stat label="Alerts" value={String(alerts.length)} />
          </div>
        </div>

        {/* segmented controls */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {views.map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {ranges.map((r) => (
              <button
                key={r.k}
                onClick={() => setRange(r.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  range === r.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={addMetric}
              disabled={state.metrics.length >= MAX_METRICS}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ color: "var(--bg)" }}
            >
              + Metric
            </button>
          </div>
        </div>
      </section>

      {/* Alerts panel — always shown when present, prominent in alerts view */}
      {alerts.length > 0 && (view === "overview" || view === "alerts") && (
        <div className="mb-6 overflow-hidden rounded-xl border border-rose-500/30 bg-app-elevated">
          <div className="flex items-center justify-between border-b border-rose-500/20 bg-rose-500/[0.06] px-4 py-2.5">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-rose-500">
              ▾ alerts · below target 3+ periods
            </div>
            <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-rose-500">
              {alerts.length}
            </span>
          </div>
          <ul className="divide-y divide-app">
            {alerts.map(({ metric, streak }) => (
              <li
                key={metric.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-app">{metric.name}</span>
                <span className="font-mono text-xs text-muted">
                  missing target for {streak} periods
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* North stars */}
      {northStars.length > 0 && (view === "overview" || view === "north-stars") && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              ▸ north stars
            </div>
            <div className="h-px flex-1 bg-app" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {northStars.map(renderCard)}
          </div>
        </section>
      )}

      {/* Supporting metrics */}
      {subMetrics.length > 0 && (view === "overview" || view === "supporting") && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-secondary">
              ▸ supporting metrics
            </div>
            <div className="h-px flex-1 bg-app" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subMetrics.map(renderCard)}
          </div>
        </section>
      )}

      {/* Funnel & breakdown */}
      {breakdownMetrics.length > 0 && (view === "overview" || view === "supporting") && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-secondary">
              ▸ funnel & breakdown
            </div>
            <div className="h-px flex-1 bg-app" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {breakdownMetrics.map(renderCard)}
          </div>
        </section>
      )}

      {view === "alerts" && alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
          <div className="text-base font-semibold text-app">All clear.</div>
          <p className="mt-1">No metric is missing its target for 3+ periods.</p>
        </div>
      )}

      {state.metrics.length === 0 && (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
          <div className="text-base font-semibold text-app">Command center is empty.</div>
          <p className="mt-1">Add your first north-star metric to start tracking.</p>
        </div>
      )}
    </>
  );
}

function Sparkline({
  series,
  target,
}: {
  series: MetricPoint[];
  target: number;
}) {
  const w = 300;
  const h = 60;
  if (series.length === 0) {
    return (
      <div className="flex h-[60px] items-center justify-center rounded-lg border border-dashed border-app text-[0.65rem] text-faint">
        No data in range
      </div>
    );
  }
  const values = series.map((p) => p.value);
  const min = Math.min(...values, target);
  const max = Math.max(...values, target);
  const span = max - min || 1;
  const xStep = series.length > 1 ? w / (series.length - 1) : 0;
  const points = series
    .map((p, i) => {
      const x = series.length > 1 ? i * xStep : w / 2;
      const y = h - ((p.value - min) / span) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const targetY = h - ((target - min) / span) * h;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[60px] w-full">
      <line
        x1="0"
        x2={w}
        y1={targetY}
        y2={targetY}
        stroke="var(--tool-accent)"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <polyline
        fill="none"
        stroke="var(--tool-accent)"
        strokeWidth={1.75}
        points={points}
      />
      {series.map((p, i) => {
        const x = series.length > 1 ? i * xStep : w / 2;
        const y = h - ((p.value - min) / span) * h;
        return (
          <circle
            key={`${p.date}-${i}`}
            cx={x}
            cy={y}
            r={2.25}
            fill="var(--tool-accent)"
          />
        );
      })}
    </svg>
  );
}

function MetricCard({
  metric,
  series,
  fullSeries,
  onChange,
  onRemove,
  onLog,
  onRemovePoint,
}: {
  metric: Metric;
  series: MetricPoint[];
  fullSeries: MetricPoint[];
  onChange: (p: Partial<Metric>) => void;
  onRemove: () => void;
  onLog: (date: string, value: number) => void;
  onRemovePoint: (date: string) => void;
}) {
  const latest = fullSeries[fullSeries.length - 1] ?? null;
  const [showEdit, setShowEdit] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [value, setValue] = useState("");

  const status = (() => {
    if (!latest)
      return {
        label: "No data",
        cls: "border-app bg-app-elevated text-muted",
      };
    const hit = metric.higherIsBetter
      ? latest.value >= metric.target
      : latest.value <= metric.target;
    return hit
      ? {
          label: "On target",
          cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
        }
      : {
          label: "Off target",
          cls: "border-rose-500/40 bg-rose-500/10 text-rose-500",
        };
  })();

  return (
    <ToolCard>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-app">
            {metric.name}
          </div>
          <div className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            target {metric.target}
            {metric.unit ? ` ${metric.unit}` : ""} ·{" "}
            {metric.higherIsBetter ? "higher better" : "lower better"}
          </div>
        </div>
        <button
          onClick={() => setShowEdit((v) => !v)}
          className="rounded-lg border border-app bg-app-elevated px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
        >
          {showEdit ? "Done" : "Edit"}
        </button>
      </div>

      <div className="mb-3 flex items-baseline gap-2">
        <div className="font-mono text-3xl font-semibold tracking-tight text-app">
          {latest ? latest.value : "—"}
        </div>
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted">
          {metric.unit}
        </div>
        <div
          className={`ml-auto rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${status.cls}`}
        >
          {status.label}
        </div>
      </div>

      <Sparkline series={series} target={metric.target} />

      {showEdit && (
        <div className="mt-4 space-y-3 rounded-lg border border-app bg-app p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <input
                value={metric.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className={inputCls()}
              />
            </Field>
            <Field label="Unit">
              <input
                value={metric.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                className={inputCls()}
              />
            </Field>
            <Field label="Target">
              <input
                type="number"
                value={metric.target}
                onChange={(e) => onChange({ target: Number(e.target.value) || 0 })}
                className={inputCls()}
              />
            </Field>
            <Field label="Direction">
              <select
                value={metric.higherIsBetter ? "up" : "down"}
                onChange={(e) =>
                  onChange({ higherIsBetter: e.target.value === "up" })
                }
                className={inputCls()}
              >
                <option value="up">Higher is better</option>
                <option value="down">Lower is better</option>
              </select>
            </Field>
          </div>

          <div className="border-t border-app pt-3">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
              Log a value
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls("sm:w-40")}
              />
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                className={inputCls("flex-1")}
              />
              <button
                onClick={() => {
                  if (value === "") return;
                  onLog(date, Number(value));
                  setValue("");
                }}
                className="rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Log
              </button>
            </div>
            {fullSeries.length > 0 && (
              <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-secondary">
                {[...fullSeries].reverse().slice(0, 6).map((p) => (
                  <li
                    key={p.date}
                    className="flex items-center justify-between rounded-md border border-app bg-app-elevated px-2 py-1"
                  >
                    <span>
                      <span className="font-mono text-app">{p.value}</span>
                      <span className="ml-2 font-mono text-muted">{p.date}</span>
                    </span>
                    <button
                      onClick={() => onRemovePoint(p.date)}
                      className="text-faint transition-colors hover:text-rose-500"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end border-t border-app pt-3">
            <button
              onClick={onRemove}
              className="rounded-lg border border-app bg-app-elevated px-3 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
            >
              Delete metric
            </button>
          </div>
        </div>
      )}
    </ToolCard>
  );
}
