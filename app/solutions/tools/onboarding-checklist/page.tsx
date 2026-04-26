"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Timeframe = "day0" | "week1" | "week2" | "month1" | "quarter1";
type Status = "todo" | "in-progress" | "done";

interface Task {
  id: string;
  title: string;
  owner: string;
  due: string; // day offset like "D+0", "W1", custom
  status: Status;
  timeframe: Timeframe;
}

const TIMEFRAMES: { key: Timeframe; label: string; rail: string; tag: string }[] = [
  { key: "day0", label: "Day 0 — First day", rail: "Day 1", tag: "D+0" },
  { key: "week1", label: "Week 1", rail: "Week 1", tag: "W1" },
  { key: "week2", label: "Week 2", rail: "Week 2", tag: "W2" },
  { key: "month1", label: "Month 1", rail: "Month 1", tag: "M1" },
  { key: "quarter1", label: "Quarter 1", rail: "90-Day", tag: "Q1" },
];

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  day0: 0,
  week1: 7,
  week2: 14,
  month1: 30,
  quarter1: 90,
};

type RoleKey = "swe" | "sales" | "marketing" | "ops" | "exec" | "support" | "legal" | "finance" | "cs" | "blank";

const ROLES: { key: RoleKey; label: string }[] = [
  { key: "swe", label: "Software Engineer" },
  { key: "sales", label: "Sales / AE" },
  { key: "marketing", label: "Marketing" },
  { key: "ops", label: "Operations" },
  { key: "exec", label: "Executive" },
  { key: "support", label: "Customer Support" },
  { key: "legal", label: "Legal / Counsel" },
  { key: "finance", label: "Finance / Accounting" },
  { key: "cs", label: "Customer Success" },
  { key: "blank", label: "Blank (start from scratch)" },
];

let __id = 0;
const nid = () => `t_${Date.now()}_${__id++}`;

const TEMPLATES: Record<RoleKey, Omit<Task, "id" | "status">[]> = {
  swe: [
    { title: "Sign offer, NDA, IP agreement", owner: "People Ops", due: "D+0", timeframe: "day0" },
    { title: "Laptop, SSO, email, Slack, GitHub access", owner: "IT", due: "D+0", timeframe: "day0" },
    { title: "Meet manager + onboarding buddy", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Clone core repos, pass README bootstrap", owner: "New hire", due: "D+1", timeframe: "week1" },
    { title: "Ship first PR (docs fix or tiny bug)", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Shadow on-call / incident channel", owner: "Manager", due: "W1", timeframe: "week1" },
    { title: "Pair with senior on a real feature", owner: "Buddy", due: "W2", timeframe: "week2" },
    { title: "Design review with tech lead", owner: "Tech Lead", due: "W2", timeframe: "week2" },
    { title: "Own first small project end-to-end", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Architecture deep-dive session", owner: "Tech Lead", due: "M1", timeframe: "month1" },
    { title: "Drive a non-trivial feature to production", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "30/60/90 review with manager", owner: "Manager", due: "Q1", timeframe: "quarter1" },
    { title: "Participate in on-call rotation", owner: "New hire", due: "Q1", timeframe: "quarter1" },
  ],
  sales: [
    { title: "Offer signed, CRM seat, dialer, comp plan", owner: "RevOps", due: "D+0", timeframe: "day0" },
    { title: "ICP + competitive battlecard review", owner: "Enablement", due: "D+0", timeframe: "day0" },
    { title: "Intro to SDR pod + AEs", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Product demo certification (dry run)", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Shadow 5 live discovery calls", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Complete enablement curriculum", owner: "Enablement", due: "W2", timeframe: "week2" },
    { title: "Run mock discovery call with manager feedback", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Pass demo + objection-handling certification", owner: "Manager", due: "M1", timeframe: "month1" },
    { title: "Book first 10 meetings / qualify pipeline", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Territory + account plan approved", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Close first deal (or advance to late-stage)", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "Hit ramped quota milestone", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "QBR readout with leadership", owner: "Manager", due: "Q1", timeframe: "quarter1" },
  ],
  marketing: [
    { title: "Access to CMS, analytics, ad platforms, CRM", owner: "IT / RevOps", due: "D+0", timeframe: "day0" },
    { title: "Brand voice + style guide walkthrough", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Review active campaigns + OKRs", owner: "Manager", due: "W1", timeframe: "week1" },
    { title: "Audit top 10 landing pages + funnel metrics", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Ship first content asset or experiment", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Own a recurring channel (SEO, email, paid, social)", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Present Q1 plan to cross-functional stakeholders", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "Hit first pipeline / MQL target", owner: "New hire", due: "Q1", timeframe: "quarter1" },
  ],
  ops: [
    { title: "Offer, NDA, system access (ERP, docs, tools)", owner: "People Ops", due: "D+0", timeframe: "day0" },
    { title: "Org chart + key-process map walkthrough", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Shadow each core workflow end-to-end", owner: "Team leads", due: "W1", timeframe: "week1" },
    { title: "Document one process with inefficiencies", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Meet all cross-functional partners", owner: "Manager", due: "W2", timeframe: "week2" },
    { title: "Propose 3 improvements with expected impact", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Own a recurring operational review", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Execute one improvement + measure outcome", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "30/60/90 review", owner: "Manager", due: "Q1", timeframe: "quarter1" },
  ],
  exec: [
    { title: "Legal docs, comp, equity paperwork", owner: "People Ops", due: "D+0", timeframe: "day0" },
    { title: "1:1s scheduled with all direct reports + peers", owner: "EA", due: "D+0", timeframe: "day0" },
    { title: "Review last 4 board decks + strategy docs", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Listening tour: 20 stakeholder conversations", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "First all-hands / function-wide address", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Publish 30/60/90 thesis + priorities", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Identify and start 2 high-leverage initiatives", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "Board / CEO checkpoint on plan", owner: "CEO", due: "Q1", timeframe: "quarter1" },
  ],
  support: [
    { title: "Access to helpdesk, KB, product sandbox", owner: "IT", due: "D+0", timeframe: "day0" },
    { title: "Meet team + buddy, tone-of-voice review", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Complete product fundamentals training", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Shadow 20 tickets across tiers", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Handle first tier-1 tickets with review", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "KB authoring training", owner: "Manager", due: "W2", timeframe: "week2" },
    { title: "Pass tier-1 certification, unassisted", owner: "Manager", due: "M1", timeframe: "month1" },
    { title: "Contribute 3 KB articles", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "Handle full ticket load + CSAT target", owner: "New hire", due: "Q1", timeframe: "quarter1" },
  ],
  legal: [
    { title: "Offer, NDA, conflict-of-interest declaration", owner: "People Ops", due: "D+0", timeframe: "day0" },
    { title: "Access: DMS, contract repository, matter mgmt", owner: "IT", due: "D+0", timeframe: "day0" },
    { title: "Meet GC + functional stakeholders", owner: "GC", due: "D+0", timeframe: "day0" },
    { title: "Review standard contract templates + playbooks", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Shadow 3 active deal reviews", owner: "GC", due: "W1", timeframe: "week1" },
    { title: "Jurisdiction + regulatory landscape briefing", owner: "GC", due: "W1", timeframe: "week1" },
    { title: "Own first contract redline end-to-end", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Compliance framework walkthrough (SOC2, GDPR, etc.)", owner: "GC", due: "W2", timeframe: "week2" },
    { title: "Manage full contract queue for one business unit", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Deliver first legal-risk memo to leadership", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Lead one policy update or template refresh", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "30/60/90 review + outside-counsel relationships mapped", owner: "GC", due: "Q1", timeframe: "quarter1" },
  ],
  finance: [
    { title: "Offer, NDA, bank/payroll system access", owner: "People Ops", due: "D+0", timeframe: "day0" },
    { title: "Access: ERP, GL, FP&A tools, BI dashboards", owner: "IT", due: "D+0", timeframe: "day0" },
    { title: "Chart of accounts + close calendar walkthrough", owner: "Controller", due: "D+0", timeframe: "day0" },
    { title: "Shadow monthly close process", owner: "Team lead", due: "W1", timeframe: "week1" },
    { title: "Review last 2 board decks + financial model", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Meet with auditor + key vendors", owner: "Controller", due: "W1", timeframe: "week1" },
    { title: "Own one reconciliation or variance analysis", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Document one manual process + improvement idea", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Lead part of monthly close unassisted", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Deliver first budget or forecast update", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Present a financial review to leadership", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "30/60/90 review with CFO", owner: "CFO", due: "Q1", timeframe: "quarter1" },
  ],
  cs: [
    { title: "Offer, NDA, CRM + CS platform access", owner: "RevOps", due: "D+0", timeframe: "day0" },
    { title: "Customer segmentation + health-score training", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Meet CS team + buddy, assigned books of business", owner: "Manager", due: "D+0", timeframe: "day0" },
    { title: "Product fundamentals + use-case certification", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Shadow 5 QBRs and renewal calls", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Read latest NPS + CSAT results", owner: "New hire", due: "W1", timeframe: "week1" },
    { title: "Run first kickoff / onboarding call with oversight", owner: "New hire", due: "W2", timeframe: "week2" },
    { title: "Adoption-playbook certification", owner: "Manager", due: "W2", timeframe: "week2" },
    { title: "Own full book of business independently", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "First renewal or expansion identified + worked", owner: "New hire", due: "M1", timeframe: "month1" },
    { title: "Hit first gross retention milestone", owner: "New hire", due: "Q1", timeframe: "quarter1" },
    { title: "Deliver one success story / case study", owner: "New hire", due: "Q1", timeframe: "quarter1" },
  ],
  blank: [],
};

const STORAGE_KEY = "solutions.onboarding-checklist.v1";

interface State {
  hireName: string;
  role: RoleKey;
  startDate: string;
  tasks: Task[];
}

const defaultState: State = {
  hireName: "",
  role: "swe",
  startDate: new Date().toISOString().slice(0, 10),
  tasks: [],
};

function seedTasks(role: RoleKey): Task[] {
  return TEMPLATES[role].map((t) => ({ ...t, id: nid(), status: "todo" as Status }));
}

function ownerInitials(name: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function OnboardingChecklistPage() {
  const [state, setState] = useState<State>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [activePhase, setActivePhase] = useState<Timeframe | "all">("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setState({ ...defaultState, ...JSON.parse(raw) });
      } else {
        setState((s) => ({ ...s, tasks: seedTasks(s.role) }));
      }
    } catch {
      setState((s) => ({ ...s, tasks: seedTasks(s.role) }));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, loaded]);

  const loadTemplate = (role: RoleKey) => {
    if (
      state.tasks.length > 0 &&
      !confirm("Replace current checklist with the template for this role?")
    )
      return;
    setState((s) => ({ ...s, role, tasks: seedTasks(role) }));
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const addTask = (timeframe: Timeframe) => {
    setState((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        {
          id: nid(),
          title: "New task",
          owner: "",
          due: "",
          status: "todo",
          timeframe,
        },
      ],
    }));
  };

  const removeTask = (id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  };

  const progress = useMemo(() => {
    if (state.tasks.length === 0) return { pct: 0, done: 0, total: 0 };
    const done = state.tasks.filter((t) => t.status === "done").length;
    return { pct: Math.round((done / state.tasks.length) * 100), done, total: state.tasks.length };
  }, [state.tasks]);

  const byTimeframe = useMemo(() => {
    const g: Record<Timeframe, Task[]> = { day0: [], week1: [], week2: [], month1: [], quarter1: [] };
    for (const t of state.tasks) g[t.timeframe].push(t);
    return g;
  }, [state.tasks]);

  // Per-timeframe progress for rail dots
  const railProgress = useMemo(() => {
    const r: Record<Timeframe, { done: number; total: number; pct: number }> = {
      day0: { done: 0, total: 0, pct: 0 },
      week1: { done: 0, total: 0, pct: 0 },
      week2: { done: 0, total: 0, pct: 0 },
      month1: { done: 0, total: 0, pct: 0 },
      quarter1: { done: 0, total: 0, pct: 0 },
    };
    for (const tf of TIMEFRAMES) {
      const items = byTimeframe[tf.key];
      const done = items.filter((t) => t.status === "done").length;
      r[tf.key] = {
        done,
        total: items.length,
        pct: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
      };
    }
    return r;
  }, [byTimeframe]);

  // Days remaining to next un-completed milestone
  const milestoneCountdown = useMemo(() => {
    const start = state.startDate ? new Date(state.startDate) : new Date();
    const today = new Date();
    const elapsedMs = today.getTime() - start.getTime();
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
    let next: { key: Timeframe; rail: string; days: number } | null = null;
    for (const tf of TIMEFRAMES) {
      const rp = railProgress[tf.key];
      if (rp.total > 0 && rp.done < rp.total) {
        const target = TIMEFRAME_DAYS[tf.key];
        next = { key: tf.key, rail: tf.rail, days: target - elapsedDays };
        break;
      }
    }
    return { elapsedDays, next };
  }, [state.startDate, railProgress]);

  const exportMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# Onboarding — ${state.hireName || "New hire"}`);
    lines.push("");
    lines.push(`**Role:** ${ROLES.find((r) => r.key === state.role)?.label || state.role}`);
    lines.push(`**Start date:** ${state.startDate}`);
    lines.push(`**Progress:** ${progress.done}/${progress.total} (${progress.pct}%)`);
    lines.push("");
    for (const tf of TIMEFRAMES) {
      const items = byTimeframe[tf.key];
      if (items.length === 0) continue;
      lines.push(`## ${tf.label}`);
      lines.push("");
      for (const t of items) {
        const box = t.status === "done" ? "[x]" : "[ ]";
        const meta = [t.owner, t.due].filter(Boolean).join(" · ");
        lines.push(`- ${box} ${t.title}${meta ? ` _(${meta})_` : ""}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    download(blob, `onboarding-${state.hireName || "new-hire"}.md`);
  };

  const exportCsv = () => {
    const rows = [["Timeframe", "Task", "Owner", "Due", "Status"]];
    for (const tf of TIMEFRAMES) {
      for (const t of byTimeframe[tf.key]) {
        rows.push([tf.label, t.title, t.owner, t.due, t.status]);
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    download(blob, `onboarding-${state.hireName || "new-hire"}.csv`);
  };

  const visibleTimeframes = activePhase === "all"
    ? TIMEFRAMES
    : TIMEFRAMES.filter((tf) => tf.key === activePhase);

  return (
    <div data-tool-theme="hr" data-tool="onboarding-checklist">
      <ToolShell
        category="HR & People"
        title="Onboarding Checklist"
        description="Structured onboarding by role — Day 0, Week 1, Month 1, Quarter 1. Saves to your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — role + phase chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {ROLES.find((r) => r.key === state.role)?.label.split(" ")[0] || "ROLE"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              day {milestoneCountdown.elapsedDays >= 0 ? milestoneCountdown.elapsedDays : "—"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              onboarding.plan
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(state.hireName || "new-hire").toLowerCase().replace(/\s+/g, "-")}.ramp
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {loaded ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Onboarding journey · 90-day ramp
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {progress.done}/{progress.total} done
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {progress.pct === 100
                      ? "fully ramped"
                      : progress.pct >= 66
                      ? "late ramp"
                      : progress.pct >= 33
                      ? "mid ramp"
                      : "early days"}
                  </span>
                  {milestoneCountdown.next && (
                    <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                      next: {milestoneCountdown.next.rail} ·{" "}
                      {milestoneCountdown.next.days >= 0
                        ? `${milestoneCountdown.next.days}d left`
                        : `${Math.abs(milestoneCountdown.next.days)}d over`}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <input
                    value={state.hireName}
                    onChange={(e) => setState({ ...state, hireName: e.target.value })}
                    placeholder="New hire name"
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
                    {progress.pct}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Tasks complete
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {progress.done} / {progress.total}
                  </div>
                </div>
              </div>
            </div>

            {/* top-of-hero progress bar */}
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-tool-accent-soft">
              <div
                className="h-full bg-tool-accent transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>

          {/* sub-tab strip — phase pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              <button
                onClick={() => setActivePhase("all")}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  activePhase === "all"
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={activePhase === "all" ? { color: "var(--bg)" } : undefined}
              >
                All
              </button>
              {TIMEFRAMES.map((tf) => {
                const rp = railProgress[tf.key];
                const isActive = activePhase === tf.key;
                return (
                  <button
                    key={tf.key}
                    onClick={() => setActivePhase(tf.key)}
                    className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                      isActive
                        ? "bg-tool-accent text-app-elevated"
                        : "text-secondary hover:text-app"
                    }`}
                    style={isActive ? { color: "var(--bg)" } : undefined}
                  >
                    {tf.tag} <span className="opacity-70">· {rp.done}/{rp.total}</span>
                  </button>
                );
              })}
            </div>

            <select
              value={state.role}
              onChange={(e) => loadTemplate(e.target.value as RoleKey)}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={exportMarkdown}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Export .md
              </button>
              <button
                onClick={exportCsv}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Export .csv
              </button>
            </div>
          </div>
        </section>

        {/* Setup row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <ToolCard title="New hire" subtitle="Basics">
            <div className="space-y-4">
              <Field label="Name">
                <input
                  value={state.hireName}
                  onChange={(e) => setState({ ...state, hireName: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  value={state.startDate}
                  onChange={(e) => setState({ ...state, startDate: e.target.value })}
                  className={inputCls()}
                />
              </Field>
              <Field label="Role template">
                <select
                  value={state.role}
                  onChange={(e) => loadTemplate(e.target.value as RoleKey)}
                  className={inputCls()}
                >
                  {ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </ToolCard>

          <ToolCard title="Phase summary" subtitle="At-a-glance progress">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TIMEFRAMES.map((tf) => {
                const rp = railProgress[tf.key];
                const fullyDone = rp.total > 0 && rp.done === rp.total;
                return (
                  <button
                    key={tf.key}
                    type="button"
                    onClick={() => setActivePhase(tf.key)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      fullyDone
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app hover:border-tool-accent"
                    }`}
                  >
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      {tf.rail}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-app">
                      {rp.done}/{rp.total}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-tool-accent-soft">
                      <div
                        className="h-full bg-tool-accent transition-all"
                        style={{ width: `${rp.pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted">
              Hand the plan to the manager, the new hire, or HRIS. Markdown for docs, CSV for spreadsheets.
            </p>
          </ToolCard>
        </div>

        {/* Day-rail with milestone cards */}
        <div className="relative mt-8">
          {/* Vertical rail */}
          <div className="absolute bottom-3 left-4 top-3 w-px bg-tool-accent-soft sm:left-6" aria-hidden />

          <div className="space-y-6">
            {visibleTimeframes.map((tf) => {
              const items = byTimeframe[tf.key];
              const rp = railProgress[tf.key];
              const fullyDone = rp.total > 0 && rp.done === rp.total;
              return (
                <div key={tf.key} className="relative pl-12 sm:pl-16">
                  {/* Milestone dot */}
                  <div className="absolute left-0 top-1 flex w-8 flex-col items-center sm:w-12">
                    <div
                      className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                        fullyDone
                          ? "border-tool-accent bg-tool-accent"
                          : rp.done > 0
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-faint"
                      }`}
                      style={fullyDone ? { color: "var(--bg)" } : undefined}
                      aria-hidden
                    >
                      {fullyDone ? (
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,8 7,12 13,4" />
                        </svg>
                      ) : (
                        <span className="font-mono text-[0.55rem] font-semibold">{tf.tag}</span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[0.5rem] uppercase tracking-[0.16em] text-faint">
                      {rp.pct}%
                    </div>
                  </div>

                  {/* Milestone card */}
                  <ToolCard
                    title={tf.rail}
                    subtitle={`${tf.label.replace(/^.+ — /, "")} · ${items.length} task${items.length === 1 ? "" : "s"}`}
                  >
                    {/* Per-card progress bar */}
                    <div className="mb-4 h-1 overflow-hidden rounded-full bg-tool-accent-soft">
                      <div
                        className="h-full bg-tool-accent transition-all"
                        style={{ width: `${rp.pct}%` }}
                      />
                    </div>

                    <div className="space-y-2">
                      {items.length === 0 && (
                        <div className="rounded-lg border border-dashed border-app bg-app px-3 py-4 text-center text-sm italic text-muted">
                          No tasks for this milestone yet.
                        </div>
                      )}
                      {items.map((t) => {
                        const done = t.status === "done";
                        const inProgress = t.status === "in-progress";
                        const initials = ownerInitials(t.owner);
                        return (
                          <div
                            key={t.id}
                            className={`group relative flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors md:flex-row md:items-center ${
                              done
                                ? "border-tool-accent bg-tool-accent-soft"
                                : "border-app bg-app-elevated hover:border-tool-accent"
                            }`}
                          >
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() =>
                                updateTask(t.id, {
                                  status: done ? "todo" : "done",
                                })
                              }
                              aria-label="Toggle done"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                                done
                                  ? "border-tool-accent bg-tool-accent text-tool-accent"
                                  : "border-app hover:border-tool-accent"
                              }`}
                              style={done ? { color: "var(--bg)" } : undefined}
                            >
                              {done && (
                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3,8 7,12 13,4" />
                                </svg>
                              )}
                            </button>

                            {/* Task title */}
                            <input
                              value={t.title}
                              onChange={(e) => updateTask(t.id, { title: e.target.value })}
                              className={inputCls(
                                `flex-1 ${done ? "text-muted line-through" : ""}`
                              )}
                            />

                            {/* Assignee chip */}
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5 rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-1">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tool-accent-soft font-mono text-[0.5rem] font-semibold text-tool-accent">
                                  {initials}
                                </span>
                                <input
                                  placeholder="Owner"
                                  value={t.owner}
                                  onChange={(e) => updateTask(t.id, { owner: e.target.value })}
                                  className="w-24 bg-transparent font-mono text-[0.65rem] text-tool-accent placeholder:text-faint outline-none"
                                />
                              </div>
                              <input
                                placeholder="Due"
                                value={t.due}
                                onChange={(e) => updateTask(t.id, { due: e.target.value })}
                                className={inputCls("w-20 text-xs")}
                              />
                              <select
                                value={t.status}
                                onChange={(e) => updateTask(t.id, { status: e.target.value as Status })}
                                className={`rounded-lg border px-2 py-1 text-xs outline-none transition-colors ${
                                  done
                                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                    : inProgress
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                                    : "border-app bg-app text-secondary"
                                }`}
                              >
                                <option value="todo">To do</option>
                                <option value="in-progress">In progress</option>
                                <option value="done">Done</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeTask(t.id)}
                                className="rounded-md border border-app px-2 text-muted opacity-0 transition-opacity hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                                aria-label="Remove"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => addTask(tf.key)}
                        className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                      >
                        + Task
                      </button>
                    </div>
                  </ToolCard>
                </div>
              );
            })}
          </div>
        </div>
      </ToolShell>
    </div>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
