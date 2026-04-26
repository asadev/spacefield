"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import { RUNBOOK_PRESETS, findPreset } from "../../_lib/supportData";

interface Step {
  id: string;
  text: string;
  done?: boolean;
}

interface Contact {
  id: string;
  role: string;
  name: string;
  contact: string;
}

interface RunbookState {
  title: string;
  trigger: string;
  checks: Step[];
  mitigation: Step[];
  escalation: Contact[];
  rollback: string;
  acceptance: string;
}

const LS_KEY = "solutions:runbook:v1";
const MODE_LS_KEY = "solutions:runbook:mode:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

function blankState(): RunbookState {
  return {
    title: "",
    trigger: "",
    checks: [{ id: uid(), text: "" }],
    mitigation: [{ id: uid(), text: "" }],
    escalation: [{ id: uid(), role: "On-call engineer", name: "", contact: "" }],
    rollback: "",
    acceptance: "",
  };
}

function presetToState(key: string): RunbookState {
  const p = findPreset(key);
  if (!p) return blankState();
  return {
    title: p.title,
    trigger: p.trigger,
    checks: p.checks.map((s) => ({ id: uid(), text: s.text })),
    mitigation: p.mitigation.map((s) => ({ id: uid(), text: s.text })),
    escalation: p.escalation.map((c) => ({
      id: uid(),
      role: c.role,
      name: c.name,
      contact: c.contact,
    })),
    rollback: p.rollback,
    acceptance: p.acceptance,
  };
}

function toMarkdown(s: RunbookState): string {
  const L: string[] = [];
  L.push(`# Runbook: ${s.title || "(untitled)"}`);
  L.push("");
  L.push(`## Trigger`);
  L.push(s.trigger || "—");
  L.push("");
  L.push(`## Checks`);
  s.checks.forEach((c, i) => L.push(`${i + 1}. ${c.text || "(step)"}`));
  L.push("");
  L.push(`## Mitigation`);
  s.mitigation.forEach((c, i) => L.push(`${i + 1}. ${c.text || "(step)"}`));
  L.push("");
  L.push(`## Escalation`);
  s.escalation.forEach((c) =>
    L.push(`- **${c.role}** — ${c.name || "—"} (${c.contact || "—"})`)
  );
  L.push("");
  L.push(`## Rollback`);
  L.push(s.rollback || "—");
  L.push("");
  L.push(`## Acceptance criteria`);
  L.push(s.acceptance || "—");
  return L.join("\n");
}

type TabKey = "edit" | "operator" | "preview";

export default function RunbookBuilderPage() {
  const [state, setState] = useState<RunbookState>(blankState());
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("edit");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw));
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "operator" || m === "edit" || m === "preview") setMode(m as TabKey);
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

  const loadPreset = (k: string) => {
    if (k === "blank") {
      if (confirm("Clear current runbook?")) setState(blankState());
      return;
    }
    if (confirm("Load preset? Current draft will be replaced.")) {
      setState(presetToState(k));
    }
  };

  const progress = useMemo(() => {
    const all = [...state.checks, ...state.mitigation];
    const total = all.length;
    const done = all.filter((s) => s.done).length;
    return { total, done, pct: total > 0 ? (done / total) * 100 : 0 };
  }, [state]);

  const resetProgress = () => {
    setState({
      ...state,
      checks: state.checks.map((s) => ({ ...s, done: false })),
      mitigation: state.mitigation.map((s) => ({ ...s, done: false })),
    });
  };

  const download = () => {
    const blob = new Blob([toMarkdown(state)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.title || "runbook"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // derive a simple severity label from the trigger text
  const severity = useMemo(() => {
    const t = (state.trigger || "").toLowerCase();
    if (/sev1|outage|down|p0|critical/.test(t))
      return { label: "SEV1", tone: "border-rose-500/40 bg-rose-500/15 text-rose-500" };
    if (/sev2|degrad|p1|major/.test(t))
      return { label: "SEV2", tone: "border-amber-500/40 bg-amber-500/15 text-amber-500" };
    if (/sev3|partial|p2/.test(t))
      return { label: "SEV3", tone: "border-sky-500/40 bg-sky-500/15 text-sky-500" };
    return { label: "DRAFT", tone: "border-app bg-app-elevated text-secondary" };
  }, [state.trigger]);

  // service chip — derive from title's first hyphenated chunk or "service"
  const serviceChip = useMemo(() => {
    const m = (state.title || "").match(/[A-Za-z][A-Za-z0-9-]+/);
    return m ? m[0].toLowerCase() : "service";
  }, [state.title]);

  // TOC items: every check + every mitigation step (numbered 1..N across both)
  const tocItems = useMemo(() => {
    const items: { id: string; n: number; phase: "check" | "mit"; text: string; done?: boolean }[] = [];
    let n = 1;
    state.checks.forEach((s) => items.push({ id: s.id, n: n++, phase: "check", text: s.text, done: s.done }));
    state.mitigation.forEach((s) => items.push({ id: s.id, n: n++, phase: "mit", text: s.text, done: s.done }));
    return items;
  }, [state.checks, state.mitigation]);

  return (
    <div data-tool-theme="support" data-tool="runbook-builder">
      <ToolShell
        category="Support & Ops"
        title="Runbook Builder"
        description="Build printable incident runbooks. Trigger, checks, mitigation, escalation, rollback, acceptance."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — severity + service chips, no dots */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${severity.tone}`}
            >
              {severity.label}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              svc:{serviceChip}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              runbook.playbook
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(state.title || "untitled").toLowerCase().replace(/\s+/g, "-")}.run
              </span>
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
                  Incident Runbook · Operator Playbook
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {state.checks.length}c · {state.mitigation.length}m
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {state.escalation.length} contact{state.escalation.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    value={state.title}
                    onChange={(e) => setState({ ...state, title: e.target.value })}
                    placeholder="Payments API 502 storm"
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>
              </div>

              {/* progress dial */}
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
                      strokeDasharray={`${progress.pct}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {progress.pct.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Steps complete
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {progress.done} / {progress.total}
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
                  { k: "operator", label: "Operator" },
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

            <select
              onChange={(e) => {
                if (e.target.value) loadPreset(e.target.value);
                e.target.value = "";
              }}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
              defaultValue=""
            >
              <option value="" disabled>
                Load preset…
              </option>
              {RUNBOOK_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                  {p.source ? ` — ${p.source}` : ""}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={download}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-app-elevated transition-opacity hover:opacity-90"
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
            </div>
          </div>
        </section>

        {mode === "operator" && (
          <ToolCard
            title="Operator mode"
            subtitle="Walk through the steps, tick as you go"
            className="mb-6"
          >
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Progress"
                value={`${progress.done} / ${progress.total}`}
                accent
              />
              <Stat label="% done" value={`${progress.pct.toFixed(0)}%`} />
              <Stat
                label="Checks done"
                value={`${state.checks.filter((s) => s.done).length} / ${
                  state.checks.length
                }`}
              />
              <Stat
                label="Mitigation done"
                value={`${state.mitigation.filter((s) => s.done).length} / ${
                  state.mitigation.length
                }`}
              />
            </div>
            <div className="h-3 overflow-hidden rounded-full border border-app bg-app">
              <div
                className="h-full bg-tool-accent transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={resetProgress}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-app"
              >
                Reset ticks
              </button>
              {state.rollback && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
                  Rollback ready: {state.rollback.slice(0, 60)}
                  {state.rollback.length > 60 ? "…" : ""}
                </div>
              )}
            </div>
          </ToolCard>
        )}

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
            {/* =========== LEFT RAIL TOC + MAIN BODY =========== */}
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              {/* LEFT RAIL */}
              <aside className="hidden lg:block">
                <div className="sticky top-6 rounded-xl border border-app bg-app-elevated p-4">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Step index
                  </div>
                  <div className="mt-1 text-[0.65rem] text-muted">
                    tap to jump
                  </div>

                  <div className="relative mt-4 space-y-1.5 pl-4">
                    <span className="pointer-events-none absolute bottom-1 left-1.5 top-1 w-px bg-tool-accent-soft" />
                    {tocItems.length === 0 && (
                      <div className="text-[0.7rem] text-muted">No steps yet.</div>
                    )}
                    {tocItems.map((it) => (
                      <a
                        key={it.id}
                        href={`#rb-step-${it.id}`}
                        className={`group flex items-start gap-2 rounded-md px-1.5 py-1 text-[0.7rem] transition-colors ${
                          it.done
                            ? "text-muted line-through"
                            : "text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
                        }`}
                      >
                        <span
                          className={`mt-[2px] inline-flex h-4 min-w-4 items-center justify-center rounded font-mono text-[0.55rem] font-semibold ${
                            it.phase === "check"
                              ? "bg-tool-accent-soft text-tool-accent"
                              : "bg-amber-500/15 text-amber-500"
                          }`}
                        >
                          {it.n}
                        </span>
                        <span className="line-clamp-2 flex-1">
                          {it.text || <span className="italic text-faint">(empty)</span>}
                        </span>
                      </a>
                    ))}
                  </div>

                  <div className="mt-5 border-t border-app pt-3">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      Sections
                    </div>
                    <div className="mt-2 space-y-1 font-mono text-[0.65rem]">
                      <a href="#rb-trigger" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ trigger
                      </a>
                      <a href="#rb-checks" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ checks
                      </a>
                      <a href="#rb-decision" className="block text-secondary transition-colors hover:text-tool-accent">
                        ◇ decision
                      </a>
                      <a href="#rb-mitigation" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ mitigation
                      </a>
                      <a href="#rb-rollback" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ rollback
                      </a>
                      <a href="#rb-escalation" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ escalation
                      </a>
                      <a href="#rb-acceptance" className="block text-secondary transition-colors hover:text-tool-accent">
                        ▸ acceptance
                      </a>
                    </div>
                  </div>
                </div>
              </aside>

              {/* MAIN BODY */}
              <div className="space-y-5">
                {/* Trigger */}
                <section id="rb-trigger">
                  <ToolCard title="Trigger / alert" subtitle="What woke you up">
                    <Field label="Trigger condition">
                      <textarea
                        value={state.trigger}
                        onChange={(e) =>
                          setState({ ...state, trigger: e.target.value })
                        }
                        rows={2}
                        placeholder="e.g. SEV2 — payments-api 5xx > 1% for 5m"
                        className={inputCls()}
                      />
                    </Field>
                  </ToolCard>
                </section>

                {/* Checks */}
                <section id="rb-checks">
                  <NumberedSteps
                    title="Checks"
                    subtitle="Verify before acting"
                    steps={state.checks}
                    onChange={(steps) => setState({ ...state, checks: steps })}
                    operator={mode === "operator"}
                    phase="check"
                    startNumber={1}
                  />
                </section>

                {/* Decision diamond branch */}
                <section id="rb-decision">
                  <div className="relative overflow-hidden rounded-xl border border-tool-accent bg-app-elevated p-5">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      Decision · branch
                    </div>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-app">
                      Did checks isolate the cause?
                    </h3>

                    <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr_auto_1fr]">
                      <div className="hidden items-center justify-center sm:flex">
                        <div
                          className="flex h-16 w-16 items-center justify-center border border-tool-accent bg-tool-accent-soft"
                          style={{ transform: "rotate(45deg)" }}
                        >
                          <span
                            className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-tool-accent"
                            style={{ transform: "rotate(-45deg)" }}
                          >
                            ?
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-emerald-500">
                          Yes → mitigate
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          Proceed to numbered mitigation steps below. Track in operator mode.
                        </div>
                      </div>

                      <div className="hidden font-mono text-xl text-faint sm:block">
                        ⇄
                      </div>

                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-3">
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-rose-500">
                          No → escalate
                        </div>
                        <div className="mt-1 text-xs text-secondary">
                          Page next on the escalation chain. Don&apos;t guess at fixes you can&apos;t verify.
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Mitigation */}
                <section id="rb-mitigation">
                  <NumberedSteps
                    title="Mitigation"
                    subtitle="Bring the service back"
                    steps={state.mitigation}
                    onChange={(steps) => setState({ ...state, mitigation: steps })}
                    operator={mode === "operator"}
                    phase="mit"
                    startNumber={state.checks.length + 1}
                  />
                </section>

                {/* Rollback */}
                <section id="rb-rollback">
                  <ToolCard
                    title="Rollback & verification"
                    subtitle="How to undo — and how to confirm the undo worked"
                  >
                    <Field label="Rollback plan">
                      <textarea
                        value={state.rollback}
                        onChange={(e) =>
                          setState({ ...state, rollback: e.target.value })
                        }
                        rows={4}
                        className={inputCls()}
                        placeholder="How to unwind the fix safely. Include checkpoints."
                      />
                    </Field>
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-amber-500">
                        Verification checklist (Google SRE)
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-secondary">
                        <li>Error rate returns to baseline for ≥ 15 min</li>
                        <li>p95 / p99 latency within 110% of pre-incident</li>
                        <li>No new alerts firing during rollback window</li>
                        <li>Downstream dependencies report healthy</li>
                        <li>Customer-facing flows (critical user journeys) pass smoke tests</li>
                      </ul>
                    </div>
                  </ToolCard>
                </section>

                {/* Acceptance */}
                <section id="rb-acceptance">
                  <ToolCard title="Acceptance criteria" subtitle="How we know it's fixed">
                    <Field label="Acceptance">
                      <textarea
                        value={state.acceptance}
                        onChange={(e) =>
                          setState({ ...state, acceptance: e.target.value })
                        }
                        rows={4}
                        className={inputCls()}
                      />
                    </Field>
                  </ToolCard>
                </section>
              </div>
            </div>

            {/* =========== ESCALATION CONTACTS FOOTER =========== */}
            <section id="rb-escalation" className="mt-6">
              <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    ▾ escalation contacts · who to page, and when
                  </div>
                  <button
                    onClick={() =>
                      setState({
                        ...state,
                        escalation: [
                          ...state.escalation,
                          { id: uid(), role: "", name: "", contact: "" },
                        ],
                      })
                    }
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    + Contact
                  </button>
                </div>

                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                  {state.escalation.map((c, idx) => {
                    const initials =
                      c.name
                        .split(/\s+/)
                        .map((s) => s[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "·";
                    return (
                      <div
                        key={c.id}
                        className="group relative rounded-xl border border-app bg-app p-3 transition-colors hover:border-tool-accent"
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-xs font-semibold text-tool-accent">
                            {initials}
                            <span
                              className="absolute -bottom-1 -right-1 rounded-full border border-app bg-tool-accent px-1 font-mono text-[0.5rem] font-bold"
                              style={{ color: "var(--bg)" }}
                            >
                              {idx + 1}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <input
                              value={c.role}
                              onChange={(e) =>
                                setState({
                                  ...state,
                                  escalation: state.escalation.map((x) =>
                                    x.id === c.id ? { ...x, role: e.target.value } : x
                                  ),
                                })
                              }
                              placeholder="Role (e.g. On-call SRE)"
                              className="w-full bg-transparent font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent placeholder:text-faint outline-none"
                            />
                            <input
                              value={c.name}
                              onChange={(e) =>
                                setState({
                                  ...state,
                                  escalation: state.escalation.map((x) =>
                                    x.id === c.id ? { ...x, name: e.target.value } : x
                                  ),
                                })
                              }
                              placeholder="Name"
                              className="w-full bg-transparent text-sm font-semibold text-app placeholder:text-faint outline-none"
                            />
                            <input
                              value={c.contact}
                              onChange={(e) =>
                                setState({
                                  ...state,
                                  escalation: state.escalation.map((x) =>
                                    x.id === c.id ? { ...x, contact: e.target.value } : x
                                  ),
                                })
                              }
                              placeholder="Contact (PagerDuty / Slack / Phone)"
                              className="w-full bg-transparent font-mono text-xs text-secondary placeholder:text-faint outline-none"
                            />
                          </div>
                          <button
                            onClick={() =>
                              setState({
                                ...state,
                                escalation: state.escalation.filter((x) => x.id !== c.id),
                              })
                            }
                            className="rounded-md border border-app px-2 text-muted opacity-0 transition-opacity hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                            aria-label="Remove contact"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {state.escalation.length === 0 && (
                    <div className="col-span-full rounded-xl border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                      No escalation contacts. Add at least one before publishing.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </ToolShell>
    </div>
  );
}

function NumberedSteps({
  title,
  subtitle,
  steps,
  onChange,
  operator = false,
  phase,
  startNumber,
}: {
  title: string;
  subtitle: string;
  steps: Step[];
  onChange: (steps: Step[]) => void;
  operator?: boolean;
  phase: "check" | "mit";
  startNumber: number;
}) {
  const numTone =
    phase === "check"
      ? "text-tool-accent"
      : "text-amber-500";
  const tagTone =
    phase === "check"
      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
      : "border-amber-500/40 bg-amber-500/10 text-amber-500";

  return (
    <ToolCard title={title} subtitle={subtitle}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${tagTone}`}>
          {phase === "check" ? "verify" : "act"}
        </span>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2.5">
        {steps.map((s, idx) => {
          const num = startNumber + idx;
          return (
            <div
              key={s.id}
              id={`rb-step-${s.id}`}
              className={`grid grid-cols-[auto_1fr_auto] items-stretch gap-2 ${
                operator && s.done ? "opacity-60" : ""
              }`}
            >
              {/* numbered chip */}
              {operator ? (
                <button
                  onClick={() =>
                    onChange(
                      steps.map((x) =>
                        x.id === s.id ? { ...x, done: !x.done } : x
                      )
                    )
                  }
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-app font-mono text-sm font-bold transition-colors ${
                    s.done
                      ? "border-emerald-500/50 text-emerald-500"
                      : `border-tool-accent ${numTone}`
                  }`}
                  aria-label="Toggle done"
                >
                  {s.done ? "✓" : num}
                </button>
              ) : (
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft font-mono text-sm font-bold ${numTone}`}>
                  {num}
                </span>
              )}

              {/* step body — input or operator-readout, plus mono command snippet zone */}
              <div className="min-w-0">
                {operator ? (
                  <div
                    className={`rounded-lg border border-app bg-app px-3 py-2 text-sm ${
                      s.done ? "text-muted line-through" : "text-app"
                    }`}
                  >
                    {s.text || <span className="text-faint">(empty step)</span>}
                  </div>
                ) : (
                  <div className="rounded-lg border border-app bg-app">
                    <div className="flex items-center gap-2 border-b border-app px-2.5 py-1">
                      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                        $ step.{num}
                      </span>
                      <span className="font-mono text-[0.55rem] text-muted">
                        {phase === "check" ? "verify" : "execute"}
                      </span>
                    </div>
                    <input
                      value={s.text}
                      onChange={(e) =>
                        onChange(
                          steps.map((x) =>
                            x.id === s.id ? { ...x, text: e.target.value } : x
                          )
                        )
                      }
                      placeholder={
                        phase === "check"
                          ? "kubectl get pods -n payments | grep CrashLoop"
                          : "kubectl rollout undo deploy/payments-api"
                      }
                      className="w-full bg-transparent px-2.5 py-2 font-mono text-sm text-app placeholder:text-faint outline-none"
                    />
                  </div>
                )}
              </div>

              {/* remove */}
              {!operator && (
                <button
                  onClick={() => onChange(steps.filter((x) => x.id !== s.id))}
                  className="self-stretch rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                  aria-label="Remove step"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {!operator && (
          <button
            onClick={() => onChange([...steps, { id: uid(), text: "" }])}
            className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
          >
            + Step
          </button>
        )}
      </div>
    </ToolCard>
  );
}
