"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ActivitiesView — list + calendar over every activity in the workspace.
 *
 * Two modes (toggle in header):
 *   1. List — chronological feed with kind icons, subject excerpt, related
 *             record click-through, completed checkbox.
 *   2. Calendar — month or week grid showing tasks by due_at and meetings
 *             by starts_at. Drag a task between days to update due_at.
 *
 * Filters: kind, assignee, "my activities" toggle, completed/uncompleted,
 * date range. Quick chips: Due today, Overdue, This week.
 * ───────────────────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import { createClient } from "@/lib/supabase/client";
import type {
  CrmActivity,
  CrmActivityKind,
} from "../types";
import { ACTIVITY_KIND_VALUES } from "../types";
import { RecIcon } from "./_records/Icon";
import ActivityComposer from "./ActivityComposer";

type Mode = "list" | "calendar";
type CalScope = "month" | "week";
type Quick = "today" | "overdue" | "week" | null;

export default function ActivitiesView() {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const [userId, setUserId] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("list");
  const [calScope, setCalScope] = useState<CalScope>("month");
  const [calCursor, setCalCursor] = useState<Date>(() => new Date());

  const [items, setItems] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [kindFilter, setKindFilter] = useState<CrmActivityKind | "">("");
  const [completedFilter, setCompletedFilter] = useState<"" | "open" | "done">(
    ""
  );
  const [mineOnly, setMineOnly] = useState(false);
  const [quick, setQuick] = useState<Quick>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (!cancelled) setUserId(data.user?.id ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (kindFilter) params.set("kind", kindFilter);
      if (completedFilter === "open") params.set("completed", "false");
      else if (completedFilter === "done") params.set("completed", "true");
      params.set("limit", "500");
      const json = await cachedFetch<{ items: CrmActivity[] }>(
        `/api/crm/activities/?${params.toString()}`
      );
      setItems(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, kindFilter, completedFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Apply client-side mine + quick + date-range filters atop the list.
  const filtered = useMemo(() => {
    let list = items;
    if (mineOnly && userId) {
      list = list.filter(
        (a) =>
          a.created_by === userId ||
          (Array.isArray(a.assignee_ids) && a.assignee_ids.includes(userId))
      );
    }
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 3600 * 1000);
    if (quick === "today") {
      list = list.filter((a) => {
        const t = a.due_at ? new Date(a.due_at).getTime() : null;
        return t !== null && t >= startOfDay.getTime() && t < endOfDay.getTime();
      });
    } else if (quick === "overdue") {
      list = list.filter(
        (a) => a.due_at && !a.completed_at && new Date(a.due_at).getTime() < now
      );
    } else if (quick === "week") {
      list = list.filter((a) => {
        const t = a.due_at ? new Date(a.due_at).getTime() : null;
        return (
          t !== null &&
          t >= startOfWeek.getTime() &&
          t < endOfWeek.getTime()
        );
      });
    }
    return list;
  }, [items, mineOnly, userId, quick]);

  const onCreated = useCallback((a: CrmActivity) => {
    setItems((prev) => [a, ...prev]);
  }, []);

  const onToggleCompleted = useCallback(
    async (a: CrmActivity) => {
      const next = a.completed_at ? null : new Date().toISOString();
      // Optimistic.
      setItems((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, completed_at: next } : x))
      );
      try {
        const res = await fetch(`/api/crm/activities/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed_at: next }),
        });
        if (!res.ok) throw new Error("update failed");
        invalidate({ prefix: `/api/crm/activities/?workspace_id=${workspaceId}` });
      } catch {
        // Revert.
        setItems((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, completed_at: a.completed_at } : x))
        );
      }
    },
    [workspaceId]
  );

  const onMoveTaskTo = useCallback(
    async (taskId: string, dayDate: Date) => {
      const a = items.find((x) => x.id === taskId);
      if (!a || a.kind !== "task" || !a.due_at) return;
      const prev = new Date(a.due_at);
      const next = new Date(dayDate);
      next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      const iso = next.toISOString();
      setItems((list) =>
        list.map((x) => (x.id === taskId ? { ...x, due_at: iso } : x))
      );
      try {
        await fetch(`/api/crm/activities/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ due_at: iso }),
        });
      } catch {
        setItems((list) =>
          list.map((x) => (x.id === taskId ? { ...x, due_at: a.due_at } : x))
        );
      }
    },
    [items]
  );

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to see activities.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.activities
          </div>
          <h2 className="text-sm font-semibold text-app">Activities</h2>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-md border border-app">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
                mode === "list"
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setMode("calendar")}
              className={`border-l border-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
                mode === "calendar"
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              Calendar
            </button>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            <RecIcon name="plus" size={12} />
            New
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-1.5">
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as CrmActivityKind | "")}
          className="rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app focus:border-tool-accent focus:outline-none"
        >
          <option value="">All kinds</option>
          {ACTIVITY_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={completedFilter}
          onChange={(e) =>
            setCompletedFilter(e.target.value as "" | "open" | "done")
          }
          className="rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app focus:border-tool-accent focus:outline-none"
        >
          <option value="">All states</option>
          <option value="open">Open</option>
          <option value="done">Completed</option>
        </select>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--tool-accent)]"
          />
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            Mine
          </span>
        </label>
        <div className="flex gap-1">
          {([
            ["today", "Due today"],
            ["overdue", "Overdue"],
            ["week", "This week"],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setQuick(quick === k ? null : k)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${
                quick === k
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app text-secondary hover:text-app"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
        {loading ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : mode === "list" ? (
          <ActivityList
            items={filtered}
            onToggleCompleted={onToggleCompleted}
          />
        ) : (
          <ActivityCalendar
            items={filtered}
            scope={calScope}
            onScope={setCalScope}
            cursor={calCursor}
            onCursor={setCalCursor}
            onMoveTaskTo={onMoveTaskTo}
          />
        )}
      </div>

      <ActivityComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}

// ── List mode ──────────────────────────────────────────────────────────

function ActivityList({
  items,
  onToggleCompleted,
}: {
  items: CrmActivity[];
  onToggleCompleted: (a: CrmActivity) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
        No activities match the current filters.
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2 py-1.5"
        >
          {a.kind === "task" && (
            <input
              type="checkbox"
              checked={Boolean(a.completed_at)}
              onChange={() => onToggleCompleted(a)}
              className="h-4 w-4 accent-[var(--tool-accent)]"
              aria-label="Toggle completed"
            />
          )}
          <KindBadge kind={a.kind} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-app">
              {a.subject ?? "(no subject)"}
            </div>
            {a.body && (
              <div className="truncate font-mono text-[0.6rem] text-secondary">
                {a.body.slice(0, 140)}
              </div>
            )}
          </div>
          <RelatedTag activity={a} />
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
            {timeLabel(a)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RelatedTag({ activity }: { activity: CrmActivity }) {
  const refs: { kind: string; id: string }[] = [];
  if (activity.contact_id) refs.push({ kind: "contact", id: activity.contact_id });
  if (activity.company_id) refs.push({ kind: "company", id: activity.company_id });
  if (activity.deal_id) refs.push({ kind: "deal", id: activity.deal_id });
  if (activity.lead_id) refs.push({ kind: "lead", id: activity.lead_id });
  if (refs.length === 0) return null;
  const r = refs[0];
  return (
    <span className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
      {r.kind}
    </span>
  );
}

function timeLabel(a: CrmActivity): string {
  const iso = a.due_at ?? a.starts_at ?? a.created_at;
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const KIND_GLYPH: Record<CrmActivityKind, string> = {
  task: "T",
  call: "C",
  meeting: "M",
  email: "E",
  note: "N",
  sms: "S",
};

function KindBadge({ kind }: { kind: CrmActivityKind }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-app bg-app font-mono text-[0.6rem] font-semibold text-tool-accent"
      title={kind}
    >
      {KIND_GLYPH[kind]}
    </span>
  );
}

// ── Calendar mode ──────────────────────────────────────────────────────

function ActivityCalendar({
  items,
  scope,
  onScope,
  cursor,
  onCursor,
  onMoveTaskTo,
}: {
  items: CrmActivity[];
  scope: CalScope;
  onScope: (s: CalScope) => void;
  cursor: Date;
  onCursor: (d: Date) => void;
  onMoveTaskTo: (taskId: string, day: Date) => void;
}) {
  const days = useMemo(() => {
    if (scope === "week") return weekGrid(cursor);
    return monthGrid(cursor);
  }, [scope, cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CrmActivity[]>();
    for (const a of items) {
      const iso =
        a.kind === "meeting" || a.kind === "call"
          ? a.starts_at
          : a.due_at ?? null;
      if (!iso) continue;
      const key = dayKey(new Date(iso));
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCursor(shift(cursor, scope, -1))}
          className="rounded-md border border-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:text-app"
        >
          ‹ Prev
        </button>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-app">
          {cursor.toLocaleString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </span>
        <button
          type="button"
          onClick={() => onCursor(shift(cursor, scope, 1))}
          className="rounded-md border border-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:text-app"
        >
          Next ›
        </button>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-app">
          <button
            type="button"
            onClick={() => onScope("week")}
            className={`px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
              scope === "week"
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:text-app"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => onScope("month")}
            className={`border-l border-app px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
              scope === "month"
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:text-app"
            }`}
          >
            Month
          </button>
        </div>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint"
          >
            {d}
          </div>
        ))}
        {days.map((d) => (
          <DayCell
            key={d.toISOString()}
            day={d}
            cursor={cursor}
            scope={scope}
            activities={byDay.get(dayKey(d)) ?? []}
            onMoveTaskTo={onMoveTaskTo}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  cursor,
  scope,
  activities,
  onMoveTaskTo,
}: {
  day: Date;
  cursor: Date;
  scope: CalScope;
  activities: CrmActivity[];
  onMoveTaskTo: (taskId: string, day: Date) => void;
}) {
  const inMonth = day.getMonth() === cursor.getMonth() || scope === "week";
  const todayKey = dayKey(new Date());
  const isToday = dayKey(day) === todayKey;
  const dragOverRef = useRef(false);
  const [, forceRender] = useState(0);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOverRef.current) {
          dragOverRef.current = true;
          forceRender((n) => n + 1);
        }
      }}
      onDragLeave={() => {
        dragOverRef.current = false;
        forceRender((n) => n + 1);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragOverRef.current = false;
        const taskId = e.dataTransfer.getData("text/crm-task-id");
        if (taskId) onMoveTaskTo(taskId, day);
        forceRender((n) => n + 1);
      }}
      className={`min-h-[80px] rounded-md border p-1 ${
        dragOverRef.current
          ? "border-tool-accent bg-tool-accent-soft"
          : isToday
          ? "border-tool-accent bg-app-elevated"
          : "border-app bg-app-elevated"
      } ${inMonth ? "" : "opacity-50"}`}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {day.getDate()}
        </span>
        {activities.length > 0 && (
          <span className="font-mono text-[0.55rem] text-faint">
            {activities.length}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {activities.slice(0, 3).map((a) => (
          <div
            key={a.id}
            draggable={a.kind === "task"}
            onDragStart={(e) => {
              if (a.kind !== "task") return;
              e.dataTransfer.setData("text/crm-task-id", a.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="truncate rounded border border-app bg-app px-1 py-0.5 font-mono text-[0.55rem] text-app"
            title={a.subject ?? ""}
          >
            <span className="text-tool-accent">{KIND_GLYPH[a.kind]}</span>{" "}
            {a.subject ?? "(untitled)"}
          </div>
        ))}
        {activities.length > 3 && (
          <div className="font-mono text-[0.55rem] text-faint">
            +{activities.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}

function shift(d: Date, scope: CalScope, n: number): Date {
  const x = new Date(d);
  if (scope === "week") x.setDate(x.getDate() + 7 * n);
  else x.setMonth(x.getMonth() + n);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function weekGrid(cursor: Date): Date[] {
  const start = new Date(cursor);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}
