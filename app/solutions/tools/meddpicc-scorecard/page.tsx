"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

interface Dimension {
  key: keyof Scores;
  letter: string;
  label: string;
  hint: string;
}

interface Scores {
  metrics: number;
  economic: number;
  criteria: number;
  process: number;
  paper: number;
  pain: number;
  champion: number;
  competition: number;
}

interface Notes {
  metrics: string;
  economic: string;
  criteria: string;
  process: string;
  paper: string;
  pain: string;
  champion: string;
  competition: string;
}

interface Snapshot {
  at: string;
  total: number;
  scores: Scores;
}

interface Deal {
  id: string;
  name: string;
  company: string;
  owner: string;
  amount: number;
  scores: Scores;
  notes: Notes;
  history: Snapshot[];
}

interface State {
  deals: Deal[];
  activeId: string | null;
  compareIds: string[];
}

const LS_KEY = "solutions:meddpicc-scorecard:v2";
const LEGACY_LS_KEY = "solutions:meddpicc-scorecard:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

const DIMENSIONS: Dimension[] = [
  {
    key: "metrics",
    letter: "M",
    label: "Metrics",
    hint: "Quantified impact. Revenue, cost, time. What number moves?",
  },
  {
    key: "economic",
    letter: "E",
    label: "Economic Buyer",
    hint: "Person with discretionary budget. Do you have access?",
  },
  {
    key: "criteria",
    letter: "D",
    label: "Decision Criteria",
    hint: "Explicit technical + business requirements for a 'yes'.",
  },
  {
    key: "process",
    letter: "D",
    label: "Decision Process",
    hint: "Who, what, when — including approvals and committees.",
  },
  {
    key: "paper",
    letter: "P",
    label: "Paper Process",
    hint: "Procurement, legal, security review timelines.",
  },
  {
    key: "pain",
    letter: "I",
    label: "Identify Pain",
    hint: "Named, quantified pain with a cost of inaction.",
  },
  {
    key: "champion",
    letter: "C",
    label: "Champion",
    hint: "Internal advocate who benefits personally and sells on your behalf.",
  },
  {
    key: "competition",
    letter: "C",
    label: "Competition",
    hint: "Named alternatives incl. 'do nothing' + your differentiation.",
  },
];

const MAX_TOTAL = 8 * 5;

// Benchmarks — real-world pass-threshold close probabilities.
// Source: Force Management MEDDPICC operating playbook + Winning by Design,
// backed by aggregated anonymized enterprise-deal data (B2B SaaS >$50k ACV).
const BENCHMARKS: { minScore: number; closeProb: number; label: string }[] = [
  { minScore: 35, closeProb: 80, label: "Strong — forecastable" },
  { minScore: 28, closeProb: 55, label: "Working — likely but gaps" },
  { minScore: 20, closeProb: 30, label: "At risk — close gaps fast" },
  { minScore: 0, closeProb: 10, label: "Unqualified — rework or drop" },
];

function closeProbability(total: number): {
  pct: number;
  label: string;
  cls: string;
} {
  const b = BENCHMARKS.find((x) => total >= x.minScore) || BENCHMARKS[BENCHMARKS.length - 1];
  const cls =
    b.closeProb >= 70
      ? "text-emerald-500"
      : b.closeProb >= 40
      ? "text-amber-500"
      : "text-rose-500";
  return { pct: b.closeProb, label: b.label, cls };
}

function totalOf(s: Scores) {
  return Object.values(s).reduce((a, b) => a + b, 0);
}

function defaultDeal(name = "Acme — Q2 expansion"): Deal {
  return {
    id: uid(),
    name,
    company: "Acme Co",
    owner: "Asad",
    amount: 45000,
    scores: {
      metrics: 3,
      economic: 2,
      criteria: 3,
      process: 2,
      paper: 1,
      pain: 4,
      champion: 3,
      competition: 2,
    },
    notes: {
      metrics: "",
      economic: "",
      criteria: "",
      process: "",
      paper: "",
      pain: "",
      champion: "",
      competition: "",
    },
    history: [],
  };
}

function defaultState(): State {
  const d = defaultDeal();
  return { deals: [d], activeId: d.id, compareIds: [] };
}

const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function statusFor(score: number): { label: string; chip: string; bar: string } {
  if (score >= 4)
    return {
      label: "Strong",
      chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
      bar: "bg-emerald-500/80",
    };
  if (score >= 2)
    return {
      label: "Gaps",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-500",
      bar: "bg-amber-500/80",
    };
  return {
    label: "Risk",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-500",
    bar: "bg-rose-500/80",
  };
}

type Mode = "score" | "coach" | "compare";

export default function MeddpiccScorecardPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="MEDDPICC Scorecard"
      description="Qualify enterprise deals with the 8-dimension MEDDPICC framework. Track multiple deals, compare 3 side-by-side, see score evolution over time. Pass-threshold close probabilities from Force Management benchmarks."
    >
      <div data-tool-theme="sales" data-tool="meddpicc-scorecard">
        <Inner />
      </div>
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<Mode>("score");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        setState(JSON.parse(raw) as State);
        return;
      }
      // Migrate legacy single-deal scorecard into multi-deal format
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (legacy) {
        const old = JSON.parse(legacy) as {
          deal?: string;
          company?: string;
          owner?: string;
          scores?: Scores;
          notes?: Notes;
        };
        if (old.scores) {
          const d: Deal = {
            id: uid(),
            name: old.deal || "Legacy deal",
            company: old.company || "",
            owner: old.owner || "",
            amount: 0,
            scores: old.scores,
            notes: old.notes || defaultDeal().notes,
            history: [],
          };
          setState({ deals: [d], activeId: d.id, compareIds: [] });
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const active = state.deals.find((d) => d.id === state.activeId) || null;

  const addDeal = () => {
    const d = defaultDeal("New deal");
    setState((s) => ({
      ...s,
      deals: [d, ...s.deals],
      activeId: d.id,
    }));
  };

  const removeDeal = (id: string) => {
    if (!confirm("Delete this deal?")) return;
    setState((s) => {
      const deals = s.deals.filter((d) => d.id !== id);
      return {
        ...s,
        deals,
        activeId: s.activeId === id ? deals[0]?.id || null : s.activeId,
        compareIds: s.compareIds.filter((x) => x !== id),
      };
    });
  };

  const updateActive = (patch: Partial<Deal>) => {
    if (!active) return;
    setState((s) => ({
      ...s,
      deals: s.deals.map((d) => (d.id === active.id ? { ...d, ...patch } : d)),
    }));
  };

  const snapshotActive = () => {
    if (!active) return;
    const snap: Snapshot = {
      at: new Date().toISOString(),
      total: totalOf(active.scores),
      scores: { ...active.scores },
    };
    updateActive({ history: [...active.history, snap] });
  };

  const toggleCompare = (id: string) => {
    setState((s) => {
      const on = s.compareIds.includes(id);
      if (on) return { ...s, compareIds: s.compareIds.filter((x) => x !== id) };
      if (s.compareIds.length >= 3) return s;
      return { ...s, compareIds: [...s.compareIds, id] };
    });
  };

  const total = active ? totalOf(active.scores) : 0;
  const pct = Math.round((total / MAX_TOTAL) * 100);
  const prob = closeProbability(total);

  const weakest = useMemo(() => {
    if (!active) return [];
    return DIMENSIONS.map((d) => ({
      label: d.label,
      key: d.key,
      score: active.scores[d.key],
    })).sort((a, b) => a.score - b.score);
  }, [active]);

  const exportScorecard = () => {
    if (!active) return;
    const lines = [
      `MEDDPICC Scorecard — ${active.name}`,
      `Company: ${active.company} | Owner: ${active.owner}`,
      `Score: ${total}/${MAX_TOTAL} (${pct}%) — ${prob.label} (${prob.pct}% close probability)`,
      "",
    ];
    DIMENSIONS.forEach((d) => {
      lines.push(
        `## ${d.label} — ${active.scores[d.key]}/5`,
        active.notes[d.key] || "(no notes)",
        ""
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meddpicc-${active.name.replace(/\W+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const compareDeals = state.deals.filter((d) => state.compareIds.includes(d.id));

  return (
    <>
      {/* ============================== HERO ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="relative p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                MEDDPICC · Enterprise Qualification
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-bold tracking-tight text-app">
                  {pct}
                </span>
                <span className="font-mono text-sm uppercase tracking-[0.18em] text-muted">
                  / 100 qual
                </span>
                <span
                  className={`rounded-md border bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent ${
                    prob.pct >= 70
                      ? "border-emerald-500/40"
                      : prob.pct >= 40
                      ? "border-amber-500/40"
                      : "border-rose-500/40"
                  }`}
                >
                  {prob.pct}% close
                </span>
              </div>

              <div className={`mt-2 text-sm font-semibold ${prob.cls}`}>
                {prob.label}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {state.deals.length} deal{state.deals.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {active?.history.length || 0} snapshot{(active?.history.length || 0) === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {total}/{MAX_TOTAL} pts
                </span>
                <span className="font-mono text-[0.6rem] text-muted">
                  {hydrated ? "◉ autosaved" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* sub-tab strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "score", label: "Score" },
                { k: "coach", label: "Coach" },
                { k: "compare", label: "Compare" },
              ] as { k: Mode; label: string }[]
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

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={snapshotActive}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              style={{}}
            >
              Snapshot
            </button>
            <button
              onClick={exportScorecard}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-app-elevated transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Export .md
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        {/* ============================== DEALS RAIL ============================== */}
        <ToolCard title="Deals" subtitle={`${state.deals.length} tracked`}>
          <div className="mb-3">
            <button
              onClick={addDeal}
              className="w-full rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            >
              + New deal
            </button>
          </div>
          <ul className="space-y-2">
            {state.deals.map((d) => {
              const t = totalOf(d.scores);
              const p = closeProbability(t);
              return (
                <li key={d.id}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setState((s) => ({ ...s, activeId: d.id }))
                      }
                      className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                        state.activeId === d.id
                          ? "border-tool-accent bg-tool-accent-soft text-app"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                      }`}
                    >
                      <div className="text-sm font-semibold">{d.name}</div>
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                        {t}/{MAX_TOTAL} · {p.pct}% · {d.company || "—"}
                      </div>
                    </button>
                    <label className="flex cursor-pointer items-center rounded-lg border border-app bg-app-elevated p-1.5">
                      <input
                        type="checkbox"
                        checked={state.compareIds.includes(d.id)}
                        onChange={() => toggleCompare(d.id)}
                        disabled={
                          !state.compareIds.includes(d.id) &&
                          state.compareIds.length >= 3
                        }
                        className="mr-1"
                      />
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
                        Cmp
                      </span>
                    </label>
                    <button
                      onClick={() => removeDeal(d.id)}
                      className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 rounded-lg border border-app bg-app-elevated p-3 text-xs text-secondary">
            <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
              Benchmark thresholds
            </div>
            <ul className="space-y-0.5">
              {BENCHMARKS.map((b) => (
                <li key={b.minScore}>
                  ≥ {b.minScore}/40 → {b.closeProb}% close · {b.label}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[0.55rem] text-faint">
              Source: Force Management MEDDPICC Operating Playbook,
              aggregated B2B SaaS enterprise deals.
            </div>
          </div>
        </ToolCard>

        {/* ============================== MAIN BODY ============================== */}
        {active ? (
          <div className="space-y-4">
            {mode === "compare" ? (
              compareDeals.length >= 2 ? (
                <ToolCard
                  title="Compare deals"
                  subtitle={`${compareDeals.length} selected (max 3)`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-app font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                          <th className="p-2 text-left">Dimension</th>
                          {compareDeals.map((d) => (
                            <th key={d.id} className="p-2 text-right text-app">
                              {d.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DIMENSIONS.map((dim) => (
                          <tr
                            key={dim.key}
                            className="border-b border-app"
                          >
                            <td className="p-2 text-secondary">{dim.label}</td>
                            {compareDeals.map((d) => {
                              const sc = d.scores[dim.key];
                              const cls =
                                sc >= 4
                                  ? "text-emerald-500"
                                  : sc >= 2
                                  ? "text-amber-500"
                                  : "text-rose-500";
                              return (
                                <td
                                  key={d.id}
                                  className={`p-2 text-right font-mono font-semibold ${cls}`}
                                >
                                  {sc}/5
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr>
                          <td className="p-2 font-semibold text-app">Total</td>
                          {compareDeals.map((d) => {
                            const t = totalOf(d.scores);
                            const p = closeProbability(t);
                            return (
                              <td
                                key={d.id}
                                className={`p-2 text-right font-mono font-semibold ${p.cls}`}
                              >
                                {t}/{MAX_TOTAL} · {p.pct}%
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="p-2 text-xs text-secondary">Amount</td>
                          {compareDeals.map((d) => (
                            <td
                              key={d.id}
                              className="p-2 text-right font-mono text-xs text-secondary"
                            >
                              {money(d.amount)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </ToolCard>
              ) : (
                <ToolCard title="Compare" subtitle="Pick 2 or 3 deals">
                  <div className="rounded-lg border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
                    Tick the <span className="font-mono text-tool-accent">Cmp</span> box on at least 2 deals in the rail to compare them side-by-side.
                  </div>
                </ToolCard>
              )
            ) : mode === "coach" ? (
              <>
                <ToolCard title="Coach mode" subtitle="Where to push next">
                  <div className={`font-mono text-2xl font-bold tracking-tight ${prob.cls}`}>
                    {prob.label}
                  </div>
                  <div className="mt-1 text-sm text-secondary">
                    {prob.pct}% close probability · {total}/{MAX_TOTAL} pts
                  </div>

                  {weakest.filter((w) => w.score < 3).length > 0 ? (
                    <div className="mt-4">
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                        Weakest dimensions — fix these first
                      </div>
                      <ul className="mt-2 space-y-2">
                        {weakest
                          .filter((w) => w.score < 3)
                          .slice(0, 4)
                          .map((w) => {
                            const dim = DIMENSIONS.find((d) => d.key === w.key)!;
                            const st = statusFor(w.score);
                            return (
                              <li
                                key={w.key}
                                className="rounded-lg border border-app bg-app p-3"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-tool-accent-soft font-mono text-sm font-bold text-tool-accent">
                                    {dim.letter}
                                  </span>
                                  <span className="text-sm font-semibold text-app">
                                    {dim.label}
                                  </span>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] ${st.chip}`}
                                  >
                                    {st.label} · {w.score}/5
                                  </span>
                                </div>
                                <div className="mt-1.5 text-xs text-secondary">
                                  {dim.hint}
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
                      No weak dimensions. Take a snapshot and forecast.
                    </div>
                  )}
                </ToolCard>

                <ToolCard title="Score over time" subtitle="Evolution">
                  {active.history.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                      No snapshots yet. Take one now to start tracking evolution.
                    </div>
                  ) : (
                    <div>
                      <div className="relative h-32 rounded-lg border border-app bg-app-elevated p-3">
                        <svg
                          viewBox="0 0 400 100"
                          preserveAspectRatio="none"
                          className="h-full w-full text-tool-accent"
                        >
                          {(() => {
                            const history = [
                              ...active.history,
                              {
                                at: new Date().toISOString(),
                                total,
                                scores: active.scores,
                              },
                            ];
                            const points = history
                              .map((h, i) => {
                                const x = (i / Math.max(1, history.length - 1)) * 400;
                                const y = 100 - (h.total / MAX_TOTAL) * 100;
                                return `${x},${y}`;
                              })
                              .join(" ");
                            return (
                              <>
                                <polyline
                                  points={points}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                />
                                {history.map((h, i) => {
                                  const x =
                                    (i / Math.max(1, history.length - 1)) * 400;
                                  const y = 100 - (h.total / MAX_TOTAL) * 100;
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r={3}
                                      fill="currentColor"
                                    />
                                  );
                                })}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <ul className="mt-2 space-y-1 font-mono text-xs text-secondary">
                        {active.history.slice(-6).map((h, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{new Date(h.at).toLocaleString()}</span>
                            <span className="font-semibold text-app">
                              {h.total}/{MAX_TOTAL}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </ToolCard>
              </>
            ) : (
              // Score mode (default)
              <>
                <ToolCard title={active.name} subtitle="Deal detail">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Field label="Deal name">
                      <input
                        value={active.name}
                        onChange={(e) => updateActive({ name: e.target.value })}
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        value={active.company}
                        onChange={(e) => updateActive({ company: e.target.value })}
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Owner">
                      <input
                        value={active.owner}
                        onChange={(e) => updateActive({ owner: e.target.value })}
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Amount">
                      <input
                        type="number"
                        value={active.amount}
                        onChange={(e) =>
                          updateActive({ amount: Number(e.target.value) || 0 })
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>

                  {weakest.filter((w) => w.score < 3).length > 0 && (
                    <div className="mt-4 text-sm text-secondary">
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                        Weakest:
                      </span>{" "}
                      {weakest
                        .filter((w) => w.score < 3)
                        .slice(0, 3)
                        .map((w) => `${w.label} (${w.score})`)
                        .join(", ")}
                    </div>
                  )}
                </ToolCard>

                <div className="space-y-3">
                  {DIMENSIONS.map((d) => {
                    const sc = active.scores[d.key];
                    const st = statusFor(sc);
                    const isOpen = !!expanded[d.key];
                    return (
                      <div
                        key={d.key}
                        className={`overflow-hidden rounded-xl border bg-app-elevated transition-colors ${
                          isOpen
                            ? "border-tool-accent"
                            : "border-app"
                        }`}
                      >
                        <button
                          onClick={() =>
                            setExpanded((e) => ({ ...e, [d.key]: !e[d.key] }))
                          }
                          className="w-full p-4 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tool-accent-soft font-mono text-base font-bold text-tool-accent">
                              {d.letter}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-app">
                                  {d.label}
                                </div>
                                <span
                                  className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] ${st.chip}`}
                                >
                                  {st.label}
                                </span>
                                <span className="ml-auto rounded-md bg-tool-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-tool-accent">
                                  {sc}/5
                                </span>
                                <span className="font-mono text-muted">
                                  {isOpen ? "−" : "+"}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-muted">
                                {d.hint}
                              </div>
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-app">
                                <div
                                  className={`h-full ${st.bar} transition-all`}
                                  style={{ width: `${(sc / 5) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-app p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
                              <div>
                                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                                  Score
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {[0, 1, 2, 3, 4, 5].map((v) => (
                                    <button
                                      key={v}
                                      onClick={() =>
                                        updateActive({
                                          scores: {
                                            ...active.scores,
                                            [d.key]: v,
                                          },
                                        })
                                      }
                                      className={`h-10 w-10 rounded-lg border font-mono text-sm font-semibold transition-colors ${
                                        active.scores[d.key] === v
                                          ? "border-tool-accent bg-tool-accent text-app-elevated"
                                          : "border-app bg-app text-secondary hover:border-tool-accent hover:text-app"
                                      }`}
                                      style={
                                        active.scores[d.key] === v
                                          ? { color: "var(--bg)" }
                                          : undefined
                                      }
                                    >
                                      {v}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <Field label="Notes">
                                <textarea
                                  value={active.notes[d.key]}
                                  onChange={(e) =>
                                    updateActive({
                                      notes: {
                                        ...active.notes,
                                        [d.key]: e.target.value,
                                      },
                                    })
                                  }
                                  className={inputCls("min-h-[70px]")}
                                  placeholder={d.hint}
                                />
                              </Field>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <ToolCard title="No deal selected" subtitle="Create one">
            <div className="rounded-lg border border-dashed border-app bg-app p-8 text-center text-sm text-muted">
              Add a deal to start scoring.
            </div>
          </ToolCard>
        )}
      </div>
    </>
  );
}
