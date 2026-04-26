"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

type Priority = "P0" | "P1" | "P2" | "P3";
type Status = "new" | "in-progress" | "waiting" | "done";
type ViewMode = "kanban" | "timeline" | "list" | "aging";
type AgeBand = "fresh" | "aging" | "stale" | "critical";

interface Ticket {
  id: string;
  title: string;
  priority: Priority;
  status: Status;
  assignee: string;
  createdAt: string;
}

interface BurndownSnapshot {
  date: string; // YYYY-MM-DD
  open: number;
  byPriority: Record<Priority, number>;
}

interface BacklogState {
  tickets: Ticket[];
  burndown?: BurndownSnapshot[];
}

const LS_KEY = "solutions:ticket-backlog:v1";
const VIEW_LS_KEY = "solutions:ticket-backlog:view:v1";
const NAMESPACE = "ticket-backlog";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);

const PRIORITY_SLA_DAYS: Record<Priority, number> = {
  P0: 1,
  P1: 3,
  P2: 7,
  P3: 30,
};

const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "P0 · Critical",
  P1: "P1 · High",
  P2: "P2 · Normal",
  P3: "P3 · Low",
};

const PRIORITY_SHORT: Record<Priority, string> = {
  P0: "Critical",
  P1: "High",
  P2: "Normal",
  P3: "Low",
};

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  "in-progress": "In progress",
  waiting: "Waiting",
  done: "Done",
};

// Severity hue semantics per spec: rose / amber / sky / emerald — kept semantic, not tool-accent.
const PRIORITY_TONE: Record<Priority, { chip: string; dot: string; bar: string; border: string }> = {
  P0: {
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-500",
    dot: "bg-rose-500",
    bar: "bg-rose-500/70",
    border: "border-l-rose-500/60",
  },
  P1: {
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    dot: "bg-amber-500",
    bar: "bg-amber-500/70",
    border: "border-l-amber-500/60",
  },
  P2: {
    chip: "border-sky-500/40 bg-sky-500/15 text-sky-500",
    dot: "bg-sky-500",
    bar: "bg-sky-500/70",
    border: "border-l-sky-500/60",
  },
  P3: {
    chip: "border-app bg-app-elevated text-secondary",
    dot: "bg-muted",
    bar: "bg-muted",
    border: "border-l-app",
  },
};

const STATUS_TONE: Record<Status, string> = {
  new: "border-tool-accent bg-tool-accent-soft text-tool-accent",
  "in-progress": "border-sky-500/40 bg-sky-500/15 text-sky-500",
  waiting: "border-amber-500/40 bg-amber-500/15 text-amber-500",
  done: "border-app bg-app-elevated text-faint line-through",
};

const AGE_BAND_TONE: Record<AgeBand, { chip: string; border: string; label: string }> = {
  fresh: {
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-500",
    border: "border-l-emerald-500/50",
    label: "fresh",
  },
  aging: {
    chip: "border-sky-500/40 bg-sky-500/15 text-sky-500",
    border: "border-l-sky-500/50",
    label: "aging",
  },
  stale: {
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-500",
    border: "border-l-amber-500/50",
    label: "stale",
  },
  critical: {
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-500",
    border: "border-l-rose-500/60",
    label: "critical",
  },
};

function defaultState(): BacklogState {
  return {
    tickets: [
      {
        id: uid(),
        title: "Login page 500 on Safari",
        priority: "P1",
        status: "new",
        assignee: "",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function ageBandFor(age: number, sla: number): AgeBand {
  if (age < sla * 0.5) return "fresh";
  if (age <= sla) return "aging";
  if (age <= sla * 2) return "stale";
  return "critical";
}

function initials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TicketBacklogPage() {
  return (
    <ToolShell
      category="Support & Ops"
      title="Ticket Backlog Tracker"
      description="Quick pipeline visibility for support tickets. P0–P3, status, assignee, stale flags. Team mode shares the board."
    >
      <BacklogInner />
    </ToolShell>
  );
}

function BacklogInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<BacklogState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === "kanban" || v === "timeline" || v === "list" || v === "aging") {
        setView(v);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<BacklogState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setState(data && Array.isArray(data.tickets) ? data : defaultState());
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          setState(raw ? JSON.parse(raw) : defaultState());
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

  const [draft, setDraft] = useState<{
    title: string;
    priority: Priority;
    assignee: string;
  }>({ title: "", priority: "P2", assignee: "" });

  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all" | "open">(
    "open"
  );
  const [ageFilter, setAgeFilter] = useState<"all" | "fresh" | "aging" | "stale">(
    "all"
  );

  const addTicket = () => {
    if (!draft.title.trim()) return;
    setState({
      tickets: [
        ...state.tickets,
        {
          id: uid(),
          title: draft.title.trim(),
          priority: draft.priority,
          status: "new",
          assignee: draft.assignee,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setDraft({ title: "", priority: "P2", assignee: "" });
  };

  const updateTicket = (id: string, patch: Partial<Ticket>) => {
    setState({
      tickets: state.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const removeTicket = (id: string) => {
    setState({ tickets: state.tickets.filter((t) => t.id !== id) });
  };

  const now = new Date();
  const stats = useMemo(() => {
    const open = state.tickets.filter((t) => t.status !== "done");
    const stale = open.filter((t) => {
      const age = daysBetween(new Date(t.createdAt), now);
      return age > PRIORITY_SLA_DAYS[t.priority];
    });
    const p0 = open.filter((t) => t.priority === "P0").length;
    const done = state.tickets.filter((t) => t.status === "done").length;
    return {
      open: open.length,
      stale: stale.length,
      p0,
      total: state.tickets.length,
      done,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tickets]);

  const byPriority = useMemo(() => {
    const g: Record<Priority, Ticket[]> = {
      P0: [],
      P1: [],
      P2: [],
      P3: [],
    };
    state.tickets.forEach((t) => g[t.priority].push(t));
    return g;
  }, [state.tickets]);

  // Aging bands (open only): fresh / aging / stale / critical
  const agingBands = useMemo(() => {
    const groups: Record<AgeBand, Ticket[]> = {
      fresh: [],
      aging: [],
      stale: [],
      critical: [],
    };
    state.tickets
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const age = daysBetween(new Date(t.createdAt), now);
        const band = ageBandFor(age, PRIORITY_SLA_DAYS[t.priority]);
        groups[band].push(t);
      });
    return groups;
  }, [state.tickets, now]);

  // Age histogram buckets (days): 0-1, 1-3, 3-7, 7-14, 14+
  const ageHistogram = useMemo(() => {
    const buckets = [
      { label: "< 1d", min: 0, max: 1, count: 0 },
      { label: "1-3d", min: 1, max: 3, count: 0 },
      { label: "3-7d", min: 3, max: 7, count: 0 },
      { label: "7-14d", min: 7, max: 14, count: 0 },
      { label: "14d+", min: 14, max: Infinity, count: 0 },
    ];
    state.tickets
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const age = daysBetween(new Date(t.createdAt), now);
        const b = buckets.find((x) => age >= x.min && age < x.max);
        if (b) b.count++;
      });
    return buckets;
  }, [state.tickets, now]);

  const teamWorkload = useMemo(() => {
    const counts = new Map<
      string,
      { open: number; stale: number; priorities: Record<Priority, number> }
    >();
    state.tickets
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const key = t.assignee || "(unassigned)";
        if (!counts.has(key))
          counts.set(key, {
            open: 0,
            stale: 0,
            priorities: { P0: 0, P1: 0, P2: 0, P3: 0 },
          });
        const entry = counts.get(key)!;
        entry.open++;
        entry.priorities[t.priority]++;
        const age = daysBetween(new Date(t.createdAt), now);
        if (age > PRIORITY_SLA_DAYS[t.priority]) entry.stale++;
      });
    return Array.from(counts.entries()).sort((a, b) => b[1].open - a[1].open);
  }, [state.tickets, now]);

  // Throughput math: tickets resolved across snapshots window (last vs first open delta)
  const throughput = useMemo(() => {
    const snaps = state.burndown || [];
    if (snaps.length < 2) return { delta: 0, window: snaps.length };
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    return { delta: first.open - last.open, window: snaps.length };
  }, [state.burndown]);

  const snapshotToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    const open = state.tickets.filter((t) => t.status !== "done").length;
    const byP: Record<Priority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    state.tickets
      .filter((t) => t.status !== "done")
      .forEach((t) => (byP[t.priority] += 1));
    const without = (state.burndown || []).filter((s) => s.date !== today);
    setState({
      ...state,
      burndown: [...without, { date: today, open, byPriority: byP }].sort(
        (a, b) => a.date.localeCompare(b.date)
      ),
    });
  };

  const filteredTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (statusFilter === "open") {
        if (t.status === "done") return false;
      } else if (statusFilter !== "all" && t.status !== statusFilter) {
        return false;
      }
      if (ageFilter !== "all") {
        const age = daysBetween(new Date(t.createdAt), now);
        const sla = PRIORITY_SLA_DAYS[t.priority];
        if (ageFilter === "fresh" && age >= sla * 0.5) return false;
        if (ageFilter === "aging" && (age < sla * 0.5 || age > sla)) return false;
        if (ageFilter === "stale" && age <= sla) return false;
      }
      return true;
    });
  }, [state.tickets, priorityFilter, statusFilter, ageFilter, now]);

  const sortedFiltered = useMemo(() => {
    const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...filteredTickets].sort((a, b) => {
      if (order[a.priority] !== order[b.priority])
        return order[a.priority] - order[b.priority];
      const ageA = daysBetween(new Date(a.createdAt), now);
      const ageB = daysBetween(new Date(b.createdAt), now);
      return ageB - ageA;
    });
  }, [filteredTickets, now]);

  const totalOpen = stats.open;
  const aging = useMemo(() => {
    return state.tickets.filter((t) => {
      if (t.status === "done") return false;
      const age = daysBetween(new Date(t.createdAt), now);
      const sla = PRIORITY_SLA_DAYS[t.priority];
      return age >= sla * 0.5 && age <= sla;
    }).length;
  }, [state.tickets, now]);

  const syncLabel = syncing
    ? "Saving…"
    : syncedAt
    ? `Saved ${syncedAt}`
    : "Ready";

  return (
    <div data-tool-theme="support" data-tool="ticket-backlog-tracker">
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            Backlog · Live
          </span>
          {stats.p0 > 0 && (
            <span className="rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-rose-500">
              P0 × {stats.p0}
            </span>
          )}
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            backlog.tracker
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {current.kind === "team" ? "team" : "personal"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[0.6rem] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                syncing ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            {syncLabel}
          </div>
        </div>

        <div className="relative p-5">
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
            Support Pipeline · SLA Watcher
          </div>

          {/* Large mono numbers + tool-accent chips */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Total" value={stats.total} hint={`${stats.done} done`} />
            <HeroStat label="Open" value={totalOpen} hint="actively tracked" accent />
            <HeroStat label="Aging" value={aging} hint="approaching SLA" tone="amber" />
            <HeroStat
              label="SLA at risk"
              value={stats.stale}
              hint="past threshold"
              tone={stats.stale > 0 ? "rose" : undefined}
            />
          </div>
        </div>

        {/* sub-tab strip — segmented pills, bg-tool-accent active */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "kanban", label: "Kanban" },
                { k: "timeline", label: "Timeline" },
                { k: "list", label: "List" },
                { k: "aging", label: "Aging" },
              ] as { k: ViewMode; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={view === t.k ? { color: "var(--bg)" } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={snapshotToday}
              className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
            >
              + Snapshot
            </button>
          </div>
        </div>
      </section>

      {/* ADD TICKET */}
      <section className="mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
            <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
              Add ticket
            </h2>
          </div>
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            quick entry
          </span>
        </header>
        <div className="grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Title
            </span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addTicket()}
              placeholder="Short description"
              className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Priority
            </span>
            <select
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as Priority })
              }
              className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
            >
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Assignee
            </span>
            <input
              value={draft.assignee}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              placeholder="name"
              className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={addTicket}
              className="w-full rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + Add
            </button>
          </div>
        </div>
      </section>

      {/* FILTER CHIPS */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          Priority
        </span>
        <FilterChip
          active={priorityFilter === "all"}
          onClick={() => setPriorityFilter("all")}
        >
          All
        </FilterChip>
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <FilterChip
            key={p}
            active={priorityFilter === p}
            onClick={() => setPriorityFilter(p)}
            tone={PRIORITY_TONE[p].dot}
          >
            {p} · {PRIORITY_SHORT[p]}
          </FilterChip>
        ))}
        <span className="ml-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          Status
        </span>
        {(
          [
            { key: "open", label: "Open" },
            { key: "all", label: "All" },
            { key: "new", label: "New" },
            { key: "in-progress", label: "In progress" },
            { key: "waiting", label: "Waiting" },
            { key: "done", label: "Done" },
          ] as const
        ).map((opt) => (
          <FilterChip
            key={opt.key}
            active={statusFilter === opt.key}
            onClick={() => setStatusFilter(opt.key)}
          >
            {opt.label}
          </FilterChip>
        ))}
        <span className="ml-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          Age
        </span>
        {(
          [
            { key: "all", label: "Any" },
            { key: "fresh", label: "Fresh" },
            { key: "aging", label: "Aging" },
            { key: "stale", label: "Past SLA" },
          ] as const
        ).map((opt) => (
          <FilterChip
            key={opt.key}
            active={ageFilter === opt.key}
            onClick={() => setAgeFilter(opt.key)}
          >
            {opt.label}
          </FilterChip>
        ))}
        <span className="ml-auto font-mono text-[0.65rem] tabular-nums text-muted">
          {sortedFiltered.length} / {state.tickets.length}
        </span>
      </section>

      {/* VIEW SWITCH BODY */}
      {view === "list" && (
        <ListView
          sortedFiltered={sortedFiltered}
          now={now}
          updateTicket={updateTicket}
          removeTicket={removeTicket}
        />
      )}

      {view === "kanban" && (
        <KanbanView
          byPriority={byPriority}
          now={now}
          removeTicket={removeTicket}
        />
      )}

      {view === "timeline" && (
        <TimelineView
          tickets={state.tickets.filter((t) => t.status !== "done")}
          now={now}
          removeTicket={removeTicket}
        />
      )}

      {view === "aging" && (
        <AgingView
          bands={agingBands}
          now={now}
          removeTicket={removeTicket}
        />
      )}

      {/* ANALYTICS PANELS */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Age histogram */}
        <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
          <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Age histogram
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              open by bucket
            </span>
          </header>
          <div className="space-y-2 p-4">
            {ageHistogram.map((b) => {
              const maxCount = Math.max(...ageHistogram.map((x) => x.count), 1);
              const pct = (b.count / maxCount) * 100;
              const isOld = b.label === "14d+" || b.label === "7-14d";
              return (
                <div
                  key={b.label}
                  className="grid grid-cols-[60px_1fr_auto] items-center gap-2"
                >
                  <span className="text-xs text-secondary">{b.label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className={`h-full ${
                        isOld ? "bg-rose-500/70" : "bg-tool-accent"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-secondary">
                    {b.count}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 pb-4 text-[0.7rem] text-muted">
            Long tail = things slipping through cracks. Watch 14d+.
          </p>
        </section>

        {/* Team workload */}
        <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
          <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Team workload
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              by assignee
            </span>
          </header>
          <div className="p-4">
            {teamWorkload.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app py-6 text-center text-xs text-muted">
                No open tickets.
              </div>
            ) : (
              <div className="space-y-2">
                {teamWorkload.map(([who, info]) => (
                  <div
                    key={who}
                    className="rounded-lg border border-app bg-app px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[0.55rem] font-semibold uppercase ${
                            who === "(unassigned)"
                              ? "border-dashed border-app bg-app-elevated text-muted"
                              : "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          }`}
                        >
                          {initials(who === "(unassigned)" ? "" : who)}
                        </span>
                        <span className="truncate text-sm text-app">
                          {who}
                        </span>
                      </div>
                      <span className="font-mono text-[0.65rem] tabular-nums text-secondary">
                        {info.open} open · {info.stale} stale
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(["P0", "P1", "P2", "P3"] as Priority[]).map((p) =>
                        info.priorities[p] > 0 ? (
                          <span
                            key={p}
                            className={`rounded px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] border ${PRIORITY_TONE[p].chip}`}
                          >
                            {p} × {info.priorities[p]}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Burndown */}
        <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
          <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Burndown
              </h2>
            </div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {throughput.window > 1
                ? `Δ ${throughput.delta > 0 ? "-" : "+"}${Math.abs(
                    throughput.delta
                  )} over ${throughput.window}`
                : "snapshots"}
            </span>
          </header>
          <div className="p-4">
            {(state.burndown || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app py-6 text-center text-xs text-muted">
                No snapshots yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {(state.burndown || []).map((s, i, arr) => {
                  const max = Math.max(...arr.map((x) => x.open), 1);
                  const delta = i > 0 ? s.open - arr[i - 1].open : 0;
                  return (
                    <div
                      key={s.date}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-2"
                    >
                      <span className="font-mono text-[0.7rem] text-secondary">
                        {s.date.slice(5)}
                      </span>
                      <div className="h-2 overflow-hidden rounded-full border border-app bg-app">
                        <div
                          className="h-full bg-tool-accent"
                          style={{ width: `${(s.open / max) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-secondary">
                        {s.open}{" "}
                        {i > 0 && (
                          <span
                            className={
                              delta > 0 ? "text-rose-500" : "text-emerald-500"
                            }
                          >
                            ({delta > 0 ? "+" : ""}
                            {delta})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── VIEWS ─────────────────────────────────────────────────────────────── */

function ListView({
  sortedFiltered,
  now,
  updateTicket,
  removeTicket,
}: {
  sortedFiltered: Ticket[];
  now: Date;
  updateTicket: (id: string, patch: Partial<Ticket>) => void;
  removeTicket: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
      <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
          <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
            Tickets
          </h2>
        </div>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          sorted by priority · age
        </span>
      </header>
      {sortedFiltered.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-muted">
          No tickets match the current filters.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {sortedFiltered.map((t) => {
            const age = daysBetween(new Date(t.createdAt), now);
            const sla = PRIORITY_SLA_DAYS[t.priority];
            const pct = Math.min(100, (age / Math.max(sla, 1)) * 100);
            const isStale = t.status !== "done" && age > sla;
            const tone = PRIORITY_TONE[t.priority];
            const band = ageBandFor(age, sla);
            const bandTone = AGE_BAND_TONE[band];
            return (
              <li
                key={t.id}
                className={`group grid items-center gap-3 px-4 py-3 transition-colors hover:bg-app md:grid-cols-[auto_minmax(0,1fr)_minmax(140px,180px)_auto_auto_auto] ${
                  isStale ? "bg-rose-500/5" : ""
                }`}
              >
                {/* Priority chip */}
                <span
                  className={`inline-flex items-center gap-1.5 self-start rounded-md border px-2 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] ${tone.chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {t.priority}
                </span>

                {/* Title + age bar */}
                <div className="min-w-0">
                  <input
                    value={t.title}
                    onChange={(e) =>
                      updateTicket(t.id, { title: e.target.value })
                    }
                    className="w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-app placeholder:text-faint outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                  />
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full border border-app bg-app">
                      <div
                        className={`h-full transition-all ${
                          isStale ? "bg-rose-500" : tone.bar
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] ${bandTone.chip}`}
                    >
                      {age}d / {sla}d
                    </span>
                  </div>
                </div>

                {/* Status pill */}
                <div className="relative">
                  <span
                    className={`pointer-events-none absolute inset-0 flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.6rem] font-medium uppercase tracking-[0.15em] ${
                      STATUS_TONE[t.status]
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {STATUS_LABEL[t.status]}
                  </span>
                  <select
                    value={t.status}
                    onChange={(e) =>
                      updateTicket(t.id, {
                        status: e.target.value as Status,
                      })
                    }
                    className="relative w-full cursor-pointer appearance-none rounded-full border border-transparent bg-transparent px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-transparent outline-none focus:border-tool-accent"
                    aria-label="Status"
                  >
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Owner */}
                <div className="flex items-center gap-2">
                  <span
                    title={t.assignee || "unassigned"}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[0.6rem] font-semibold uppercase tracking-wide ${
                      t.assignee
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-dashed border-app bg-app text-muted"
                    }`}
                  >
                    {initials(t.assignee)}
                  </span>
                  <input
                    value={t.assignee}
                    onChange={(e) =>
                      updateTicket(t.id, { assignee: e.target.value })
                    }
                    placeholder="unassigned"
                    className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-secondary placeholder:text-faint outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                  />
                </div>

                {/* Stale badge */}
                {isStale ? (
                  <span className="hidden rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-rose-500 md:inline-flex">
                    Stale
                  </span>
                ) : (
                  <span className="hidden md:inline-block md:w-[52px]" />
                )}

                {/* Delete */}
                <button
                  onClick={() => removeTicket(t.id)}
                  className="rounded-md border border-app px-2 py-1 text-xs text-muted opacity-0 transition-colors hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                  aria-label="Delete ticket"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KanbanView({
  byPriority,
  now,
  removeTicket,
}: {
  byPriority: Record<Priority, Ticket[]>;
  now: Date;
  removeTicket: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => {
        const tone = PRIORITY_TONE[p];
        const items = byPriority[p];
        return (
          <section
            key={p}
            className="overflow-hidden rounded-xl border border-app bg-app-elevated"
          >
            <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] ${tone.chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {p}
                </span>
                <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  {PRIORITY_SHORT[p]}
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                SLA {PRIORITY_SLA_DAYS[p]}d · {items.length} ticket
                {items.length === 1 ? "" : "s"}
              </span>
            </header>
            {items.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-muted">
                Nothing in this lane.
              </div>
            ) : (
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const age = daysBetween(new Date(t.createdAt), now);
                  const sla = PRIORITY_SLA_DAYS[p];
                  const pct = Math.min(100, (age / Math.max(sla, 1)) * 100);
                  const isStale = t.status !== "done" && age > sla;
                  const band = ageBandFor(age, sla);
                  const bandTone = AGE_BAND_TONE[band];
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border border-l-4 bg-app-elevated p-3 transition-colors hover:border-tool-accent ${tone.border} ${
                        isStale ? "border-rose-500/40" : "border-app"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${
                            STATUS_TONE[t.status]
                          }`}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${bandTone.chip}`}
                        >
                          {bandTone.label}
                        </span>
                      </div>
                      <div
                        className="mt-2 truncate text-sm text-app"
                        title={t.title}
                      >
                        {t.title || "(untitled)"}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full border border-app bg-app">
                          <div
                            className={`h-full ${
                              isStale ? "bg-rose-500" : tone.bar
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono text-[0.6rem] tabular-nums ${
                            isStale ? "text-rose-500" : "text-muted"
                          }`}
                        >
                          {age}d / {sla}d
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            title={t.assignee || "unassigned"}
                            className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[0.5rem] font-semibold uppercase ${
                              t.assignee
                                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                : "border-dashed border-app bg-app text-muted"
                            }`}
                          >
                            {initials(t.assignee)}
                          </span>
                          <span className="truncate text-[0.65rem] text-secondary">
                            {t.assignee || "unassigned"}
                          </span>
                        </div>
                        <button
                          onClick={() => removeTicket(t.id)}
                          className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.6rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TimelineView({
  tickets,
  now,
  removeTicket,
}: {
  tickets: Ticket[];
  now: Date;
  removeTicket: (id: string) => void;
}) {
  // Sort by oldest first — timeline reads chronologically
  const sorted = [...tickets].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return (
    <section className="overflow-hidden rounded-xl border border-app bg-app-elevated">
      <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
          <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
            Timeline
          </h2>
        </div>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
          oldest → newest
        </span>
      </header>
      {sorted.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-muted">
          No open tickets.
        </div>
      ) : (
        <div className="relative space-y-3 p-5">
          <span className="pointer-events-none absolute bottom-5 left-7 top-5 w-px bg-tool-accent-soft" />
          {sorted.map((t) => {
            const age = daysBetween(new Date(t.createdAt), now);
            const sla = PRIORITY_SLA_DAYS[t.priority];
            const isStale = age > sla;
            const tone = PRIORITY_TONE[t.priority];
            const band = ageBandFor(age, sla);
            const bandTone = AGE_BAND_TONE[band];
            return (
              <div
                key={t.id}
                className="group grid grid-cols-[auto_1fr] items-start gap-3"
              >
                <div
                  className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-app-elevated font-mono text-[0.6rem] font-bold ${
                    isStale
                      ? "border-rose-500 text-rose-500"
                      : `border-tool-accent text-tool-accent`
                  }`}
                >
                  {age}d
                </div>
                <div
                  className={`flex-1 rounded-xl border border-l-4 bg-app-elevated p-3 transition-colors hover:border-tool-accent ${tone.border}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${tone.chip}`}
                    >
                      {t.priority}
                    </span>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${
                        STATUS_TONE[t.status]
                      }`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${bandTone.chip}`}
                    >
                      {bandTone.label}
                    </span>
                    <span className="font-mono text-[0.6rem] tabular-nums text-muted">
                      created {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => removeTicket(t.id)}
                      className="ml-auto rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.6rem] text-muted opacity-0 transition-colors hover:border-rose-500/40 hover:text-rose-500 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1.5 truncate text-sm text-app">
                    {t.title || "(untitled)"}
                  </div>
                  <div className="mt-1 text-[0.65rem] text-secondary">
                    {t.assignee || "unassigned"} · SLA {sla}d
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgingView({
  bands,
  now,
  removeTicket,
}: {
  bands: Record<AgeBand, Ticket[]>;
  now: Date;
  removeTicket: (id: string) => void;
}) {
  const order: AgeBand[] = ["critical", "stale", "aging", "fresh"];
  return (
    <div className="space-y-4">
      {order.map((band) => {
        const items = bands[band];
        const tone = AGE_BAND_TONE[band];
        return (
          <section
            key={band}
            className={`overflow-hidden rounded-xl border border-l-4 bg-app-elevated ${tone.border} border-app`}
          >
            <header className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] ${tone.chip}`}
                >
                  {tone.label}
                </span>
                <h2 className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  {band === "critical"
                    ? "Past 2× SLA"
                    : band === "stale"
                    ? "Past SLA"
                    : band === "aging"
                    ? "Approaching SLA"
                    : "Within SLA"}
                </h2>
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                {items.length} ticket{items.length === 1 ? "" : "s"}
              </span>
            </header>
            {items.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-muted">
                Empty.
              </div>
            ) : (
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const age = daysBetween(new Date(t.createdAt), now);
                  const sla = PRIORITY_SLA_DAYS[t.priority];
                  const ptone = PRIORITY_TONE[t.priority];
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border border-l-4 bg-app-elevated p-3 transition-colors hover:border-tool-accent border-app ${ptone.border}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${ptone.chip}`}
                        >
                          {t.priority}
                        </span>
                        <span className="font-mono text-[0.6rem] tabular-nums text-secondary">
                          {age}d / {sla}d
                        </span>
                      </div>
                      <div className="mt-2 truncate text-sm text-app">
                        {t.title || "(untitled)"}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[0.65rem] text-secondary">
                          {t.assignee || "unassigned"}
                        </span>
                        <button
                          onClick={() => removeTicket(t.id)}
                          className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.6rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ─── Local presentational helpers ─────────────────────────────────────── */

function HeroStat({
  label,
  value,
  hint,
  accent,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
  tone?: "rose" | "amber";
}) {
  const valueColor = accent
    ? "text-tool-accent"
    : tone === "rose"
    ? "text-rose-500"
    : tone === "amber"
    ? "text-amber-500"
    : "text-app";
  const borderColor = accent
    ? "border-tool-accent"
    : tone === "rose"
    ? "border-rose-500/40"
    : tone === "amber"
    ? "border-amber-500/40"
    : "border-app";
  const bg = accent
    ? "bg-tool-accent-soft"
    : tone === "rose"
    ? "bg-rose-500/5"
    : tone === "amber"
    ? "bg-amber-500/5"
    : "bg-app";
  return (
    <div className={`rounded-xl border ${borderColor} ${bg} px-4 py-3`}>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold tabular-nums sm:text-3xl ${valueColor}`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[0.65rem] text-muted">{hint}</div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.6rem] font-medium uppercase tracking-[0.15em] transition-colors ${
        active
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
      }`}
    >
      {tone && (
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} aria-hidden />
      )}
      {children}
    </button>
  );
}
