"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { POSTMORTEM_TEMPLATES } from "../../_lib/supportData";

type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";

interface TimelineEntry {
  id: string;
  at: string;
  event: string;
}

interface ActionItem {
  id: string;
  task: string;
  owner: string;
  due: string;
  done?: boolean;
}

interface PirState {
  title: string;
  severity: Severity;
  date: string;
  summary: string;
  timeline: TimelineEntry[];
  impactUsers: string;
  impactRevenue: string;
  impactDuration: string;
  rootCause: string;
  contributing: string;
  resolution: string;
  actions: ActionItem[];
  lessons: string;
}

const LS_KEY = "solutions:incident-postmortem:v1";
const TEMPLATE_LS_KEY = "solutions:incident-postmortem:template:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

const SEVERITY_DEFS: Record<Severity, string> = {
  SEV1: "Full service outage / data loss",
  SEV2: "Major degradation, partial outage",
  SEV3: "Minor degradation, workaround available",
  SEV4: "Cosmetic / low-impact issue",
};

const SEVERITY_TONE: Record<Severity, { dot: string; text: string; border: string; bg: string }> = {
  SEV1: { dot: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/10" },
  SEV2: { dot: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  SEV3: { dot: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/40", bg: "bg-sky-500/10" },
  SEV4: { dot: "bg-app/40", text: "text-secondary", border: "border-app", bg: "bg-app-elevated" },
};

function defaultState(): PirState {
  return {
    title: "",
    severity: "SEV2",
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    timeline: [
      { id: uid(), at: "", event: "Alert fired" },
      { id: uid(), at: "", event: "Engineer acknowledged" },
      { id: uid(), at: "", event: "Mitigation deployed" },
      { id: uid(), at: "", event: "All clear" },
    ],
    impactUsers: "",
    impactRevenue: "",
    impactDuration: "",
    rootCause: "",
    contributing: "",
    resolution: "",
    actions: [{ id: uid(), task: "", owner: "", due: "", done: false }],
    lessons: "",
  };
}

function toMarkdown(s: PirState): string {
  const lines: string[] = [];
  lines.push(`# Incident Postmortem: ${s.title || "(untitled)"}`);
  lines.push("");
  lines.push(`**Severity:** ${s.severity} — ${SEVERITY_DEFS[s.severity]}  `);
  lines.push(`**Date:** ${s.date}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(s.summary || "_No summary yet._");
  lines.push("");
  lines.push(`## Timeline`);
  s.timeline.forEach((t) => {
    lines.push(`- **${t.at || "--:--"}** — ${t.event}`);
  });
  lines.push("");
  lines.push(`## Impact`);
  lines.push(`- Users affected: ${s.impactUsers || "—"}`);
  lines.push(`- Revenue impact: ${s.impactRevenue || "—"}`);
  lines.push(`- Duration: ${s.impactDuration || "—"}`);
  lines.push("");
  lines.push(`## Root Cause`);
  lines.push(s.rootCause || "—");
  lines.push("");
  lines.push(`## Contributing Factors`);
  lines.push(s.contributing || "—");
  lines.push("");
  lines.push(`## Resolution`);
  lines.push(s.resolution || "—");
  lines.push("");
  lines.push(`## Action Items`);
  s.actions.forEach((a) => {
    lines.push(
      `- [${a.done ? "x" : " "}] ${a.task || "(task)"} — @${a.owner || "owner"} — due ${
        a.due || "TBD"
      }`
    );
  });
  lines.push("");
  lines.push(`## Lessons Learned`);
  lines.push(s.lessons || "—");
  return lines.join("\n");
}

/* ---------- small helpers ---------- */

function timeToMinutes(t: string): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mm)) return null;
  return h * 60 + mm;
}

function fmtDuration(mins: number): string {
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ---------- component ---------- */

type SubTab = "timeline" | "rca" | "actions" | "lessons";

export default function IncidentPostmortemPage() {
  const [state, setState] = useState<PirState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [template, setTemplate] = useState<string>("google-sre");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<SubTab>("timeline");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw));
      const t = localStorage.getItem(TEMPLATE_LS_KEY);
      if (t) setTemplate(t);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(TEMPLATE_LS_KEY, template);
    } catch {}
  }, [state, template, hydrated]);

  const activeTemplate = POSTMORTEM_TEMPLATES.find((t) => t.key === template);

  const download = () => {
    const md = toMarkdown(state);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.title || "postmortem"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(state));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  /* timeline metrics */
  const tlMetrics = useMemo(() => {
    const pts = state.timeline
      .map((t) => timeToMinutes(t.at))
      .filter((v): v is number => v !== null);
    if (pts.length < 2) return null;
    const start = Math.min(...pts);
    const end = Math.max(...pts);
    const total = Math.max(1, end - start);
    return {
      start,
      end,
      total,
      markers: state.timeline.map((t) => {
        const m = timeToMinutes(t.at);
        return {
          id: t.id,
          event: t.event,
          at: t.at,
          pct: m === null ? null : ((m - start) / total) * 100,
        };
      }),
    };
  }, [state.timeline]);

  const ttr = tlMetrics ? fmtDuration(tlMetrics.total) : "—";
  const ttrOverBudget = tlMetrics ? tlMetrics.total > 60 : false;

  /* completion */
  const fields = [
    state.title,
    state.summary,
    state.rootCause,
    state.resolution,
    state.lessons,
    state.impactUsers,
    state.impactDuration,
  ];
  const filled = fields.filter((f) => f && f.trim().length > 0).length;
  const pct = Math.round((filled / fields.length) * 100);

  const actionsDone = state.actions.filter((a) => a.done).length;

  const sev = SEVERITY_TONE[state.severity];

  /* shared input class — uses foundation tokens */
  const inp =
    "w-full rounded-md border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";
  const mono =
    "font-mono tabular-nums w-full rounded-md border border-app bg-app-elevated px-3 py-2 text-sm text-tool-accent placeholder:text-faint outline-none focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

  const tabs: { key: SubTab; label: string; count?: string }[] = [
    { key: "timeline", label: "Timeline", count: `${state.timeline.length}` },
    { key: "rca", label: "Root Cause" },
    { key: "actions", label: "Actions", count: `${actionsDone}/${state.actions.length}` },
    { key: "lessons", label: "Lessons" },
  ];

  return (
    <div data-tool-theme="support" data-tool="incident-postmortem-template">
      <ToolShell
        category="Support & Ops"
        title="Incident Postmortem"
        description="Structured PIR template. Fill fields, preview the markdown, export or print."
      >
        {/* =========================== INCIDENT HEADER =========================== */}
        <section className="tool-hero relative mb-5 overflow-hidden rounded-2xl border border-app bg-app-elevated">
          <div className="flex flex-col gap-5 p-5 lg:p-6">
            {/* row 1: severity chip + id + title */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${sev.border} ${sev.bg} ${sev.text}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                  {state.severity}
                </span>
                <span className="rounded-full border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  INC-2026-001
                </span>
                <span className="rounded-full border border-tool-accent/40 bg-tool-accent-soft px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                  Blameless
                </span>
                <input
                  type="date"
                  value={state.date}
                  onChange={(e) => setState({ ...state, date: e.target.value })}
                  className="rounded-full border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary outline-none focus:border-tool-accent"
                />
                {hydrated && (
                  <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Autosaved
                  </span>
                )}
              </div>

              <input
                value={state.title}
                onChange={(e) => setState({ ...state, title: e.target.value })}
                placeholder="Payments API 502s"
                className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
              />
              <div className="text-xs text-muted">
                {SEVERITY_DEFS[state.severity]}
              </div>
            </div>

            {/* row 2: severity selector + impact badges + completion + TTR */}
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={state.severity}
                  onChange={(e) =>
                    setState({ ...state, severity: e.target.value as Severity })
                  }
                  className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-xs font-medium text-app outline-none focus:border-tool-accent"
                >
                  {(Object.keys(SEVERITY_DEFS) as Severity[]).map((s) => (
                    <option key={s} value={s}>
                      {s} — {SEVERITY_DEFS[s]}
                    </option>
                  ))}
                </select>

                <ImpactBadge label="Users" value={state.impactUsers || "—"} />
                <ImpactBadge label="Revenue" value={state.impactRevenue || "—"} />
                <ImpactBadge
                  label="Duration"
                  value={state.impactDuration || ttr}
                  accent
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-app bg-app-elevated px-3 py-2">
                  <div className="relative h-11 w-11">
                    <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9"
                        fill="none"
                        stroke="var(--tool-accent)"
                        strokeWidth="3"
                        strokeDasharray={`${pct}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                      {pct}%
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Completion
                    </div>
                    <div className="text-sm font-semibold text-app">
                      {filled} / {fields.length}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-app bg-app-elevated px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    TTR
                  </div>
                  <div
                    className={`font-mono text-lg font-bold ${
                      ttrOverBudget ? "text-amber-400" : "text-tool-accent"
                    }`}
                  >
                    {ttr}
                  </div>
                </div>
              </div>
            </div>

            {/* row 3: TL;DR */}
            <div>
              <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                TL;DR · leadership summary
              </div>
              <textarea
                value={state.summary}
                onChange={(e) => setState({ ...state, summary: e.target.value })}
                rows={2}
                className={inp}
                placeholder="One-paragraph recap. What broke, who was affected, how long, how we fixed it."
              />
            </div>
          </div>

          {/* action bar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-app bg-app px-5 py-3">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              {copied ? "Copied" : "Copy markdown"}
            </button>
            <button
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              Download .md
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              Print / PDF
            </button>
            <button
              onClick={() => {
                if (confirm("Reset this postmortem?")) setState(defaultState());
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-400"
            >
              Reset
            </button>
          </div>
        </section>

        {/* =========================== TEMPLATE PICKER =========================== */}
        <section className="mb-5 overflow-hidden rounded-2xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app px-4 py-3">
            <div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                Template format
              </div>
              <div className="text-sm text-secondary">
                Pick a company&apos;s postmortem style
              </div>
            </div>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-5">
            {POSTMORTEM_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTemplate(t.key)}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                  template === t.key
                    ? "border-tool-accent bg-tool-accent-soft"
                    : "border-app bg-app hover:border-tool-accent/40"
                }`}
              >
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  {t.source.split("—")[0].trim()}
                </div>
                <div className="mt-1 text-sm font-semibold text-app">
                  {t.name}
                </div>
              </button>
            ))}
          </div>
          {activeTemplate && (
            <div className="flex flex-wrap items-center gap-2 border-t border-app px-4 py-3 text-xs">
              <span className="text-secondary">{activeTemplate.description}</span>
              {activeTemplate.sections.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-app bg-app px-2 py-0.5 text-[0.65rem] text-muted"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* =========================== TWO-COLUMN: EDITOR | PAPER =========================== */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ------------ EDITOR PANE ------------ */}
          <div className="space-y-4">
            {/* sub-tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-app bg-app-elevated p-1.5">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === t.key
                      ? "bg-tool-accent text-black"
                      : "text-secondary hover:bg-app hover:text-app"
                  }`}
                >
                  {t.label}
                  {t.count && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[0.55rem] ${
                        tab === t.key
                          ? "bg-black/20 text-black"
                          : "bg-app text-muted"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* TIMELINE TAB */}
            {tab === "timeline" && (
              <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
                <header className="flex items-center justify-between border-b border-app px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-app">
                      Timeline
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                    <span className="inline-flex items-center gap-1 text-tool-accent">
                      <span className="h-2 w-2 rounded-sm bg-tool-accent" /> on-budget
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <span className="h-2 w-2 rounded-sm bg-amber-400" /> over 60m
                    </span>
                  </div>
                </header>

                {/* phase rail */}
                <div className="px-4 pt-4">
                  <div className="flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    <span>Detect</span>
                    <span>Respond</span>
                    <span>Mitigate</span>
                    <span>Resolve</span>
                  </div>
                  <div className="relative mt-1.5 h-3 overflow-hidden rounded-full border border-app bg-app">
                    {tlMetrics ? (
                      <>
                        <div
                          className="absolute inset-y-0 left-0 bg-tool-accent"
                          style={{
                            width: `${Math.min(100, (60 / tlMetrics.total) * 100)}%`,
                          }}
                        />
                        <div
                          className="absolute inset-y-0 right-0 bg-amber-500/60"
                          style={{
                            width: `${Math.max(0, 100 - (60 / tlMetrics.total) * 100)}%`,
                          }}
                        />
                        {tlMetrics.markers.map((m) =>
                          m.pct === null ? null : (
                            <div
                              key={m.id}
                              className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-app"
                              style={{
                                left: `${Math.max(0, Math.min(100, m.pct))}%`,
                              }}
                              title={`${m.at} — ${m.event}`}
                            />
                          )
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-app" />
                    )}
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[0.55rem] text-muted">
                    <span>
                      {tlMetrics
                        ? `T+0 (${
                            state.timeline.find(
                              (t) => timeToMinutes(t.at) === tlMetrics.start
                            )?.at
                          })`
                        : "—"}
                    </span>
                    <span>{tlMetrics ? `TTR ${ttr}` : "add times to plot"}</span>
                  </div>
                </div>

                {/* event list with rail */}
                <div className="relative p-4 pt-5">
                  <div className="absolute left-[28px] top-5 bottom-5 w-px bg-app" />
                  <div className="space-y-2">
                    {state.timeline.map((t, idx) => (
                      <div
                        key={t.id}
                        className="group relative flex items-center gap-3"
                      >
                        <span className="relative z-10 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-tool-accent bg-app-elevated font-mono text-[0.6rem] font-bold text-tool-accent">
                          {idx + 1}
                        </span>
                        <input
                          value={t.at}
                          onChange={(e) =>
                            setState({
                              ...state,
                              timeline: state.timeline.map((x) =>
                                x.id === t.id ? { ...x, at: e.target.value } : x
                              ),
                            })
                          }
                          placeholder="14:32"
                          className={`${mono} max-w-[110px] flex-none`}
                        />
                        <input
                          value={t.event}
                          onChange={(e) =>
                            setState({
                              ...state,
                              timeline: state.timeline.map((x) =>
                                x.id === t.id ? { ...x, event: e.target.value } : x
                              ),
                            })
                          }
                          placeholder={`Event ${idx + 1} — what happened`}
                          className={`${inp} flex-1`}
                        />
                        <button
                          onClick={() =>
                            setState({
                              ...state,
                              timeline: state.timeline.filter(
                                (x) => x.id !== t.id
                              ),
                            })
                          }
                          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-app text-muted opacity-0 transition-opacity hover:border-rose-500/40 hover:text-rose-400 group-hover:opacity-100"
                          aria-label="remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setState({
                        ...state,
                        timeline: [
                          ...state.timeline,
                          { id: uid(), at: "", event: "" },
                        ],
                      })
                    }
                    className="mt-3 w-full rounded-md border border-dashed border-tool-accent/40 bg-tool-accent-soft py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:border-tool-accent"
                  >
                    + Add event
                  </button>
                </div>
              </section>
            )}

            {/* RCA TAB */}
            {tab === "rca" && (
              <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
                <header className="flex items-center justify-between border-b border-app px-4 py-3">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-app">
                    Root cause analysis
                  </span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    blameless · systems lens
                  </span>
                </header>
                <div className="space-y-4 p-4">
                  <RcaField
                    label="Root cause"
                    hint="What in the system allowed this? Mechanisms, not people."
                  >
                    <textarea
                      value={state.rootCause}
                      onChange={(e) =>
                        setState({ ...state, rootCause: e.target.value })
                      }
                      rows={4}
                      className={inp}
                      placeholder="The deploy at 14:30 introduced a connection-pool leak; default timeouts hid it for 12 minutes."
                    />
                  </RcaField>
                  <RcaField
                    label="Contributing factors"
                    hint="What made it worse or slower to detect?"
                  >
                    <textarea
                      value={state.contributing}
                      onChange={(e) =>
                        setState({ ...state, contributing: e.target.value })
                      }
                      rows={3}
                      className={inp}
                      placeholder="No alert on pool saturation; on-call paged via wrong channel."
                    />
                  </RcaField>
                  <RcaField label="Resolution" hint="What stopped the bleed?">
                    <textarea
                      value={state.resolution}
                      onChange={(e) =>
                        setState({ ...state, resolution: e.target.value })
                      }
                      rows={3}
                      className={inp}
                      placeholder="Rolled back to previous build; added pool-size alert at 80%."
                    />
                  </RcaField>
                </div>
              </section>
            )}

            {/* ACTIONS TAB */}
            {tab === "actions" && (
              <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
                <header className="flex items-center justify-between border-b border-app px-4 py-3">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-app">
                    Action items
                  </span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    {actionsDone} / {state.actions.length} done
                  </span>
                </header>
                <div className="space-y-2 p-4">
                  {state.actions.map((a) => (
                    <div
                      key={a.id}
                      className={`group grid grid-cols-[auto_1fr] gap-3 rounded-xl border bg-app p-3 transition-colors md:grid-cols-[auto_2fr_1fr_auto_auto] ${
                        a.done ? "border-tool-accent/40 opacity-60" : "border-app"
                      }`}
                    >
                      <button
                        onClick={() =>
                          setState({
                            ...state,
                            actions: state.actions.map((x) =>
                              x.id === a.id ? { ...x, done: !x.done } : x
                            ),
                          })
                        }
                        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded border-2 transition-colors ${
                          a.done
                            ? "border-tool-accent bg-tool-accent"
                            : "border-tool-accent bg-transparent hover:bg-tool-accent-soft"
                        }`}
                        aria-label="toggle done"
                      >
                        {a.done && (
                          <svg
                            viewBox="0 0 20 20"
                            className="h-3 w-3 text-black"
                          >
                            <path
                              d="M5 10l3 3 7-7"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                      <input
                        value={a.task}
                        onChange={(e) =>
                          setState({
                            ...state,
                            actions: state.actions.map((x) =>
                              x.id === a.id ? { ...x, task: e.target.value } : x
                            ),
                          })
                        }
                        placeholder="Add circuit breaker to payments service"
                        className={`min-w-0 bg-transparent text-sm text-app placeholder:text-faint outline-none ${
                          a.done ? "line-through" : ""
                        }`}
                      />
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[0.55rem] text-muted">
                          @
                        </span>
                        <input
                          value={a.owner}
                          onChange={(e) =>
                            setState({
                              ...state,
                              actions: state.actions.map((x) =>
                                x.id === a.id
                                  ? { ...x, owner: e.target.value }
                                  : x
                              ),
                            })
                          }
                          placeholder="owner"
                          className="min-w-0 flex-1 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-xs text-tool-accent placeholder:text-tool-accent/50 outline-none"
                        />
                      </div>
                      <input
                        type="date"
                        value={a.due}
                        onChange={(e) =>
                          setState({
                            ...state,
                            actions: state.actions.map((x) =>
                              x.id === a.id ? { ...x, due: e.target.value } : x
                            ),
                          })
                        }
                        className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-xs text-secondary outline-none focus:border-tool-accent"
                      />
                      <button
                        onClick={() =>
                          setState({
                            ...state,
                            actions: state.actions.filter((x) => x.id !== a.id),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-app text-muted hover:border-rose-500/40 hover:text-rose-400"
                        aria-label="remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setState({
                        ...state,
                        actions: [
                          ...state.actions,
                          { id: uid(), task: "", owner: "", due: "", done: false },
                        ],
                      })
                    }
                    className="w-full rounded-md border border-dashed border-tool-accent/40 bg-tool-accent-soft py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:border-tool-accent"
                  >
                    + Add action item
                  </button>
                </div>
              </section>
            )}

            {/* LESSONS TAB */}
            {tab === "lessons" && (
              <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
                <header className="flex items-center justify-between border-b border-app px-4 py-3">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-app">
                    What went well · lessons
                  </span>
                </header>
                <div className="p-4">
                  <textarea
                    value={state.lessons}
                    onChange={(e) =>
                      setState({ ...state, lessons: e.target.value })
                    }
                    rows={8}
                    className={inp}
                    placeholder="What worked? What instincts paid off? What do we want to reinforce next time?"
                  />
                </div>
              </section>
            )}

            {/* impact editor — always visible at bottom */}
            <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
              <header className="flex items-center justify-between border-b border-app px-4 py-3">
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-app">
                  Impact
                </span>
              </header>
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
                {[
                  {
                    k: "impactUsers" as const,
                    label: "Users affected",
                    ph: "12,400 (22%)",
                  },
                  {
                    k: "impactRevenue" as const,
                    label: "Revenue impact",
                    ph: "$38k lost",
                  },
                  {
                    k: "impactDuration" as const,
                    label: "Duration",
                    ph: "47 minutes",
                  },
                ].map((f) => (
                  <div
                    key={f.k}
                    className="rounded-xl border border-app bg-app p-3"
                  >
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                      {f.label}
                    </div>
                    <input
                      value={state[f.k]}
                      onChange={(e) =>
                        setState({
                          ...state,
                          [f.k]: e.target.value,
                        } as PirState)
                      }
                      placeholder={f.ph}
                      className="mt-1 w-full bg-transparent text-base font-semibold text-app placeholder:text-faint outline-none"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ------------ PAPER PREVIEW PANE ------------ */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <span className="h-2 w-2 rounded-full bg-tool-accent" />
                  Paper preview
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Letter · blameless · {state.severity}
                </div>
              </div>

              <div className="max-h-[1400px] overflow-y-auto bg-[#fafaf7] px-8 py-8 text-[13px] leading-relaxed text-neutral-900">
                {/* paper header */}
                <div className="mb-5 flex items-start justify-between border-b border-black/10 pb-3">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-lime-700">
                      Postmortem / INC-2026-001
                    </div>
                    <h1 className="mt-1 text-2xl font-bold text-neutral-900">
                      {state.title || "Untitled incident"}
                    </h1>
                    <div className="mt-1 text-xs text-neutral-600">
                      {state.date} · {state.severity} —{" "}
                      {SEVERITY_DEFS[state.severity]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-block rounded border border-lime-600/40 bg-lime-100 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-lime-800">
                      Blameless · In review
                    </div>
                  </div>
                </div>

                <PaperSection n={1} title="TL;DR">
                  <p className="whitespace-pre-wrap text-neutral-800">
                    {state.summary || (
                      <span className="italic text-neutral-400">
                        No summary yet.
                      </span>
                    )}
                  </p>
                </PaperSection>

                <PaperSection n={2} title="Impact">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: "Users", v: state.impactUsers },
                      { l: "Revenue", v: state.impactRevenue },
                      { l: "Duration", v: state.impactDuration || ttr },
                    ].map((f) => (
                      <div
                        key={f.l}
                        className="rounded border border-neutral-200 bg-white p-2"
                      >
                        <div className="font-mono text-[0.5rem] uppercase tracking-[0.2em] text-neutral-500">
                          {f.l}
                        </div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {f.v || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </PaperSection>

                <PaperSection n={3} title="Timeline">
                  <ol className="space-y-1.5">
                    {state.timeline.map((t, i) => (
                      <li
                        key={t.id}
                        className="flex gap-3 border-l-2 border-lime-400 pl-3"
                      >
                        <span className="font-mono text-[11px] font-semibold tabular-nums text-lime-700">
                          {t.at || "--:--"}
                        </span>
                        <span className="text-neutral-800">
                          {t.event || (
                            <span className="italic text-neutral-400">
                              event {i + 1}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </PaperSection>

                <PaperSection n={4} title="Root cause">
                  <p className="whitespace-pre-wrap text-neutral-800">
                    {state.rootCause || (
                      <span className="italic text-neutral-400">—</span>
                    )}
                  </p>
                  {state.contributing && (
                    <>
                      <div className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-neutral-500">
                        Contributing factors
                      </div>
                      <p className="whitespace-pre-wrap text-neutral-800">
                        {state.contributing}
                      </p>
                    </>
                  )}
                  {state.resolution && (
                    <>
                      <div className="mt-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-neutral-500">
                        Resolution
                      </div>
                      <p className="whitespace-pre-wrap text-neutral-800">
                        {state.resolution}
                      </p>
                    </>
                  )}
                </PaperSection>

                <PaperSection n={5} title="What went well · lessons">
                  <p className="whitespace-pre-wrap text-neutral-800">
                    {state.lessons || (
                      <span className="italic text-neutral-400">—</span>
                    )}
                  </p>
                </PaperSection>

                <PaperSection n={6} title="Action items">
                  <ul className="space-y-1">
                    {state.actions.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-2 text-neutral-800"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-3.5 w-3.5 flex-none items-center justify-center rounded-sm border ${
                            a.done
                              ? "border-lime-600 bg-lime-500"
                              : "border-neutral-400"
                          }`}
                        >
                          {a.done && (
                            <svg
                              viewBox="0 0 20 20"
                              className="h-2.5 w-2.5 text-white"
                            >
                              <path
                                d="M5 10l3 3 7-7"
                                stroke="currentColor"
                                strokeWidth="3"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1">
                          <span className={a.done ? "line-through" : ""}>
                            {a.task || (
                              <span className="italic text-neutral-400">
                                (task)
                              </span>
                            )}
                          </span>
                          <span className="ml-2 rounded-full bg-lime-100 px-1.5 py-0.5 text-[10px] font-semibold text-lime-800">
                            @{a.owner || "owner"}
                          </span>
                          <span className="ml-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                            due {a.due || "TBD"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </PaperSection>

                <div className="mt-6 border-t border-black/10 pt-3 text-center font-mono text-[0.55rem] uppercase tracking-[0.25em] text-neutral-400">
                  — end of postmortem · blameless by policy —
                </div>
              </div>
            </div>

            {/* markdown raw */}
            <details className="mt-3 overflow-hidden rounded-2xl border border-app bg-app-elevated">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary hover:text-tool-accent">
                <span>Raw markdown</span>
                <span className="text-muted">toggle</span>
              </summary>
              <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap border-t border-app bg-app p-4 text-xs text-secondary">
                {toMarkdown(state)}
              </pre>
            </details>
          </div>
        </div>
      </ToolShell>
    </div>
  );
}

/* ---------- presentational helpers ---------- */

function ImpactBadge({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 ${
        accent
          ? "border-tool-accent/40 bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function RcaField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
          {label}
        </div>
        {hint && <div className="text-[0.6rem] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function PaperSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-neutral-900">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-lime-400 font-mono text-[0.55rem] text-black">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
