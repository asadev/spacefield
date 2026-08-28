"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * RemindersView — reminder list tied to contacts.
 *
 * Folded in from app/solutions/tools/follow-up-reminder/page.tsx. Marketing
 * chrome stripped; renders inside the CRM shell. Persistence is
 * workspace_data (`follow-ups` namespace) when a team is selected;
 * localStorage fallback for personal mode.
 *
 * Buckets: Overdue / Today / Upcoming / Snoozed / Done. Filter by owner.
 * Recurrence: daily/weekly/biweekly/monthly. Auto-escalate after N days
 * overdue. Batch-snooze pill row for overdue stack.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

type Status = "pending" | "done" | "snoozed";
type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";
type Bucket = "all" | "overdue" | "today" | "upcoming";

interface Reminder {
  id: string;
  contact: string;
  due: string;
  message: string;
  status: Status;
  owner: string;
  recurrence?: Recurrence;
  escalateAfterDays?: number;
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
        owner: "Alex",
      },
      {
        id: uid(),
        contact: "John Chen",
        due: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        message: "Check on pilot results",
        status: "pending",
        owner: "Alex",
      },
    ],
  };
}

function daysBetween(a: string, b: string) {
  const d1 = new Date(a).setHours(0, 0, 0, 0);
  const d2 = new Date(b).setHours(0, 0, 0, 0);
  return Math.round((d1 - d2) / 86400000);
}

function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${extra}`.trim();
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
}

export default function RemindersView({
  workspaceId,
  workspaceLabel,
  width,
}: Props) {
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
  const [bucketFilter, setBucketFilter] = useState<Bucket>("all");

  const compact = width < 720;

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
        } catch {
          /* ignore */
        }
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
      if (typeof window !== "undefined") {
        window.alert("Contact and message are required.");
      }
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
      reminders: s.reminders.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));

  const remove = (id: string) => {
    setState((s) => ({
      reminders: s.reminders.filter((r) => r.id !== id),
    }));
  };

  const snooze = (id: string, days: number) => {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return;
    const next = new Date(r.due);
    next.setDate(next.getDate() + days);
    update(id, { due: next.toISOString().slice(0, 10), status: "pending" });
  };

  const filterChips: { key: Bucket; label: string; count: number }[] = [
    {
      key: "all",
      label: "All open",
      count: overdue.length + today.length + upcoming.length,
    },
    { key: "overdue", label: "Overdue", count: overdue.length },
    { key: "today", label: "Today", count: today.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
  ];

  const visibleByBucket: Record<Bucket, Reminder[]> = {
    all: [...overdue, ...today, ...upcoming],
    overdue,
    today,
    upcoming,
  };
  const visible = visibleByBucket[bucketFilter];

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
    const dueLabel = new Date(r.due).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return (
      <li>
        <div
          className={`rounded-md border bg-app-elevated p-3 transition-colors ${
            escalated
              ? "border-rose-500/40"
              : delta < 0
              ? "border-rose-500/30"
              : delta === 0
              ? "border-amber-500/30"
              : "border-app"
          }`}
        >
          <div className="flex flex-wrap items-start gap-2">
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
                  <span className="inline-flex items-center gap-1 rounded-full border border-app bg-app px-2 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-faint">
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
                <span>Due {dueLabel}</span>
                <input
                  type="date"
                  value={r.due}
                  onChange={(e) => update(r.id, { due: e.target.value })}
                  className="rounded border border-app bg-app px-2 py-0.5 text-[0.65rem] normal-case tracking-normal text-secondary hover:border-tool-accent"
                />
                <span className="text-faint">·</span>
                <input
                  value={r.owner}
                  placeholder="Owner"
                  onChange={(e) => update(r.id, { owner: e.target.value })}
                  className="w-24 rounded border border-app bg-app px-2 py-0.5 text-[0.65rem] normal-case tracking-normal text-secondary hover:border-tool-accent"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(r.id)}
              className="rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint hover:border-rose-500/40 hover:text-rose-500"
              aria-label="Delete reminder"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-app pt-2">
            {r.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    update(r.id, { status: "done" });
                    advanceRecurrence(r.id);
                  }}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-emerald-500 hover:bg-emerald-500/20"
                >
                  ✓ Done
                </button>
                <span className="ml-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  Snooze
                </span>
                <button
                  type="button"
                  onClick={() => snooze(r.id, 1)}
                  className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                >
                  +1d
                </button>
                <button
                  type="button"
                  onClick={() => snooze(r.id, 3)}
                  className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                >
                  +3d
                </button>
                <button
                  type="button"
                  onClick={() => snooze(r.id, 7)}
                  className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                >
                  +1w
                </button>
              </>
            )}
            {r.status === "done" && (
              <button
                type="button"
                onClick={() => update(r.id, { status: "pending" })}
                className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
              >
                ↻ Reopen
              </button>
            )}
            {r.status === "snoozed" && (
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                Snoozed
              </span>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.reminders
          </div>
          <h2 className="text-sm font-semibold text-app">Follow-up reminders</h2>
        </div>
        <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-rose-500">
          {overdue.length} overdue
        </span>
        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-amber-500">
          {today.length} today
        </span>
        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
          {upcoming.length} upcoming
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {syncing
            ? "saving…"
            : syncedAt
            ? `saved ${syncedAt}`
            : hydrated
            ? "ready"
            : "loading…"}
        </span>
      </header>

      <div className="border-b border-app bg-app-elevated p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_1fr_1fr_auto]">
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
            type="button"
            onClick={add}
            className="rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            + Add
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
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
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
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
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
        <div className="inline-flex overflow-hidden rounded-md border border-app bg-app-elevated">
          {filterChips.map((chip) => {
            const active = bucketFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setBucketFilter(chip.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "bg-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
                style={active ? { color: "var(--bg)" } : undefined}
              >
                <span>{chip.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[0.55rem] ${
                    active ? "bg-app/20" : "bg-app text-faint"
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
          Owner
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className={inputCls("max-w-[160px]")}
          >
            <option value="all">All</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
      </div>

      {overdue.length > 0 &&
        (bucketFilter === "all" || bucketFilter === "overdue") && (
          <div className="flex flex-wrap items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-rose-500">
              {overdue.length} overdue · batch snooze
            </span>
            <button
              type="button"
              onClick={() =>
                batchSnooze(
                  overdue.map((r) => r.id),
                  1
                )
              }
              className="rounded-md border border-app bg-app-elevated px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
            >
              +1 day
            </button>
            <button
              type="button"
              onClick={() =>
                batchSnooze(
                  overdue.map((r) => r.id),
                  3
                )
              }
              className="rounded-md border border-app bg-app-elevated px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
            >
              +3 days
            </button>
            <button
              type="button"
              onClick={() =>
                batchSnooze(
                  overdue.map((r) => r.id),
                  7
                )
              }
              className="rounded-md border border-app bg-app-elevated px-2.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-secondary hover:border-tool-accent hover:text-tool-accent"
            >
              +1 week
            </button>
          </div>
        )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visible.length > 0 ? (
          <ul className="space-y-2">
            {visible.map((r) => (
              <ReminderRow key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
            {bucketFilter === "all"
              ? "No open reminders. Add one above."
              : `No ${bucketFilter} reminders.`}
          </div>
        )}

        {snoozed.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Snoozed ({snoozed.length})
            </div>
            <ul className="space-y-2">
              {snoozed.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </ul>
          </div>
        )}
        {done.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Done ({done.length})
            </div>
            <ul className="space-y-2">
              {done.map((r) => (
                <ReminderRow key={r.id} r={r} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="border-t border-app bg-app-elevated px-3 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {workspaceLabel} · {workspaceId ? "synced" : "personal mode"}
        {compact ? " · narrow" : ""}
      </footer>
    </div>
  );
}
