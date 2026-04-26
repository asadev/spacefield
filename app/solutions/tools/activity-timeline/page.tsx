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

type ActivityType = "email" | "call" | "meeting" | "note" | "task";

interface Activity {
  id: string;
  contact: string;
  type: ActivityType;
  at: string; // ISO
  summary: string;
  nextStep: string;
  owner: string;
}

interface State {
  activities: Activity[];
}

const LS_KEY = "solutions:activity-timeline:v1";
const NAMESPACE = "activity";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const TYPES: ActivityType[] = ["email", "call", "meeting", "note", "task"];

const uid = () => Math.random().toString(36).slice(2, 9);

function formatIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString().padStart(4, "0") +
    (d.getUTCMonth() + 1).toString().padStart(2, "0") +
    d.getUTCDate().toString().padStart(2, "0") +
    "T" +
    d.getUTCHours().toString().padStart(2, "0") +
    d.getUTCMinutes().toString().padStart(2, "0") +
    "00Z"
  );
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function toIcs(activities: { id: string; type: string; contact: string; at: string; summary: string; nextStep: string }[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//spacefield-ai//activity-timeline//EN",
    "CALSCALE:GREGORIAN",
  ];
  activities.forEach((a) => {
    const start = formatIcsDate(a.at);
    // Default 30 min duration
    const endDate = new Date(new Date(a.at).getTime() + 30 * 60 * 1000);
    const end = formatIcsDate(endDate.toISOString());
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@spacefield-ai-timeline`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcs(`[${a.type}] ${a.contact}: ${a.summary || ""}`)}`,
      `DESCRIPTION:${escapeIcs(
        [a.summary, a.nextStep ? `Next: ${a.nextStep}` : ""]
          .filter(Boolean)
          .join("\n")
      )}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Try to pull contact names from contact-manager LS for a convenience suggestion list
function useContactSuggestions() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("solutions:contact-manager:v1");
      if (!raw) return;
      const s = JSON.parse(raw) as { contacts?: { name: string }[] };
      if (Array.isArray(s.contacts)) {
        setNames(s.contacts.map((c) => c.name).filter(Boolean));
      }
    } catch {}
  }, []);
  return names;
}

function defaultState(): State {
  const now = Date.now();
  return {
    activities: [
      {
        id: uid(),
        contact: "Jane Doe",
        type: "meeting",
        at: new Date(now - 2 * 86400000).toISOString(),
        summary: "Discovery call — mapped buying process, 3 stakeholders.",
        nextStep: "Send proposal draft Friday.",
        owner: "Asad",
      },
      {
        id: uid(),
        contact: "Jane Doe",
        type: "email",
        at: new Date(now - 86400000).toISOString(),
        summary: "Sent one-pager + case study.",
        nextStep: "",
        owner: "Asad",
      },
    ],
  };
}

// Group activities by date label (Today / Yesterday / weekday / date)
function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export default function ActivityTimelinePage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Activity Timeline"
      description="Log emails, calls, meetings, notes, and tasks against any contact. Filter by type or owner. Team mode shares the timeline across the workspace."
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

  const [contactFilter, setContactFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"timeline" | "thread">("timeline");

  const [draft, setDraft] = useState<Activity>({
    id: uid(),
    contact: "",
    type: "email",
    at: new Date().toISOString().slice(0, 16),
    summary: "",
    nextStep: "",
    owner: "",
  });

  const suggestions = useContactSuggestions();

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
          data && Array.isArray(data.activities) ? data : defaultState()
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

  const owners = useMemo(() => {
    return Array.from(new Set(state.activities.map((a) => a.owner))).filter(
      Boolean
    );
  }, [state]);

  const filtered = useMemo(() => {
    return state.activities
      .filter((a) => {
        if (contactFilter && !a.contact.toLowerCase().includes(contactFilter.toLowerCase())) return false;
        if (typeFilter !== "all" && a.type !== typeFilter) return false;
        if (ownerFilter !== "all" && a.owner !== ownerFilter) return false;
        return true;
      })
      .sort((a, b) => (b.at > a.at ? 1 : -1));
  }, [state, contactFilter, typeFilter, ownerFilter]);

  const logDraft = () => {
    if (!draft.contact.trim() || !draft.summary.trim()) {
      alert("Contact and summary required.");
      return;
    }
    const toAdd: Activity = {
      ...draft,
      id: uid(),
      at: new Date(draft.at).toISOString(),
    };
    setState((s) => ({ activities: [toAdd, ...s.activities] }));
    setDraft((d) => ({
      ...d,
      summary: "",
      nextStep: "",
      at: new Date().toISOString().slice(0, 16),
    }));
  };

  const remove = (id: string) => {
    if (!confirm("Delete this activity?")) return;
    setState((s) => ({ activities: s.activities.filter((a) => a.id !== id) }));
  };

  const stats = useMemo(() => {
    const by: Record<ActivityType, number> = {
      email: 0,
      call: 0,
      meeting: 0,
      note: 0,
      task: 0,
    };
    state.activities.forEach((a) => by[a.type]++);
    return by;
  }, [state]);

  const exportIcs = () => {
    const data = toIcs(filtered);
    const blob = new Blob([data], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity-timeline.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group by contact for thread view
  const threadedByContact = useMemo(() => {
    const map = new Map<string, Activity[]>();
    filtered.forEach((a) => {
      const key = a.contact || "(no contact)";
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    });
    // Sort each thread desc by date
    const entries = Array.from(map.entries()).map(([k, v]) => ({
      contact: k,
      activities: v.sort((a, b) => (b.at > a.at ? 1 : -1)),
    }));
    // Order threads by most recent activity
    entries.sort((a, b) =>
      b.activities[0].at > a.activities[0].at ? 1 : -1
    );
    return entries;
  }, [filtered]);

  // Group filtered activities by date label for the main timeline view
  const groupedByDate = useMemo(() => {
    const groups: { label: string; activities: Activity[] }[] = [];
    filtered.forEach((a) => {
      const label = dateGroupLabel(a.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.activities.push(a);
      else groups.push({ label, activities: [a] });
    });
    return groups;
  }, [filtered]);

  const typeIcon: Record<ActivityType, string> = {
    email: "✉",
    call: "☎",
    meeting: "◉",
    note: "✎",
    task: "✓",
  };

  const importantTypes: ActivityType[] = ["meeting", "call"];

  return (
    <div data-tool-theme="crm" data-tool="activity-timeline">
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            crm:timeline
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {current.kind === "team" ? "team" : "personal"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            activity.feed
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {filtered.length}/{state.activities.length} entries
            </span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing
              ? "◌ saving"
              : syncedAt
              ? `◉ saved ${syncedAt}`
              : hydrated
              ? "◉ ready"
              : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
            CRM &amp; Sales Ops · Activity Log
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
            Every touch, on one timeline.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            Log calls, emails, meetings, notes and tasks against any contact. Filter by type or owner. Team mode syncs the feed across the workspace.
          </p>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={String(state.activities.length)} accent />
        <Stat label="Emails" value={String(stats.email)} />
        <Stat label="Calls" value={String(stats.call)} />
        <Stat label="Meetings" value={String(stats.meeting)} />
        <Stat label="Tasks" value={String(stats.task)} />
        <Stat
          label={current.kind === "team" ? "Team mode" : "Personal mode"}
          value={syncing ? "Saving…" : syncedAt ? `Saved ${syncedAt}` : "Ready"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <ToolCard title="Log activity" subtitle="New entry">
          <div className="space-y-3">
            <Field label="Contact">
              <input
                value={draft.contact}
                list="contact-suggestions"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact: e.target.value }))
                }
                className={inputCls()}
                placeholder="Jane Doe @ Acme"
              />
              <datalist id="contact-suggestions">
                {suggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="Type">
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: t }))}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                      draft.type === t
                        ? "border-tool-accent bg-tool-accent text-app-elevated"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                    }`}
                    style={draft.type === t ? { color: "var(--bg)" } : undefined}
                  >
                    <span aria-hidden>{typeIcon[t]}</span>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Date & time">
              <input
                type="datetime-local"
                value={draft.at.slice(0, 16)}
                onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))}
                className={inputCls()}
              />
            </Field>
            <Field label="Summary">
              <textarea
                value={draft.summary}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, summary: e.target.value }))
                }
                className={inputCls("min-h-[80px]")}
              />
            </Field>
            <Field label="Next step">
              <input
                value={draft.nextStep}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, nextStep: e.target.value }))
                }
                className={inputCls()}
              />
            </Field>
            <Field label="Owner">
              <input
                value={draft.owner}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, owner: e.target.value }))
                }
                className={inputCls()}
              />
            </Field>
            <button
              onClick={logDraft}
              className="w-full rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Log activity
            </button>
          </div>
        </ToolCard>

        <ToolCard title="Timeline" subtitle={`${filtered.length} entries`}>
          {/* Search + owner filter */}
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              placeholder="Filter by contact"
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className={inputCls()}
            />
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className={inputCls()}
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Type filter — segmented pills */}
          <div className="mb-3 inline-flex flex-wrap items-center gap-0 overflow-hidden rounded-lg border border-app bg-app-elevated">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                typeFilter === "all"
                  ? "bg-tool-accent text-app-elevated"
                  : "text-secondary hover:text-app"
              }`}
              style={typeFilter === "all" ? { color: "var(--bg)" } : undefined}
            >
              All
            </button>
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  typeFilter === t
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={typeFilter === t ? { color: "var(--bg)" } : undefined}
              >
                <span aria-hidden>{typeIcon[t]}</span>
                {t}
              </button>
            ))}
          </div>

          {/* View toggle + export */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              <button
                onClick={() => setViewMode("timeline")}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  viewMode === "timeline"
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setViewMode("thread")}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  viewMode === "thread"
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                By contact
              </button>
            </div>
            <button
              onClick={exportIcs}
              className="ml-auto rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
            >
              Export .ics
            </button>
          </div>

          {/* Per-channel breakdown */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TYPES.map((t) => {
              const total = filtered.length || 1;
              const n = filtered.filter((a) => a.type === t).length;
              const pct = (n / total) * 100;
              return (
                <div
                  key={t}
                  className="rounded-lg border border-app bg-app-elevated p-2"
                >
                  <div className="flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                    <span>{t}</span>
                    <span className="text-tool-accent">{n}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-app">
                    <div
                      className="h-full bg-tool-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {viewMode === "thread" ? (
            <div className="space-y-4">
              {threadedByContact.map(({ contact, activities }) => (
                <div
                  key={contact}
                  className="rounded-xl border border-app bg-app-elevated p-4"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-sm font-semibold text-app">
                      {contact}
                    </div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                      {activities.length} activities
                    </div>
                  </div>
                  <ol className="relative space-y-3 pl-6">
                    <span
                      aria-hidden
                      className="absolute left-[0.45rem] top-1 bottom-1 w-px bg-app"
                      style={{ background: "var(--border)" }}
                    />
                    {activities.map((a) => {
                      const isImportant = importantTypes.includes(a.type);
                      return (
                        <li key={a.id} className="relative">
                          <span
                            aria-hidden
                            className={`absolute -left-[1.15rem] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                              isImportant
                                ? "bg-tool-accent ring-2 ring-tool-accent-soft"
                                : "border border-app bg-app-elevated"
                            }`}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                              <span aria-hidden>{typeIcon[a.type]}</span>
                              {a.type}
                            </span>
                            <span className="font-mono text-xs text-muted">
                              {new Date(a.at).toLocaleString()}
                            </span>
                            {a.owner && (
                              <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                                {a.owner}
                              </span>
                            )}
                            <button
                              onClick={() => remove(a.id)}
                              className="ml-auto rounded-md border border-app px-1.5 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                              aria-label="Delete activity"
                            >
                              ×
                            </button>
                          </div>
                          <p className="mt-1 text-sm text-app">{a.summary}</p>
                          {a.nextStep && (
                            <p className="mt-1 text-xs text-tool-accent">
                              <span className="opacity-60">→</span> {a.nextStep}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              {threadedByContact.length === 0 && (
                <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
                  No activity yet.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedByDate.map((group) => (
                <div key={group.label}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                      {group.label}
                    </span>
                    <span
                      aria-hidden
                      className="h-px flex-1 bg-app"
                      style={{ background: "var(--border)" }}
                    />
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                      {group.activities.length}
                    </span>
                  </div>

                  <ol className="relative space-y-3 pl-7">
                    <span
                      aria-hidden
                      className="absolute left-[0.7rem] top-2 bottom-2 w-px"
                      style={{ background: "var(--border)" }}
                    />
                    {group.activities.map((a) => {
                      const isImportant = importantTypes.includes(a.type);
                      return (
                        <li key={a.id} className="relative">
                          <span
                            aria-hidden
                            className={`absolute -left-[1.45rem] top-4 flex h-4 w-4 items-center justify-center rounded-full ${
                              isImportant
                                ? "bg-tool-accent ring-2 ring-tool-accent-soft"
                                : "border border-app bg-app-elevated"
                            }`}
                          >
                            {isImportant && (
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: "var(--bg)" }}
                              />
                            )}
                          </span>
                          <div
                            className={`rounded-xl border bg-app-elevated p-4 transition-colors ${
                              isImportant
                                ? "border-tool-accent"
                                : "border-app hover:border-tool-accent"
                            }`}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                                <span aria-hidden>{typeIcon[a.type]}</span>
                                {a.type}
                              </span>
                              <span className="text-sm font-medium text-app">
                                {a.contact}
                              </span>
                              <span className="font-mono text-xs text-muted">
                                {new Date(a.at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {a.owner && (
                                <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent">
                                  · {a.owner}
                                </span>
                              )}
                              <button
                                onClick={() => remove(a.id)}
                                className="ml-auto rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                              >
                                ×
                              </button>
                            </div>
                            <p className="text-sm text-app">{a.summary}</p>
                            {a.nextStep && (
                              <p className="mt-2 text-xs text-tool-accent">
                                <span className="opacity-60">→ Next:</span> {a.nextStep}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              {groupedByDate.length === 0 && (
                <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
                  No activity yet.
                </div>
              )}
            </div>
          )}
        </ToolCard>
      </div>
    </div>
  );
}
