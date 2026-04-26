"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

const LS_KEY = "solutions:north-star-metric-builder:v1";
const MODE_LS_KEY = "solutions:north-star-metric-builder:mode:v1";

// Real-world north-star metrics — Amplitude's North Star Playbook, a16z notes 2024.
const COMPANY_NSMS: Array<{ company: string; nsm: string; why: string }> = [
  { company: "Spotify", nsm: "Time spent listening", why: "Engaged listeners retain and upgrade to Premium." },
  { company: "Airbnb", nsm: "Nights booked", why: "Captures demand + supply match + repeat." },
  { company: "Facebook", nsm: "Daily active users (DAU)", why: "Daily habit = ad inventory = revenue." },
  { company: "Amazon", nsm: "Purchases per Prime member", why: "Prime loyalty × basket depth = LTV." },
  { company: "Slack", nsm: "Paid teams sending 2,000+ messages", why: "Activation threshold that predicts retention." },
  { company: "Netflix", nsm: "Hours streamed per subscriber", why: "Engagement drives retention in sub business." },
  { company: "Uber", nsm: "Weekly rides", why: "Rider habit + driver utilization in one metric." },
  { company: "Notion", nsm: "Weekly active team workspaces", why: "Teams > solo users for expansion." },
  { company: "Duolingo", nsm: "Daily active users streak", why: "Habit/streak → retention → subscription conversion." },
  { company: "Miro", nsm: "Weekly active collaborators", why: "Collab > viewers for enterprise expansion." },
];

// NSM quality criteria — Sean Ellis / Amplitude framework
const NSM_CRITERIA: Array<{ key: string; label: string; hint: string }> = [
  { key: "value", label: "Reflects core value delivered", hint: "Measures the moment users get value, not vanity." },
  { key: "revenue", label: "Leads revenue", hint: "Movement in this metric precedes revenue movement." },
  { key: "actionable", label: "Actionable by the team", hint: "Teams can directly influence it through work." },
  { key: "measurable", label: "Cleanly measurable", hint: "Unambiguous definition; no debate over numerator/denominator." },
  { key: "single", label: "Single number", hint: "One metric, not a basket. Forces tradeoffs." },
];

interface Component {
  id: string;
  label: string;
  weight: number;
  type: "users" | "frequency" | "depth" | "retention" | "conversion";
}

interface Week {
  id: string;
  weekStart: string; // YYYY-MM-DD
  target: number;
  actual: number;
  revenue?: number;
}

interface State {
  name: string;
  definition: string;
  unit: string;
  cadence: "weekly" | "monthly";
  components: Component[];
  weeks: Week[];
  criteria: Record<string, boolean>;
}

type ViewKey = "build" | "validate" | "track";

const TYPE_ICON: Record<Component["type"], string> = {
  users: "◉",
  frequency: "↻",
  depth: "▤",
  retention: "⟲",
  conversion: "→",
};

const uid = () => Math.random().toString(36).slice(2, 9);

function thisWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function defaultState(): State {
  return {
    name: "Weekly Active Teams",
    definition: "Teams that logged a session and completed ≥1 key action in the past 7 days.",
    unit: "teams",
    cadence: "weekly",
    components: [
      { id: uid(), label: "Weekly active users", weight: 1, type: "users" },
      { id: uid(), label: "Sessions per user", weight: 1, type: "frequency" },
      { id: uid(), label: "Actions per session", weight: 1, type: "depth" },
    ],
    weeks: [
      {
        id: uid(),
        weekStart: thisWeekStart(),
        target: 1000,
        actual: 850,
        revenue: 42000,
      },
    ],
    criteria: {
      value: true,
      revenue: false,
      actionable: true,
      measurable: true,
      single: true,
    },
  };
}

export default function NorthStarPage() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("build");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) setState({ ...defaultState(), ...parsed });
      }
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "build" || m === "validate" || m === "track") setView(m as ViewKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(MODE_LS_KEY, view);
    } catch {}
  }, [state, view, hydrated]);

  const sorted = useMemo(
    () => [...state.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [state.weeks]
  );

  const latest = sorted[sorted.length - 1];
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const latestVariance = latest
    ? latest.target > 0
      ? (latest.actual - latest.target) / latest.target
      : 0
    : 0;

  const trend =
    sorted.length >= 2
      ? (sorted[sorted.length - 1].actual - sorted[0].actual) /
        Math.max(1, sorted[0].actual)
      : 0;

  const wow =
    latest && previous && previous.actual > 0
      ? (latest.actual - previous.actual) / previous.actual
      : 0;

  const correlation = useMemo(() => {
    const pairs = sorted
      .filter((w) => typeof w.revenue === "number" && !isNaN(w.revenue))
      .map((w) => [w.actual, w.revenue as number]);
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
    const my = pairs.reduce((s, p) => s + p[1], 0) / n;
    let num = 0,
      dx = 0,
      dy = 0;
    for (const [x, y] of pairs) {
      num += (x - mx) * (y - my);
      dx += (x - mx) ** 2;
      dy += (y - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom > 0 ? num / denom : 0;
  }, [sorted]);

  const maxActual = Math.max(1, ...sorted.map((w) => Math.max(w.actual, w.target)));

  const criteriaScore = useMemo(() => {
    const total = NSM_CRITERIA.length;
    const passed = NSM_CRITERIA.filter((c) => state.criteria[c.key]).length;
    return { passed, total, pct: total > 0 ? (passed / total) * 100 : 0 };
  }, [state.criteria]);

  const addWeek = () => {
    const last = sorted[sorted.length - 1];
    setState((s) => ({
      ...s,
      weeks: [
        ...s.weeks,
        {
          id: uid(),
          weekStart: last ? addDays(last.weekStart, 7) : thisWeekStart(),
          target: last?.target ?? 0,
          actual: 0,
          revenue: undefined,
        },
      ],
    }));
  };

  const updateWeek = (id: string, patch: Partial<Week>) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));

  const removeWeek = (id: string) =>
    setState((s) => ({ ...s, weeks: s.weeks.filter((w) => w.id !== id) }));

  const updateComponent = (id: string, patch: Partial<Component>) =>
    setState((s) => ({
      ...s,
      components: s.components.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    }));

  const addComponent = () =>
    setState((s) => ({
      ...s,
      components: [...s.components, { id: uid(), label: "Component", weight: 1, type: "users" }],
    }));

  const removeComponent = (id: string) =>
    setState((s) => ({
      ...s,
      components: s.components.filter((c) => c.id !== id),
    }));

  const toggleCriterion = (key: string) =>
    setState((s) => ({
      ...s,
      criteria: { ...s.criteria, [key]: !s.criteria[key] },
    }));

  const fmt = (n: number) =>
    n >= 10000
      ? `${(n / 1000).toFixed(1)}k`
      : n >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <div data-tool-theme="growth" data-tool="north-star-metric-builder">
      <ToolShell
        category="Growth & Strategy"
        title="North Star Metric Builder"
        description="Define one north-star metric, break it into input drivers, track weekly actuals against targets, and see if it correlates with revenue."
      >
        {/* ============================== HERO ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              NSM
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {state.cadence}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              metric.builder
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(state.name || "untitled").toLowerCase().replace(/\s+/g, "-")}.nsm
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  North Star Metric · Formula
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {state.components.length} drivers
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {sorted.length} period{sorted.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    value={state.name}
                    onChange={(e) => setState({ ...state, name: e.target.value })}
                    placeholder="Weekly Active Teams"
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>

                {/* Assembled formula */}
                <div className="mt-4 rounded-lg border border-app bg-app px-4 py-3">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Formula
                  </div>
                  <div className="mt-1 font-mono text-base text-app md:text-lg">
                    <span className="text-tool-accent">{state.name || "NSM"}</span>
                    <span className="text-muted"> = </span>
                    {state.components.length === 0 ? (
                      <span className="text-faint italic">add drivers below</span>
                    ) : (
                      state.components.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && <span className="text-muted"> × </span>}
                          {c.weight !== 1 && (
                            <span className="text-secondary">({c.weight}) </span>
                          )}
                          <span className="text-app">{c.label || "?"}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Score chip */}
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
                      strokeDasharray={`${criteriaScore.pct}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {criteriaScore.pct.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    NSM score
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {criteriaScore.passed} / {criteriaScore.total}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "build", label: "Build" },
                  { k: "validate", label: "Validate" },
                  { k: "track", label: "Track" },
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
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                {latest ? `latest ${fmt(latest.actual)} ${state.unit}` : "no data"}
              </span>
            </div>
          </div>
        </section>

        {/* ============================== BUILD VIEW ============================== */}
        {view === "build" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
            <ToolCard title="Definition" subtitle="What you're tracking">
              <div className="space-y-4">
                <Field label="Metric name">
                  <input
                    value={state.name}
                    onChange={(e) =>
                      setState((s) => ({ ...s, name: e.target.value }))
                    }
                    className={inputCls()}
                  />
                </Field>
                <Field label="Definition">
                  <textarea
                    value={state.definition}
                    onChange={(e) =>
                      setState((s) => ({ ...s, definition: e.target.value }))
                    }
                    className={inputCls()}
                    rows={3}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Unit">
                    <input
                      value={state.unit}
                      onChange={(e) =>
                        setState((s) => ({ ...s, unit: e.target.value }))
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Cadence">
                    <select
                      value={state.cadence}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          cadence: e.target.value as State["cadence"],
                        }))
                      }
                      className={inputCls()}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                </div>
              </div>
            </ToolCard>

            <ToolCard title="Input drivers" subtitle="Decompose the metric into levers">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  {state.components.length} driver{state.components.length === 1 ? "" : "s"}
                </span>
                <button
                  onClick={addComponent}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Driver
                </button>
              </div>

              <div className="space-y-2.5">
                {state.components.map((c, idx) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-app bg-app-elevated p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent">
                          {TYPE_ICON[c.type]}
                        </span>
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                          #{idx + 1}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          value={c.label}
                          onChange={(e) =>
                            updateComponent(c.id, { label: e.target.value })
                          }
                          placeholder="Driver label"
                          className="w-full bg-transparent text-sm font-semibold text-app placeholder:text-faint outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={c.type}
                            onChange={(e) =>
                              updateComponent(c.id, {
                                type: e.target.value as Component["type"],
                              })
                            }
                            className={inputCls("text-xs")}
                          >
                            <option value="users">Users</option>
                            <option value="frequency">Frequency</option>
                            <option value="depth">Depth</option>
                            <option value="retention">Retention</option>
                            <option value="conversion">Conversion</option>
                          </select>
                          <input
                            type="number"
                            value={c.weight}
                            step="0.1"
                            onChange={(e) =>
                              updateComponent(c.id, {
                                weight: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="weight"
                            className={inputCls("text-xs")}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeComponent(c.id)}
                        className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        aria-label="Remove driver"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                {state.components.length === 0 && (
                  <div className="rounded-xl border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                    No drivers yet. Add one to start building the formula.
                  </div>
                )}
              </div>
            </ToolCard>
          </div>
        )}

        {/* ============================== VALIDATE VIEW ============================== */}
        {view === "validate" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
            <ToolCard title="NSM criteria" subtitle="Does this metric pass the bar?">
              <div className="space-y-2.5">
                {NSM_CRITERIA.map((c) => {
                  const checked = !!state.criteria[c.key];
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleCriterion(c.key)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        checked
                          ? "border-tool-accent bg-app-elevated"
                          : "border-app bg-app-elevated hover:border-tool-accent"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-sm ${
                          checked
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app text-muted"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-app">{c.label}</div>
                        <div className="mt-0.5 text-xs text-secondary">{c.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-app bg-app px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Score
                  </span>
                  <span className="font-mono text-sm font-semibold text-tool-accent">
                    {criteriaScore.passed} / {criteriaScore.total}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full border border-app bg-app-elevated">
                  <div
                    className="h-full bg-tool-accent transition-all"
                    style={{ width: `${criteriaScore.pct}%` }}
                  />
                </div>
              </div>
            </ToolCard>

            <ToolCard title="Real company NSMs" subtitle="What world-class companies track">
              <div className="space-y-2">
                {COMPANY_NSMS.map((c) => (
                  <div
                    key={c.company}
                    className="rounded-xl border border-app bg-app-elevated p-3 text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-app">{c.company}</span>
                      <button
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            name: c.nsm,
                            definition: `${c.company}-style NSM. ${c.why}`,
                          }))
                        }
                        className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                      >
                        Use
                      </button>
                    </div>
                    <div className="mt-1 font-mono text-tool-accent">{c.nsm}</div>
                    <p className="mt-1 text-secondary">{c.why}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[0.6rem] text-muted">
                Source: Amplitude North Star Playbook + founder interviews 2024.
              </p>
            </ToolCard>
          </div>
        )}

        {/* ============================== TRACK VIEW ============================== */}
        {view === "track" && (
          <div className="space-y-6">
            <ToolCard title="Tracking" subtitle="Targets vs actuals">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Latest actual"
                  value={latest ? latest.actual.toLocaleString() : "0"}
                  accent
                />
                <Stat
                  label="Latest target"
                  value={latest ? latest.target.toLocaleString() : "0"}
                />
                <Stat
                  label="Variance"
                  value={`${latestVariance >= 0 ? "+" : ""}${(
                    latestVariance * 100
                  ).toFixed(1)}%`}
                />
                <Stat
                  label="Trend"
                  value={`${trend >= 0 ? "+" : ""}${(trend * 100).toFixed(1)}%`}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat
                  label="WoW"
                  value={`${wow >= 0 ? "+" : ""}${(wow * 100).toFixed(1)}%`}
                />
                <Stat
                  label="Rev correlation"
                  value={correlation === null ? "—" : correlation.toFixed(2)}
                />
              </div>

              {correlation !== null && (
                <div className="mt-4 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 text-xs text-app">
                  Correlation with revenue: <b>{correlation.toFixed(2)}</b>
                  {correlation > 0.6
                    ? " — strong positive. This metric is a real leading indicator."
                    : correlation > 0.3
                    ? " — moderate. Directionally useful."
                    : correlation > -0.3
                    ? " — weak. Revenue moves for other reasons."
                    : " — negative. This metric is pointing the wrong way."}
                </div>
              )}

              <div className="mt-5">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Progress
                </div>
                <div className="space-y-1.5">
                  {sorted.map((w) => {
                    const a = (w.actual / maxActual) * 100;
                    const t = (w.target / maxActual) * 100;
                    const hit = w.actual >= w.target;
                    return (
                      <div key={w.id} className="flex items-center gap-3">
                        <div className="w-24 font-mono text-[0.6rem] text-muted">
                          {w.weekStart}
                        </div>
                        <div className="relative h-5 flex-1 rounded bg-app-elevated">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-tool-accent-soft"
                            style={{ width: `${t}%` }}
                          />
                          <div
                            className={`absolute inset-y-0 left-0 rounded ${
                              hit ? "bg-emerald-500/60" : "bg-rose-500/60"
                            }`}
                            style={{ width: `${a}%` }}
                          />
                        </div>
                        <div className="w-32 text-right text-xs text-secondary">
                          {w.actual.toLocaleString()} / {w.target.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Entries
                </span>
                <button
                  onClick={addWeek}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Period
                </button>
              </div>

              <div className="mt-3 overflow-auto rounded-lg border border-app">
                <table className="w-full text-xs">
                  <thead className="bg-app text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono uppercase tracking-[0.16em]">Start</th>
                      <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.16em]">Target</th>
                      <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.16em]">Actual</th>
                      <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.16em]">Revenue</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="text-app">
                    {sorted.map((w) => (
                      <tr key={w.id} className="border-t border-app">
                        <td className="px-3 py-1">
                          <input
                            type="date"
                            value={w.weekStart}
                            onChange={(e) =>
                              updateWeek(w.id, { weekStart: e.target.value })
                            }
                            className={inputCls("w-36 text-xs")}
                          />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            type="number"
                            value={w.target}
                            onChange={(e) =>
                              updateWeek(w.id, { target: Number(e.target.value) || 0 })
                            }
                            className={inputCls("w-28 text-right text-xs")}
                          />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            type="number"
                            value={w.actual}
                            onChange={(e) =>
                              updateWeek(w.id, { actual: Number(e.target.value) || 0 })
                            }
                            className={inputCls("w-28 text-right text-xs")}
                          />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            type="number"
                            value={w.revenue ?? ""}
                            onChange={(e) =>
                              updateWeek(w.id, {
                                revenue:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className={inputCls("w-28 text-right text-xs")}
                            placeholder="opt"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <button
                            onClick={() => removeWeek(w.id)}
                            className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolCard>

            <ToolCard title="Forecast to target" subtitle="When will you hit it?">
              <ForecastToTarget state={state} fmt={fmt} />
            </ToolCard>
          </div>
        )}
      </ToolShell>
    </div>
  );
}

/* ───────────────────────────── helpers ───────────────────────────── */

function ForecastToTarget({
  state,
  fmt,
}: {
  state: State;
  fmt: (n: number) => string;
}) {
  const [targetValue, setTargetValue] = useState("5000");
  const [growthPct, setGrowthPct] = useState("5");

  const latest = state.weeks[state.weeks.length - 1];
  const current = latest?.actual || 0;
  const target = parseFloat(targetValue) || 0;
  const g = (parseFloat(growthPct) || 0) / 100;

  let periods = 0;
  let projected = current;
  const points: number[] = [current];
  if (g > 0 && target > current && current > 0) {
    while (projected < target && periods < 260) {
      projected = projected * (1 + g);
      periods++;
      points.push(projected);
    }
  }

  const cadenceLabel = state.cadence === "weekly" ? "weeks" : "months";
  const eta =
    periods > 0
      ? `${periods} ${cadenceLabel}`
      : target <= current
      ? "Already hit"
      : g <= 0
      ? "Not growing"
      : "—";
  const maxPoint = Math.max(...points, target, 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Target (${state.unit})`}>
          <input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className={inputCls()}
            min="0"
          />
        </Field>
        <Field
          label={`Growth / ${state.cadence === "weekly" ? "week" : "month"} (%)`}
        >
          <input
            type="number"
            value={growthPct}
            onChange={(e) => setGrowthPct(e.target.value)}
            className={inputCls()}
            step="0.5"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Current" value={fmt(current)} />
        <Stat label="ETA to target" value={eta} accent />
      </div>
      <div className="rounded-lg border border-app bg-app-elevated p-3">
        <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
          Projected curve
        </div>
        <div className="flex h-16 items-end gap-0.5">
          {points.slice(0, 52).map((p, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-tool-accent"
              style={{
                height: `${(p / maxPoint) * 100}%`,
                opacity: 0.4 + (i / Math.max(1, points.length - 1)) * 0.6,
              }}
              title={`${state.cadence === "weekly" ? "W" : "M"}${i}: ${Math.round(
                p
              ).toLocaleString()}`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-muted">
          <span>Now</span>
          <span>Target line at {target.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
