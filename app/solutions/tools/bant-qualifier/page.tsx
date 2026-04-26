"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Answer = 0 | 1 | 2 | 3; // 0=unknown, 1=low, 2=mid, 3=high

interface Lead {
  id: string;
  name: string;
  company: string;
  budget: Answer;
  authority: Answer;
  need: Answer;
  timeline: Answer;
  notes: string;
}

interface State {
  leads: Lead[];
}

const LS_KEY = "solutions:bant-qualifier:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const LABELS: Record<Answer, string> = {
  0: "Unknown",
  1: "Low",
  2: "Mid",
  3: "High",
};

// Per-step badge tones. Disqualifier (low) keeps semantic rose tone.
const BADGE: Record<Answer, string> = {
  0: "bg-app-elevated text-muted",
  1: "bg-rose-500/15 text-rose-500",
  2: "bg-amber-500/15 text-amber-500",
  3: "bg-emerald-500/15 text-emerald-500",
};

function score(l: Lead) {
  return l.budget + l.authority + l.need + l.timeline;
}

function verdict(l: Lead) {
  const s = score(l);
  if (s >= 10) return { label: "Qualified", cls: "text-emerald-500" };
  if (s >= 7) return { label: "Nurture", cls: "text-amber-500" };
  return { label: "Disqualified", cls: "text-rose-500" };
}

// Verdict banner palette — qualified leans tool-accent,
// nurture is amber, disqualified rose-muted (semantic).
function verdictBanner(l: Lead): {
  label: string;
  hint: string;
  wrap: string;
  pill: string;
} {
  const s = score(l);
  if (s >= 10) {
    return {
      label: "Qualified",
      hint: "Move to demo / proposal track.",
      wrap: "border-tool-accent bg-tool-accent-soft",
      pill: "bg-tool-accent-soft text-tool-accent border-tool-accent",
    };
  }
  if (s >= 7) {
    return {
      label: "Nurture",
      hint: "Keep warm — gaps in BANT signal.",
      wrap: "border-amber-500/30 bg-amber-500/10",
      pill: "bg-amber-500/15 text-amber-500 border-amber-500/40",
    };
  }
  return {
    label: "Not qualified",
    hint: "Disqualify or revisit later.",
    wrap: "border-rose-500/30 bg-rose-500/10",
    pill: "bg-rose-500/15 text-rose-500 border-rose-500/40",
  };
}

// Auto-tags based on BANT profile. Returns array of tags to display.
function autoTags(l: Lead): string[] {
  const s = score(l);
  const tags: string[] = [];
  if (s >= 11) tags.push("hot");
  else if (s >= 9) tags.push("warm");
  if (l.budget === 3 && l.authority === 3) tags.push("fast-track");
  if (l.timeline === 3) tags.push("urgent");
  if (l.need === 3 && l.budget <= 1) tags.push("ROI-sell");
  if (l.authority <= 1 && l.need >= 2) tags.push("find-champion");
  if (l.budget === 0 && l.authority === 0) tags.push("early-stage");
  if (l.need === 3 && l.timeline === 3 && l.budget >= 2) tags.push("priority");
  return tags;
}

const TAG_CLS: Record<string, string> = {
  hot: "bg-rose-500/15 text-rose-500 border-rose-500/40",
  warm: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  "fast-track": "bg-tool-accent-soft text-tool-accent border-tool-accent",
  urgent: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  "ROI-sell": "bg-blue-500/15 text-blue-500 border-blue-500/30",
  "find-champion": "bg-teal-500/15 text-teal-500 border-teal-500/30",
  "early-stage": "bg-app-elevated text-muted border-app",
  priority: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
};

function defaultState(): State {
  return {
    leads: [
      {
        id: uid(),
        name: "Jane Doe",
        company: "Acme Co",
        budget: 2,
        authority: 3,
        need: 3,
        timeline: 2,
        notes: "Q3 project, exec sponsor confirmed.",
      },
    ],
  };
}

const DIM_GLYPH: Record<string, string> = {
  budget: "$",
  authority: "★",
  need: "!",
  timeline: "◷",
};

export default function BantQualifierPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="BANT Qualifier"
      description="Quick four-question scorecard for inbound leads — Budget, Authority, Need, Timeline. Log multiple leads, see who to work first."
    >
      <div data-tool-theme="crm" data-tool="bant-qualifier">
        <Inner />
      </div>
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const add = () => {
    setState((s) => ({
      leads: [
        {
          id: uid(),
          name: "New lead",
          company: "",
          budget: 0,
          authority: 0,
          need: 0,
          timeline: 0,
          notes: "",
        },
        ...s.leads,
      ],
    }));
  };

  const update = (id: string, patch: Partial<Lead>) =>
    setState((s) => ({
      leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));

  const remove = (id: string) =>
    setState((s) => ({ leads: s.leads.filter((l) => l.id !== id) }));

  const summary = useMemo(() => {
    const qual = state.leads.filter((l) => verdict(l).label === "Qualified").length;
    const nurt = state.leads.filter((l) => verdict(l).label === "Nurture").length;
    const disq = state.leads.filter((l) => verdict(l).label === "Disqualified").length;
    const hot = state.leads.filter((l) => autoTags(l).includes("hot")).length;
    return { qual, nurt, disq, hot };
  }, [state]);

  const DIM_LABELS: { key: keyof Lead; label: string; hint: string }[] = [
    { key: "budget", label: "Budget", hint: "Do they have funds allocated?" },
    { key: "authority", label: "Authority", hint: "Can your contact decide?" },
    { key: "need", label: "Need", hint: "Is there a quantified pain?" },
    { key: "timeline", label: "Timeline", hint: "Clear buying window?" },
  ];

  return (
    <>
      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            BANT
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {state.leads.length} lead{state.leads.length === 1 ? "" : "s"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            crm.qualifier
            <span className="text-faint">/</span>
            <span className="text-secondary">scorecard.bant</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ autosaved" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
            Inbound lead scorecard · Budget · Authority · Need · Timeline
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
            Who do you work first?
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            Score each dimension 0–3. Total ≥ 10 qualifies, 7–9 nurtures, below disqualifies. Auto-tags surface playbook signals.
          </p>
        </div>
      </section>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Leads" value={String(state.leads.length)} accent />
        <Stat label="Hot (auto-tag)" value={String(summary.hot)} />
        <Stat label="Qualified" value={String(summary.qual)} />
        <Stat label="Nurture" value={String(summary.nurt)} />
        <Stat label="Disqualified" value={String(summary.disq)} />
      </div>

      {/* Auto-tagging legend */}
      <div className="mb-4 rounded-xl border border-app bg-app-elevated p-3 text-xs text-secondary">
        <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
          Auto-tagging legend
        </div>
        <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
          <div><strong className="text-rose-500">hot</strong> — BANT &ge; 11/12</div>
          <div><strong className="text-amber-500">warm</strong> — BANT &ge; 9</div>
          <div><strong className="text-tool-accent">fast-track</strong> — full Budget + Authority</div>
          <div><strong className="text-orange-500">urgent</strong> — Timeline high</div>
          <div><strong className="text-blue-500">ROI-sell</strong> — high Need, low Budget</div>
          <div><strong className="text-teal-500">find-champion</strong> — high Need, no Authority</div>
          <div><strong className="text-muted">early-stage</strong> — no Budget or Authority signal</div>
          <div><strong className="text-emerald-500">priority</strong> — Need + Timeline + Budget aligned</div>
        </div>
      </div>

      <div className="mb-5 flex justify-end">
        <button
          onClick={add}
          className="rounded-lg border border-tool-accent bg-tool-accent-soft px-4 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
        >
          + Lead
        </button>
      </div>

      <div className="space-y-4">
        {state.leads.map((l) => {
          const v = verdict(l);
          const s = score(l);
          const tags = autoTags(l);
          const banner = verdictBanner(l);
          const pct = Math.round((s / 12) * 100);
          return (
            <ToolCard
              key={l.id}
              title={l.name}
              subtitle={`${l.company || "—"} · ${s}/12 · ${v.label}`}
            >
              {/* Verdict hero — chip + large mono total score */}
              <div
                className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${banner.wrap}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] ${banner.pill}`}
                  >
                    {banner.label}
                  </span>
                  <span className="text-xs text-secondary">{banner.hint}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Total score
                    </div>
                    <div className="font-mono text-2xl font-bold tabular-nums leading-none text-tool-accent">
                      {s}
                      <span className="text-base text-faint">/12</span>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted">{pct}%</span>
                </div>
              </div>

              {/* Score progress bar */}
              <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full border border-app bg-app">
                <div
                  className="h-full bg-tool-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] ${TAG_CLS[t] || "border-app bg-app-elevated text-muted"}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Name">
                  <input
                    value={l.name}
                    onChange={(e) => update(l.id, { name: e.target.value })}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={l.company}
                    onChange={(e) => update(l.id, { company: e.target.value })}
                    className={inputCls()}
                  />
                </Field>
              </div>

              {/* 4-card scorecard — per-dimension cards */}
              <div className="mt-5">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  BANT scorecard
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {DIM_LABELS.map((d) => {
                    const val = l[d.key] as Answer;
                    const active = val > 0;
                    return (
                      <div
                        key={d.key}
                        className={`group relative rounded-xl border p-3 transition-colors ${
                          active
                            ? "border-tool-accent bg-app-elevated"
                            : "border-app bg-app-elevated hover:border-tool-accent"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[0.7rem] font-semibold ${
                                active
                                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                  : "border-app bg-app text-muted"
                              }`}
                            >
                              {DIM_GLYPH[d.key as string]}
                            </span>
                            <div className="text-sm font-medium text-app">
                              {d.label}
                            </div>
                          </div>
                          {/* score chip in tool-accent-soft */}
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] tabular-nums ${
                              active
                                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                : "border-app bg-app text-faint"
                            }`}
                          >
                            {val}/3
                          </span>
                        </div>
                        {/* question rubric row */}
                        <div className="mb-2 rounded-md bg-app-elevated px-2 py-1.5 text-[0.65rem] leading-snug text-muted">
                          {d.hint}
                        </div>
                        <div className="flex gap-1">
                          {([0, 1, 2, 3] as Answer[]).map((vv) => (
                            <button
                              key={vv}
                              onClick={() =>
                                update(l.id, { [d.key]: vv } as Partial<Lead>)
                              }
                              className={`flex-1 rounded-md border px-1.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.12em] transition-colors ${
                                val === vv
                                  ? `${BADGE[vv]} border-current`
                                  : "border-app bg-app text-muted hover:border-tool-accent hover:text-app"
                              }`}
                            >
                              {LABELS[vv]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Disqualifier signals — keep semantic rose tone */}
              {s < 7 && (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-rose-500">
                    Disqualifier signals
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-secondary">
                    {l.budget <= 1 && <li>Budget unverified or missing.</li>}
                    {l.authority <= 1 && <li>No confirmed decision-maker.</li>}
                    {l.need <= 1 && <li>Need not quantified.</li>}
                    {l.timeline <= 1 && <li>No buying window.</li>}
                  </ul>
                </div>
              )}

              <div className="mt-4">
                <Field label="Notes">
                  <textarea
                    value={l.notes}
                    onChange={(e) => update(l.id, { notes: e.target.value })}
                    className={inputCls("min-h-[60px]")}
                  />
                </Field>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-app pt-3">
                <div className={`text-sm font-semibold ${v.cls}`}>
                  {v.label}
                </div>
                <button
                  onClick={() => remove(l.id)}
                  className="rounded-lg border border-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  Delete
                </button>
              </div>
            </ToolCard>
          );
        })}
      </div>
    </>
  );
}
