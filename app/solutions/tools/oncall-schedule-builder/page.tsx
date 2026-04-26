"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

type Rotation = "daily" | "weekly";
type View = "week" | "month" | "list";

interface Member {
  name: string;
  tz: string; // IANA or abbreviation
  pto: string[]; // list of YYYY-MM-DD they're off
}

interface Swap {
  shiftIdx: number;
  newMember: string; // name string
}

interface OncallState {
  members: Member[] | string[]; // back-compat — tolerate old string[]
  rotation: Rotation;
  startDate: string;
  weeks: number;
  handoffTime: string; // HH:mm
  holidays?: string[]; // YYYY-MM-DD
  swaps?: Swap[];
}

interface Shift {
  who: string;
  start: Date;
  end: Date;
  onHoliday?: boolean;
  swapped?: boolean;
}

// normalize legacy string[] members to Member[]
function normalizeMembers(ms: Member[] | string[]): Member[] {
  if (ms.length === 0) return [];
  if (typeof ms[0] === "string") {
    return (ms as string[]).map((name) => ({ name, tz: "local", pto: [] }));
  }
  return ms as Member[];
}

const LS_KEY = "solutions:oncall-schedule:v1";
const NAMESPACE = "oncall-schedule";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

function defaultState(): OncallState {
  return {
    members: [
      { name: "Alice", tz: "local", pto: [] },
      { name: "Bob", tz: "local", pto: [] },
      { name: "Carol", tz: "local", pto: [] },
    ],
    rotation: "weekly",
    startDate: new Date().toISOString().slice(0, 10),
    weeks: 8,
    handoffTime: "09:00",
    holidays: [],
    swaps: [],
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildSchedule(s: OncallState): Shift[] {
  const members = normalizeMembers(s.members);
  if (members.length === 0) return [];
  const [hh, mm] = s.handoffTime.split(":").map(Number);
  const start = new Date(`${s.startDate}T00:00:00`);
  start.setHours(hh || 9, mm || 0, 0, 0);

  const shiftLen = s.rotation === "daily" ? 1 : 7;
  const totalShifts =
    s.rotation === "daily" ? s.weeks * 7 : s.weeks;
  const shifts: Shift[] = [];
  const holidays = new Set(s.holidays || []);
  const swaps = s.swaps || [];

  for (let i = 0; i < totalShifts; i++) {
    let who = members[i % members.length].name;

    // Check PTO auto-skip: if assigned member is on PTO that date, bump to next.
    let attempts = 0;
    while (attempts < members.length) {
      const m = members.find((x) => x.name === who);
      if (!m) break;
      const shiftStartDate = new Date(start);
      shiftStartDate.setDate(start.getDate() + i * shiftLen);
      const isPto = m.pto.some((d) => d === iso(shiftStartDate));
      if (!isPto) break;
      who = members[(i + attempts + 1) % members.length].name;
      attempts++;
    }

    // Apply manual swap
    const swap = swaps.find((sw) => sw.shiftIdx === i);
    const swapped = !!swap;
    if (swap) who = swap.newMember;

    const sStart = new Date(start);
    sStart.setDate(start.getDate() + i * shiftLen);
    const sEnd = new Date(sStart);
    sEnd.setDate(sStart.getDate() + shiftLen);

    // Check if any day of the shift overlaps a holiday
    let onHoliday = false;
    for (let d = new Date(sStart); d < sEnd; d.setDate(d.getDate() + 1)) {
      if (holidays.has(iso(d))) {
        onHoliday = true;
        break;
      }
    }

    shifts.push({ who, start: sStart, end: sEnd, onHoliday, swapped });
  }

  return shifts;
}

function toIcs(shifts: Shift[]): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
      d.getUTCDate()
    )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//solutions//oncall//EN",
    "CALSCALE:GREGORIAN",
  ];
  shifts.forEach((s, i) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:oncall-${i}-${s.start.getTime()}@example.com`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    lines.push(`DTSTART:${fmt(s.start)}`);
    lines.push(`DTEND:${fmt(s.end)}`);
    lines.push(`SUMMARY:On-call: ${s.who}`);
    lines.push(`DESCRIPTION:Primary responder`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/* ---------- visual helpers ---------- */

// Deterministic palette per-member name. Lime-leaning to harmonize with
// the support theme, but with enough hue variety to keep avatars legible.
const AVATAR_PALETTE = [
  { bg: "#a3e635", ink: "#1a2e05" },
  { bg: "#86efac", ink: "#052e16" },
  { bg: "#fde047", ink: "#3f2d00" },
  { bg: "#7dd3fc", ink: "#0c2a3d" },
  { bg: "#f0abfc", ink: "#3a0d3f" },
  { bg: "#fda4af", ink: "#3a0a18" },
  { bg: "#fdba74", ink: "#3a1a05" },
  { bg: "#c4b5fd", ink: "#1c0d3a" },
];

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarFor(name: string) {
  if (!name) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[hashName(name) % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDayShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTimeShort(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtWeekday(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export default function OncallSchedulePage() {
  return (
    <ToolShell
      category="Support & Ops"
      title="On-call Schedule Builder"
      description="Generate a rotation schedule. Export as ICS. Team mode shares the roster across the workspace."
    >
      <div data-tool-theme="support" data-tool="oncall-schedule-builder">
        <OncallInner />
      </div>
    </ToolShell>
  );
}

function OncallInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<OncallState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<View>("month");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<OncallState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        const ds = data && Array.isArray(data.members) ? data : defaultState();
        setState({
          ...ds,
          members: normalizeMembers(ds.members),
          holidays: ds.holidays || [],
          swaps: ds.swaps || [],
        });
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          const parsed = raw ? (JSON.parse(raw) as OncallState) : defaultState();
          setState({
            ...parsed,
            members: normalizeMembers(parsed.members),
            holidays: parsed.holidays || [],
            swaps: parsed.swaps || [],
          });
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

  const shifts = useMemo(() => buildSchedule(state), [state]);
  const members = normalizeMembers(state.members);

  const [memberInput, setMemberInput] = useState("");
  const [holidayInput, setHolidayInput] = useState("");

  const addMember = () => {
    const name = memberInput.trim();
    if (!name) return;
    setState({
      ...state,
      members: [...members, { name, tz: "local", pto: [] }],
    });
    setMemberInput("");
  };
  const removeMember = (i: number) => {
    setState({
      ...state,
      members: members.filter((_, idx) => idx !== i),
    });
  };
  const updateMember = (i: number, patch: Partial<Member>) => {
    setState({
      ...state,
      members: members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    });
  };

  const addHoliday = () => {
    if (!holidayInput) return;
    setState({
      ...state,
      holidays: Array.from(new Set([...(state.holidays || []), holidayInput])),
    });
    setHolidayInput("");
  };
  const removeHoliday = (d: string) => {
    setState({
      ...state,
      holidays: (state.holidays || []).filter((x) => x !== d),
    });
  };

  const applySwap = (shiftIdx: number, newMember: string) => {
    const without = (state.swaps || []).filter((s) => s.shiftIdx !== shiftIdx);
    if (!newMember) {
      setState({ ...state, swaps: without });
    } else {
      setState({ ...state, swaps: [...without, { shiftIdx, newMember }] });
    }
  };

  const downloadIcs = () => {
    const ics = toIcs(shifts);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oncall.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const coverage = useMemo(() => {
    const counts = new Map<string, number>();
    shifts.forEach((s) => counts.set(s.who, (counts.get(s.who) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [shifts]);

  // Fairness: lower variance = more fair. Score 0-100 where 100 = perfectly balanced.
  const fairness = useMemo(() => {
    if (coverage.length < 2 || shifts.length === 0)
      return { score: 100, stdev: 0, verdict: "—" };
    const counts = coverage.map(([, n]) => n);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const stdev = Math.sqrt(variance);
    // score: if stdev is 0 -> 100. Penalty ~ stdev/mean.
    const cv = mean > 0 ? stdev / mean : 0;
    const score = Math.max(0, Math.round(100 * (1 - cv)));
    const verdict =
      score >= 90
        ? "Excellent"
        : score >= 75
        ? "Good"
        : score >= 60
        ? "Uneven"
        : "Unfair — rebalance";
    return { score, stdev, verdict };
  }, [coverage, shifts]);

  // Holiday / weekend load per person
  const holidayLoad = useMemo(() => {
    const counts = new Map<string, number>();
    shifts.forEach((s) => {
      if (s.onHoliday) counts.set(s.who, (counts.get(s.who) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [shifts]);

  /* ---------- calendar grid layout ---------- */

  // build a continuous list of days from shifts; figure out who's primary on each day
  // and who's secondary (next member in roster after the primary).
  const calendar = useMemo(() => {
    if (shifts.length === 0 || members.length === 0)
      return {
        days: [] as {
          date: Date;
          primary: string;
          secondary: string;
          onHoliday: boolean;
          shiftIdx: number;
        }[],
        firstDow: 0,
      };

    // expand shifts into per-day cells
    const days: {
      date: Date;
      primary: string;
      secondary: string;
      onHoliday: boolean;
      shiftIdx: number;
    }[] = [];
    shifts.forEach((s, idx) => {
      const start = new Date(s.start);
      const end = new Date(s.end);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const primary = s.who;
        const pIdx = members.findIndex((m) => m.name === primary);
        const secondary =
          pIdx >= 0
            ? members[(pIdx + 1) % members.length].name
            : members[0].name;
        days.push({
          date: new Date(d),
          primary,
          secondary,
          onHoliday: (state.holidays || []).includes(iso(d)),
          shiftIdx: idx,
        });
      }
    });

    // Sunday=0..Saturday=6; align grid to week
    const firstDow = days[0] ? days[0].date.getDay() : 0;
    return { days, firstDow };
  }, [shifts, members, state.holidays]);

  const totalCells = calendar.days.length + calendar.firstDow;
  const weekRows = Math.max(1, Math.ceil(totalCells / 7));
  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // hero handoff data
  const firstShift = shifts[0];
  const lastShift = shifts[shifts.length - 1];
  const nextHandoff = shifts[1];

  // For "week" view: just first 7 days. For "month": all rows.
  const visibleWeekRows =
    view === "week" ? 1 : view === "month" ? weekRows : 0;

  return (
    <>
      <WorkspaceSwitcher />

      {/* ============== ROTATION SUMMARY HERO ============== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-tool-accent/30 bg-tool-surface p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-tool-accent/15 via-transparent to-transparent" />

        <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* now / next column */}
          <div className="space-y-4">
            <div>
              <div className="text-[0.55rem] uppercase tracking-[0.28em] text-tool-accent">
                Currently primary
              </div>

              <div className="mt-3 flex items-center gap-4">
                {firstShift ? (
                  <>
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold ring-2 ring-tool-accent ring-offset-2 ring-offset-app-elevated"
                      style={{
                        background: avatarFor(firstShift.who).bg,
                        color: avatarFor(firstShift.who).ink,
                      }}
                    >
                      {initials(firstShift.who)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-tool-heading truncate text-2xl text-app">
                        {firstShift.who}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {fmtDayShort(firstShift.start)} {fmtTimeShort(firstShift.start)}
                        <span className="mx-1.5 text-tool-accent">→</span>
                        {fmtDayShort(firstShift.end)} {fmtTimeShort(firstShift.end)}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1.5 text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                        {state.rotation} rotation · {state.weeks}w window
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">
                    Add members to start the rotation.
                  </div>
                )}
              </div>
            </div>

            {nextHandoff && (
              <div className="flex items-center gap-3 rounded-lg border border-app bg-app-elevated px-3 py-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{
                    background: avatarFor(nextHandoff.who).bg,
                    color: avatarFor(nextHandoff.who).ink,
                  }}
                >
                  {initials(nextHandoff.who)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                    Next handoff
                  </div>
                  <div className="truncate text-sm text-app">
                    {nextHandoff.who}{" "}
                    <span className="text-muted">
                      · {fmtWeekday(nextHandoff.start)}{" "}
                      {fmtDayShort(nextHandoff.start)} at{" "}
                      {fmtTimeShort(nextHandoff.start)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadIcs}
                disabled={shifts.length === 0}
                className="inline-flex items-center gap-2 rounded-md border border-tool-accent/40 bg-tool-accent-soft px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent ring-tool-accent hover:bg-tool-accent/20 disabled:opacity-40"
              >
                <span>↓</span> Download .ics
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                {current.kind === "team" ? "Team" : "Personal"}
                <span className="text-faint">·</span>
                {syncing ? "saving…" : syncedAt ? `saved ${syncedAt}` : "ready"}
              </span>
            </div>
          </div>

          {/* metrics column */}
          <div className="grid grid-cols-2 gap-2.5">
            <HeroStat label="Members" value={String(members.length)} />
            <HeroStat label="Shifts" value={String(shifts.length)} />
            <HeroStat
              label="Fairness"
              value={`${fairness.score}`}
              sub={fairness.verdict}
              good={fairness.score >= 75}
            />
            <HeroStat
              label="Holiday shifts"
              value={String(shifts.filter((s) => s.onHoliday).length)}
              warn={shifts.some((s) => s.onHoliday)}
            />
            <div className="col-span-2 rounded-lg border border-app bg-app-elevated px-3 py-2.5">
              <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                Coverage window
              </div>
              <div className="mt-1 text-xs text-secondary">
                {firstShift && lastShift ? (
                  <>
                    {fmtDayShort(firstShift.start)}{" "}
                    <span className="text-tool-accent">→</span>{" "}
                    {fmtDayShort(lastShift.end)}
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============== MAIN: ROSTER SIDEBAR + CALENDAR ============== */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ---- TEAM ROSTER SIDEBAR ---- */}
        <aside className="space-y-4">
          <ToolCard title="Team roster" subtitle="Who's in the rotation">
            <div className="flex gap-2">
              <input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                placeholder="Add a name"
                className={inputCls()}
              />
              <button
                onClick={addMember}
                className="shrink-0 rounded-md border border-tool-accent/40 bg-tool-accent-soft px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent hover:bg-tool-accent/20"
              >
                + Add
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {members.map((m, i) => {
                const av = avatarFor(m.name);
                const shiftCount = coverage.find(([n]) => n === m.name)?.[1] || 0;
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-app bg-app-elevated p-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                        style={{ background: av.bg, color: av.ink }}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          value={m.name}
                          onChange={(e) =>
                            updateMember(i, { name: e.target.value })
                          }
                          className={`${inputCls()} h-8 px-2 py-1 text-sm`}
                          placeholder="Name"
                        />
                      </div>
                      <button
                        onClick={() => removeMember(i)}
                        className="rounded-md border border-app px-2 py-1 text-xs text-muted hover:border-rose-400/40 hover:text-rose-300"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      <div className="flex items-center gap-2">
                        <span>TZ</span>
                        <input
                          value={m.tz}
                          onChange={(e) =>
                            updateMember(i, { tz: e.target.value })
                          }
                          className={`${inputCls()} h-6 w-20 px-1.5 py-0 text-[0.65rem] normal-case`}
                          placeholder="PT"
                        />
                      </div>
                      <span className="text-tool-accent">
                        {shiftCount} shift{shiftCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        type="date"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const newPto = Array.from(
                            new Set([...m.pto, e.target.value])
                          );
                          updateMember(i, { pto: newPto });
                          e.target.value = "";
                        }}
                        className={`${inputCls()} h-7 w-auto px-1.5 py-0 text-xs`}
                      />
                      <div className="flex flex-wrap gap-1">
                        {m.pto.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/[0.08] px-2 py-0.5 text-[0.65rem] text-amber-200"
                          >
                            {d}
                            <button
                              onClick={() =>
                                updateMember(i, {
                                  pto: m.pto.filter((x) => x !== d),
                                })
                              }
                              className="text-amber-300/70 hover:text-rose-300"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
              {members.length === 0 && (
                <li className="rounded-lg border border-dashed border-app bg-app-elevated px-3 py-6 text-center text-xs text-muted">
                  No members yet.
                </li>
              )}
            </ul>
          </ToolCard>

          <ToolCard title="Rotation setup" subtitle="Cadence & start">
            <div className="space-y-3">
              <Field label="Rotation">
                <select
                  value={state.rotation}
                  onChange={(e) =>
                    setState({
                      ...state,
                      rotation: e.target.value as Rotation,
                    })
                  }
                  className={inputCls()}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  value={state.startDate}
                  onChange={(e) =>
                    setState({ ...state, startDate: e.target.value })
                  }
                  className={inputCls()}
                />
              </Field>
              <Field label="Handoff time (24h)">
                <input
                  type="time"
                  value={state.handoffTime}
                  onChange={(e) =>
                    setState({ ...state, handoffTime: e.target.value })
                  }
                  className={inputCls()}
                />
              </Field>
              <Field label="Number of weeks">
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={state.weeks}
                  onChange={(e) =>
                    setState({
                      ...state,
                      weeks: Number(e.target.value) || 1,
                    })
                  }
                  className={inputCls()}
                />
              </Field>
            </div>
          </ToolCard>

          <ToolCard title="Holidays" subtitle="On-call premium dates">
            <div className="flex gap-2">
              <input
                type="date"
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                className={inputCls()}
              />
              <button
                onClick={addHoliday}
                className="shrink-0 rounded-md border border-tool-accent/40 bg-tool-accent-soft px-3 py-2 text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent hover:bg-tool-accent/20"
              >
                + Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(state.holidays || []).map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/[0.08] px-2 py-0.5 text-xs text-rose-200"
                >
                  {d}
                  <button
                    onClick={() => removeHoliday(d)}
                    className="text-rose-300/70 hover:text-rose-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              {(state.holidays || []).length === 0 && (
                <span className="text-xs text-muted">No holidays flagged.</span>
              )}
            </div>
            {holidayLoad.length > 0 && (
              <div className="mt-4">
                <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Holiday-shift load
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {holidayLoad.map(([who, n]) => (
                    <span
                      key={who}
                      className="rounded-full border border-amber-400/25 bg-amber-500/[0.06] px-2 py-0.5 text-xs text-amber-200"
                    >
                      {who}: {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </ToolCard>
        </aside>

        {/* ---- CALENDAR + SCHEDULE ---- */}
        <div className="space-y-6">
          <ToolCard title="Calendar" subtitle="Rotation map">
            {/* sub-tabs: week / month / list */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-app bg-app-elevated p-0.5 text-[0.6rem] uppercase tracking-[0.18em]">
                {(["week", "month", "list"] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-[5px] px-3 py-1.5 transition-colors ${
                      view === v
                        ? "bg-tool-accent text-app-elevated shadow-sm"
                        : "text-muted hover:text-secondary"
                    }`}
                    style={
                      view === v
                        ? { color: "#0a0d05", background: "var(--tool-accent)" }
                        : undefined
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-6 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--tool-accent) 0%, var(--tool-accent-soft) 100%)",
                    }}
                  />
                  Primary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-6 rounded-full"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, var(--tool-accent-soft) 0 6px, transparent 6px 10px)",
                    }}
                  />
                  Secondary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                  Holiday
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-300/70" />
                  Swapped
                </span>
                <span className="text-faint">
                  · {weekRows} week{weekRows === 1 ? "" : "s"} ·{" "}
                  {calendar.days.length} day
                  {calendar.days.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {calendar.days.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app-elevated px-3 py-10 text-center text-sm text-muted">
                Add members to generate a schedule.
              </div>
            ) : view === "list" ? (
              <CalendarListView
                days={calendar.days}
                shifts={shifts}
              />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  {/* dow header */}
                  <div className="grid grid-cols-7 gap-1 pb-1.5">
                    {dowLabels.map((d) => (
                      <div
                        key={d}
                        className="text-center text-[0.55rem] uppercase tracking-[0.22em] text-muted"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* weeks */}
                  <div className="space-y-1">
                    {Array.from({ length: visibleWeekRows }).map((_, wIdx) => {
                      const rowCells = Array.from({ length: 7 }).map(
                        (_, dIdx) => {
                          const cellIdx = wIdx * 7 + dIdx;
                          const dayIdx = cellIdx - calendar.firstDow;
                          if (dayIdx < 0 || dayIdx >= calendar.days.length)
                            return null;
                          return calendar.days[dayIdx];
                        }
                      );

                      // is the primary the same all week? -> single primary band
                      const primaries = rowCells
                        .filter((c) => c)
                        .map((c) => c!.primary);
                      const uniformPrimary =
                        primaries.length > 0 &&
                        primaries.every((p) => p === primaries[0]);

                      return (
                        <div key={wIdx} className="space-y-1">
                          {/* primary band stripe */}
                          {uniformPrimary && primaries[0] && (
                            <div className="flex items-center gap-2">
                              <div
                                className="h-1.5 flex-1 rounded-full"
                                style={{
                                  background: `linear-gradient(90deg, ${
                                    avatarFor(primaries[0]).bg
                                  } 0%, ${
                                    avatarFor(primaries[0]).bg
                                  }55 100%)`,
                                }}
                              />
                              <span
                                className="text-[0.55rem] uppercase tracking-[0.22em]"
                                style={{ color: avatarFor(primaries[0]).bg }}
                              >
                                {primaries[0]} · primary
                              </span>
                            </div>
                          )}

                          {/* secondary band */}
                          {uniformPrimary && primaries[0] && (
                            <div
                              className="h-0.5 rounded-full opacity-60"
                              style={{
                                background:
                                  "repeating-linear-gradient(90deg, var(--tool-accent-soft) 0 8px, transparent 8px 14px)",
                              }}
                            />
                          )}

                          {/* the 7-day row */}
                          <div className="grid grid-cols-7 gap-1">
                            {rowCells.map((cell, dIdx) => {
                              if (!cell)
                                return (
                                  <div
                                    key={dIdx}
                                    className="h-[88px] rounded-md border border-app bg-app-elevated opacity-40"
                                  />
                                );
                              const av = avatarFor(cell.primary);
                              const sav = avatarFor(cell.secondary);
                              const shift = shifts[cell.shiftIdx];
                              const isSwapped = !!shift?.swapped;
                              return (
                                <div
                                  key={dIdx}
                                  className={`relative h-[88px] overflow-hidden rounded-md border p-1.5 transition-colors hover:border-tool-accent/40 ${
                                    cell.onHoliday
                                      ? "border-rose-400/30 bg-rose-500/[0.06]"
                                      : "border-app bg-app-elevated"
                                  }`}
                                >
                                  {/* date */}
                                  <div className="flex items-start justify-between">
                                    <span className="text-[0.6rem] tabular-nums text-secondary">
                                      {cell.date.getDate()}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      {cell.onHoliday && (
                                        <span
                                          title="Holiday"
                                          className="h-1.5 w-1.5 rounded-full bg-rose-400/80"
                                        />
                                      )}
                                      {isSwapped && (
                                        <span
                                          title="Swapped"
                                          className="h-1.5 w-1.5 rounded-full bg-amber-300/80"
                                        />
                                      )}
                                    </div>
                                  </div>

                                  {/* primary avatar */}
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <div
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold"
                                      style={{
                                        background: av.bg,
                                        color: av.ink,
                                      }}
                                    >
                                      {initials(cell.primary)}
                                    </div>
                                    <div className="min-w-0 truncate text-[0.7rem] font-medium text-app">
                                      {cell.primary}
                                    </div>
                                  </div>

                                  {/* secondary thin chip */}
                                  <div className="mt-1.5 flex items-center gap-1 text-[0.55rem] text-muted">
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm text-center text-[0.5rem] font-bold leading-3"
                                      style={{
                                        background: sav.bg,
                                        color: sav.ink,
                                      }}
                                    >
                                      {initials(cell.secondary).slice(0, 1)}
                                    </span>
                                    <span className="truncate">
                                      2nd · {cell.secondary}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </ToolCard>

          <ToolCard title="Shift list" subtitle="Inline swap & handoff times">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="py-2 pr-3 text-left">#</th>
                    <th className="py-2 pr-3 text-left">Primary</th>
                    <th className="py-2 pr-3 text-left">Swap</th>
                    <th className="py-2 pr-3 text-left">Start</th>
                    <th className="py-2 pr-3 text-left">End</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s, i) => {
                    const av = avatarFor(s.who);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-app transition-colors hover:bg-tool-accent-soft ${
                          s.onHoliday ? "bg-rose-500/[0.04]" : ""
                        }`}
                      >
                        <td className="py-2 pr-3 text-xs tabular-nums text-muted">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[0.6rem] font-bold"
                              style={{ background: av.bg, color: av.ink }}
                            >
                              {initials(s.who)}
                            </div>
                            <span className="text-app">{s.who}</span>
                            {s.onHoliday && (
                              <span className="rounded border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-rose-200">
                                Hol
                              </span>
                            )}
                            {s.swapped && (
                              <span className="rounded border border-amber-400/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-amber-200">
                                Swap
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <select
                            value={
                              (state.swaps || []).find(
                                (sw) => sw.shiftIdx === i
                              )?.newMember || ""
                            }
                            onChange={(e) => applySwap(i, e.target.value)}
                            className={`${inputCls()} h-8 w-28 px-2 py-1 text-xs`}
                          >
                            <option value="">—</option>
                            {members.map((m) => (
                              <option key={m.name} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-xs tabular-nums text-secondary">
                          {fmtDayShort(s.start)} {fmtTimeShort(s.start)}
                        </td>
                        <td className="py-2 pr-3 text-xs tabular-nums text-secondary">
                          {fmtDayShort(s.end)} {fmtTimeShort(s.end)}
                        </td>
                      </tr>
                    );
                  })}
                  {shifts.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted"
                      >
                        Add members to generate a schedule.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {coverage.length > 0 && (
              <div className="mt-4 rounded-lg border border-app bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Shift count · fairness stdev {fairness.stdev.toFixed(2)}
                </div>
                <div className="mt-2 space-y-1.5">
                  {coverage.map(([who, n]) => {
                    const max = coverage[0][1] || 1;
                    const pct = (n / max) * 100;
                    const av = avatarFor(who);
                    return (
                      <div key={who} className="flex items-center gap-2">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[0.55rem] font-bold"
                          style={{ background: av.bg, color: av.ink }}
                        >
                          {initials(who)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-[0.7rem]">
                            <span className="truncate text-secondary">
                              {who}
                            </span>
                            <span className="tabular-nums text-muted">
                              {n} shift{n === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-app">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: av.bg,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ToolCard>
        </div>
      </div>
    </>
  );
}

/* ---------- small subcomponents ---------- */

function HeroStat({
  label,
  value,
  sub,
  good,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-3 py-2.5">
      <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
      <div
        className={`font-tool-heading mt-1 text-xl tabular-nums ${
          good
            ? "text-tool-accent"
            : warn
            ? "text-amber-300"
            : "text-app"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {sub}
        </div>
      )}
    </div>
  );
}

function CalendarListView({
  days,
  shifts,
}: {
  days: {
    date: Date;
    primary: string;
    secondary: string;
    onHoliday: boolean;
    shiftIdx: number;
  }[];
  shifts: Shift[];
}) {
  // group consecutive same-primary days into rows for a compact agenda
  const groups: {
    primary: string;
    secondary: string;
    start: Date;
    end: Date;
    days: number;
    holidays: number;
    swapped: boolean;
  }[] = [];
  let cur: (typeof groups)[number] | null = null;
  days.forEach((d) => {
    const sw = shifts[d.shiftIdx]?.swapped || false;
    if (!cur || cur.primary !== d.primary) {
      cur && groups.push(cur);
      cur = {
        primary: d.primary,
        secondary: d.secondary,
        start: d.date,
        end: d.date,
        days: 1,
        holidays: d.onHoliday ? 1 : 0,
        swapped: sw,
      };
    } else {
      cur.end = d.date;
      cur.days += 1;
      if (d.onHoliday) cur.holidays += 1;
      if (sw) cur.swapped = true;
    }
  });
  if (cur) groups.push(cur);

  return (
    <ul className="space-y-1.5">
      {groups.map((g, i) => {
        const av = avatarFor(g.primary);
        const sav = avatarFor(g.secondary);
        return (
          <li
            key={i}
            className="flex items-center gap-3 rounded-md border border-app bg-app-elevated p-2.5"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
              style={{ background: av.bg, color: av.ink }}
            >
              {initials(g.primary)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-app">
                <span className="font-medium">{g.primary}</span>
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  {g.days} day{g.days === 1 ? "" : "s"}
                </span>
                {g.holidays > 0 && (
                  <span className="rounded border border-rose-400/30 bg-rose-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-rose-200">
                    {g.holidays} hol
                  </span>
                )}
                {g.swapped && (
                  <span className="rounded border border-amber-400/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.15em] text-amber-200">
                    Swap
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-muted">
                {fmtWeekday(g.start)} {fmtDayShort(g.start)}{" "}
                <span className="text-tool-accent">→</span>{" "}
                {fmtWeekday(g.end)} {fmtDayShort(g.end)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: sav.bg }}
                title={`Secondary: ${g.secondary}`}
              />
              <span className="text-[0.6rem] text-muted">2nd · {g.secondary}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
