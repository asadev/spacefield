"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";

type Schedule = "always" | "business" | "after";

interface Contact {
  id: string;
  role: string;
  name: string;
  method: string; // phone / slack / email
  notifyAfter: string; // e.g. "0 min", "5 min", "15 min"
  schedule?: Schedule;
  backup?: string; // vacation coverage — who covers if unavailable
}

const SCHEDULE_LABEL: Record<Schedule, string> = {
  always: "24/7",
  business: "Biz hours",
  after: "After hours",
};

interface Level {
  severity: Severity;
  definition: string;
  contacts: Contact[];
}

type MatrixState = {
  levels: Record<Severity, Level>;
};

const LS_KEY = "solutions:escalation-matrix:v1";
const MODE_LS_KEY = "solutions:escalation-matrix:mode:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

const SEV_LIST: Severity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];

// Severity hue semantics: P0 rose / P1 amber / P2 sky / P3 emerald
const SEV_TONE: Record<
  Severity,
  {
    label: string;
    short: string;
    text: string;
    border: string;
    bg: string;
    chip: string;
    soft: string;
  }
> = {
  SEV1: {
    label: "P0 · Critical",
    short: "P0",
    text: "text-rose-500",
    border: "border-rose-500/40",
    bg: "bg-rose-500/15",
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-500",
    soft: "bg-rose-500/10",
  },
  SEV2: {
    label: "P1 · High",
    short: "P1",
    text: "text-amber-500",
    border: "border-amber-500/40",
    bg: "bg-amber-500/15",
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    soft: "bg-amber-500/10",
  },
  SEV3: {
    label: "P2 · Medium",
    short: "P2",
    text: "text-sky-500",
    border: "border-sky-500/40",
    bg: "bg-sky-500/15",
    chip: "border-sky-500/40 bg-sky-500/15 text-sky-500",
    soft: "bg-sky-500/10",
  },
  SEV4: {
    label: "P3 · Low",
    short: "P3",
    text: "text-emerald-500",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/15",
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-500",
    soft: "bg-emerald-500/10",
  },
};

const TIME_BANDS = ["0 min", "5 min", "15 min", "30 min", "60 min+"];

function defaultState(): MatrixState {
  return {
    levels: {
      SEV1: {
        severity: "SEV1",
        definition: "Full outage / data loss — page everyone immediately.",
        contacts: [
          {
            id: uid(),
            role: "On-call engineer",
            name: "",
            method: "PagerDuty",
            notifyAfter: "0 min",
          },
          {
            id: uid(),
            role: "Incident commander",
            name: "",
            method: "PagerDuty",
            notifyAfter: "0 min",
          },
          {
            id: uid(),
            role: "VP Engineering",
            name: "",
            method: "SMS + call",
            notifyAfter: "10 min",
          },
          {
            id: uid(),
            role: "CEO",
            name: "",
            method: "Call",
            notifyAfter: "30 min",
          },
        ],
      },
      SEV2: {
        severity: "SEV2",
        definition: "Major degradation / partial outage.",
        contacts: [
          {
            id: uid(),
            role: "On-call engineer",
            name: "",
            method: "PagerDuty",
            notifyAfter: "0 min",
          },
          {
            id: uid(),
            role: "Team lead",
            name: "",
            method: "Slack + SMS",
            notifyAfter: "15 min",
          },
        ],
      },
      SEV3: {
        severity: "SEV3",
        definition: "Minor degradation, workaround available.",
        contacts: [
          {
            id: uid(),
            role: "On-call engineer",
            name: "",
            method: "Slack",
            notifyAfter: "business hours",
          },
        ],
      },
      SEV4: {
        severity: "SEV4",
        definition: "Cosmetic / low-impact.",
        contacts: [
          {
            id: uid(),
            role: "Team channel",
            name: "",
            method: "Slack",
            notifyAfter: "next business day",
          },
        ],
      },
    },
  };
}

type TabKey = "edit" | "preview";

const initials = (s: string) =>
  (s || "?")
    .split(/\s+/)
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "·";

export default function EscalationMatrixPage() {
  const [state, setState] = useState<MatrixState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("edit");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw));
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "edit" || m === "preview") setMode(m as TabKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [state, mode, hydrated]);

  const updateLevel = (s: Severity, patch: Partial<Level>) => {
    setState({
      ...state,
      levels: { ...state.levels, [s]: { ...state.levels[s], ...patch } },
    });
  };

  const addContact = (s: Severity) => {
    updateLevel(s, {
      contacts: [
        ...state.levels[s].contacts,
        {
          id: uid(),
          role: "",
          name: "",
          method: "",
          notifyAfter: "",
          schedule: "always",
          backup: "",
        },
      ],
    });
  };

  const updateContact = (s: Severity, id: string, patch: Partial<Contact>) => {
    updateLevel(s, {
      contacts: state.levels[s].contacts.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    });
  };

  const removeContact = (s: Severity, id: string) => {
    updateLevel(s, {
      contacts: state.levels[s].contacts.filter((c) => c.id !== id),
    });
  };

  const stats = useMemo(() => {
    const all = SEV_LIST.flatMap((s) => state.levels[s].contacts);
    const bizOnly = all.filter((c) => c.schedule === "business").length;
    const afterOnly = all.filter((c) => c.schedule === "after").length;
    const always = all.filter(
      (c) => !c.schedule || c.schedule === "always"
    ).length;
    const missingBackup = all.filter((c) => !c.backup).length;
    return { total: all.length, bizOnly, afterOnly, always, missingBackup };
  }, [state]);

  const toMarkdown = (s: MatrixState): string => {
    const L: string[] = [];
    L.push(`# Escalation Matrix`);
    L.push("");
    SEV_LIST.forEach((sev) => {
      const lvl = s.levels[sev];
      L.push(`## ${SEV_TONE[sev].label}`);
      L.push(lvl.definition || "—");
      L.push("");
      if (lvl.contacts.length === 0) {
        L.push(`_No contacts._`);
      } else {
        L.push(`| Role | Name | Method | After | When | Backup |`);
        L.push(`|---|---|---|---|---|---|`);
        lvl.contacts.forEach((c) => {
          L.push(
            `| ${c.role || "—"} | ${c.name || "—"} | ${c.method || "—"} | ${
              c.notifyAfter || "—"
            } | ${SCHEDULE_LABEL[c.schedule || "always"]} | ${c.backup || "—"} |`
          );
        });
      }
      L.push("");
    });
    return L.join("\n");
  };

  const download = () => {
    const blob = new Blob([toMarkdown(state)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "escalation-matrix.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-tool-theme="support" data-tool="escalation-matrix">
      <ToolShell
        category="Support & Ops"
        title="Escalation Matrix"
        description="Role-based escalation builder. Per-severity notification lists with timing. Print-ready for the war room wall."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — severity counts */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              matrix
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {stats.total} contact{stats.total === 1 ? "" : "s"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              escalation.tier × time
              <span className="text-faint">/</span>
              <span className="text-secondary">war-room.matrix</span>
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
                  War Room · Escalation Map
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Tier × Time matrix
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-secondary">
                  Severity rows. Elapsed-time columns. Each cell shows who is on
                  the hook and how the escalation chains.
                </p>
              </div>

              {/* coverage dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
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
                      strokeDasharray={`${
                        stats.total > 0 ? (stats.always / stats.total) * 100 : 0
                      }, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.6rem] font-bold text-tool-accent">
                    {stats.always}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    24/7 coverage
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {stats.always} / {stats.total}
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
                  { k: "edit", label: "Edit" },
                  { k: "preview", label: "Preview" },
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

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={download}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Export .md
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Print
              </button>
              <button
                onClick={() => {
                  if (confirm("Reset to defaults?")) setState(defaultState());
                }}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {mode === "preview" ? (
          <div className="mt-2">
            <ToolCard title="Markdown preview" subtitle="Ready to copy">
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app p-4 font-mono text-xs text-app">
                {toMarkdown(state)}
              </pre>
            </ToolCard>
          </div>
        ) : (
          <>
            {/* severity definition strip */}
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEV_LIST.map((s) => (
                <div
                  key={s}
                  className={`rounded-xl border-l-4 ${SEV_TONE[s].border} border-y border-r border-app bg-app-elevated p-3`}
                >
                  <div
                    className={`font-mono text-[0.55rem] uppercase tracking-[0.2em] ${SEV_TONE[s].text}`}
                  >
                    {SEV_TONE[s].label}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-secondary">
                    {state.levels[s].definition}
                  </div>
                </div>
              ))}
            </div>

            {/* coverage stats */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  24/7 coverage
                </div>
                <div className="mt-1 text-xl font-semibold text-tool-accent">
                  {stats.always}
                </div>
              </div>
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Biz hours only
                </div>
                <div className="mt-1 text-xl font-semibold text-app">
                  {stats.bizOnly}
                </div>
              </div>
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  After-hours only
                </div>
                <div className="mt-1 text-xl font-semibold text-app">
                  {stats.afterOnly}
                </div>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  stats.missingBackup > 0
                    ? "border-rose-500/40 bg-rose-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10"
                }`}
              >
                <div
                  className={`font-mono text-[0.55rem] uppercase tracking-[0.2em] ${
                    stats.missingBackup > 0
                      ? "text-rose-500"
                      : "text-emerald-500"
                  }`}
                >
                  Missing backup
                </div>
                <div
                  className={`mt-1 text-xl font-semibold ${
                    stats.missingBackup > 0
                      ? "text-rose-500"
                      : "text-emerald-500"
                  }`}
                >
                  {stats.missingBackup}
                </div>
              </div>
            </div>

            {/* ============================== GRID ============================== */}
            <section className="mb-6 overflow-x-auto rounded-xl border border-app bg-app-elevated p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                  ▾ escalation grid
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  rows: severity · cols: minutes elapsed
                </div>
              </div>
              <div className="min-w-[720px]">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `120px repeat(${TIME_BANDS.length}, minmax(0,1fr))`,
                  }}
                >
                  <div />
                  {TIME_BANDS.map((t) => (
                    <div
                      key={t}
                      className="rounded-lg border border-app bg-app px-2 py-1 text-center font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted"
                    >
                      T+{t}
                    </div>
                  ))}
                  {SEV_LIST.map((sev) => {
                    const contacts = state.levels[sev].contacts;
                    const buckets = TIME_BANDS.map((band, i) => {
                      const minutes = parseInt(band) || (i === 0 ? 0 : 999);
                      return contacts.filter((c) => {
                        const m = parseInt(c.notifyAfter);
                        if (isNaN(m)) return i === TIME_BANDS.length - 1;
                        if (i === TIME_BANDS.length - 1) return m >= 60;
                        const next = parseInt(TIME_BANDS[i + 1]) || 999;
                        return m >= minutes && m < next;
                      });
                    });
                    const tone = SEV_TONE[sev];
                    return (
                      <div key={sev} className="contents">
                        <div
                          className={`flex items-center rounded-lg border-l-4 ${tone.border} border-y border-r border-app bg-app-elevated px-3 py-2`}
                        >
                          <span
                            className={`font-mono text-sm font-semibold ${tone.text}`}
                          >
                            {tone.label}
                          </span>
                        </div>
                        {buckets.map((bucket, i) => (
                          <div
                            key={i}
                            className="relative min-h-[64px] rounded-lg border border-app bg-app p-2"
                          >
                            {bucket.length === 0 ? (
                              <div className="flex h-full items-center justify-center font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                                —
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {bucket.map((c) => (
                                  <div
                                    key={c.id}
                                    title={`${c.role} ${
                                      c.name ? "· " + c.name : ""
                                    } via ${c.method}`}
                                    className={`flex items-center gap-1.5 rounded-full border ${tone.border} ${tone.soft} py-0.5 pl-0.5 pr-2`}
                                  >
                                    <span
                                      className={`flex h-5 w-5 items-center justify-center rounded-full ${tone.bg} font-mono text-[0.55rem] font-bold ${tone.text}`}
                                    >
                                      {initials(c.name || c.role)}
                                    </span>
                                    <span className="text-[0.6rem] text-secondary">
                                      {c.role || "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {i < buckets.length - 1 && bucket.length > 0 && (
                              <span className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 text-tool-accent/60">
                                →
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ============================== PER-SEVERITY EDITORS ============================== */}
            <div className="space-y-6">
              {SEV_LIST.map((sev) => {
                const level = state.levels[sev];
                const tone = SEV_TONE[sev];
                return (
                  <section
                    key={sev}
                    className={`relative overflow-hidden rounded-xl border-l-4 ${tone.border} border-y border-r border-app bg-app-elevated`}
                  >
                    <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${tone.chip}`}
                        >
                          {tone.short}
                        </span>
                        <span
                          className={`font-mono text-[0.6rem] uppercase tracking-[0.22em] ${tone.text}`}
                        >
                          {tone.label}
                        </span>
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                          · {level.contacts.length} contact
                          {level.contacts.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button
                        onClick={() => addContact(sev)}
                        className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                      >
                        + Contact
                      </button>
                    </div>

                    <div className="p-5">
                      <Field label="Definition">
                        <input
                          value={level.definition}
                          onChange={(e) =>
                            updateLevel(sev, { definition: e.target.value })
                          }
                          className={inputCls()}
                        />
                      </Field>

                      <div className="mt-4 space-y-2.5">
                        {level.contacts.map((c, idx) => (
                          <div
                            key={c.id}
                            className="group relative rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border ${tone.border} ${tone.soft} font-mono text-xs font-semibold ${tone.text}`}
                              >
                                {initials(c.name || c.role)}
                                <span
                                  className="absolute -bottom-1 -right-1 rounded-full border border-app bg-tool-accent px-1 font-mono text-[0.5rem] font-bold"
                                  style={{ color: "var(--bg)" }}
                                >
                                  {idx + 1}
                                </span>
                              </div>
                              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    Role
                                  </label>
                                  <input
                                    value={c.role}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        role: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. On-call SRE"
                                    className="w-full bg-transparent font-mono text-[0.7rem] uppercase tracking-[0.12em] text-tool-accent placeholder:text-faint outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    Name
                                  </label>
                                  <input
                                    value={c.name}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        name: e.target.value,
                                      })
                                    }
                                    placeholder="Name"
                                    className="w-full bg-transparent text-sm font-semibold text-app placeholder:text-faint outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    Method
                                  </label>
                                  <input
                                    value={c.method}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        method: e.target.value,
                                      })
                                    }
                                    placeholder="PagerDuty / Slack / SMS"
                                    className="w-full bg-transparent font-mono text-xs text-secondary placeholder:text-faint outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    Notify after
                                  </label>
                                  <input
                                    value={c.notifyAfter}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        notifyAfter: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. 15 min"
                                    className="w-full bg-transparent font-mono text-xs text-secondary placeholder:text-faint outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    When
                                  </label>
                                  <select
                                    value={c.schedule || "always"}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        schedule: e.target.value as Schedule,
                                      })
                                    }
                                    className="w-full bg-transparent font-mono text-xs text-secondary outline-none"
                                  >
                                    {(
                                      ["always", "business", "after"] as Schedule[]
                                    ).map((s) => (
                                      <option
                                        key={s}
                                        value={s}
                                        className="bg-app text-app"
                                      >
                                        {SCHEDULE_LABEL[s]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                                    Backup
                                  </label>
                                  <input
                                    value={c.backup || ""}
                                    onChange={(e) =>
                                      updateContact(sev, c.id, {
                                        backup: e.target.value,
                                      })
                                    }
                                    placeholder="Backup name"
                                    className="w-full bg-transparent font-mono text-xs text-secondary placeholder:text-faint outline-none"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={() => removeContact(sev, c.id)}
                                className="rounded-md border border-app px-2 text-muted opacity-0 transition-opacity hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                                aria-label="Remove contact"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                        {level.contacts.length === 0 && (
                          <div className="rounded-xl border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                            No contacts for {sev}. Add at least one.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </ToolShell>
    </div>
  );
}
