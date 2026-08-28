"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import MintShareButton from "@/app/(share)/_components/MintShareButton";
import type { PageBlock } from "@/lib/share/types";

type Template = "consulting" | "saas" | "services";
type TabKey = "edit" | "preview" | "send";

interface Phase {
  id: string;
  name: string;
  weeks: number;
  deliverables: string;
}

interface LineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
}

interface Section {
  id: string;
  title: string;
  body: string;
  included: boolean;
}

interface State {
  template: Template;
  clientName: string;
  clientCompany: string;
  proposalTitle: string;
  preparedBy: string;
  date: string;
  problem: string;
  solution: string;
  phases: Phase[];
  items: LineItem[];
  nextSteps: string;
  terms: string;
  // additive: custom sections can be toggled on/off for the print version
  customSections?: Section[];
  includeProblem?: boolean;
  includeSolution?: boolean;
  includeTimeline?: boolean;
  includeInvestment?: boolean;
  includeNextSteps?: boolean;
  includeTerms?: boolean;
}

const LS_KEY = "solutions:proposal-generator:v1";
const MODE_LS_KEY = "solutions:proposal-generator:mode:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const PRESETS: Record<Template, Partial<State>> = {
  consulting: {
    problem:
      "The team's pipeline reporting is manual, error-prone, and too slow for weekly forecasts.",
    solution:
      "A 6-week engagement to audit current process, implement a single source of truth, and train the RevOps team.",
    phases: [
      {
        id: uid(),
        name: "Discovery",
        weeks: 1,
        deliverables: "Stakeholder interviews, current-state audit, requirements doc.",
      },
      {
        id: uid(),
        name: "Build",
        weeks: 3,
        deliverables: "Reports, dashboards, weekly forecast template.",
      },
      {
        id: uid(),
        name: "Rollout",
        weeks: 2,
        deliverables: "Training, documentation, 30-day support.",
      },
    ],
    items: [
      { id: uid(), description: "Discovery + audit", qty: 1, rate: 8000 },
      { id: uid(), description: "Build — dashboards & reports", qty: 1, rate: 24000 },
      { id: uid(), description: "Rollout + training", qty: 1, rate: 8000 },
    ],
  },
  saas: {
    problem:
      "Your CS team is manually reconciling usage data across 3 systems every week.",
    solution:
      "Annual Platform subscription with implementation services and dedicated success manager.",
    phases: [
      {
        id: uid(),
        name: "Onboarding",
        weeks: 2,
        deliverables: "Account setup, SSO, integrations, import of historical data.",
      },
      {
        id: uid(),
        name: "Live",
        weeks: 50,
        deliverables: "Ongoing platform access, quarterly business reviews.",
      },
    ],
    items: [
      { id: uid(), description: "Platform — 25 seats, annual", qty: 25, rate: 1200 },
      { id: uid(), description: "Implementation (one-time)", qty: 1, rate: 7500 },
    ],
  },
  services: {
    problem: "You need a partner to run outbound motion for the next quarter.",
    solution: "Fractional SDR team + tooling + weekly reporting.",
    phases: [
      {
        id: uid(),
        name: "Setup",
        weeks: 1,
        deliverables: "ICP, messaging, list building, sequences configured.",
      },
      {
        id: uid(),
        name: "Execute",
        weeks: 12,
        deliverables: "Outbound cadence, 250+ dials/week, meetings booked.",
      },
    ],
    items: [
      { id: uid(), description: "Monthly retainer", qty: 3, rate: 6500 },
      { id: uid(), description: "Tooling pass-through", qty: 3, rate: 400 },
    ],
  },
};

function defaultState(): State {
  return {
    template: "consulting",
    clientName: "Jane Doe",
    clientCompany: "Acme Co",
    proposalTitle: "Pipeline Reporting Engagement",
    preparedBy: "Spacefield",
    date: new Date().toISOString().slice(0, 10),
    problem: PRESETS.consulting.problem!,
    solution: PRESETS.consulting.solution!,
    phases: PRESETS.consulting.phases!.map((p) => ({ ...p, id: uid() })),
    items: PRESETS.consulting.items!.map((i) => ({ ...i, id: uid() })),
    nextSteps:
      "1. Review this proposal\n2. Sign + return by end of week\n3. Kickoff call the following Monday",
    terms:
      "Payment: 50% at signing, 50% at milestone completion. 30-day termination with pro-rata refund. Work product is client-owned upon final payment.",
    customSections: [],
    includeProblem: true,
    includeSolution: true,
    includeTimeline: true,
    includeInvestment: true,
    includeNextSteps: true,
    includeTerms: true,
  };
}

const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

/* Build the share.example.com PagePayload from the proposal's editable state.
 * Sections obey the same include* flags as the print preview. */
function buildProposalSharePayload(state: State, total: number) {
  const blocks: PageBlock[] = [];

  blocks.push({
    kind: "stats",
    items: [
      { label: "Prepared for", value: state.clientCompany || state.clientName || "—" },
      { label: "Prepared by", value: state.preparedBy || "—" },
      { label: "Date", value: state.date || "—" },
      { label: "Investment", value: money(total) },
    ],
  });

  if (state.includeProblem !== false && state.problem) {
    blocks.push({ kind: "heading", text: "The problem", level: 2 });
    blocks.push({ kind: "paragraph", text: state.problem });
  }
  if (state.includeSolution !== false && state.solution) {
    blocks.push({ kind: "heading", text: "Our proposed solution", level: 2 });
    blocks.push({ kind: "paragraph", text: state.solution });
  }

  for (const cs of state.customSections || []) {
    if (!cs.included) continue;
    if (cs.title) blocks.push({ kind: "heading", text: cs.title, level: 2 });
    if (cs.body) blocks.push({ kind: "paragraph", text: cs.body });
  }

  if (state.includeTimeline !== false && state.phases.length) {
    blocks.push({ kind: "heading", text: "Timeline", level: 2 });
    blocks.push({
      kind: "list",
      ordered: true,
      items: state.phases.map(
        (p) =>
          `${p.name} — ${p.weeks} week${p.weeks === 1 ? "" : "s"}${
            p.deliverables ? `: ${p.deliverables}` : ""
          }`
      ),
    });
  }

  if (state.includeInvestment !== false && state.items.length) {
    blocks.push({ kind: "heading", text: "Investment", level: 2 });
    blocks.push({
      kind: "stats",
      items: state.items.map((i) => ({
        label: i.description || "Line item",
        value: money(i.qty * i.rate),
      })),
    });
    blocks.push({
      kind: "stats",
      items: [{ label: "Total", value: money(total) }],
    });
  }

  if (state.includeNextSteps !== false && state.nextSteps) {
    blocks.push({ kind: "heading", text: "Next steps", level: 2 });
    blocks.push({ kind: "paragraph", text: state.nextSteps });
  }

  if (state.includeTerms !== false && state.terms) {
    blocks.push({ kind: "heading", text: "Terms", level: 2 });
    blocks.push({ kind: "paragraph", text: state.terms });
  }

  return {
    title: state.proposalTitle || "Proposal",
    blocks,
    ctaLabel: "Reply",
    ctaHref: undefined as string | undefined,
  };
}

export default function ProposalGeneratorPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Proposal Generator"
      description="Build a sales proposal section by section. Print-ready output with a cover, problem, solution, phases, investment, next steps, and terms."
    >
      <div data-tool-theme="sales" data-tool="proposal-generator">
        <Inner />
      </div>
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("edit");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "edit" || m === "preview" || m === "send") setMode(m as TabKey);
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

  const total = useMemo(
    () => state.items.reduce((s, i) => s + i.qty * i.rate, 0),
    [state.items]
  );
  const totalWeeks = useMemo(
    () => state.phases.reduce((s, p) => s + p.weeks, 0),
    [state.phases]
  );

  const loadTemplate = (t: Template) => {
    const p = PRESETS[t];
    setState((s) => ({
      ...s,
      template: t,
      problem: p.problem || s.problem,
      solution: p.solution || s.solution,
      phases: (p.phases || []).map((x) => ({ ...x, id: uid() })),
      items: (p.items || []).map((x) => ({ ...x, id: uid() })),
    }));
  };

  const addPhase = () =>
    setState((s) => ({
      ...s,
      phases: [
        ...s.phases,
        { id: uid(), name: "New phase", weeks: 1, deliverables: "" },
      ],
    }));

  const updatePhase = (id: string, patch: Partial<Phase>) =>
    setState((s) => ({
      ...s,
      phases: s.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const removePhase = (id: string) =>
    setState((s) => ({ ...s, phases: s.phases.filter((p) => p.id !== id) }));

  const addItem = () =>
    setState((s) => ({
      ...s,
      items: [
        ...s.items,
        { id: uid(), description: "New line", qty: 1, rate: 0 },
      ],
    }));

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

  const removeItem = (id: string) =>
    setState((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));

  const print = () => window.print();

  const addCustomSection = () =>
    setState((s) => ({
      ...s,
      customSections: [
        ...(s.customSections || []),
        {
          id: uid(),
          title: "Custom section",
          body: "",
          included: true,
        },
      ],
    }));

  const updateCustomSection = (id: string, patch: Partial<Section>) =>
    setState((s) => ({
      ...s,
      customSections: (s.customSections || []).map((x) =>
        x.id === id ? { ...x, ...patch } : x
      ),
    }));

  const removeCustomSection = (id: string) =>
    setState((s) => ({
      ...s,
      customSections: (s.customSections || []).filter((x) => x.id !== id),
    }));

  const initials = (state.clientCompany || state.clientName || "C")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sectionCount = useMemo(() => {
    let n = 0;
    if (state.includeProblem !== false) n++;
    if (state.includeSolution !== false) n++;
    if (state.includeTimeline !== false) n++;
    if (state.includeInvestment !== false) n++;
    if (state.includeNextSteps !== false) n++;
    if (state.includeTerms !== false) n++;
    n += (state.customSections || []).filter((c) => c.included).length;
    return n;
  }, [state]);

  return (
    <>
      {/* Print-only styles — paper-white proposal */}
      <style jsx global>{`
        @media print {
          header,
          nav,
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .proposal-print,
          .proposal-print * {
            background: white !important;
            color: black !important;
            border-color: #d4d4d4 !important;
            box-shadow: none !important;
          }
          .proposal-print .proposal-accent {
            color: #555 !important;
          }
          .proposal-print .proposal-muted {
            color: #666 !important;
          }
          .proposal-print .proposal-soft-bg {
            background: #f5f5f5 !important;
          }
        }
      `}</style>

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated no-print">
        {/* meta strip */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            Proposal · Draft
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            tpl:{state.template}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            proposal.doc
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {(state.proposalTitle || "untitled")
                .toLowerCase()
                .replace(/\s+/g, "-")}
              .pdf
            </span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ autosaved" : ""}
          </div>
        </div>

        {/* hero body */}
        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Sales Proposal · Print-ready document
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {sectionCount} section{sectionCount === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {state.phases.length} phase{state.phases.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {totalWeeks}w · {state.items.length} line{state.items.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                  {money(total)}
                </span>
              </div>

              <div className="mt-3">
                <input
                  value={state.proposalTitle}
                  onChange={(e) =>
                    setState({ ...state, proposalTitle: e.target.value })
                  }
                  placeholder="Pipeline Reporting Engagement"
                  className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                />
              </div>
            </div>

            {/* client identity card */}
            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft font-mono text-sm font-semibold text-tool-accent">
                {initials}
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Prepared for
                </div>
                <div className="text-sm font-semibold text-app">
                  {state.clientCompany || state.clientName || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* sub-tab strip — segmented pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "edit", label: "Edit" },
                { k: "preview", label: "Preview" },
                { k: "send", label: "Send" },
              ] as { k: TabKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  mode === t.k
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={mode === t.k ? { color: "var(--bg)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={state.template}
            onChange={(e) => loadTemplate(e.target.value as Template)}
            className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
          >
            <option value="consulting">Consulting</option>
            <option value="saas">SaaS</option>
            <option value="services">Services</option>
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            <MintShareButton
              type="page"
              sourceTool="proposal-generator"
              label="Share link"
              variant="ghost"
              disabled={!state.proposalTitle.trim()}
              resetKey={`${state.proposalTitle}|${state.clientName}|${state.items.length}`}
              payload={() => buildProposalSharePayload(state, total)}
            />
            <button
              onClick={print}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Print / PDF
            </button>
          </div>
        </div>
      </section>

      {/* Doc stats strip */}
      <div className="no-print mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={money(total)} accent />
        <Stat label="Weeks" value={String(totalWeeks)} />
        <Stat label="Phases" value={String(state.phases.length)} />
        <Stat label="Line items" value={String(state.items.length)} />
      </div>

      {mode === "edit" && (
        <EditMode
          state={state}
          setState={setState}
          total={total}
          totalWeeks={totalWeeks}
          addPhase={addPhase}
          updatePhase={updatePhase}
          removePhase={removePhase}
          addItem={addItem}
          updateItem={updateItem}
          removeItem={removeItem}
          addCustomSection={addCustomSection}
          updateCustomSection={updateCustomSection}
          removeCustomSection={removeCustomSection}
        />
      )}

      {mode === "send" && (
        <div className="no-print">
          <ToolCard
            title="Send"
            subtitle="Export the proposal — share, email, or print to PDF"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Public share link
                </div>
                <div className="mt-2 text-sm text-secondary">
                  Publish to <span className="text-app">share.example.com</span>{" "}
                  — copy a URL the client opens in any browser, no PDF needed.
                </div>
                <div className="mt-3">
                  <MintShareButton
                    type="page"
                    sourceTool="proposal-generator"
                    label="Create share link"
                    disabled={!state.proposalTitle.trim()}
                    resetKey={`${state.proposalTitle}|${state.clientName}|${state.items.length}`}
                    payload={() => buildProposalSharePayload(state, total)}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  PDF export
                </div>
                <div className="mt-2 text-sm text-secondary">
                  Use the browser print dialog. Choose &ldquo;Save as PDF&rdquo;
                  for a clean paper-white document.
                </div>
                <button
                  onClick={print}
                  className="mt-3 rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Open print dialog
                </button>
              </div>
              <div className="rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Email handoff
                </div>
                <div className="mt-2 text-sm text-secondary">
                  Save the PDF, then attach it to a fresh email to{" "}
                  <span className="text-app">
                    {state.clientName || "the client"}
                  </span>
                  .
                </div>
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    state.proposalTitle
                  )}&body=${encodeURIComponent(
                    `Hi ${state.clientName},\n\nAttached is the proposal — ${state.proposalTitle}.\n\nBest,\n${state.preparedBy}`
                  )}`}
                  className="mt-3 inline-block rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Draft email
                </a>
              </div>
            </div>
          </ToolCard>
        </div>
      )}

      {/* Print-ready proposal — wrapped in elevated viewport for screen, paper-white in print */}
      {mode === "preview" || mode === "edit" ? (
        <div
          className={`mt-8 rounded-xl border border-app ${
            mode === "preview" ? "bg-app-elevated p-4 md:p-8" : "no-print bg-app-elevated p-4 md:p-6"
          }`}
        >
          {mode === "edit" && (
            <div className="mb-3 flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              <span className="text-tool-accent">▸</span> Live preview · what
              the client sees
            </div>
          )}
          <ProposalDocument
            state={state}
            total={total}
            totalWeeks={totalWeeks}
            initials={initials}
          />
        </div>
      ) : null}
    </>
  );
}

/* ----- Edit mode (the editor stack) ----- */

function EditMode({
  state,
  setState,
  total,
  totalWeeks,
  addPhase,
  updatePhase,
  removePhase,
  addItem,
  updateItem,
  removeItem,
  addCustomSection,
  updateCustomSection,
  removeCustomSection,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  total: number;
  totalWeeks: number;
  addPhase: () => void;
  updatePhase: (id: string, patch: Partial<Phase>) => void;
  removePhase: (id: string) => void;
  addItem: () => void;
  updateItem: (id: string, patch: Partial<LineItem>) => void;
  removeItem: (id: string) => void;
  addCustomSection: () => void;
  updateCustomSection: (id: string, patch: Partial<Section>) => void;
  removeCustomSection: (id: string) => void;
}) {
  return (
    <div className="no-print space-y-5">
      {/* Section visibility — outline checklist */}
      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Outline · Sections in print
          </div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            Toggle to include / omit
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          {[
            ["includeProblem", "Problem"],
            ["includeSolution", "Solution"],
            ["includeTimeline", "Timeline"],
            ["includeInvestment", "Investment"],
            ["includeNextSteps", "Next steps"],
            ["includeTerms", "Terms"],
          ].map(([key, label]) => {
            const checked =
              (state[key as keyof State] as boolean | undefined) !== false;
            return (
              <label
                key={key as string}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  checked
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setState({ ...state, [key as string]: e.target.checked })
                  }
                  className="accent-[color:var(--tool-accent)]"
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Cover & parties */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <ToolCard title="Document" subtitle="Title, date, prepared by">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Proposal title">
              <input
                value={state.proposalTitle}
                onChange={(e) =>
                  setState({ ...state, proposalTitle: e.target.value })
                }
                className={inputCls()}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={state.date}
                onChange={(e) => setState({ ...state, date: e.target.value })}
                className={inputCls()}
              />
            </Field>
            <Field label="Prepared by">
              <input
                value={state.preparedBy}
                onChange={(e) =>
                  setState({ ...state, preparedBy: e.target.value })
                }
                className={inputCls()}
              />
            </Field>
          </div>
        </ToolCard>

        <ToolCard title="Client" subtitle="Recipient details">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Client name">
              <input
                value={state.clientName}
                onChange={(e) =>
                  setState({ ...state, clientName: e.target.value })
                }
                className={inputCls()}
              />
            </Field>
            <Field label="Client company">
              <input
                value={state.clientCompany}
                onChange={(e) =>
                  setState({ ...state, clientCompany: e.target.value })
                }
                className={inputCls()}
              />
            </Field>
          </div>
        </ToolCard>
      </div>

      {/* Narrative */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <ToolCard title="Problem & solution" subtitle="The core argument">
          <div className="space-y-3">
            <Field label="Problem statement">
              <textarea
                value={state.problem}
                onChange={(e) =>
                  setState({ ...state, problem: e.target.value })
                }
                className={inputCls("min-h-[100px]")}
              />
            </Field>
            <Field label="Proposed solution">
              <textarea
                value={state.solution}
                onChange={(e) =>
                  setState({ ...state, solution: e.target.value })
                }
                className={inputCls("min-h-[100px]")}
              />
            </Field>
          </div>
        </ToolCard>

        <ToolCard
          title="Custom sections"
          subtitle="Extras: testimonials, security, success criteria"
        >
          <div className="mb-3 flex justify-end">
            <button
              onClick={addCustomSection}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            >
              + Section
            </button>
          </div>
          <div className="space-y-3">
            {(state.customSections || []).map((cs) => (
              <div
                key={cs.id}
                className="rounded-lg border border-app bg-app p-3"
              >
                <div className="mb-2 grid grid-cols-[2fr_auto_auto] gap-2">
                  <input
                    value={cs.title}
                    onChange={(e) =>
                      updateCustomSection(cs.id, { title: e.target.value })
                    }
                    className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
                  />
                  <label className="flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary">
                    <input
                      type="checkbox"
                      checked={cs.included}
                      onChange={(e) =>
                        updateCustomSection(cs.id, {
                          included: e.target.checked,
                        })
                      }
                      className="accent-[color:var(--tool-accent)]"
                    />
                    Include
                  </label>
                  <button
                    onClick={() => removeCustomSection(cs.id)}
                    className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  value={cs.body}
                  onChange={(e) =>
                    updateCustomSection(cs.id, { body: e.target.value })
                  }
                  className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-secondary outline-none transition-colors focus:border-tool-accent"
                  rows={3}
                />
              </div>
            ))}
            {(state.customSections || []).length === 0 && (
              <div className="rounded-lg border border-dashed border-app p-4 text-center text-xs text-muted">
                Add sections like Testimonials, Case study, Security overview,
                Success criteria.
              </div>
            )}
          </div>
        </ToolCard>
      </div>

      {/* Plan / Phases */}
      <ToolCard title="Phases" subtitle="Sequence of work">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            {state.phases.length} phase{state.phases.length === 1 ? "" : "s"} ·{" "}
            <span className="text-secondary">{totalWeeks} weeks total</span>
          </div>
          <button
            onClick={addPhase}
            className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
          >
            + Phase
          </button>
        </div>
        <div className="space-y-2">
          {state.phases.map((p, idx) => (
            <div
              key={p.id}
              className="rounded-lg border border-app bg-app p-3 transition-colors hover:border-tool-accent"
            >
              <div className="grid grid-cols-[auto_2fr_1fr_auto] items-center gap-2">
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  P{String(idx + 1).padStart(2, "0")}
                </span>
                <input
                  value={p.name}
                  onChange={(e) =>
                    updatePhase(p.id, { name: e.target.value })
                  }
                  className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
                />
                <input
                  type="number"
                  value={p.weeks}
                  onChange={(e) =>
                    updatePhase(p.id, {
                      weeks: Number(e.target.value) || 0,
                    })
                  }
                  className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
                  placeholder="weeks"
                />
                <button
                  onClick={() => removePhase(p.id)}
                  className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  ×
                </button>
              </div>
              <input
                value={p.deliverables}
                onChange={(e) =>
                  updatePhase(p.id, { deliverables: e.target.value })
                }
                placeholder="Deliverables"
                className="mt-2 w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-secondary outline-none transition-colors focus:border-tool-accent"
              />
            </div>
          ))}
        </div>
      </ToolCard>

      {/* Pricing */}
      <ToolCard title="Line items" subtitle="Quantity, rate, amount">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            Subtotal:{" "}
            <span className="text-tool-accent">{money(total)}</span>
          </div>
          <button
            onClick={addItem}
            className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
          >
            + Line
          </button>
        </div>
        <div className="space-y-2">
          {state.items.map((i) => (
            <div
              key={i.id}
              className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2"
            >
              <input
                value={i.description}
                onChange={(e) =>
                  updateItem(i.id, { description: e.target.value })
                }
                className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
              />
              <input
                type="number"
                value={i.qty}
                onChange={(e) =>
                  updateItem(i.id, { qty: Number(e.target.value) || 0 })
                }
                className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
                placeholder="qty"
              />
              <input
                type="number"
                value={i.rate}
                onChange={(e) =>
                  updateItem(i.id, { rate: Number(e.target.value) || 0 })
                }
                className="rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none transition-colors focus:border-tool-accent"
                placeholder="rate"
              />
              <button
                onClick={() => removeItem(i.id)}
                className="rounded-md border border-app px-2 py-1 font-mono text-[0.55rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </ToolCard>

      {/* Closing */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <ToolCard title="Next steps" subtitle="What happens after signing">
          <Field label="Next steps">
            <textarea
              value={state.nextSteps}
              onChange={(e) =>
                setState({ ...state, nextSteps: e.target.value })
              }
              className={inputCls("min-h-[120px]")}
            />
          </Field>
        </ToolCard>
        <ToolCard title="Terms" subtitle="Legal, payment, scope notes">
          <Field label="Terms">
            <textarea
              value={state.terms}
              onChange={(e) => setState({ ...state, terms: e.target.value })}
              className={inputCls("min-h-[120px]")}
            />
          </Field>
        </ToolCard>
      </div>
    </div>
  );
}

/* ----- Print-ready document body — paper-white when printed ----- */

function ProposalDocument({
  state,
  total,
  totalWeeks,
  initials,
}: {
  state: State;
  total: number;
  totalWeeks: number;
  initials: string;
}) {
  return (
    <div className="proposal-print overflow-hidden rounded-xl border border-app bg-app">
      {/* COVER PAGE */}
      <div className="relative border-b border-app px-10 py-14">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="proposal-accent font-mono text-[0.6rem] uppercase tracking-[0.3em] text-tool-accent">
              Proposal · Confidential
            </div>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-app">
              {state.proposalTitle}
            </h1>
            <div className="proposal-muted mt-2 text-sm text-secondary">
              Prepared for {state.clientCompany || state.clientName}
            </div>
          </div>
          <div className="hidden h-16 w-16 items-center justify-center rounded-lg border border-app bg-app-elevated text-lg font-semibold text-tool-accent sm:flex">
            {initials}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-app pt-6 text-sm sm:grid-cols-3">
          <CoverField label="Prepared for">
            <div className="text-app">{state.clientName}</div>
            <div className="proposal-muted text-secondary">
              {state.clientCompany}
            </div>
          </CoverField>
          <CoverField label="Prepared by">
            <div className="text-app">{state.preparedBy}</div>
          </CoverField>
          <CoverField label="Date">
            <div className="text-app">{state.date}</div>
          </CoverField>
        </div>

        <div className="proposal-muted mt-8 flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          <span className="proposal-soft-bg rounded-full border border-tool-accent bg-tool-accent-soft px-2.5 py-1 text-tool-accent">
            {state.template}
          </span>
          <span>·</span>
          <span>{totalWeeks} weeks</span>
          <span>·</span>
          <span>{state.phases.length} phases</span>
          <span>·</span>
          <span className="proposal-accent text-tool-accent">
            {money(total)}
          </span>
        </div>
      </div>

      {/* TABLE OF CONTENTS */}
      <div className="border-b border-app px-10 py-6">
        <div className="proposal-muted mb-3 font-mono text-[0.55rem] uppercase tracking-[0.25em] text-muted">
          Contents
        </div>
        <ol className="space-y-1.5 text-sm text-secondary">
          {[
            state.includeProblem !== false && "The problem",
            state.includeSolution !== false && "Our proposed solution",
            ...((state.customSections || [])
              .filter((c) => c.included)
              .map((c) => c.title)),
            state.includeTimeline !== false && "Timeline",
            state.includeInvestment !== false && "Investment",
            state.includeNextSteps !== false && "Next steps",
            state.includeTerms !== false && "Terms",
          ]
            .filter(Boolean)
            .map((title, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-app pb-1.5"
              >
                <span>
                  <span className="proposal-accent mr-2 font-mono text-tool-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {title as string}
                </span>
                <span className="text-faint">·</span>
              </li>
            ))}
        </ol>
      </div>

      {/* BODY */}
      <div className="space-y-2 px-10 py-10">
        {state.includeProblem !== false && (
          <DocBodySection num="01" title="The problem">
            <p className="whitespace-pre-wrap leading-relaxed text-app">
              {state.problem}
            </p>
          </DocBodySection>
        )}

        {state.includeSolution !== false && (
          <DocBodySection num="02" title="Our proposed solution">
            <p className="whitespace-pre-wrap leading-relaxed text-app">
              {state.solution}
            </p>
          </DocBodySection>
        )}

        {(state.customSections || [])
          .filter((cs) => cs.included)
          .map((cs, i) => (
            <DocBodySection
              key={cs.id}
              num={`E${String(i + 1).padStart(2, "0")}`}
              title={cs.title}
            >
              <p className="whitespace-pre-wrap leading-relaxed text-app">
                {cs.body}
              </p>
            </DocBodySection>
          ))}

        {state.includeTimeline !== false && (
          <DocBodySection num="03" title="Timeline">
            <div className="overflow-hidden rounded-lg border border-app">
              <table className="w-full text-sm">
                <thead className="proposal-soft-bg bg-tool-accent-soft font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  <tr>
                    <th className="p-3 text-left font-semibold">Phase</th>
                    <th className="p-3 text-left font-semibold">Weeks</th>
                    <th className="p-3 text-left font-semibold">
                      Deliverables
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.phases.map((p, idx) => (
                    <tr key={p.id} className="border-t border-app">
                      <td className="p-3 font-medium text-app">
                        <span className="proposal-accent mr-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                          P{String(idx + 1).padStart(2, "0")}
                        </span>
                        {p.name}
                      </td>
                      <td className="p-3 text-secondary">{p.weeks}</td>
                      <td className="p-3 text-secondary">{p.deliverables}</td>
                    </tr>
                  ))}
                  <tr className="proposal-soft-bg border-t border-app bg-tool-accent-soft">
                    <td className="p-3 font-semibold text-app">Total</td>
                    <td className="proposal-accent p-3 font-semibold text-tool-accent">
                      {totalWeeks} weeks
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </DocBodySection>
        )}

        {state.includeInvestment !== false && (
          <DocBodySection num="04" title="Investment">
            <div className="overflow-hidden rounded-lg border border-app">
              <table className="w-full text-sm">
                <thead className="proposal-soft-bg bg-tool-accent-soft font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  <tr>
                    <th className="p-3 text-left font-semibold">
                      Description
                    </th>
                    <th className="p-3 text-right font-semibold">Qty</th>
                    <th className="p-3 text-right font-semibold">Rate</th>
                    <th className="p-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {state.items.map((i) => (
                    <tr key={i.id} className="border-t border-app">
                      <td className="p-3 text-app">{i.description}</td>
                      <td className="p-3 text-right text-secondary">
                        {i.qty}
                      </td>
                      <td className="p-3 text-right text-secondary">
                        {money(i.rate)}
                      </td>
                      <td className="p-3 text-right font-medium text-app">
                        {money(i.qty * i.rate)}
                      </td>
                    </tr>
                  ))}
                  <tr className="proposal-soft-bg border-t border-app bg-tool-accent-soft">
                    <td
                      colSpan={3}
                      className="p-3 text-right font-semibold text-app"
                    >
                      Total
                    </td>
                    <td className="proposal-accent p-3 text-right text-base font-bold text-tool-accent">
                      {money(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DocBodySection>
        )}

        {state.includeNextSteps !== false && (
          <DocBodySection num="05" title="Next steps">
            <p className="whitespace-pre-wrap leading-relaxed text-app">
              {state.nextSteps}
            </p>
          </DocBodySection>
        )}

        {state.includeTerms !== false && (
          <DocBodySection num="06" title="Terms">
            <div className="rounded-lg border border-app bg-app-elevated p-4 text-sm leading-relaxed text-secondary">
              <p className="whitespace-pre-wrap">{state.terms}</p>
            </div>
          </DocBodySection>
        )}

        {/* Signature block */}
        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-app pt-8 sm:grid-cols-2">
          <SignBlock label="Client signature" name={state.clientName} />
          <SignBlock label="Issued by" name={state.preparedBy} />
        </div>
      </div>

      {/* Footer */}
      <div className="proposal-muted flex items-center justify-between border-t border-app px-10 py-4 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
        <span>{state.proposalTitle}</span>
        <span>· {state.date} ·</span>
        <span>Confidential</span>
      </div>
    </div>
  );
}

/* ----- Local presentational helpers ----- */

function DocBodySection({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="proposal-accent font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
          {num}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-app">
          {title}
        </h2>
        <span className="ml-2 h-px flex-1 bg-tool-accent-soft" />
      </div>
      <div className="pl-8">{children}</div>
    </section>
  );
}

function CoverField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="proposal-accent font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function SignBlock({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="proposal-accent font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
        {label}
      </div>
      <div className="mt-6 border-b border-app" />
      <div className="proposal-muted mt-2 flex items-center justify-between text-xs text-secondary">
        <span>{name}</span>
        <span>Date</span>
      </div>
    </div>
  );
}
