"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

type Status = "pending" | "done" | "snoozed";

type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";

interface Reminder {
  id: string;
  contact: string;
  due: string; // ISO date
  message: string;
  status: Status;
  owner: string;
  recurrence?: Recurrence;
  escalateAfterDays?: number; // auto-flag if overdue > N days
  createdAt?: string;
}

interface State {
  reminders: Reminder[];
}

const LS_KEY = "solutions:follow-up-reminder:v1";
const NAMESPACE = "follow-ups";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    reminders: [
      {
        id: uid(),
        contact: "Jane Doe",
        due: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        message: "Send pricing proposal",
        status: "pending",
        owner: "Asad",
      },
      {
        id: uid(),
        contact: "John Chen",
        due: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        message: "Check on pilot results",
        status: "pending",
        owner: "Asad",
      },
    ],
  };
}

function daysBetween(a: string, b: string) {
  const d1 = new Date(a).setHours(0, 0, 0, 0);
  const d2 = new Date(b).setHours(0, 0, 0, 0);
  return Math.round((d1 - d2) / 86400000);
}

export default function FollowUpReminderPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Follow-up Reminder"
      description="A simple reminder list tied to contacts. Overdue and upcoming views, snooze by days, owner filter. Team mode shares reminders across the workspace."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  const [draft, setDraft] = useState<Reminder>({
    id: uid(),
    contact: "",
    due: new Date().toISOString().slice(0, 10),
    message: "",
    status: "pending",
    owner: "",
    recurrence: "none",
    escalateAfterDays: 0,
  });
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState<
    "all" | "overdue" | "today" | "upcoming"
  >("all");

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    (async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<State>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setState(
          data && Array.isArray(data.reminders) ? data : defaultState()
        );
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          setState(raw ? (JSON.parse(raw) as State) : defaultState());
        } catch {
          setState(defaultState());
        }
      }
      lastSig.current = null;
      setHydrated(true);
    })();
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

  const owners = useMemo(
    () =>
      Array.from(new Set(state.reminders.map((r) => r.owner))).filter(Boolean),
    [state]
  );

  const now = new Date().toISOString().slice(0, 10);
  const filtered = state.reminders.filter(
    (r) => ownerFilter === "all" || r.owner === ownerFilter
  );

  const overdue = filtered.filter(
    (r) => r.status === "pending" && daysBetween(r.due, now) < 0
  );
  const today = filtered.filter(
    (r) => r.status === "pending" && daysBetween(r.due, now) === 0
  );
  const upcoming = filtered.filter(
    (r) => r.status === "pending" && daysBetween(r.due, now) > 0
  );
  const done = filtered.filter((r) => r.status === "done");
  const snoozed = filtered.filter((r) => r.status === "snoozed");

  const add = () => {
    if (!draft.contact.trim() || !draft.message.trim()) {
      alert("Contact and message are required.");
      return;
    }
    const r: Reminder = {
      ...draft,
      id: uid(),
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ reminders: [r, ...s.reminders] }));
    setDraft({
      id: uid(),
      contact: "",
      due: new Date().toISOString().slice(0, 10),
      message: "",
      status: "pending",
      owner: "",
      recurrence: "none",
      escalateAfterDays: 0,
    });
  };

  const advanceRecurrence = (id: string) => {
    const r = state.reminders.find((x) => x.id === id);
    if (!r || !r.recurrence || r.recurrence === "none") return;
    const next = new Date(r.due);
    switch (r.recurrence) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
    }
    // Clone the reminder forward as a new pending instance
    const clone: Reminder = {
      ...r,
      id: uid(),
      due: next.toISOString().slice(0, 10),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ reminders: [clone, ...s.reminders] }));
  };

  const batchSnooze = (ids: string[], days: number) => {
    setState((s) => ({
      reminders: s.reminders.map((r) => {
        if (!ids.includes(r.id)) return r;
        const next = new Date(r.due);
        next.setDate(next.getDate() + days);
        return {
          ...r,
          due: next.toISOString().slice(0, 10),
          status: "pending",
        };
      }),
    }));
  };

  const update = (id: string, patch: Partial<Reminder>) =>
    setState((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const remove = (id: string) => {
    setState((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
  };

  const snooze = (id: string, days: number) => {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return;
    const next = new Date(r.due);
    next.setDate(next.getDate() + days);
    update(id, { due: next.toISOString().slice(0, 10), status: "pending" });
  };

  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const ReminderRow = ({ r }: { r: Reminder }) => {
    const delta = daysBetween(r.due, now);
    const escalated =
      r.status === "pending" &&
      r.escalateAfterDays &&
      r.escalateAfterDays > 0 &&
      -delta >= r.escalateAfterDays;
    const badge =
      delta < 0
        ? `${-delta}d overdue`
        : delta === 0
        ? "Today"
        : `in ${delta}d`;
    const badgeCls =
      delta < 0
        ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
        : delta === 0
        ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
        : "border-tool-accent bg-tool-accent-soft text-tool-accent";
    const dotCls =
      delta < 0
        ? "border-rose-500 bg-rose-500/40"
        : delta === 0
        ? "border-amber-500 bg-amber-500/40"
        : r.status === "snoozed"
        ? "border-app bg-app-elevated"
        : "border-tool-accent bg-tool-accent/30";
    const dueLabel = new Date(r.due).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return (
      <li className="relative">
        <span
          aria-hidden
          className={`absolute -left-[1.45rem] top-5 flex h-4 w-4 items-center justify-center rounded-full border ${dotCls}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
        </span>
        <div
          className={`rounded-xl border bg-app-elevated p-4 transition-colors ${
            escalated
              ? "border-rose-500/40"
              : delta < 0
              ? "border-rose-500/30 hover:border-rose-500/50"
              : delta === 0
              ? "border-amber-500/30 hover:border-amber-500/50"
              : "border-app hover:border-tool-accent"
          }`}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft text-[0.65rem] font-semibold uppercase tracking-wider text-tool-accent"
            >
              {initials(r.contact)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <input
                  value={r.contact}
                  onChange={(e) => update(r.id, { contact: e.target.value })}
                  className="rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-app hover:border-app focus:border-tool-accent focus:bg-app focus:outline-none"
                />
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.15em] ${badgeCls}`}
                >
                  {badge}
                </span>
                {escalated && (
                  <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-rose-500">
                    Escalated
                  </span>
                )}
                {r.recurrence && r.recurrence !== "none" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-app bg-app px-2 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-muted">
                    ↻ {r.recurrence}
                  </span>
                )}
              </div>
              <input
                value={r.message}
                onChange={(e) => update(r.id, { message: e.target.value })}
                className="block w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-secondary hover:border-app focus:border-tool-accent focus:bg-app focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.6rem] uppercase tracking-[0.12em] text-faint">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden>📅</span>
                  <span>{dueLabel}</span>
                </span>
                <input
                  type="date"
                  value={r.due}
                  onChange={(e) => update(r.id, { due: e.target.value })}
                  className="rounded-lg border border-app bg-app px-2 py-0.5 text-[0.65rem] normal-case tracking-normal text-secondary hover:border-tool-accent"
                />
                <span className="text-faint">•</span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden>👤</span>
                  <input
                    value={r.owner}
                    placeholder="Owner"
                    onChange={(e) => update(r.id, { owner: e.target.value })}
                    className="w-24 rounded-lg border border-app bg-app px-2 py-0.5 text-[0.65rem] normal-case tracking-normal text-secondary hover:border-tool-accent"
                  />
                </span>
              </div>
            </div>
            <button
              onClick={() => remove(r.id)}
              className="text-[0.85rem] leading-none text-faint hover:text-rose-500 transition-colors"
              aria-label="Delete reminder"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-app pt-3">
            {r.status === "pending" && (
              <>
                <button
                  onClick={() => {
                    update(r.id, { status: "done" });
                    advanceRecurrence(r.id);
                  }}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                >
                  ✓ Done
                </button>
                <span className="ml-1 text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  Snooze
                </span>
                <button
                  onClick={() => snooze(r.id, 1)}
                  className="rounded-lg border border-app bg-app px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
                >
                  +1d
                </button>
                <button
                  onClick={() => snooze(r.id, 3)}
                  className="rounded-lg border border-app bg-app px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
                >
                  +3d
                </button>
                <button
                  onClick={() => snooze(r.id, 7)}
                  className="rounded-lg border border-app bg-app px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
                >
                  +1w
                </button>
              </>
            )}
            {r.status === "done" && (
              <button
                onClick={() => update(r.id, { status: "pending" })}
                className="rounded-lg border border-app bg-app px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
              >
                ↻ Reopen
              </button>
            )}
            {r.status === "snoozed" && (
              <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                Snoozed
              </span>
            )}
          </div>
        </div>
      </li>
    );
  };

  const TimelineRail = ({ items }: { items: Reminder[] }) => (
    <ol className="relative space-y-3 pl-7">
      <span
        aria-hidden
        className="absolute left-[0.7rem] top-2 bottom-2 w-px bg-tool-accent-soft"
      />
      {items.map((r) => (
        <ReminderRow key={r.id} r={r} />
      ))}
    </ol>
  );

  const filterChips: { key: "all" | "overdue" | "today" | "upcoming"; label: string; count: number }[] = [
    { key: "all", label: "All open", count: overdue.length + today.length + upcoming.length },
    { key: "overdue", label: "Overdue", count: overdue.length },
    { key: "today", label: "Today", count: today.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
  ];

  const visibleByBucket: Record<typeof bucketFilter, Reminder[]> = {
    all: [...overdue, ...today, ...upcoming],
    overdue,
    today,
    upcoming,
  };
  const visible = visibleByBucket[bucketFilter];

  return (
    <div data-tool-theme="crm" data-tool="follow-up-reminder">
      <WorkspaceSwitcher />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Overdue" value={String(overdue.length)} accent />
        <Stat label="Today" value={String(today.length)} />
        <Stat label="Upcoming" value={String(upcoming.length)} />
        <Stat label="Done" value={String(done.length)} />
        <Stat
          label={current.kind === "team" ? "Team mode" : "Personal mode"}
          value={syncing ? "Saving…" : syncedAt ? `Saved ${syncedAt}` : "Ready"}
        />
      </div>

      <ToolCard title="New reminder" subtitle="Add follow-up">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_1fr_1fr_auto]">
          <input
            placeholder="Contact"
            value={draft.contact}
            onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
            className={inputCls()}
          />
          <input
            placeholder="Message"
            value={draft.message}
            onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            className={inputCls()}
          />
          <input
            type="date"
            value={draft.due}
            onChange={(e) => setDraft({ ...draft, due: e.target.value })}
            className={inputCls()}
          />
          <input
            placeholder="Owner"
            value={draft.owner}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            className={inputCls()}
          />
          <button
            onClick={add}
            className="rounded-lg bg-tool-accent px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Add
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="mb-1 block text-[0.55rem] uppercase tracking-[0.15em] text-muted">
              Recurrence
            </span>
            <select
              value={draft.recurrence || "none"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  recurrence: e.target.value as Recurrence,
                })
              }
              className={inputCls()}
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.55rem] uppercase tracking-[0.15em] text-muted">
              Auto-escalate after (days overdue, 0 = off)
            </span>
            <input
              type="number"
              min={0}
              value={draft.escalateAfterDays ?? 0}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  escalateAfterDays: Number(e.target.value) || 0,
                })
              }
              className={inputCls()}
            />
          </label>
        </div>
      </ToolCard>

      {/* Filter strip — segmented pills */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
          {filterChips.map((chip) => {
            const active = bucketFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setBucketFilter(chip.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={active ? { color: "var(--bg)" } : undefined}
              >
                <span>{chip.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[0.55rem] ${
                    active
                      ? "bg-app/20"
                      : "bg-app text-muted"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[0.6rem] uppercase tracking-[0.15em] text-muted">
            Owner
          </span>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className={inputCls("max-w-xs")}
          >
            <option value="all">All</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch snooze pill controls (visible when overdue exist) */}
      {overdue.length > 0 && (bucketFilter === "all" || bucketFilter === "overdue") && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          <span className="text-[0.55rem] uppercase tracking-[0.15em] text-rose-500">
            {overdue.length} overdue · batch snooze
          </span>
          <button
            onClick={() => batchSnooze(overdue.map((r) => r.id), 1)}
            className="rounded-lg border border-app bg-app-elevated px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
          >
            +1 day
          </button>
          <button
            onClick={() => batchSnooze(overdue.map((r) => r.id), 3)}
            className="rounded-lg border border-app bg-app-elevated px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
          >
            +3 days
          </button>
          <button
            onClick={() => batchSnooze(overdue.map((r) => r.id), 7)}
            className="rounded-lg border border-app bg-app-elevated px-3 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
          >
            +1 week
          </button>
        </div>
      )}

      {/* Timeline rail */}
      <div className="mt-5 space-y-6">
        <ToolCard
          title="Reminder timeline"
          subtitle={`${visible.length} ${visible.length === 1 ? "reminder" : "reminders"}`}
        >
          {visible.length > 0 ? (
            <TimelineRail items={visible} />
          ) : (
            <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
              {bucketFilter === "all"
                ? "No open reminders. Add one above."
                : `No ${bucketFilter} reminders.`}
            </div>
          )}
        </ToolCard>

        {snoozed.length > 0 && (
          <ToolCard title={`Snoozed (${snoozed.length})`} subtitle="Later">
            <TimelineRail items={snoozed} />
          </ToolCard>
        )}
        {done.length > 0 && (
          <ToolCard title={`Done (${done.length})`} subtitle="Completed">
            <TimelineRail items={done} />
          </ToolCard>
        )}
      </div>
    </div>
  );
}
