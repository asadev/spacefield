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

const LS_KEY = "solutions:pirate-metrics-tracker:v1";
const NAMESPACE = "pirate-metrics";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

type Stage = "acquisition" | "activation" | "retention" | "referral" | "revenue";
type ViewKey = "funnel" | "cohorts" | "trends";

const STAGES: { key: Stage; label: string; letter: string; hint: string }[] = [
  { key: "acquisition", label: "Acquisition", letter: "A", hint: "Visitors, signups" },
  { key: "activation", label: "Activation", letter: "A", hint: "First valuable action" },
  { key: "retention", label: "Retention", letter: "R", hint: "Came back W2+" },
  { key: "referral", label: "Referral", letter: "R", hint: "Invited >=1 friend" },
  { key: "revenue", label: "Revenue", letter: "R", hint: "Paid customers" },
];

// SaaS benchmarks for conversion rates between stages — Mixpanel Product Benchmarks 2024, OpenView 2024.
const CONVERSION_BENCH: Record<string, { range: string; median: number; great: number }> = {
  "Visitor -> Signup": { range: "2-5%", median: 3, great: 5 },
  "Signup -> Activation": { range: "20-40%", median: 30, great: 40 },
  "Activation -> Retention": { range: "60-85%", median: 72, great: 85 },
  "Activation -> Referral": { range: "10-20%", median: 15, great: 20 },
  "Free -> Paid": { range: "2-5%", median: 3, great: 5 },
};

interface MonthEntry {
  id: string;
  month: string; // YYYY-MM
  values: Record<Stage, number>;
}

interface State {
  entries: MonthEntry[];
  goals?: Record<Stage, number>;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultState(): State {
  return {
    entries: [
      {
        id: uid(),
        month: currentMonth(),
        values: {
          acquisition: 10000,
          activation: 3500,
          retention: 1800,
          referral: 400,
          revenue: 600,
        },
      },
    ],
  };
}

export default function PirateMetricsPage() {
  return (
    <ToolShell
      category="Growth & Strategy"
      title="Pirate Metrics Tracker (AARRR)"
      description="Track Acquisition -> Activation -> Retention -> Referral -> Revenue monthly with conversion rates and stage trends."
    >
      <PirateInner />
    </ToolShell>
  );
}

function PirateInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("funnel");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<State>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        if (data && Array.isArray(data.entries)) setState(data);
        else setState(defaultState());
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as State;
            if (parsed && Array.isArray(parsed.entries)) setState(parsed);
            else setState(defaultState());
          } else setState(defaultState());
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

  const addMonth = () => {
    const last = state.entries[state.entries.length - 1];
    setState((s) => ({
      ...s,
      entries: [
        ...s.entries,
        {
          id: uid(),
          month: nextMonthStr(last?.month ?? currentMonth()),
          values: last
            ? { ...last.values }
            : { acquisition: 0, activation: 0, retention: 0, referral: 0, revenue: 0 },
        },
      ],
    }));
  };

  const updateEntry = (id: string, patch: Partial<MonthEntry>) =>
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));

  const updateValue = (id: string, stage: Stage, v: number) =>
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, values: { ...e.values, [stage]: v } } : e
      ),
    }));

  const removeEntry = (id: string) =>
    setState((s) => ({
      ...s,
      entries: s.entries.filter((e) => e.id !== id),
    }));

  const sorted = useMemo(
    () => [...state.entries].sort((a, b) => a.month.localeCompare(b.month)),
    [state.entries]
  );

  const latest = sorted[sorted.length - 1];

  const conversions = useMemo(() => {
    if (!latest) return [];
    const v = latest.values;
    return [
      { label: "Acq -> Act", rate: rate(v.activation, v.acquisition) },
      { label: "Act -> Ret", rate: rate(v.retention, v.activation) },
      { label: "Ret -> Ref", rate: rate(v.referral, v.retention) },
      { label: "Ret -> Rev", rate: rate(v.revenue, v.retention) },
    ];
  }, [latest]);

  const trend = (stage: Stage) => {
    if (sorted.length < 2) return 0;
    const last = sorted[sorted.length - 1].values[stage];
    const prev = sorted[sorted.length - 2].values[stage];
    return rate(last - prev, prev);
  };

  const maxByStage = (stage: Stage) =>
    Math.max(1, ...sorted.map((e) => e.values[stage]));

  // Funnel ribbon dimensions — taper from 100% at acquisition down to revenue's share.
  const funnelRows = STAGES.map((s, i) => {
    const v = latest?.values[s.key] ?? 0;
    const top = latest?.values.acquisition || 1;
    const prevKey = i > 0 ? STAGES[i - 1].key : null;
    const prev = prevKey ? latest?.values[prevKey] ?? 0 : v;
    const widthPct = Math.max(6, Math.min(100, (v / top) * 100));
    const stageConv = i === 0 ? 1 : prev > 0 ? v / prev : 0;
    // Opacity ramp: each subsequent stage gets a stronger fill
    const opacity = 0.35 + i * 0.13;
    return { stage: s, value: v, widthPct, stageConv, opacity };
  });

  const totalRevenue = latest?.values.revenue ?? 0;
  const activationPct = latest
    ? rate(latest.values.activation, latest.values.acquisition) * 100
    : 0;
  const overallDropoff =
    latest && latest.values.acquisition > 0
      ? ((latest.values.acquisition - latest.values.revenue) /
          latest.values.acquisition) *
        100
      : 0;

  return (
    <div data-tool-theme="growth" data-tool="pirate-metrics-tracker">
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome strip */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            AARRR
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {sorted.length} mo
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            pirate.funnel
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {latest?.month ?? "—"}.metrics
            </span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing
              ? "saving..."
              : syncedAt
              ? `saved ${syncedAt}`
              : current.kind === "team"
              ? "team"
              : "personal"}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Pirate metrics · Dave McClure
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  acq · act · ret · ref · rev
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {sorted.length} mo
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-mono text-4xl font-bold tabular-nums text-app md:text-5xl">
                  {latest ? totalRevenue.toLocaleString() : "0"}
                </span>
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  revenue {latest?.month ?? ""}
                </span>
              </div>
            </div>

            {/* conversion chip cluster */}
            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Activation
                </div>
                <div className="font-mono text-lg font-bold tabular-nums text-tool-accent">
                  {activationPct.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Drop-off
                </div>
                <div className="text-sm font-semibold text-app">
                  {overallDropoff.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* segmented pills + actions */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "funnel", label: "Funnel" },
                { k: "cohorts", label: "Cohorts" },
                { k: "trends", label: "Trends" },
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

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={addMonth}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + Month
            </button>
          </div>
        </div>
      </section>

      {/* ============================== STAGE STAT STRIP ============================== */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGES.map((s) => (
          <Stat
            key={s.key}
            label={s.label}
            value={latest ? latest.values[s.key].toLocaleString() : "0"}
            accent={s.key === "revenue"}
          />
        ))}
      </div>

      {/* ============================== FUNNEL VIEW ============================== */}
      {view === "funnel" && latest && (
        <div className="mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              Funnel · {latest.month}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              tapered ribbon
            </div>
          </div>

          <div className="p-5">
            <div className="mx-auto max-w-3xl space-y-1">
              {funnelRows.map((row, i) => (
                <div key={row.stage.key}>
                  {/* Conversion arrow between stages */}
                  {i > 0 && (
                    <div className="relative my-1 flex items-center justify-center">
                      <div className="flex items-center gap-2 rounded-full border border-tool-accent bg-tool-accent-soft px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                        <span className="text-[0.65rem] font-semibold tabular-nums">
                          {(row.stageConv * 100).toFixed(1)}%
                        </span>
                        <span aria-hidden>↓</span>
                      </div>
                    </div>
                  )}

                  {/* Ribbon-bar with opacity ramp per stage */}
                  <div
                    className="mx-auto flex items-center justify-center"
                    style={{ width: `${row.widthPct}%`, minWidth: "10rem" }}
                  >
                    <div
                      className="relative flex h-12 w-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-tool-accent px-4"
                      style={{
                        backgroundColor: "var(--tool-accent)",
                        opacity: row.opacity,
                      }}
                      title={`${row.stage.label}: ${row.value.toLocaleString()}`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 w-1 bg-tool-accent"
                        style={{ opacity: 1 }}
                      />
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-base font-black" style={{ color: "var(--bg)" }}>
                          {row.stage.letter}
                        </span>
                        <span
                          className="font-mono text-[0.65rem] uppercase tracking-[0.18em]"
                          style={{ color: "var(--bg)" }}
                        >
                          {row.stage.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span
                          className="rounded-full bg-app px-2 py-0.5 font-mono text-[0.65rem] font-semibold tabular-nums text-tool-accent"
                        >
                          {row.widthPct.toFixed(0)}%
                        </span>
                        <span
                          className="font-mono text-xs font-semibold tabular-nums"
                          style={{ color: "var(--bg)" }}
                        >
                          {row.value.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {conversions.map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border border-app bg-app p-3"
                >
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    {c.label}
                  </div>
                  <div className="mt-1 font-mono text-base font-semibold tabular-nums text-tool-accent">
                    {(c.rate * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================== COHORTS / MONTHLY ENTRIES ============================== */}
      {view === "cohorts" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              Monthly entries
            </div>
            <button
              onClick={addMonth}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            >
              + Month
            </button>
          </div>

          <div className="space-y-3">
            {sorted.map((e) => (
              <ToolCard key={e.id}>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <input
                    type="month"
                    value={e.month}
                    onChange={(ev) => updateEntry(e.id, { month: ev.target.value })}
                    className={inputCls("w-40")}
                  />
                  <button
                    onClick={() => removeEntry(e.id)}
                    className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {STAGES.map((s) => (
                    <Field key={s.key} label={s.label} hint={s.hint}>
                      <input
                        type="number"
                        value={e.values[s.key]}
                        onChange={(ev) =>
                          updateValue(e.id, s.key, Number(ev.target.value) || 0)
                        }
                        className={inputCls()}
                      />
                    </Field>
                  ))}
                </div>
              </ToolCard>
            ))}
          </div>
        </>
      )}

      {/* ============================== TRENDS VIEW ============================== */}
      {view === "trends" && (
        <>
          {sorted.length >= 2 ? (
            <>
              <div className="mb-4 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Stage-over-stage trend (latest vs previous)
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAGES.map((s) => {
                  const t = trend(s.key);
                  return (
                    <div
                      key={s.key}
                      className="rounded-lg border border-app bg-app-elevated p-3"
                    >
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                        {s.label}
                      </div>
                      <div
                        className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                          t > 0
                            ? "text-emerald-500"
                            : t < 0
                            ? "text-rose-500"
                            : "text-app"
                        }`}
                      >
                        {t > 0 ? "+" : ""}
                        {(t * 100).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="border-b border-app bg-app px-4 py-2.5 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  12-month time-series · all stages
                </div>
                <div className="space-y-2 p-4">
                  {STAGES.map((s) => {
                    const max = maxByStage(s.key);
                    return (
                      <div key={s.key}>
                        <div className="mb-0.5 flex justify-between font-mono text-[0.6rem] text-secondary">
                          <span>{s.label}</span>
                          <span className="tabular-nums">
                            {latest?.values[s.key].toLocaleString()}
                          </span>
                        </div>
                        <div className="flex h-8 items-end gap-1">
                          {sorted.slice(-12).map((e) => (
                            <div
                              key={e.id}
                              className="flex-1 rounded-t bg-tool-accent"
                              style={{
                                height: `${(e.values[s.key] / max) * 100}%`,
                                opacity: s.key === "revenue" ? 0.85 : 0.5,
                              }}
                              title={`${e.month}: ${e.values[s.key].toLocaleString()}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
              Add at least two months to see trends.
            </div>
          )}
        </>
      )}

      {/* ============================== BENCHMARKS + GOALS ============================== */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ToolCard title="SaaS benchmarks" subtitle="Your conversion vs median">
          <div className="space-y-2">
            {Object.entries(CONVERSION_BENCH).map(([label, b]) => {
              // Map bench label to computed conversion
              const v = latest?.values;
              let you = 0;
              if (v) {
                if (label.startsWith("Visitor")) you = rate(v.activation, v.acquisition) * 100;
                else if (label.startsWith("Signup")) you = rate(v.activation, v.acquisition) * 100;
                else if (label.startsWith("Activation -> Retention")) you = rate(v.retention, v.activation) * 100;
                else if (label.startsWith("Activation -> Referral")) you = rate(v.referral, v.activation) * 100;
                else if (label.startsWith("Free")) you = rate(v.revenue, v.activation) * 100;
              }
              return (
                <div key={label} className="rounded-lg border border-app bg-app p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-secondary">{label}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        you >= b.median
                          ? "text-emerald-500"
                          : you >= b.median * 0.7
                          ? "text-amber-500"
                          : "text-rose-500"
                      }`}
                    >
                      {you.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[0.6rem] text-muted">
                    <span>bench {b.range}</span>
                    <div className="relative h-1 flex-1 overflow-hidden rounded bg-app-elevated">
                      <div
                        className="absolute inset-y-0 bg-tool-accent-soft"
                        style={{ width: `${(b.median / b.great) * 100}%` }}
                      />
                      <div
                        className="absolute -top-0.5 h-2 w-0.5 bg-tool-accent"
                        style={{ left: `${Math.min(100, (you / b.great) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[0.6rem] text-faint">
            Source: Mixpanel Product Benchmarks 2024, OpenView SaaS 2024.
          </p>
        </ToolCard>

        <ToolCard title="Goals per stage" subtitle="Set targets, track progress">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const goal = state.goals?.[s.key] ?? 0;
              const actual = latest?.values[s.key] ?? 0;
              const pct = goal > 0 ? (actual / goal) * 100 : 0;
              return (
                <div key={s.key} className="rounded-lg border border-app bg-app p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-24 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-secondary">
                      {s.label}
                    </span>
                    <input
                      type="number"
                      value={goal || ""}
                      placeholder="Goal"
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        setState((st) => ({
                          ...st,
                          goals: {
                            ...(st.goals ?? {
                              acquisition: 0,
                              activation: 0,
                              retention: 0,
                              referral: 0,
                              revenue: 0,
                            }),
                            [s.key]: v,
                          },
                        }));
                      }}
                      className={inputCls("!py-1 text-xs")}
                    />
                    <span
                      className={`w-14 text-right font-mono text-xs font-semibold tabular-nums ${
                        pct >= 100
                          ? "text-emerald-500"
                          : pct >= 70
                          ? "text-amber-500"
                          : "text-muted"
                      }`}
                    >
                      {goal > 0 ? `${pct.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  {goal > 0 && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-app-elevated">
                      <div
                        className="h-full bg-tool-accent"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          opacity: pct >= 100 ? 1 : 0.7,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ToolCard>
      </div>
    </div>
  );
}

function rate(num: number, denom: number): number {
  if (!denom) return 0;
  return num / denom;
}

function nextMonthStr(m: string): string {
  const [y, mo] = m.split("-").map((x) => parseInt(x, 10));
  const d = new Date(y, (mo || 1) - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
