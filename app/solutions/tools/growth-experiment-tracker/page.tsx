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

const LS_KEY = "solutions:growth-experiment-tracker:v1";
const NAMESPACE = "growth-experiments";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

type Status = "proposed" | "running" | "done";
type Result = "win" | "lose" | "inconclusive" | "";
type ViewKey = "backlog" | "running" | "done" | "insights";

interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  impact: number; // 1-10
  confidence: number; // 1-10
  ease: number; // 1-10
  status: Status;
  result: Result;
  learnings: string;
  owner: string;
  createdAt: string;
}

interface IceWeights {
  impact: number;
  confidence: number;
  ease: number;
}

interface State {
  experiments: Experiment[];
  weights?: IceWeights;
}

const DEFAULT_WEIGHTS: IceWeights = { impact: 1, confidence: 1, ease: 1 };

const WEIGHT_PRESETS: Record<string, { label: string; weights: IceWeights; note: string }> = {
  balanced: { label: "Balanced", weights: { impact: 1, confidence: 1, ease: 1 }, note: "Default ICE." },
  "conviction-led": {
    label: "Conviction-led",
    weights: { impact: 1.2, confidence: 1, ease: 1 },
    note: "Impact × 1.2. Teams with strong hypothesis/strategy culture.",
  },
  "data-led": {
    label: "Data-led",
    weights: { impact: 1, confidence: 1.3, ease: 1 },
    note: "Confidence × 1.3. Rewards well-evidenced bets; avoids wishful thinking.",
  },
  "velocity-led": {
    label: "Velocity-led",
    weights: { impact: 1, confidence: 1, ease: 1.2 },
    note: "Ease × 1.2. Early-stage teams that need learning volume.",
  },
};

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    experiments: [
      {
        id: uid(),
        title: "Move signup above the fold",
        hypothesis:
          "Surfacing the signup CTA above the fold on /home will lift visit → signup by 15%+.",
        impact: 8,
        confidence: 6,
        ease: 9,
        status: "proposed",
        result: "",
        learnings: "",
        owner: "Growth",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function ice(e: Experiment, w: IceWeights = DEFAULT_WEIGHTS): number {
  return (e.impact * w.impact * e.confidence * w.confidence * e.ease * w.ease) / 10;
}

export default function GrowthExperimentTrackerPage() {
  return (
    <ToolShell
      category="Growth & Strategy"
      title="Growth Experiment Tracker"
      description="ICE-prioritized growth backlog. Hypothesize, score, run, learn. Team mode shares the list across the workspace."
    >
      <ExperimentsInner />
    </ToolShell>
  );
}

function ExperimentsInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);
  const [view, setView] = useState<ViewKey>("backlog");

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
        if (data && Array.isArray(data.experiments)) setState(data);
        else setState(defaultState());
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as State;
            if (parsed && Array.isArray(parsed.experiments)) setState(parsed);
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

  const add = () =>
    setState((s) => ({
      ...s,
      experiments: [
        {
          id: uid(),
          title: "New experiment",
          hypothesis: "",
          impact: 5,
          confidence: 5,
          ease: 5,
          status: "proposed",
          result: "",
          learnings: "",
          owner: "",
          createdAt: new Date().toISOString(),
        },
        ...s.experiments,
      ],
    }));

  const update = (id: string, patch: Partial<Experiment>) =>
    setState((s) => ({
      ...s,
      experiments: s.experiments.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      ),
    }));

  const remove = (id: string) =>
    setState((s) => ({
      ...s,
      experiments: s.experiments.filter((e) => e.id !== id),
    }));

  const weights = state.weights ?? DEFAULT_WEIGHTS;

  const counts = useMemo(() => {
    const c = { proposed: 0, running: 0, done: 0, wins: 0, losses: 0, inconclusive: 0 };
    state.experiments.forEach((e) => {
      c[e.status]++;
      if (e.result === "win") c.wins++;
      else if (e.result === "lose") c.losses++;
      else if (e.result === "inconclusive") c.inconclusive++;
    });
    return c;
  }, [state]);

  const winRate =
    counts.done > 0
      ? state.experiments.filter((e) => e.status === "done" && e.result === "win")
          .length / counts.done
      : 0;

  const total = state.experiments.length;

  const sortedByIce = useMemo(() => {
    const list = [...state.experiments];
    list.sort((a, b) => ice(b, weights) - ice(a, weights));
    return list;
  }, [state, weights]);

  const viewList = useMemo(() => {
    if (view === "backlog") return sortedByIce.filter((e) => e.status === "proposed");
    if (view === "running") return sortedByIce.filter((e) => e.status === "running");
    if (view === "done") return sortedByIce.filter((e) => e.status === "done");
    return sortedByIce;
  }, [sortedByIce, view]);

  const viewCount =
    view === "backlog"
      ? counts.proposed
      : view === "running"
      ? counts.running
      : view === "done"
      ? counts.done
      : total;

  return (
    <div data-tool-theme="growth" data-tool="growth-experiment-tracker">
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            LAB
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            ice:{weights.impact}×{weights.confidence}×{weights.ease}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            growth.experiments
            <span className="text-faint">/</span>
            <span className="text-secondary">backlog.run</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing
              ? "◉ saving"
              : syncedAt
              ? `◉ saved ${syncedAt}`
              : current.kind === "team"
              ? "◉ team"
              : "◉ personal"}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Experiment lab · ICE-scored growth backlog
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {total} total
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {(winRate * 100).toFixed(0)}% win rate
                </span>
              </div>

              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                Hypothesize. Score. Run. Learn.
              </h1>
            </div>

            {/* score dial */}
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
                    strokeDasharray={`${(winRate * 100).toFixed(0)}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                  {(winRate * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Win rate
                </div>
                <div className="text-sm font-semibold text-app">
                  {state.experiments.filter((e) => e.status === "done" && e.result === "win").length} / {counts.done}
                </div>
              </div>
            </div>
          </div>

          {/* hero counts */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroCount label="Active" value={counts.running} tone="accent" sub="running" />
            <HeroCount label="Won" value={counts.wins} tone="win" sub={`${(winRate * 100).toFixed(0)}% win rate`} />
            <HeroCount label="Lost" value={counts.losses} tone="lose" sub="killed" />
            <HeroCount label="Backlog" value={counts.proposed} tone="muted" sub="proposed" />
          </div>
        </div>

        {/* sub-tab strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "backlog", label: `Backlog (${counts.proposed})` },
                { k: "running", label: `Running (${counts.running})` },
                { k: "done", label: `Done (${counts.done})` },
                { k: "insights", label: "Insights" },
              ] as { k: ViewKey; label: string }[]
            ).map((t) => (
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

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={add}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + New experiment
            </button>
          </div>
        </div>
      </section>

      {/* ============================== ICE WEIGHT TUNING ============================== */}
      <div className="mb-6 rounded-xl border border-app bg-app-elevated p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            ICE weight tuning
          </span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(WEIGHT_PRESETS).map(([k, p]) => (
              <button
                key={k}
                onClick={() => setState((s) => ({ ...s, weights: p.weights }))}
                title={p.note}
                className="rounded-lg border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          {(["impact", "confidence", "ease"] as const).map((k) => (
            <Field key={k} label={`${k} ×`} hint={weights[k].toFixed(2)}>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="2"
                value={weights[k]}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    weights: { ...weights, [k]: parseFloat(e.target.value) || 1 },
                  }))
                }
                className={inputCls("!py-1")}
              />
            </Field>
          ))}
        </div>
        <p className="mt-3 text-[0.6rem] text-muted">
          Conviction-led teams use Impact × 1.2. Data-led teams use Confidence × 1.3.
        </p>
      </div>

      {/* ============================== VIEW BODY ============================== */}
      {view === "insights" ? (
        <ToolCard title="Roadmap view" subtitle="Gantt-style by ICE score & status">
          <ExperimentRoadmap experiments={state.experiments} weights={weights} />
        </ToolCard>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
            <span className="text-tool-accent">▸</span>
            {view} · {viewCount} item{viewCount === 1 ? "" : "s"}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {viewList.map((e) => (
              <ExperimentCard
                key={e.id}
                exp={e}
                onChange={(p) => update(e.id, p)}
                onRemove={() => remove(e.id)}
                weights={weights}
              />
            ))}
            {viewList.length === 0 && (
              <div className="rounded-xl border border-dashed border-app bg-app p-10 text-center text-sm text-muted md:col-span-2">
                No experiments in this view.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HeroCount({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number;
  tone: "accent" | "win" | "lose" | "muted";
  sub?: string;
}) {
  const toneCls =
    tone === "accent"
      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
      : tone === "win"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : tone === "lose"
      ? "border-rose-500/35 bg-rose-500/10 text-rose-500"
      : "border-app bg-app text-secondary";
  return (
    <div className={`rounded-xl border ${toneCls} px-4 py-3`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && (
        <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] opacity-60">{sub}</div>
      )}
    </div>
  );
}

function ExperimentRoadmap({ experiments, weights }: { experiments: Experiment[]; weights: IceWeights }) {
  const ordered = [...experiments].sort((a, b) => ice(b, weights) - ice(a, weights));
  const rows = ordered.slice(0, 12).map((e) => {
    const duration = Math.max(1, Math.round((11 - e.ease) / 2 + 1));
    const start = e.status === "done" ? -duration : e.status === "running" ? 0 : 0;
    return { exp: e, start, duration };
  });
  let cursor = 0;
  for (const r of rows) {
    if (r.exp.status === "proposed") {
      r.start = cursor;
      cursor += r.duration;
    }
  }
  const weeks = 12;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[1.8fr_repeat(12,1fr)] gap-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
          <span></span>
          {Array.from({ length: weeks }, (_, i) => (
            <span key={i} className="text-center">W{i + 1}</span>
          ))}
        </div>
        <div className="mt-1 space-y-1">
          {rows.map(({ exp, start, duration }) => {
            const statusColor =
              exp.status === "done"
                ? "bg-app-elevated border-app text-secondary"
                : exp.status === "running"
                ? "bg-tool-accent-soft border-tool-accent text-tool-accent"
                : "bg-tool-accent-soft/40 border-tool-accent/40 text-tool-accent";
            return (
              <div key={exp.id} className="grid grid-cols-[1.8fr_repeat(12,1fr)] items-center gap-1 text-xs">
                <span className="truncate text-app" title={exp.title}>{exp.title}</span>
                {Array.from({ length: weeks }, (_, i) => {
                  const inRange = i >= Math.max(0, start) && i < Math.max(0, start) + duration;
                  return (
                    <div
                      key={i}
                      className={`h-5 rounded ${inRange ? `${statusColor} border` : "bg-app"}`}
                    >
                      {inRange && i === Math.max(0, start) && (
                        <span className="block truncate px-1 font-mono text-[0.55rem] leading-5">
                          {ice(exp, weights).toFixed(0)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-3 font-mono text-[0.6rem] text-muted">
          <span className="flex items-center gap-1"><div className="h-2 w-2 rounded border border-tool-accent bg-tool-accent-soft" /> Running</span>
          <span className="flex items-center gap-1"><div className="h-2 w-2 rounded bg-tool-accent-soft/40" /> Proposed</span>
          <span className="flex items-center gap-1"><div className="h-2 w-2 rounded bg-app-elevated" /> Done</span>
        </div>
      </div>
    </div>
  );
}

function ExperimentCard({
  exp,
  onChange,
  onRemove,
  weights,
}: {
  exp: Experiment;
  onChange: (p: Partial<Experiment>) => void;
  onRemove: () => void;
  weights?: IceWeights;
}) {
  const w = weights ?? DEFAULT_WEIGHTS;
  const score = ice(exp, w);
  const scoreTone =
    score >= 60
      ? "border-emerald-500/40 text-emerald-500"
      : score >= 30
      ? "border-tool-accent text-tool-accent"
      : "border-app text-secondary";

  // Display status: "proposed" | "running" | "won" | "lost" | "inconclusive"
  const displayStatus =
    exp.status === "done"
      ? exp.result === "win"
        ? "won"
        : exp.result === "lose"
        ? "lost"
        : exp.result === "inconclusive"
        ? "inconclusive"
        : "done"
      : exp.status;

  const pillTone =
    displayStatus === "running"
      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
      : displayStatus === "won"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : displayStatus === "lost"
      ? "border-rose-500/35 bg-rose-500/10 text-rose-500"
      : displayStatus === "inconclusive"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
      : displayStatus === "done"
      ? "border-app bg-app text-secondary"
      : "border-app bg-app text-muted";

  // Baseline-vs-result bars built from existing axes — no math change.
  const baselinePct = Math.max(0, Math.min(100, exp.confidence * 10));
  const resultPct = Math.max(0, Math.min(100, score));
  const lift = baselinePct > 0 ? ((resultPct - baselinePct) / baselinePct) * 100 : 0;
  const liftSign = exp.result === "lose" ? -Math.abs(lift) : exp.result === "inconclusive" ? 0 : lift;
  const liftTone =
    liftSign > 0
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : liftSign < 0
      ? "border-rose-500/35 bg-rose-500/10 text-rose-500"
      : "border-app bg-app text-secondary";
  const liftLabel = `${liftSign > 0 ? "+" : ""}${liftSign.toFixed(0)}%`;

  return (
    <div className="experiment-card relative flex flex-col rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent">
      {/* Top: title + status pill */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={exp.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full border-0 border-b border-dashed border-app bg-transparent pb-1 text-base font-semibold tracking-tight text-app outline-none transition-colors focus:border-tool-accent"
            placeholder="Experiment title"
          />
          {exp.owner && (
            <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              Owner · {exp.owner}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${pillTone}`}
        >
          {displayStatus}
        </span>
      </div>

      {/* Hypothesis */}
      <div className="mb-3">
        <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
          Hypothesis
        </div>
        <textarea
          value={exp.hypothesis}
          onChange={(e) => onChange({ hypothesis: e.target.value })}
          rows={2}
          placeholder="If we [change] then [metric] will [direction] because [reason]."
          className="w-full resize-none rounded-lg border border-app bg-app px-3 py-2 text-sm leading-snug text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent"
        />
      </div>

      {/* ICE score chip + lift chip */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className={`rounded-lg border bg-tool-accent-soft px-3 py-1.5 ${scoreTone}`}>
          <span className="font-mono text-[0.5rem] uppercase tracking-[0.2em] opacity-70">Metric · ICE</span>
          <span className="ml-2 text-base font-semibold">{score.toFixed(1)}</span>
        </div>
        <div className={`rounded-lg border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] ${liftTone}`}>
          Lift {liftLabel}
        </div>
      </div>

      {/* Baseline vs result bars */}
      <div className="mb-4 space-y-2">
        <BaselineResultBar label="Baseline" value={baselinePct} tone="muted" />
        <BaselineResultBar
          label="Result"
          value={resultPct}
          tone={
            exp.result === "win"
              ? "win"
              : exp.result === "lose"
              ? "lose"
              : exp.result === "inconclusive"
              ? "warn"
              : "accent"
          }
        />
      </div>

      {/* ICE inputs row */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(
          [
            { k: "impact", label: "Impact" },
            { k: "confidence", label: "Confidence" },
            { k: "ease", label: "Ease" },
          ] as const
        ).map(({ k, label }) => (
          <Field key={k} label={`${label} (1-10)`}>
            <input
              type="number"
              min="1"
              max="10"
              value={exp[k]}
              onChange={(e) =>
                onChange({ [k]: clamp(Number(e.target.value) || 0, 1, 10) } as Partial<Experiment>)
              }
              className={inputCls("!py-1")}
            />
          </Field>
        ))}
      </div>

      {/* Status / Result / Owner */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Field label="Status">
          <select
            value={exp.status}
            onChange={(e) => onChange({ status: e.target.value as Status })}
            className={inputCls("!py-1")}
          >
            <option value="proposed">Proposed</option>
            <option value="running">Running</option>
            <option value="done">Done</option>
          </select>
        </Field>
        <Field label="Result">
          <select
            value={exp.result}
            onChange={(e) => onChange({ result: e.target.value as Result })}
            className={inputCls("!py-1")}
          >
            <option value="">—</option>
            <option value="win">Win</option>
            <option value="lose">Lose</option>
            <option value="inconclusive">Inconclusive</option>
          </select>
        </Field>
        <Field label="Owner">
          <input
            value={exp.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
            className={inputCls("!py-1")}
          />
        </Field>
      </div>

      {(exp.status === "done" || exp.result) && (
        <div className="mb-3">
          <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            Learnings
          </div>
          <textarea
            value={exp.learnings}
            onChange={(e) => onChange({ learnings: e.target.value })}
            rows={2}
            placeholder="What did we learn? What changes next?"
            className="w-full resize-none rounded-lg border border-app bg-app px-3 py-2 text-sm leading-snug text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent"
          />
        </div>
      )}

      <div className="mt-auto flex justify-end pt-1">
        <button
          onClick={onRemove}
          className="rounded-lg border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function BaselineResultBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "win" | "lose" | "warn" | "muted";
}) {
  const fill =
    tone === "win"
      ? "bg-emerald-500"
      : tone === "lose"
      ? "bg-rose-500"
      : tone === "warn"
      ? "bg-amber-500"
      : tone === "accent"
      ? "bg-tool-accent"
      : "bg-app-elevated";
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-app bg-app">
        <div
          className={`absolute inset-y-0 left-0 ${fill} transition-[width]`}
          style={{ width: `${Math.max(0, Math.min(100, value)).toFixed(1)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[0.6rem] tabular-nums text-secondary">
        {value.toFixed(0)}
      </span>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
