"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Quadrant = "do" | "schedule" | "delegate" | "drop";
type View = "matrix" | "list";

interface Task {
  id: string;
  title: string;
  urgency: number; // 1-10
  importance: number; // 1-10
  manual?: Quadrant | null; // if user manually placed
}

const STORAGE_KEY = "solutions:eisenhower-matrix:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function autoQuadrant(u: number, i: number): Quadrant {
  const urgent = u >= 6;
  const important = i >= 6;
  if (urgent && important) return "do";
  if (!urgent && important) return "schedule";
  if (urgent && !important) return "delegate";
  return "drop";
}

function quadrantOf(t: Task): Quadrant {
  return t.manual ?? autoQuadrant(t.urgency, t.importance);
}

interface QuadrantSpec {
  key: Quadrant;
  label: string;
  verb: string; // do / decide / delegate / delete (hero strip)
  subtitle: string;
  badge: string;
  // Card surface — Q1 uses tool-accent; Q2/Q3/Q4 fade through neutral steps.
  surface: string;
  // Heading tone.
  tone: string;
  // Glyph for the quadrant header.
  glyph: string;
}

const QUADRANTS: QuadrantSpec[] = [
  {
    key: "do",
    label: "Do now",
    verb: "do",
    subtitle: "Urgent · Important",
    badge: "Q1",
    surface:
      "border-tool-accent/60 bg-tool-accent-soft ring-1 ring-[color:var(--tool-accent-ring)]",
    tone: "text-tool-accent",
    glyph: "→",
  },
  {
    key: "schedule",
    label: "Decide",
    verb: "decide",
    subtitle: "Not urgent · Important",
    badge: "Q2",
    surface: "border-app bg-app-elevated",
    tone: "text-app",
    glyph: "◷",
  },
  {
    key: "delegate",
    label: "Delegate",
    verb: "delegate",
    subtitle: "Urgent · Not important",
    badge: "Q3",
    surface: "border-app bg-surface",
    tone: "text-secondary",
    glyph: "↗",
  },
  {
    key: "drop",
    label: "Delete",
    verb: "delete",
    subtitle: "Not urgent · Not important",
    badge: "Q4",
    surface: "border-dashed border-app bg-transparent",
    tone: "text-muted",
    glyph: "×",
  },
];

const DEFAULT_TASKS: Task[] = [
  { id: uid(), title: "Fix production auth bug", urgency: 10, importance: 9 },
  { id: uid(), title: "Q2 roadmap planning", urgency: 3, importance: 9 },
  { id: uid(), title: "Approve vendor invoices", urgency: 8, importance: 3 },
  { id: uid(), title: "Organize file server", urgency: 2, importance: 2 },
];

// Three example tasks per quadrant — inspiration for users unsure where a
// given piece of work sits. Draws on Covey's "7 Habits of Highly Effective
// People" quadrant descriptions and standard PM practice.
const EXAMPLES_BY_QUADRANT: Record<Quadrant, string[]> = {
  do: [
    "Production outage or customer-facing bug",
    "Deal on the edge — renewal this week",
    "Regulatory filing due in 48 hours",
  ],
  schedule: [
    "Quarterly strategy / planning",
    "Team skill development",
    "Documentation & runbook upkeep",
  ],
  delegate: [
    "Recurring expense approvals",
    "Interview scheduling",
    "Inbox triage + routine customer replies",
  ],
  drop: [
    "Most email newsletters you skim",
    "Meetings you attend 'just in case'",
    "Status updates nobody reads",
  ],
};

export default function EisenhowerMatrixPage() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);
  const [draft, setDraft] = useState({ title: "", urgency: "5", importance: "5" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<View>("matrix");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Task[];
        if (Array.isArray(parsed)) setTasks(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* ignore */
    }
  }, [tasks, hydrated]);

  const grouped = useMemo(() => {
    const map: Record<Quadrant, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
    tasks.forEach((t) => map[quadrantOf(t)].push(t));
    return map;
  }, [tasks]);

  const resetDraft = () => setDraft({ title: "", urgency: "5", importance: "5" });

  const openAdd = () => {
    setEditingId(null);
    resetDraft();
    setDrawerOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setDraft({
      title: t.title,
      urgency: String(t.urgency),
      importance: String(t.importance),
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    resetDraft();
  };

  const submitDraft = () => {
    const title = draft.title.trim();
    if (!title) return;
    const u = Math.max(1, Math.min(10, parseInt(draft.urgency) || 5));
    const i = Math.max(1, Math.min(10, parseInt(draft.importance) || 5));
    if (editingId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingId ? { ...t, title, urgency: u, importance: i } : t
        )
      );
    } else {
      setTasks((prev) => [...prev, { id: uid(), title, urgency: u, importance: i }]);
    }
    closeDrawer();
  };

  const remove = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) closeDrawer();
  };
  const moveTo = (id: string, q: Quadrant) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, manual: q } : t)));
  const resetAuto = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, manual: null } : t)));

  const clearAll = () => {
    if (confirm("Clear all tasks?")) setTasks([]);
  };

  const exportMarkdown = () => {
    const lines: string[] = ["# Eisenhower Matrix", ""];
    QUADRANTS.forEach((q) => {
      lines.push(`## ${q.label} — ${q.subtitle}`);
      const items = grouped[q.key];
      if (items.length === 0) {
        lines.push("_(empty)_", "");
      } else {
        items.forEach((t) =>
          lines.push(`- ${t.title} _(U${t.urgency}/I${t.importance})_`)
        );
        lines.push("");
      }
    });
    downloadBlob(lines.join("\n"), "eisenhower.md", "text/markdown");
  };

  const exportCsv = () => {
    const rows = [["Quadrant", "Task", "Urgency", "Importance"]];
    tasks.forEach((t) =>
      rows.push([
        quadrantOf(t),
        `"${t.title.replace(/"/g, '""')}"`,
        String(t.urgency),
        String(t.importance),
      ])
    );
    downloadBlob(rows.map((r) => r.join(",")).join("\n"), "eisenhower.csv", "text/csv");
  };

  return (
    <ToolShell
      category="Productivity"
      title="Eisenhower Matrix"
      description="Score tasks on urgency and importance. Auto-placed into Do, Decide, Delegate, or Delete. Drag between quadrants to override."
    >
      <div data-tool-theme="productivity" data-tool="eisenhower-matrix">
        {/* Sky hero strip — verb counts (do / decide / delegate / delete) */}
        <div className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-app px-6 py-5 sm:px-8">
          <div className="absolute inset-0 -z-10 opacity-50 [background-image:radial-gradient(circle_at_85%_-10%,var(--tool-accent-soft),transparent_55%)]" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-tool-accent-soft px-3 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              Priority Matrix
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {QUADRANTS.map((q, idx) => (
                <span key={q.key} className="flex items-center gap-3">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={`text-base font-semibold tabular-nums ${
                        q.key === "do" ? "text-tool-accent" : "text-app"
                      }`}
                    >
                      {grouped[q.key].length}
                    </span>
                    <span>{q.verb}</span>
                  </span>
                  {idx < QUADRANTS.length - 1 && <span className="text-faint">·</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar — sub-tabs + add + exports */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-app bg-app-elevated p-0.5 text-[0.65rem] uppercase tracking-[0.18em]">
            {(["matrix", "list"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 transition ${
                  view === v
                    ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                    : "text-secondary hover:text-app"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAdd}
              className="rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent transition hover:brightness-110"
            >
              + Add task
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
            >
              .md
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
            >
              .csv
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
            >
              Print
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-muted transition hover:border-rose-400/40 hover:text-rose-400"
            >
              Clear
            </button>
          </div>
        </div>

        {/* MATRIX view */}
        {view === "matrix" && (
          <div className="relative">
            {/* Axis labels — orient the user around the crosshair */}
            <div className="pointer-events-none absolute -top-2 left-1/2 hidden -translate-x-1/2 -translate-y-full text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent/70 sm:block">
              ← Importance →
            </div>
            <div className="pointer-events-none absolute -left-3 top-1/2 hidden -translate-x-full -translate-y-1/2 -rotate-90 text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent/70 sm:block">
              ← Urgency →
            </div>

            <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-0">
              {/* Crosshair lines for the 4-quadrant grid (sm+) */}
              <div className="pointer-events-none absolute inset-0 hidden sm:block">
                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-tool-accent/40 to-transparent" />
                <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-tool-accent/40 to-transparent" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tool-accent ring-4 ring-[color:var(--tool-accent-soft)]" />
              </div>

              {QUADRANTS.map((q) => (
                <div
                  key={q.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) {
                      moveTo(dragId, q.key);
                      setDragId(null);
                    }
                  }}
                  className={`group/quad relative min-h-[240px] rounded-xl border p-4 transition-all sm:m-1.5 sm:rounded-lg ${q.surface} ${
                    dragId ? "ring-1 ring-tool-accent/40" : ""
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[0.55rem] font-semibold uppercase tracking-[0.22em] ${q.tone}`}
                        >
                          {q.badge}
                        </span>
                        <span className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                          {q.subtitle}
                        </span>
                      </div>
                      <div
                        className={`mt-1 flex items-center gap-1.5 text-lg font-semibold tracking-tight ${
                          q.key === "do" ? "text-tool-accent" : "text-app"
                        }`}
                      >
                        <span className="text-base opacity-60">{q.glyph}</span>
                        {q.label}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.15em] ${
                        q.key === "do"
                          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                          : "bg-app-elevated text-muted ring-1 ring-[color:var(--border)]"
                      }`}
                    >
                      {grouped[q.key].length}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {grouped[q.key].length === 0 && (
                      <div className="rounded-md border border-dashed border-app p-3 text-xs text-muted">
                        <div className="text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                          Drop here · examples
                        </div>
                        <ul className="mt-2 space-y-1">
                          {EXAMPLES_BY_QUADRANT[q.key].slice(0, 3).map((ex, i) => (
                            <li key={i} className="flex gap-1.5">
                              <span className="text-faint">·</span>
                              <span>{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {grouped[q.key].map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => setDragId(null)}
                        onDoubleClick={() => openEdit(t)}
                        className={`group relative cursor-grab rounded-md border bg-app-elevated p-2.5 text-sm text-app transition active:cursor-grabbing hover:border-tool-accent/40 ${
                          q.key === "do" ? "border-tool-accent/30" : "border-app"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            className="flex-1 break-words text-left text-app hover:text-tool-accent"
                          >
                            {t.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(t.id)}
                            className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
                            aria-label="Remove task"
                          >
                            ×
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          <span>U {t.urgency}</span>
                          <span>·</span>
                          <span>I {t.importance}</span>
                          {t.manual && (
                            <>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() => resetAuto(t.id)}
                                className="text-tool-accent/80 hover:text-tool-accent"
                              >
                                auto
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LIST view — flat ordered listing */}
        {view === "list" && (
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-app px-4 py-2.5 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <div>Task</div>
              <div className="text-right">U</div>
              <div className="text-right">I</div>
              <div className="text-right">Quadrant</div>
            </div>
            {tasks.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted">
                No tasks. Add one to start.
              </div>
            )}
            {QUADRANTS.flatMap((q) =>
              grouped[q.key].map((t) => (
                <div
                  key={t.id}
                  className="group grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-app px-4 py-2.5 text-sm transition-colors hover:bg-surface last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="text-left text-app hover:text-tool-accent"
                  >
                    {t.title}
                  </button>
                  <span className="text-right tabular-nums text-secondary">{t.urgency}</span>
                  <span className="text-right tabular-nums text-secondary">{t.importance}</span>
                  <span className="flex items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.15em] ${
                        q.key === "do"
                          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                          : "bg-app-elevated text-muted ring-1 ring-[color:var(--border)]"
                      }`}
                    >
                      {q.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
                      aria-label="Remove task"
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* How it works — slim helper */}
        <div className="mt-6 rounded-md border border-app bg-app-elevated p-4 text-xs leading-relaxed text-secondary">
          <p className="font-medium text-app">How it works</p>
          <p className="mt-1.5">
            Urgency or importance at 6+ puts a task in the &quot;yes&quot; half for that
            axis. Drag a card between quadrants (or double-click to edit) to override the
            auto-placement. Data lives in your browser only.
          </p>
        </div>

        {/* Form drawer — add / edit */}
        {drawerOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={closeDrawer}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            />
            <div className="relative w-full max-w-md rounded-t-2xl border border-app bg-app-elevated p-6 shadow-elevated sm:rounded-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    {editingId ? "Edit task" : "New task"}
                  </div>
                  <div className="mt-1 text-base font-semibold tracking-tight text-app">
                    Score it on the matrix
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="text-muted hover:text-app"
                  aria-label="Close drawer"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                    Task
                  </span>
                  <input
                    type="text"
                    autoFocus
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submitDraft()}
                    placeholder="What needs doing?"
                    className="w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-app-focus focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                        Urgency
                      </span>
                      <span className="text-[0.55rem] text-faint">1–10</span>
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={draft.urgency}
                      onChange={(e) => setDraft({ ...draft, urgency: e.target.value })}
                      className="w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-app-focus focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                        Importance
                      </span>
                      <span className="text-[0.55rem] text-faint">1–10</span>
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={draft.importance}
                      onChange={(e) => setDraft({ ...draft, importance: e.target.value })}
                      className="w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-app-focus focus:outline-none"
                    />
                  </label>
                </div>

                <div className="rounded-md border border-app bg-surface px-3 py-2 text-[0.65rem] text-secondary">
                  Will land in&nbsp;
                  <span className="font-semibold text-tool-accent">
                    {
                      QUADRANTS.find(
                        (q) =>
                          q.key ===
                          autoQuadrant(
                            parseInt(draft.urgency) || 5,
                            parseInt(draft.importance) || 5
                          )
                      )?.label
                    }
                  </span>
                  &nbsp;based on the score.
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => remove(editingId)}
                      className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-muted transition hover:border-rose-400/40 hover:text-rose-400"
                    >
                      Delete
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeDrawer}
                      className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary hover:text-app"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitDraft}
                      className="rounded-md border border-tool-accent bg-tool-accent-soft px-4 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition hover:brightness-110"
                    >
                      {editingId ? "Save" : "Add task"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print-only daily-plan view */}
      <div className="hidden print:block mt-8">
        <div className="rounded-lg bg-white p-6 text-slate-900">
          <h1 className="text-2xl font-semibold">
            Daily Plan — {new Date().toLocaleDateString()}
          </h1>
          {QUADRANTS.map((q) => (
            <div key={q.key} className="mt-5">
              <h2 className="text-base font-semibold uppercase tracking-wide text-slate-700 border-b border-slate-300 pb-1">
                {q.label} — {q.subtitle}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {grouped[q.key].length === 0 && (
                  <li className="text-sm italic text-slate-500">No tasks</li>
                )}
                {grouped[q.key].map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-4 w-4 rounded border border-slate-400" />
                    <span className="flex-1">{t.title}</span>
                    <span className="text-[10px] uppercase text-slate-500">
                      U{t.urgency}/I{t.importance}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          nav, header, footer, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </ToolShell>
  );
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
