"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Meeting Cost Calculator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no
   ToolShell/AuthGate/PageHeader/WorkspaceSwitcher, no Suspense, no macOS
   chrome, no ToolRecommendations or back-links. Width-driven layout below
   780px collapses the roster + bill split into a single column. All
   live-tick math, hooks and state are preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

interface Attendee {
  id: string;
  role: string;
  rate: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Typical US 2024 fully-loaded hourly rates (salary + benefits + overhead).
// Numbers drawn from Radford Tech Compensation Survey 2024 and BLS OES 2024
// fully-loaded at 1.35x base. Rough midpoints — calibrate to your company.
const ROLE_RATE_PRESETS: { role: string; rate: number; note: string }[] = [
  { role: "Junior Engineer", rate: 80, note: "Entry-level SWE" },
  { role: "Engineer", rate: 120, note: "Mid-level SWE / IC3" },
  { role: "Senior Engineer", rate: 160, note: "Senior / IC4" },
  { role: "Staff Engineer", rate: 220, note: "Staff+ / IC5" },
  { role: "Engineering Manager", rate: 180, note: "Line manager" },
  { role: "Product Manager", rate: 140, note: "Mid-level PM" },
  { role: "Senior PM", rate: 180, note: "Senior PM / Group PM" },
  { role: "Designer", rate: 110, note: "Product designer" },
  { role: "Senior Designer", rate: 150, note: "Senior / staff designer" },
  { role: "Data Analyst", rate: 95, note: "Mid-level" },
  { role: "Data Scientist", rate: 140, note: "Mid / senior DS" },
  { role: "Sales AE", rate: 130, note: "Fully-loaded incl. OTE" },
  { role: "Customer Success", rate: 90, note: "CSM" },
  { role: "Marketing Manager", rate: 110, note: "Mid-level marketer" },
  { role: "Director", rate: 220, note: "Director-level leader" },
  { role: "VP", rate: 280, note: "VP" },
  { role: "Executive (C-level)", rate: 300, note: "CxO fully-loaded" },
];

// Sub-tab style "state buttons" for switching breakdown views.
type BreakdownTab = "ledger" | "share" | "recurrence";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function MeetingCostCalculatorApp(props: NativeAppProps) {
  const { width } = props;

  // Width-driven: below 780px collapse roster+bill grid; below 540px stack
  // the recurrence tiles into 2 cols and tighten the controls.
  const isWide = width >= 780;
  const isUltra = width < 540;

  const [attendees, setAttendees] = useState<Attendee[]>([
    { id: uid(), role: "Senior Manager", rate: "120" },
    { id: uid(), role: "Engineer", rate: "85" },
    { id: uid(), role: "Engineer", rate: "85" },
    { id: uid(), role: "Designer", rate: "75" },
  ]);
  const [durationMin, setDurationMin] = useState("60");
  const [frequencyPerYear, setFrequencyPerYear] = useState("52");
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>("ledger");

  // Live clock state — UI only, independent from cost math
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startRef.current != null) {
        setElapsedMs(Date.now() - startRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const { totalRate, cost, annualCost } = useMemo(() => {
    const total = attendees.reduce((sum, a) => sum + (parseFloat(a.rate) || 0), 0);
    const hours = (parseFloat(durationMin) || 0) / 60;
    const single = total * hours;
    const annual = single * (parseFloat(frequencyPerYear) || 0);
    return { totalRate: total, cost: single, annualCost: annual };
  }, [attendees, durationMin, frequencyPerYear]);

  const liveCost = useMemo(() => {
    return totalRate * (elapsedMs / 3_600_000);
  }, [totalRate, elapsedMs]);

  const ratePerMinute = totalRate / 60;
  const AMBER_THRESHOLD = 250;
  const ROSE_THRESHOLD = 1000;
  const heatLevel: "calm" | "amber" | "rose" =
    liveCost >= ROSE_THRESHOLD ? "rose" : liveCost >= AMBER_THRESHOLD ? "amber" : "calm";

  const addAttendee = () =>
    setAttendees((prev) => [...prev, { id: uid(), role: "", rate: "" }]);
  const addFromPreset = (role: string, rate: number) =>
    setAttendees((prev) => [...prev, { id: uid(), role, rate: String(rate) }]);
  const removeAttendee = (id: string) =>
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  const update = (id: string, patch: Partial<Attendee>) =>
    setAttendees((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const fmtPrecise = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtClock = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const handleStart = () => {
    if (running) return;
    startRef.current = Date.now() - elapsedMs;
    setRunning(true);
  };
  const handlePause = () => {
    setRunning(false);
  };
  const handleReset = () => {
    setRunning(false);
    startRef.current = null;
    setElapsedMs(0);
  };

  // Tone-driven heat band — calm uses tool accent, then escalates amber → rose.
  const heatNumberClass =
    heatLevel === "rose"
      ? "text-rose-500"
      : heatLevel === "amber"
        ? "text-amber-500"
        : "text-tool-accent";

  const heatChipClass =
    heatLevel === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
      : heatLevel === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : "border-tool-accent/30 bg-tool-accent-soft text-tool-accent";

  const heatLabelTone =
    heatLevel === "rose"
      ? "This meeting could have been a Slack."
      : heatLevel === "amber"
        ? "This meeting could have been an email."
        : "Every minute counts.";

  const heatBorderClass =
    heatLevel === "rose"
      ? "border-rose-500/30"
      : heatLevel === "amber"
        ? "border-amber-500/30"
        : "border-tool-accent/25";

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  // Savings recommendation — surface-level guidance based on attendee count + duration.
  const numAttendees = attendees.length;
  const durationVal = parseFloat(durationMin) || 0;
  const savingsRec = useMemo(() => {
    if (numAttendees >= 6 && durationVal >= 45) {
      return {
        label: "Cut to async memo",
        detail: `Drop ${numAttendees - 2} attendees + send a Loom — saves ${fmt(cost * 0.7)}/run.`,
        tone: "rose" as const,
      };
    }
    if (durationVal >= 60) {
      return {
        label: "Halve the duration",
        detail: `Trim to 30m with a tight agenda — saves ${fmt(cost * 0.5)}/run.`,
        tone: "amber" as const,
      };
    }
    if (numAttendees >= 5) {
      return {
        label: "Decision-makers only",
        detail: `Send notes to ${numAttendees - 3} optional attendees — saves ${fmt(cost * 0.4)}/run.`,
        tone: "amber" as const,
      };
    }
    return {
      label: "Lean meeting",
      detail: "Right-sized for the cost. Keep the agenda tight and you're good.",
      tone: "calm" as const,
    };
  }, [numAttendees, durationVal, cost]);

  const recChipClass =
    savingsRec.tone === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
      : savingsRec.tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : "border-tool-accent/30 bg-tool-accent-soft text-tool-accent";

  return (
    <div
      data-tool-theme="finance"
      data-tool="meeting-cost-calculator"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <div className="space-y-6 p-5">
        {/* In-tool header — finance ledger chrome */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-tool-accent/25 bg-tool-surface px-6 py-5 shadow-sm">
          <span className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l border-t border-tool-accent/40" />
          <span className="pointer-events-none absolute right-0 bottom-0 h-6 w-6 border-r border-b border-tool-accent/30" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Productivity · Live ledger
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Meeting Cost Calculator
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Bank-statement precision on the bill while the meeting runs.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              {numAttendees} {numAttendees === 1 ? "attendee" : "attendees"} · {fmt(totalRate)}/hr
            </div>
          </div>
        </header>

        {/* Live ticker hero — money on fire */}
        <section
          className={`relative overflow-hidden rounded-2xl border bg-tool-surface px-6 py-8 shadow-sm ${heatBorderClass}`}
        >
          {/* Faint ledger ruling */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />

          <div className="relative flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    running ? "animate-pulse bg-rose-500" : "bg-muted/60"
                  }`}
                />
                {running ? "Recording" : elapsedMs > 0 ? "Paused" : "Ready"}
              </div>
              <div className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                As of {asOfStamp} · USD
              </div>
            </div>

            <div className="text-center">
              <div className="mb-2 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                Money on fire
              </div>
              <div
                className={`font-mono font-bold leading-none tracking-tight tabular-nums transition-colors duration-500 ${heatNumberClass}`}
                style={{ fontSize: isUltra ? "clamp(2.75rem, 14vw, 5rem)" : "clamp(3.5rem, 13vw, 8rem)" }}
              >
                {elapsedMs === 0 && !running ? fmt(0) : fmtPrecise(liveCost)}
              </div>
              <div className="mt-3 text-sm text-secondary">{heatLabelTone}</div>
            </div>

            {/* Live stat strip */}
            <div className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
              <div className="bg-app-elevated p-3 text-center">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Elapsed</div>
                <div className="mt-1 tabular-nums text-app">{fmtClock(elapsedMs)}</div>
              </div>
              <div className="bg-app-elevated p-3 text-center">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Rate / min</div>
                <div className="mt-1 tabular-nums text-app">{fmtPrecise(ratePerMinute)}</div>
              </div>
              <div className="bg-app-elevated p-3 text-center">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Scheduled</div>
                <div className="mt-1 tabular-nums text-app">{fmt(cost)}</div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!running ? (
                <button
                  type="button"
                  onClick={handleStart}
                  className="inline-flex items-center gap-2 rounded-md border border-tool-accent/50 bg-tool-accent px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {elapsedMs > 0 ? "Resume" : "Start meeting"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center gap-2 rounded-md border border-tool-accent/50 bg-tool-accent-soft px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-tool-accent transition-all hover:bg-tool-accent/20 active:scale-[0.98]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                disabled={elapsedMs === 0 && !running}
                className="inline-flex items-center gap-2 rounded-md border border-app bg-app-elevated px-4 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-secondary transition-all hover:border-tool-accent/30 hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                Reset
              </button>
            </div>

            {/* Heat status chip + savings recommendation chip */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] ${heatChipClass}`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                Burn:{" "}
                {heatLevel === "rose"
                  ? "Critical"
                  : heatLevel === "amber"
                    ? "Elevated"
                    : "Calm"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] ${recChipClass}`}
                title={savingsRec.detail}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v6" /><path d="M5 9l7 7 7-7" />
                </svg>
                {savingsRec.label}
              </span>
            </div>
          </div>
        </section>

        {/* Roster + ledger summary */}
        <section
          className={isWide ? "grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]" : "grid grid-cols-1 gap-6"}
        >
          {/* Attendee ledger */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Attendee roster
              </h2>
              <div className="flex items-center gap-3 font-mono text-[0.65rem] tabular-nums">
                <span className="text-muted">Combined</span>
                <span className="text-tool-accent">{fmt(totalRate)}/hr</span>
              </div>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[1.75rem_1fr_6rem_5rem_2rem] gap-2 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-center">#</span>
              <span>Role / name</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Hourly</span>
              <span />
            </div>

            <ul className="mt-2 space-y-1.5">
              {attendees.map((a, i) => {
                const rateNum = parseFloat(a.rate) || 0;
                const share = totalRate > 0 ? (rateNum / totalRate) * 100 : 0;
                return (
                  <li
                    key={a.id}
                    className="grid grid-cols-[1.75rem_1fr_6rem_5rem_2rem] items-center gap-2"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-app bg-app-elevated font-mono text-[0.65rem] tabular-nums text-muted">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={a.role}
                      onChange={(e) => update(a.id, { role: e.target.value })}
                      placeholder="Role / name"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-app outline-none transition-colors placeholder:text-muted hover:border-app focus:border-tool-accent focus:bg-app-elevated"
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                        $
                      </span>
                      <input
                        type="number"
                        value={a.rate}
                        onChange={(e) => update(a.id, { rate: e.target.value })}
                        placeholder="85"
                        className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-5 pr-2 text-right font-mono text-sm tabular-nums text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app-elevated"
                        min="0"
                        step="5"
                      />
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums text-secondary">
                      {share.toFixed(0)}%
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttendee(a.id)}
                      className="rounded-md border border-transparent text-sm text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                      aria-label={`Remove ${a.role || "attendee"}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addAttendee}
                className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
              >
                + Add attendee
              </button>
              <select
                defaultValue=""
                onChange={(e) => {
                  const [role, rateStr] = e.target.value.split("|");
                  if (role) addFromPreset(role, Number(rateStr));
                  e.target.value = "";
                }}
                className="rounded-md border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-secondary transition-colors hover:border-tool-accent/30 hover:text-tool-accent"
              >
                <option value="">From preset…</option>
                {ROLE_RATE_PRESETS.map((p) => (
                  <option key={p.role} value={`${p.role}|${p.rate}`}>
                    {p.role} — ${p.rate}/hr
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-app pt-5">
              <label className="block">
                <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Scheduled duration (min)
                </span>
                <input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="mt-1 w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                  min="1"
                  step="15"
                />
              </label>
              <label className="block">
                <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Times per year
                </span>
                <input
                  type="number"
                  value={frequencyPerYear}
                  onChange={(e) => setFrequencyPerYear(e.target.value)}
                  className="mt-1 w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                  min="0"
                  step="1"
                />
              </label>
            </div>
          </div>

          {/* The bill — totals */}
          <aside className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                The bill
              </h2>
              <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Per scheduled run
              </span>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-tool-accent/25 bg-tool-accent-soft p-4">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent/80">
                  This meeting
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                  {fmt(cost)}
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Combined / hr
                  </div>
                  <div className="mt-1 tabular-nums text-app">{fmt(totalRate)}</div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Per minute
                  </div>
                  <div className="mt-1 tabular-nums text-app">{fmtPrecise(ratePerMinute)}</div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Annual (recurring)
                  </div>
                  <div className="mt-1 tabular-nums text-app">{fmt(annualCost)}</div>
                </div>
                <div className="bg-app-elevated p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Headcount-hrs / yr
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {(
                      ((parseFloat(durationMin) || 0) / 60) *
                      (parseFloat(frequencyPerYear) || 0) *
                      numAttendees
                    ).toFixed(0)}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`mt-4 rounded-md border px-3 py-2 font-mono text-[0.7rem] ${recChipClass}`}
            >
              <div className="mb-0.5 text-[0.55rem] uppercase tracking-[0.2em] opacity-80">
                Recommendation
              </div>
              <div>{savingsRec.detail}</div>
            </div>
          </aside>
        </section>

        {/* Tabbed breakdown — ledger / share / recurrence */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Breakdown
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-muted">
                Per-attendee burn, share of bill, and recurrence projections.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TabButton active={breakdownTab === "ledger"} onClick={() => setBreakdownTab("ledger")}>
                Ledger
              </TabButton>
              <TabButton active={breakdownTab === "share"} onClick={() => setBreakdownTab("share")}>
                Share bars
              </TabButton>
              <TabButton
                active={breakdownTab === "recurrence"}
                onClick={() => setBreakdownTab("recurrence")}
              >
                Recurrence
              </TabButton>
            </div>
          </header>

          {breakdownTab === "ledger" && (
            <div className="overflow-x-auto rounded-md border border-app">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="bg-app-elevated text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-right">Rate / hr</th>
                    <th className="px-3 py-2 text-right">This meeting</th>
                    <th className="px-3 py-2 text-right">Annual</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {attendees.map((a, i) => {
                    const rateNum = parseFloat(a.rate) || 0;
                    const hours = (parseFloat(durationMin) || 0) / 60;
                    const single = rateNum * hours;
                    const annual = single * (parseFloat(frequencyPerYear) || 0);
                    return (
                      <tr key={a.id} className="border-t border-app text-app">
                        <td className="px-3 py-1.5 text-secondary">
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td className="px-3 py-1.5">{a.role || "—"}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(rateNum)}</td>
                        <td className="px-3 py-1.5 text-right text-tool-accent">{fmt(single)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(annual)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-app bg-app-elevated font-semibold">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-secondary uppercase tracking-[0.18em] text-[0.55rem]">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(totalRate)}</td>
                    <td className="px-3 py-2 text-right text-tool-accent">{fmt(cost)}</td>
                    <td className="px-3 py-2 text-right">{fmt(annualCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {breakdownTab === "share" && (
            <div className="space-y-1 font-mono text-[0.7rem]">
              <div className="mb-2 flex items-center justify-end gap-3 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 bg-tool-accent/70" /> Share of cost
                </span>
              </div>
              {attendees.map((a, i) => {
                const rateNum = parseFloat(a.rate) || 0;
                const share = totalRate > 0 ? (rateNum / totalRate) * 100 : 0;
                const single = rateNum * ((parseFloat(durationMin) || 0) / 60);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-sm px-1 py-0.5 text-secondary"
                  >
                    <span className="w-6 tabular-nums text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`${isUltra ? "w-24" : "w-40"} truncate text-app`}>{a.role || "—"}</span>
                    <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-app-elevated">
                      <div
                        className="absolute left-0 top-0 h-full rounded-sm bg-tool-accent/70"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="w-12 text-right tabular-nums text-secondary">
                      {share.toFixed(0)}%
                    </span>
                    <span className="w-20 text-right tabular-nums text-tool-accent">
                      {fmt(single)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {breakdownTab === "recurrence" && (
            <div
              className={`grid gap-px overflow-hidden rounded-md border border-app bg-app font-mono text-sm ${
                isUltra ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"
              }`}
            >
              {[
                { label: "Weekly · 52/yr", value: cost * 52, accent: false },
                { label: "Bi-weekly · 26/yr", value: cost * 26, accent: false },
                { label: "Monthly · 12/yr", value: cost * 12, accent: false },
                { label: "Your cadence", value: annualCost, accent: true },
              ].map((c) => (
                <div
                  key={c.label}
                  className={`p-3 ${c.accent ? "bg-tool-accent-soft" : "bg-app-elevated"}`}
                >
                  <div
                    className={`text-[0.55rem] uppercase tracking-[0.2em] ${
                      c.accent ? "text-tool-accent/80" : "text-muted"
                    }`}
                  >
                    {c.label}
                  </div>
                  <div
                    className={`mt-1 tabular-nums ${
                      c.accent ? "font-semibold text-tool-accent" : "text-app"
                    }`}
                  >
                    {fmt(c.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Methodology footer */}
        <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
              How it&apos;s calculated
            </h2>
            <span className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              US 2024 · fully-loaded
            </span>
          </div>
          <ul className="divide-y divide-app font-mono text-xs">
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Sum of hourly rates × hours</span>
              <span className="tabular-nums text-app">= single cost</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Single × times/year</span>
              <span className="tabular-nums text-app">= annual burn</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="text-secondary">Use fully-loaded rates</span>
              <span className="tabular-nums text-app">salary × 1.3-1.5</span>
            </li>
          </ul>
          <p className="mt-3 text-[0.6rem] leading-relaxed text-muted">
            Source: Radford Tech Compensation Survey 2024 + BLS OES 2024 benefits/overhead
            multipliers. A 60-min weekly status with 5 mid-level ICs at $120/hr fully-loaded runs
            ~{fmt(120 * 5 * 52)}/yr. Worth asking: is async enough?
          </p>
        </section>
      </div>
    </div>
  );
}
