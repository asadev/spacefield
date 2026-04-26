"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";
import { KPI_BENCHMARKS } from "../../_lib/supportData";

type Direction = "up" | "down";

interface Metric {
  key: string;
  label: string;
  unit: string;
  target: number;
  direction: Direction; // up = higher is better; down = lower is better
}

interface Entry {
  id: string;
  period: string; // e.g. "2026-W12" or "2026-02"
  values: Record<string, number | null>;
}

interface KpiState {
  metrics: Metric[];
  entries: Entry[];
}

const LS_KEY = "solutions:kpi-dashboard:v1";
const NAMESPACE = "kpi-dashboard";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_METRICS: Metric[] = [
  {
    key: "frt",
    label: "First-response time",
    unit: "min",
    target: 15,
    direction: "down",
  },
  {
    key: "resolution",
    label: "Resolution time",
    unit: "hr",
    target: 8,
    direction: "down",
  },
  { key: "csat", label: "CSAT", unit: "%", target: 90, direction: "up" },
  { key: "nps", label: "NPS", unit: "", target: 40, direction: "up" },
  {
    key: "volume",
    label: "Ticket volume",
    unit: "tickets",
    target: 500,
    direction: "down",
  },
  {
    key: "backlog",
    label: "Backlog",
    unit: "tickets",
    target: 50,
    direction: "down",
  },
];

// Group metrics into categories for the dashboard sectioning.
const METRIC_CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  { id: "speed", label: "Speed", keys: ["frt", "resolution"] },
  { id: "quality", label: "Quality", keys: ["csat", "nps"] },
  { id: "load", label: "Load", keys: ["volume", "backlog"] },
];

type PeriodFilter = "day" | "week" | "month" | "quarter" | "year";
const PERIOD_TABS: { k: PeriodFilter; label: string }[] = [
  { k: "day", label: "Day" },
  { k: "week", label: "Week" },
  { k: "month", label: "Month" },
  { k: "quarter", label: "Quarter" },
  { k: "year", label: "Year" },
];

function classifyPeriod(p: string): PeriodFilter | "other" {
  // YYYY-MM-DD → day
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return "day";
  // YYYY-Wnn → week
  if (/^\d{4}-W\d{1,2}$/i.test(p)) return "week";
  // YYYY-Qn → quarter
  if (/^\d{4}-Q[1-4]$/i.test(p)) return "quarter";
  // YYYY-MM → month
  if (/^\d{4}-\d{2}$/.test(p)) return "month";
  // YYYY → year
  if (/^\d{4}$/.test(p)) return "year";
  return "other";
}

function defaultState(): KpiState {
  return { metrics: DEFAULT_METRICS, entries: [] };
}

function onTarget(m: Metric, val: number): boolean {
  return m.direction === "up" ? val >= m.target : val <= m.target;
}

function Sparkline({
  values,
  direction,
}: {
  values: number[];
  direction: Direction;
}) {
  if (values.length === 0)
    return (
      <div className="flex h-10 items-center font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        No data
      </div>
    );
  const w = 140;
  const h = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const points = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    `0,${h} ` +
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
    ` ${w},${h}`;
  const first = values[0];
  const last = values[values.length - 1];
  const improving = direction === "up" ? last >= first : last <= first;
  // Improving uses tool accent; regressing uses semantic rose.
  const stroke = improving ? "var(--tool-accent)" : "rgb(244 63 94)";
  const fill = improving
    ? "color-mix(in oklab, var(--tool-accent) 18%, transparent)"
    : "rgba(244,63,94,0.14)";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
    >
      <polygon points={area} fill={fill} stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KpiDashboardPage() {
  return (
    <div data-tool-theme="productivity" data-tool="kpi-dashboard">
      <ToolShell
        category="Support & Ops"
        title="Support KPI Dashboard"
        description="Track first-response, resolution, CSAT, NPS, volume, backlog. Sparklines, targets, team-mode history."
      >
        <KpiInner />
      </ToolShell>
    </div>
  );
}

function KpiInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<KpiState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<KpiState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setState(
          data && Array.isArray(data.metrics) && Array.isArray(data.entries)
            ? data
            : defaultState()
        );
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          setState(raw ? JSON.parse(raw) : defaultState());
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
        const res = await saveWorkspaceData(
          current.id,
          NAMESPACE,
          DATA_KEY,
          state
        );
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {}
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const [newPeriod, setNewPeriod] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );

  const addEntry = () => {
    if (!newPeriod.trim()) return;
    if (state.entries.some((e) => e.period === newPeriod)) return;
    const values: Record<string, number | null> = {};
    state.metrics.forEach((m) => (values[m.key] = null));
    setState({
      ...state,
      entries: [...state.entries, { id: uid(), period: newPeriod, values }].sort(
        (a, b) => a.period.localeCompare(b.period)
      ),
    });
  };

  const setVal = (periodId: string, key: string, v: string) => {
    const num = v === "" ? null : Number(v);
    setState({
      ...state,
      entries: state.entries.map((e) =>
        e.id === periodId ? { ...e, values: { ...e.values, [key]: num } } : e
      ),
    });
  };

  const removeEntry = (id: string) => {
    setState({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  };

  const stats = useMemo(() => {
    const latest = state.entries[state.entries.length - 1];
    if (!latest) return { entries: 0, onTarget: 0, total: state.metrics.length };
    const hits = state.metrics.filter((m) => {
      const v = latest.values[m.key];
      return typeof v === "number" && onTarget(m, v);
    }).length;
    return { entries: state.entries.length, onTarget: hits, total: state.metrics.length };
  }, [state]);

  // Correlation matrix: Pearson correlation between pairs of metrics over time.
  const correlations = useMemo(() => {
    const metrics = state.metrics;
    const series: Record<string, number[]> = {};
    metrics.forEach((m) => {
      series[m.key] = state.entries
        .map((e) => e.values[m.key])
        .filter((v): v is number => typeof v === "number");
    });
    const pearson = (xs: number[], ys: number[]): number | null => {
      const n = Math.min(xs.length, ys.length);
      if (n < 3) return null;
      const x = xs.slice(0, n);
      const y = ys.slice(0, n);
      const mx = x.reduce((a, b) => a + b, 0) / n;
      const my = y.reduce((a, b) => a + b, 0) / n;
      let num = 0,
        dx2 = 0,
        dy2 = 0;
      for (let i = 0; i < n; i++) {
        const a = x[i] - mx;
        const b = y[i] - my;
        num += a * b;
        dx2 += a * a;
        dy2 += b * b;
      }
      const den = Math.sqrt(dx2 * dy2);
      if (den === 0) return null;
      return num / den;
    };
    return metrics.map((a) =>
      metrics.map((b) => (a.key === b.key ? 1 : pearson(series[a.key], series[b.key])))
    );
  }, [state]);

  const targetPct = stats.total
    ? Math.round((stats.onTarget / stats.total) * 100)
    : 0;

  const grouped = useMemo(() => {
    const known = new Set(METRIC_CATEGORIES.flatMap((c) => c.keys));
    const sections = METRIC_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      metrics: state.metrics.filter((m) => c.keys.includes(m.key)),
    })).filter((s) => s.metrics.length > 0);
    const others = state.metrics.filter((m) => !known.has(m.key));
    if (others.length > 0) {
      sections.push({ id: "other", label: "Other", metrics: others });
    }
    return sections;
  }, [state.metrics]);

  // Filter entries by the active period grain (no math change — just the table view).
  const filteredEntries = useMemo(
    () =>
      state.entries.filter((e) => classifyPeriod(e.period) === periodFilter),
    [state.entries, periodFilter]
  );

  const periodCounts = useMemo(() => {
    const counts: Record<PeriodFilter, number> = {
      day: 0,
      week: 0,
      month: 0,
      quarter: 0,
      year: 0,
    };
    state.entries.forEach((e) => {
      const c = classifyPeriod(e.period);
      if (c !== "other") counts[c]++;
    });
    return counts;
  }, [state.entries]);

  return (
    <>
      <WorkspaceSwitcher />

      {/* ============================== HERO ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            KPI · rollup
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {current.kind === "team" ? "team" : "personal"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            kpi.dashboard
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {state.entries.length > 0
                ? state.entries[state.entries.length - 1].period
                : "no-entries"}
            </span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing ? "◌ saving" : syncedAt ? `◉ ${syncedAt}` : hydrated ? "◉ ready" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Latest period · on-target completion
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-6xl font-semibold tracking-tight tabular-nums text-app sm:text-7xl">
                  {stats.onTarget}
                  <span className="text-3xl text-faint">/{stats.total}</span>
                </span>
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-secondary">
                  on target
                </span>
              </div>

              <div className="mt-3 h-1.5 w-full max-w-md overflow-hidden rounded-full border border-app bg-app">
                <div
                  className="h-full rounded-full bg-tool-accent transition-[width] duration-500"
                  style={{ width: `${targetPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 md:w-[22rem]">
              <HeroStat label="Entries" value={String(stats.entries)} />
              <HeroStat label="Metrics" value={String(state.metrics.length)} />
              <HeroStat
                label="Hit rate"
                value={`${targetPct}%`}
                tone={targetPct >= 70 ? "ok" : targetPct >= 40 ? "muted" : "warn"}
              />
            </div>
          </div>
        </div>

        {/* period segmented tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {PERIOD_TABS.map((t) => {
              const active = periodFilter === t.k;
              const count = periodCounts[t.k];
              return (
                <button
                  key={t.k}
                  onClick={() => setPeriodFilter(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    active
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={active ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                  {count > 0 && (
                    <span className={`ml-1.5 ${active ? "opacity-80" : "text-faint"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
            {filteredEntries.length} {periodFilter}
            {filteredEntries.length === 1 ? "" : "s"} shown
          </div>
        </div>
      </section>

      {/* ============================== TILE GRID ============================== */}
      <div className="space-y-7">
        {grouped.map((section) => (
          <section key={section.id}>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-secondary">
                {section.label}
              </h3>
              <span className="h-px flex-1 bg-app" style={{ background: "var(--border)" }} />
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                {section.metrics.length} metric
                {section.metrics.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.metrics.map((m) => {
                const series = state.entries
                  .map((e) => e.values[m.key])
                  .filter((v): v is number => typeof v === "number");
                const latest = series[series.length - 1];
                const prev =
                  series.length >= 2 ? series[series.length - 2] : null;
                const hit =
                  typeof latest === "number" ? onTarget(m, latest) : null;
                const delta =
                  typeof latest === "number" && typeof prev === "number"
                    ? latest - prev
                    : null;
                const deltaPct =
                  delta !== null && prev !== 0 && prev !== null
                    ? (delta / Math.abs(prev)) * 100
                    : null;
                const deltaGood =
                  delta === null
                    ? null
                    : m.direction === "up"
                    ? delta >= 0
                    : delta <= 0;
                const targetProgress =
                  typeof latest === "number"
                    ? m.direction === "up"
                      ? Math.max(0, Math.min(1, latest / Math.max(m.target, 0.0001)))
                      : latest <= 0
                      ? 1
                      : Math.max(
                          0,
                          Math.min(1, m.target / Math.max(latest, 0.0001))
                        )
                    : 0;
                const targetPctTile = Math.round(targetProgress * 100);
                return (
                  <article
                    key={m.key}
                    className="group relative flex flex-col rounded-xl border border-app bg-app-elevated p-5 transition-colors hover:border-tool-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                          {m.label}
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="font-mono text-3xl font-semibold tabular-nums text-app">
                            {typeof latest === "number" ? latest : "—"}
                          </span>
                          {m.unit && typeof latest === "number" && (
                            <span className="font-mono text-sm text-muted">
                              {m.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <Sparkline values={series} direction={m.direction} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {delta !== null && deltaGood !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[0.6rem] tabular-nums ${
                            deltaGood
                              ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-500"
                          }`}
                          title="vs previous period"
                        >
                          <span aria-hidden>
                            {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"}
                          </span>
                          {delta > 0 ? "+" : ""}
                          {Number.isInteger(delta) ? delta : delta.toFixed(2)}
                          {deltaPct !== null && (
                            <span className="opacity-70">
                              ({deltaPct > 0 ? "+" : ""}
                              {deltaPct.toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                          No prior period
                        </span>
                      )}
                      {hit !== null && (
                        <span
                          className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] font-medium uppercase tracking-[0.14em] ${
                            hit
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                          }`}
                        >
                          {hit ? "On target" : "Off target"}
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                        <span>
                          Target {m.direction === "down" ? "≤" : "≥"} {m.target}
                          {m.unit ? ` ${m.unit}` : ""}
                        </span>
                        <span className="tabular-nums text-secondary">
                          {typeof latest === "number" ? `${targetPctTile}%` : "—"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full border border-app bg-app">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            hit === null
                              ? "bg-app"
                              : hit
                              ? "bg-tool-accent"
                              : "bg-amber-500/80"
                          }`}
                          style={{
                            width: `${
                              typeof latest === "number" ? targetPctTile : 0
                            }%`,
                          }}
                        />
                      </div>
                      <div className="mt-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                        {series.length} point{series.length === 1 ? "" : "s"} ·{" "}
                        {m.direction === "up" ? "Higher is better" : "Lower is better"}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ============================== LOG A PERIOD ============================== */}
      <div className="mt-7">
        <ToolCard title="Log a period" subtitle="Daily, weekly, monthly, quarterly, or yearly values">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Period (e.g. 2026-04-15, 2026-W16, 2026-04, 2026-Q2, 2026)">
              <input
                value={newPeriod}
                onChange={(e) => setNewPeriod(e.target.value)}
                className={inputCls()}
              />
            </Field>
            <button
              onClick={addEntry}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            >
              + Add period
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                  <th className="py-2 pr-4 text-left">Period</th>
                  {state.metrics.map((m) => (
                    <th key={m.key} className="py-2 pr-4 text-left">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-2 pr-4 text-left" />
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="border-t border-app">
                    <td className="py-2 pr-4 font-mono tabular-nums text-app">
                      {e.period}
                    </td>
                    {state.metrics.map((m) => {
                      const v = e.values[m.key];
                      const hit = typeof v === "number" ? onTarget(m, v) : null;
                      return (
                        <td key={m.key} className="py-1 pr-2">
                          <input
                            type="number"
                            value={v ?? ""}
                            onChange={(ev) =>
                              setVal(e.id, m.key, ev.target.value)
                            }
                            className={`${inputCls()} w-24 ${
                              hit === null
                                ? ""
                                : hit
                                ? "border-emerald-500/40"
                                : "border-rose-500/40"
                            }`}
                          />
                        </td>
                      );
                    })}
                    <td className="py-1 pr-4">
                      <button
                        onClick={() => removeEntry(e.id)}
                        className="rounded-md border border-app px-2 py-1 text-xs text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={state.metrics.length + 2}
                      className="py-6 text-center font-mono text-xs uppercase tracking-[0.16em] text-muted"
                    >
                      {state.entries.length === 0
                        ? "No entries yet. Add a period to start tracking."
                        : `No ${periodFilter}-grain entries. Switch tabs or add one.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ToolCard>
      </div>

      {/* ============================== BENCHMARKS + CORRELATION ============================== */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolCard
          title="Industry benchmarks"
          subtitle="Your latest vs the median"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                  <th className="py-2 pr-4 text-left">Metric</th>
                  <th className="py-2 pr-4 text-left">You</th>
                  <th className="py-2 pr-4 text-left">Industry</th>
                  <th className="py-2 pr-4 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {KPI_BENCHMARKS.map((b) => {
                  const metric = state.metrics.find((m) => m.key === b.key);
                  const latest = state.entries[state.entries.length - 1];
                  const val =
                    latest && metric ? latest.values[b.key] : null;
                  const beating =
                    typeof val === "number"
                      ? b.direction === "up"
                        ? val >= b.median
                        : val <= b.median
                      : null;
                  return (
                    <tr key={b.key} className="border-t border-app">
                      <td className="py-2 pr-4 text-app">{b.label}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {typeof val === "number" ? (
                          <span
                            className={
                              beating ? "text-emerald-500" : "text-rose-500"
                            }
                          >
                            {val} {b.unit}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums text-secondary">
                        {b.median} {b.unit}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted">
                        {b.source}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Medians from Zendesk CX Trends 2024 + HubSpot Customer Service
            Report 2024. Metric keys: frt, resolution, csat, nps, volume,
            backlog.
          </p>
        </ToolCard>

        <ToolCard
          title="Correlation matrix"
          subtitle="How metrics move together (Pearson r)"
        >
          {state.entries.length < 3 ? (
            <div className="rounded-lg border border-dashed border-app bg-app py-4 text-center font-mono text-xs uppercase tracking-[0.16em] text-muted">
              Log at least 3 periods to compute correlations.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                    <th className="py-2 pr-2 text-left"></th>
                    {state.metrics.map((m) => (
                      <th key={m.key} className="px-1 py-2 text-center">
                        {m.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.metrics.map((a, i) => (
                    <tr key={a.key} className="border-t border-app">
                      <td className="py-1 pr-2 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary">
                        {a.key}
                      </td>
                      {state.metrics.map((b, j) => {
                        const r = correlations[i][j];
                        const color =
                          r === null
                            ? "text-faint"
                            : r > 0.5
                            ? "text-emerald-500"
                            : r < -0.5
                            ? "text-rose-500"
                            : "text-secondary";
                        return (
                          <td
                            key={b.key}
                            className={`px-1 py-1 text-center font-mono tabular-nums ${color}`}
                          >
                            {r === null ? "—" : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">
                +1 = move together, -1 = opposite, 0 = independent. Strong
                correlations hint at causal chains worth investigating.
              </p>
            </div>
          )}
        </ToolCard>
      </div>
    </>
  );
}

function HeroStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const toneCls =
    tone === "ok"
      ? "text-tool-accent"
      : tone === "warn"
      ? "text-amber-500"
      : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app px-3 py-2.5">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}
