"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Relationship = "manager" | "peer" | "direct-report" | "self";

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  manager: "Manager reviewing report",
  peer: "Peer review",
  "direct-report": "Upward (manager being reviewed)",
  self: "Self-assessment",
};

const DEFAULT_COMPETENCIES = [
  "Communication",
  "Collaboration & teamwork",
  "Ownership & accountability",
  "Technical / craft excellence",
  "Impact & results",
  "Leadership & influence",
  "Adaptability",
  "Customer focus",
];

// Role-specific competency sets, drawn from SHRM 2024 performance management
// guidance and the Korn Ferry leadership architect framework. IC weight is
// craft + collaboration; manager weight is coaching + decision-making; senior
// leader weight is strategy + org design.
type RoleLevel = "ic" | "manager" | "senior";

const COMPETENCIES_BY_ROLE: Record<RoleLevel, string[]> = {
  ic: [
    "Craft excellence",
    "Problem decomposition",
    "Collaboration & partnership",
    "Communication (written + verbal)",
    "Ownership of outcomes",
    "Learning velocity",
    "Feedback receptivity",
    "Reliability & follow-through",
  ],
  manager: [
    "Coaching & developing others",
    "Hiring & performance management",
    "Decision quality under ambiguity",
    "Prioritization & trade-offs",
    "Stakeholder communication",
    "Psychological safety & inclusion",
    "Process improvement",
    "Cross-functional influence",
  ],
  senior: [
    "Strategic thinking",
    "Org design & capacity",
    "Vision setting & narrative",
    "Executive communication",
    "Talent bench strength",
    "Capital allocation & trade-offs",
    "Board / exec stakeholder management",
    "Culture shaping",
  ],
};

const ROLE_LEVEL_LABEL: Record<RoleLevel, string> = {
  ic: "Individual contributor",
  manager: "People manager",
  senior: "Senior leader / director+",
};

const SCALE = [
  { n: 1, label: "Rarely demonstrates", anchor: "Frequently falls short of expectations." },
  { n: 2, label: "Developing", anchor: "Shows effort but inconsistent results." },
  { n: 3, label: "Meets expectations", anchor: "Reliably performs at level of role." },
  { n: 4, label: "Exceeds expectations", anchor: "Often elevates team performance." },
  { n: 5, label: "Role model", anchor: "Sets the standard others learn from." },
];

const OPEN_ENDED_BASE = [
  "What is this person doing exceptionally well?",
  "Where is the biggest opportunity for growth in the next 6 months?",
  "Describe a specific moment this person had significant impact.",
  "What is one thing they should start, stop, and continue doing?",
];

const OPEN_ENDED_BY_REL: Record<Relationship, string[]> = {
  manager: ["What support or resources would help them grow next?"],
  peer: ["How do they show up in collaboration day-to-day?"],
  "direct-report": ["Where could their management style be more effective for you?"],
  self: ["What accomplishment from this period are you proudest of, and why?"],
};

const STORAGE_KEY = "solutions.360-review-template.v1";

interface State {
  revieweeName: string;
  revieweeRole: string;
  reviewerName: string;
  relationship: Relationship;
  period: string;
  competencies: string[];
  customInput: string;
  roleLevel: RoleLevel;
  // Per-rater 1–5 ratings keyed by `${relationship}::${competency}`.
  ratings: Record<string, number>;
}

const defaultState: State = {
  revieweeName: "",
  revieweeRole: "",
  reviewerName: "",
  relationship: "peer",
  period: `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
  competencies: [...DEFAULT_COMPETENCIES],
  customInput: "",
  roleLevel: "ic",
  ratings: {},
};

const ratingKey = (rel: Relationship, comp: string) => `${rel}::${comp}`;

export default function ReviewTemplatePage() {
  const [state, setState] = useState<State>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      // Try decoding from ?cfg= first (shareable URL)
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const cfg = params.get("cfg");
        if (cfg) {
          try {
            const decoded = JSON.parse(atob(decodeURIComponent(cfg)));
            setState({ ...defaultState, ...decoded });
            setLoaded(true);
            return;
          } catch {}
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);

  const [shareCopied, setShareCopied] = useState(false);
  const copyShareUrl = async () => {
    try {
      const payload = {
        revieweeName: state.revieweeName,
        revieweeRole: state.revieweeRole,
        relationship: state.relationship,
        period: state.period,
        competencies: state.competencies,
        roleLevel: state.roleLevel,
      };
      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
      const url = `${window.location.origin}${window.location.pathname}?cfg=${encoded}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {}
  };

  const applyRoleLevel = (level: RoleLevel) => {
    setState((s) => ({
      ...s,
      roleLevel: level,
      competencies: [...COMPETENCIES_BY_ROLE[level]],
    }));
  };

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, loaded]);

  const toggleCompetency = (c: string) => {
    setState((s) => ({
      ...s,
      competencies: s.competencies.includes(c)
        ? s.competencies.filter((x) => x !== c)
        : [...s.competencies, c],
    }));
  };

  const setRating = (comp: string, n: number) => {
    setState((s) => ({
      ...s,
      ratings: { ...s.ratings, [ratingKey(s.relationship, comp)]: n },
    }));
  };

  const addCustom = () => {
    const v = state.customInput.trim();
    if (!v || state.competencies.includes(v)) return;
    setState((s) => ({ ...s, competencies: [...s.competencies, v], customInput: "" }));
  };

  const openEnded = useMemo(
    () => [...OPEN_ENDED_BASE, ...OPEN_ENDED_BY_REL[state.relationship]],
    [state.relationship]
  );

  const markdown = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# 360 Review — ${state.revieweeName || "[Reviewee]"}`);
    lines.push("");
    lines.push(`**Role:** ${state.revieweeRole || "—"}`);
    lines.push(`**Reviewer:** ${state.reviewerName || "—"} (${RELATIONSHIP_LABEL[state.relationship]})`);
    lines.push(`**Period:** ${state.period || "—"}`);
    lines.push("");
    lines.push("## Rating Scale");
    lines.push("");
    for (const s of SCALE) {
      lines.push(`- **${s.n} — ${s.label}:** ${s.anchor}`);
    }
    lines.push("");
    lines.push("## Competencies");
    lines.push("");
    for (const c of state.competencies) {
      const r = state.ratings[ratingKey(state.relationship, c)];
      lines.push(`### ${c}`);
      lines.push("");
      lines.push(`Rating (1–5): ${r ? r : "______"}`);
      lines.push("");
      lines.push("Specific example / evidence:");
      lines.push("");
      lines.push("> ");
      lines.push("");
    }
    lines.push("## Open-ended");
    lines.push("");
    for (const q of openEnded) {
      lines.push(`**${q}**`);
      lines.push("");
      lines.push("> ");
      lines.push("");
    }
    return lines.join("\n");
  }, [state, openEnded]);

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const doPrint = () => window.print();

  // Consensus dial: average of ratings across ALL raters for the currently
  // selected competencies. 0 if nothing has been rated yet.
  const consensus = useMemo(() => {
    const vals: number[] = [];
    for (const c of state.competencies) {
      for (const rel of Object.keys(RELATIONSHIP_LABEL) as Relationship[]) {
        const v = state.ratings[ratingKey(rel, c)];
        if (typeof v === "number") vals.push(v);
      }
    }
    if (vals.length === 0) return { avg: 0, pct: 0, count: 0 };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { avg, pct: Math.round(((avg - 1) / 4) * 100), count: vals.length };
  }, [state.ratings, state.competencies]);

  const RATER_TABS: { key: Relationship; short: string; tag: string }[] = [
    { key: "peer", short: "Peer", tag: "Lateral lens" },
    { key: "manager", short: "Manager", tag: "Top-down lens" },
    { key: "direct-report", short: "Direct report", tag: "Upward lens" },
    { key: "self", short: "Self", tag: "Inside-out lens" },
  ];

  return (
    <ToolShell
      category="HR & People"
      title="360 Review Template"
      description="Generate a printable 360-degree review form with behavioral-anchored rating scales."
    >
      <div data-tool-theme="hr" data-tool="360-review-template">
        {/* Hero / review-spread header */}
        <div className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-tool-accent-soft p-6 sm:p-8">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-tool-accent-soft blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                360° review spread
              </div>
              <h2 className="font-tool-heading mt-2 text-2xl text-app sm:text-3xl">
                {state.revieweeName || "Reviewee"}
                <span className="text-faint"> · </span>
                <span className="text-secondary">{state.period || "Period"}</span>
              </h2>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Behavior-anchored ratings collected across four rater roles, then printed or shared.
              </p>
            </div>

            {/* Consensus dial */}
            <div className="flex items-center gap-4 rounded-xl border border-tool-accent-soft bg-tool-surface px-5 py-4 backdrop-blur">
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    className="text-tool-accent"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${consensus.pct} 100`}
                    pathLength={100}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-xs font-semibold text-tool-accent">
                  {consensus.avg ? consensus.avg.toFixed(1) : "—"}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Consensus
                </div>
                <div className="mt-1 text-app">
                  {consensus.count
                    ? `${consensus.count} rating${consensus.count === 1 ? "" : "s"} across raters`
                    : `${state.competencies.length} competenc${state.competencies.length === 1 ? "y" : "ies"} loaded`}
                </div>
                <div className="text-faint">{ROLE_LEVEL_LABEL[state.roleLevel]}</div>
              </div>
            </div>
          </div>

          {/* Rater-role tabs */}
          <div className="relative mt-6 flex flex-wrap gap-2">
            {RATER_TABS.map((t) => {
              const active = state.relationship === t.key;
              const ratedCount = state.competencies.filter(
                (c) => typeof state.ratings[ratingKey(t.key, c)] === "number"
              ).length;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setState({ ...state, relationship: t.key })}
                  className={`group flex flex-col items-start rounded-lg border px-4 py-2.5 text-left transition-all ${
                    active
                      ? "border-tool-accent bg-tool-accent-soft text-app shadow-[0_0_0_1px_var(--tool-accent-soft)]"
                      : "border-app bg-surface text-secondary hover:border-tool-accent-soft hover:text-app"
                  }`}
                >
                  <span className={`text-sm font-semibold ${active ? "text-tool-accent" : ""}`}>
                    {t.short}
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                    {t.tag}
                    {ratedCount > 0 && (
                      <span className="ml-1.5 text-tool-accent">· {ratedCount}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <ToolCard title="Review details" subtitle="Who, what, when">
            <div className="space-y-4">
              <Field label="Reviewee name">
                <input
                  value={state.revieweeName}
                  onChange={(e) => setState({ ...state, revieweeName: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <Field label="Reviewee role">
                <input
                  value={state.revieweeRole}
                  onChange={(e) => setState({ ...state, revieweeRole: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <Field label="Reviewer name">
                <input
                  value={state.reviewerName}
                  onChange={(e) => setState({ ...state, reviewerName: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <Field label="Review period">
                <input
                  value={state.period}
                  onChange={(e) => setState({ ...state, period: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <div className="rounded-md border border-tool-accent-soft bg-tool-surface px-3 py-2 text-xs text-secondary">
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Active rater
                </span>
                <div className="mt-1 text-app">
                  {RELATIONSHIP_LABEL[state.relationship]}
                </div>
              </div>
            </div>
          </ToolCard>

          <ToolCard
            title={`Competencies · ${RATER_TABS.find((t) => t.key === state.relationship)?.short}`}
            subtitle="Per-rater cards with sliders"
          >
            <div className="mb-4">
              <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent mb-2">
                Apply role-level preset
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COMPETENCIES_BY_ROLE) as RoleLevel[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => applyRoleLevel(k)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      state.roleLevel === k
                        ? "border-tool-accent bg-tool-accent-soft text-app"
                        : "border-app bg-surface text-secondary hover:text-app"
                    }`}
                  >
                    {ROLE_LEVEL_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {/* Competency cards with rating slider styled in tool-accent */}
            <div className="space-y-2">
              {[
                ...DEFAULT_COMPETENCIES,
                ...COMPETENCIES_BY_ROLE[state.roleLevel].filter(
                  (c) => !DEFAULT_COMPETENCIES.includes(c)
                ),
              ].map((c) => {
                const on = state.competencies.includes(c);
                const r = state.ratings[ratingKey(state.relationship, c)] || 0;
                const sliderFill = on && r ? (r / 5) * 100 : 0;
                return (
                  <div
                    key={c}
                    className={`group relative w-full overflow-hidden rounded-lg border transition-all ${
                      on
                        ? "border-tool-accent bg-tool-surface"
                        : "border-app bg-surface hover:border-tool-accent-soft"
                    }`}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-tool-accent-soft transition-all"
                      style={{ width: `${sliderFill}%` }}
                      aria-hidden
                    />
                    <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleCompetency(c)}
                        className="flex items-center gap-2 text-left"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${
                            on
                              ? "border-tool-accent bg-tool-accent text-white"
                              : "border-app text-faint"
                          }`}
                        >
                          {on ? "✓" : "+"}
                        </span>
                        <span className={`text-sm ${on ? "text-app" : "text-secondary"}`}>
                          {c}
                        </span>
                      </button>
                      {/* 1–5 rating sub-tabs (state buttons) */}
                      {on && (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => {
                            const active = r === n;
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setRating(c, n)}
                                aria-label={`Rate ${c} as ${n}`}
                                className={`grid h-6 w-6 place-items-center rounded text-[0.65rem] font-semibold transition-all ${
                                  active
                                    ? "bg-tool-accent text-white shadow-sm"
                                    : "border border-app bg-surface text-secondary hover:border-tool-accent hover:text-tool-accent"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex gap-2">
              <input
                placeholder="Add custom competency…"
                value={state.customInput}
                onChange={(e) => setState({ ...state, customInput: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
                className={inputCls()}
              />
              <button
                type="button"
                onClick={addCustom}
                className="shrink-0 rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-2 text-sm text-app hover:bg-tool-accent hover:text-white transition-colors"
              >
                Add
              </button>
            </div>

            {state.competencies.some((c) => !DEFAULT_COMPETENCIES.includes(c)) && (
              <div className="mt-4">
                <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">Custom</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state.competencies
                    .filter((c) => !DEFAULT_COMPETENCIES.includes(c))
                    .map((c) => (
                      <span
                        key={c}
                        className="flex items-center gap-2 rounded-full border border-tool-accent bg-tool-accent-soft px-3 py-1 text-xs text-app"
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => toggleCompetency(c)}
                          className="text-secondary hover:text-app"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </ToolCard>
        </div>

        {/* Summary panel */}
        <div className="mt-6 rounded-2xl border border-tool-accent-soft bg-tool-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                Summary panel
              </div>
              <div className="font-tool-heading mt-1 text-base text-app">
                Rating scale anchors (1 → 5)
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyMd}
                className="rounded-md border border-tool-accent bg-tool-accent-soft px-4 py-2 text-sm text-app transition-colors hover:bg-tool-accent hover:text-white focus:outline-none focus:ring-2 ring-tool-accent"
              >
                {copied ? "Copied" : "Copy markdown"}
              </button>
              <button
                type="button"
                onClick={doPrint}
                className="rounded-md border border-app bg-surface px-4 py-2 text-sm text-app hover:border-tool-accent-soft"
              >
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={copyShareUrl}
                className="rounded-md border border-app bg-surface px-4 py-2 text-sm text-app hover:border-tool-accent-soft"
              >
                {shareCopied ? "Link copied" : "Copy shareable link"}
              </button>
            </div>
          </div>

          {/* Anchor strip */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
            {SCALE.map((s) => (
              <div
                key={s.n}
                className="rounded-lg border border-app bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-tool-accent-soft text-xs font-semibold text-tool-accent">
                    {s.n}
                  </span>
                  <span className="text-xs font-semibold text-app">{s.label}</span>
                </div>
                <p className="mt-2 text-[0.7rem] leading-snug text-secondary">{s.anchor}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 print:mt-0">
          <ToolCard title="Preview" subtitle="What reviewers will see">
            <div className="rounded-lg bg-white p-8 text-slate-900 print:p-0 print:shadow-none">
              <h1 className="text-2xl font-semibold">
                360 Review — {state.revieweeName || "[Reviewee]"}
              </h1>
              <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-slate-700">Role:</span>{" "}
                  {state.revieweeRole || "—"}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Period:</span> {state.period || "—"}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Reviewer:</span>{" "}
                  {state.reviewerName || "—"}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Relationship:</span>{" "}
                  {RELATIONSHIP_LABEL[state.relationship]}
                </div>
              </div>

              <h2 className="mt-6 border-b border-slate-200 pb-1 text-base font-semibold uppercase tracking-wide text-slate-700">
                Rating Scale
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {SCALE.map((s) => (
                  <li key={s.n}>
                    <span className="font-semibold">
                      {s.n} — {s.label}:
                    </span>{" "}
                    <span className="text-slate-600">{s.anchor}</span>
                  </li>
                ))}
              </ul>

              <h2 className="mt-6 border-b border-slate-200 pb-1 text-base font-semibold uppercase tracking-wide text-slate-700">
                Competencies
              </h2>
              {state.competencies.length === 0 && (
                <p className="mt-3 text-sm italic text-slate-500">No competencies selected.</p>
              )}
              {state.competencies.map((c) => {
                const r = state.ratings[ratingKey(state.relationship, c)];
                return (
                  <div key={c} className="mt-5">
                    <h3 className="text-sm font-semibold text-slate-800">{c}</h3>
                    <div className="mt-1 text-sm text-slate-600">
                      Rating (1–5):{" "}
                      {r ? (
                        <span className="ml-1 font-semibold text-slate-800">{r}</span>
                      ) : (
                        <span className="ml-1 inline-block w-24 border-b border-slate-400" />
                      )}
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                      Specific example / evidence
                    </div>
                    <div className="mt-1 h-16 rounded border border-slate-200" />
                  </div>
                );
              })}

              <h2 className="mt-6 border-b border-slate-200 pb-1 text-base font-semibold uppercase tracking-wide text-slate-700">
                Open-ended
              </h2>
              {openEnded.map((q, i) => (
                <div key={i} className="mt-4">
                  <div className="text-sm font-semibold text-slate-800">{q}</div>
                  <div className="mt-1 h-14 rounded border border-slate-200" />
                </div>
              ))}
            </div>
          </ToolCard>
        </div>
      </div>
    </ToolShell>
  );
}
