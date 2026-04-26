"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { Field, inputCls } from "../../_components/ToolCard";
import {
  CADENCE_TEMPLATES,
  CHANNEL_EFFECTIVENESS,
  TOUCHES_TO_RESPONSE,
  type Channel,
  type CadenceTemplate,
} from "./presets";

interface Step {
  id: string;
  day: number;
  channel: Channel;
  note: string;
  template: string;
}

type Variant = CadenceTemplate["variant"];

interface Cadence {
  id: string;
  name: string;
  variant: Variant;
  sourceKey?: string;
  source?: string;
  steps: Step[];
}

interface State {
  cadences: Cadence[];
  activeId: string | null;
}

type ViewKey = "build" | "preview" | "calendar";

const LS_KEY = "solutions:sdr-cadence-builder:v2";
const LEGACY_LS_KEY = "solutions:sdr-cadence-builder:v1";
const VIEW_LS_KEY = "solutions:sdr-cadence-builder:view:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function fromPreset(key: string): Cadence | null {
  const preset = CADENCE_TEMPLATES.find((c) => c.key === key);
  if (!preset) return null;
  return {
    id: uid(),
    name: preset.name,
    variant: preset.variant,
    sourceKey: preset.key,
    source: preset.source,
    steps: preset.steps.map((s) => ({ ...s, id: uid() })),
  };
}

function defaultState(): State {
  const c = fromPreset("outreach_15");
  return { cadences: c ? [c] : [], activeId: c?.id || null };
}

const CHANNEL_META: Record<
  Channel,
  { label: string; short: string; glyph: string }
> = {
  email: { label: "Email", short: "EM", glyph: "@" },
  call: { label: "Call", short: "CL", glyph: "☏" },
  linkedin: { label: "LinkedIn", short: "LI", glyph: "in" },
  video: { label: "Video", short: "VD", glyph: "▶" },
};

export default function SdrCadenceBuilderPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="SDR Cadence Builder"
      description="Design multi-touch outbound sequences. 10 real cadence templates (Gong 22-touch, Outreach 15-touch, persona-specific). Channel-effectiveness benchmarks and expected touches-to-response from Gong.io 2024 + Outreach 2024."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("build");
  const [responseProfile, setResponseProfile] =
    useState<keyof typeof TOUCHES_TO_RESPONSE>("cold_enterprise");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LEGACY_LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === "build" || v === "preview" || v === "calendar") setView(v);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {}
  }, [state, view, hydrated]);

  const active = state.cadences.find((c) => c.id === state.activeId) || null;

  const newFromPreset = (key: string) => {
    const c = fromPreset(key);
    if (!c) return;
    setState((s) => ({ cadences: [c, ...s.cadences], activeId: c.id }));
  };

  const cloneActive = () => {
    if (!active) return;
    const c: Cadence = {
      ...active,
      id: uid(),
      name: `${active.name} (copy)`,
      steps: active.steps.map((s) => ({ ...s, id: uid() })),
    };
    setState((s) => ({ cadences: [c, ...s.cadences], activeId: c.id }));
  };

  const updateCadence = (id: string, patch: Partial<Cadence>) =>
    setState((s) => ({
      ...s,
      cadences: s.cadences.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const removeCadence = (id: string) => {
    if (!confirm("Delete this cadence?")) return;
    setState((s) => {
      const cadences = s.cadences.filter((c) => c.id !== id);
      return {
        cadences,
        activeId: cadences[0]?.id || null,
      };
    });
  };

  const addStep = () => {
    if (!active) return;
    const last = active.steps[active.steps.length - 1];
    const step: Step = {
      id: uid(),
      day: last ? last.day + 2 : 1,
      channel: "email",
      note: "",
      template: "",
    };
    updateCadence(active.id, { steps: [...active.steps, step] });
  };

  const updateStep = (stepId: string, patch: Partial<Step>) => {
    if (!active) return;
    updateCadence(active.id, {
      steps: active.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  };

  const removeStep = (stepId: string) => {
    if (!active) return;
    updateCadence(active.id, {
      steps: active.steps.filter((s) => s.id !== stepId),
    });
  };

  const sortedSteps = useMemo(() => {
    if (!active) return [];
    return [...active.steps].sort((a, b) => a.day - b.day);
  }, [active]);

  const totalDays = sortedSteps.length
    ? sortedSteps[sortedSteps.length - 1].day
    : 0;

  const byChannel = useMemo(() => {
    if (!active)
      return { email: 0, call: 0, linkedin: 0, video: 0 } as Record<
        Channel,
        number
      >;
    const acc: Record<Channel, number> = {
      email: 0,
      call: 0,
      linkedin: 0,
      video: 0,
    };
    active.steps.forEach((s) => acc[s.channel]++);
    return acc;
  }, [active]);

  const totalMinutes = useMemo(() => {
    if (!active) return 0;
    return active.steps.reduce(
      (acc, s) => acc + CHANNEL_EFFECTIVENESS[s.channel].timeCost,
      0
    );
  }, [active]);

  const expectedResponsePct = useMemo(() => {
    if (!active) return 0;
    let noResp = 1;
    active.steps.forEach((s) => {
      const p = CHANNEL_EFFECTIVENESS[s.channel].responseRate / 100;
      noResp *= 1 - p;
    });
    return (1 - noResp) * 100;
  }, [active]);

  const activePreset = active?.sourceKey
    ? CADENCE_TEMPLATES.find((p) => p.key === active.sourceKey)
    : null;

  const profile = TOUCHES_TO_RESPONSE[responseProfile];

  const totalTouches = active?.steps.length || 0;

  const dayBuckets = useMemo(() => {
    const map = new Map<number, Step[]>();
    sortedSteps.forEach((s) => {
      const arr = map.get(s.day) || [];
      arr.push(s);
      map.set(s.day, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [sortedSteps]);

  // Calendar grid: weeks x days (1..totalDays)
  const calendarWeeks = useMemo(() => {
    if (!totalDays) return [] as number[][];
    const weeks: number[][] = [];
    let week: number[] = [];
    for (let d = 1; d <= totalDays; d++) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) weeks.push(week);
    return weeks;
  }, [totalDays]);

  const stepsByDay = useMemo(() => {
    const m = new Map<number, Step[]>();
    sortedSteps.forEach((s) => {
      const arr = m.get(s.day) || [];
      arr.push(s);
      m.set(s.day, arr);
    });
    return m;
  }, [sortedSteps]);

  return (
    <div data-tool-theme="sales" data-tool="sdr-cadence-builder" className="space-y-6">
      {/* HERO */}
      <section className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-app bg-tool-accent-soft px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              Outbound · Cadence designer
            </div>
            <h2 className="font-tool-heading text-2xl font-semibold tracking-tight text-app sm:text-3xl">
              {active?.name || "Pick a cadence"}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-secondary">
              Sequence calls, emails, LinkedIn and SMS into a multi-day rhythm. Channel benchmarks from Gong.io 2024 and Outreach 2024.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
            <SummaryChip label="Touches" value={String(totalTouches)} primary />
            <SummaryChip label="Days" value={`${totalDays}d`} />
            <SummaryChip label="≥1 reply" value={`${expectedResponsePct.toFixed(0)}%`} />
          </div>
        </div>

        {/* Big number band */}
        <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-app pt-5 sm:grid-cols-5">
          <BigNum label="Touches" value={String(totalTouches)} accent />
          <BigNum label="Span" value={`${totalDays} days`} />
          <BigNum label="Time cost" value={`${Math.round(totalMinutes)}m`} />
          <BigNum label="Est. reply" value={`${expectedResponsePct.toFixed(0)}%`} />
          <BigNum
            label="Mix E/C/LI/V"
            value={`${byChannel.email}/${byChannel.call}/${byChannel.linkedin}/${byChannel.video}`}
          />
        </div>

        {/* Channel mix bar */}
        {totalTouches > 0 && (
          <div className="relative mt-5">
            <div className="mb-2 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span>Channel mix</span>
              <span>{totalTouches} total</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full border border-app bg-app">
              {(["email", "call", "linkedin", "video"] as Channel[]).map((ch) => {
                const pct = totalTouches ? (byChannel[ch] / totalTouches) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={ch}
                    className="h-full bg-tool-accent"
                    style={{
                      width: `${pct}%`,
                      opacity:
                        ch === "email" ? 1 : ch === "call" ? 0.78 : ch === "linkedin" ? 0.55 : 0.35,
                    }}
                    title={`${CHANNEL_META[ch].label}: ${byChannel[ch]}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-muted">
              {(["email", "call", "linkedin", "video"] as Channel[]).map((ch) => (
                <span key={ch} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-sm bg-tool-accent"
                    style={{
                      opacity:
                        ch === "email" ? 1 : ch === "call" ? 0.78 : ch === "linkedin" ? 0.55 : 0.35,
                    }}
                  />
                  {CHANNEL_META[ch].label} · {byChannel[ch]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* View tabs (segmented pills) */}
        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app">
            {(
              [
                { k: "build", label: "Build" },
                { k: "preview", label: "Preview" },
                { k: "calendar", label: "Calendar" },
              ] as { k: ViewKey; label: string }[]
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
          {active && (
            <button
              onClick={cloneActive}
              className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
            >
              Clone current
            </button>
          )}
        </div>
      </section>

      {/* PRESETS TOOLBAR */}
      <section className="rounded-xl border border-app bg-app-elevated px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
            10 real cadence templates · sources cited
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {CADENCE_TEMPLATES.map((p) => {
            const isActive = active?.sourceKey === p.key;
            return (
              <button
                key={p.key}
                onClick={() => newFromPreset(p.key)}
                title={`${p.description} — Source: ${p.source}`}
                className={`group rounded-lg border px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app text-secondary hover:border-tool-accent hover:text-tool-accent"
                }`}
              >
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.15em]">
                  {p.name}
                </div>
                <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  {p.steps.length}× · {p.persona}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* LEFT RAIL */}
        <aside className="space-y-5">
          {/* Saved cadences */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app px-3 py-2">
              <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-secondary">
                Cadences
              </div>
              <div className="text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent">
                {state.cadences.length} saved
              </div>
            </div>
            <ul className="space-y-1.5 p-2">
              {state.cadences.length === 0 && (
                <li className="rounded-lg border border-dashed border-app px-3 py-4 text-center text-[0.7rem] text-faint">
                  No cadences yet
                </li>
              )}
              {state.cadences.map((c) => {
                const isActive = state.activeId === c.id;
                return (
                  <li key={c.id} className="flex items-center gap-1.5">
                    <button
                      onClick={() => setState((s) => ({ ...s, activeId: c.id }))}
                      className={`flex-1 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        isActive
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app text-secondary hover:border-tool-accent"
                      }`}
                    >
                      <div className="truncate text-xs font-semibold">{c.name}</div>
                      <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                        {c.steps.length} touches · {c.variant.replace("_", " ")}
                      </div>
                    </button>
                    <button
                      onClick={() => removeCadence(c.id)}
                      className="rounded-md border border-app px-1.5 py-1 text-[0.7rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Channel benchmarks */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="border-b border-app px-3 py-2">
              <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-secondary">
                Channel benchmarks
              </div>
              <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                Gong.io 2024 · Outreach 2024
              </div>
            </div>
            <ul className="space-y-2 p-3">
              {(["email", "call", "linkedin", "video"] as Channel[]).map((ch) => {
                const d = CHANNEL_EFFECTIVENESS[ch];
                const meta = CHANNEL_META[ch];
                return (
                  <li
                    key={ch}
                    className="rounded-lg border border-app bg-app p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-tool-accent-soft px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-tool-accent">
                        <span className="font-mono text-tool-accent">{meta.glyph}</span>
                        {meta.label}
                      </span>
                      <span className="font-mono text-[0.65rem] font-semibold text-app">
                        {d.responseRate}% reply
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1 text-[0.6rem] text-muted">
                      {d.connectRate > 0 && <span>connect {d.connectRate}%</span>}
                      <span>{d.timeCost}m / touch</span>
                    </div>
                    <div className="mt-1 text-[0.6rem] leading-snug text-secondary">
                      {d.bestUseCase}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Touches → response */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="border-b border-app px-3 py-2">
              <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-secondary">
                Touches → response
              </div>
              <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                How many to hit reply?
              </div>
            </div>
            <div className="p-3">
              <select
                value={responseProfile}
                onChange={(e) =>
                  setResponseProfile(
                    e.target.value as keyof typeof TOUCHES_TO_RESPONSE
                  )
                }
                className={inputCls("mb-3 focus:ring-2 focus:ring-tool-accent")}
              >
                <option value="cold_enterprise">Cold — enterprise</option>
                <option value="cold_smb">Cold — SMB</option>
                <option value="inbound">Inbound follow-up</option>
                <option value="warm_event">Warm — post-event</option>
              </select>

              <div className="space-y-1.5">
                {([
                  ["p50 (median)", profile.p50],
                  ["p80", profile.p80],
                  ["p95", profile.p95],
                ] as const).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded-md border border-app bg-app px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-[0.65rem] uppercase tracking-[0.15em] text-muted">
                      {k}
                    </span>
                    <span className="font-mono text-sm font-semibold text-tool-accent">
                      {v} touches
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-md bg-tool-accent-soft p-2 text-[0.65rem] leading-snug text-secondary">
                Most reps quit at touch 3–4. Gong data shows p80 reply doesn&apos;t hit until touch{" "}
                <span className="font-semibold text-tool-accent">{profile.p80}</span>. If you&apos;re disqualifying at 4, you&apos;re leaving 50%+ of pipeline on the table.
              </div>
            </div>
          </section>
        </aside>

        {/* MAIN PANEL */}
        <div className="min-w-0">
          {!active ? (
            <section className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-app bg-app-elevated p-8 text-center">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-tool-accent-soft px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                No cadence loaded
              </div>
              <div className="text-sm text-secondary">
                Pick a preset above to start designing the rhythm.
              </div>
            </section>
          ) : view === "preview" ? (
            <PreviewPanel cadence={active} sortedSteps={sortedSteps} />
          ) : view === "calendar" ? (
            <CalendarPanel
              weeks={calendarWeeks}
              stepsByDay={stepsByDay}
              totalDays={totalDays}
            />
          ) : (
            <section className="rounded-xl border border-app bg-app-elevated">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-app px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                    Cadence editor
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-app">
                    {active.name}
                  </div>
                </div>
                <button
                  onClick={addStep}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  <span className="text-base leading-none">+</span> Step
                </button>
              </div>

              <div className="p-4 sm:p-5">
                {activePreset && (
                  <div className="mb-5 rounded-lg bg-tool-accent-soft px-3 py-2.5 text-xs leading-snug text-secondary">
                    <div className="mb-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                      Source: {activePreset.source}
                    </div>
                    {activePreset.description}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
                  <Field label="Name">
                    <input
                      value={active.name}
                      onChange={(e) =>
                        updateCadence(active.id, { name: e.target.value })
                      }
                      className={inputCls("focus:ring-2 focus:ring-tool-accent")}
                    />
                  </Field>
                  <Field label="Variant">
                    <select
                      value={active.variant}
                      onChange={(e) =>
                        updateCadence(active.id, {
                          variant: e.target.value as Variant,
                        })
                      }
                      className={inputCls("focus:ring-2 focus:ring-tool-accent")}
                    >
                      <option value="enterprise">enterprise</option>
                      <option value="smb">smb</option>
                      <option value="inbound_followup">inbound follow-up</option>
                    </select>
                  </Field>
                </div>

                {/* TIMELINE */}
                <div className="mt-6">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                      Sequence timeline
                    </h3>
                    <span className="text-[0.6rem] uppercase tracking-[0.15em] text-faint">
                      Day · Channel · Touch
                    </span>
                  </div>

                  {sortedSteps.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-app bg-app px-4 py-8 text-center text-xs text-faint">
                      No steps yet — add one to start the rhythm.
                    </div>
                  ) : (
                    <div className="relative pl-3 sm:pl-4">
                      {/* Vertical rail */}
                      <div className="absolute bottom-2 left-[7px] top-2 w-px border-l border-app sm:left-[11px]" />
                      <ol className="space-y-3">
                        {dayBuckets.map(([day, steps]) => (
                          <li key={day} className="relative">
                            {/* Day node — vertical dot */}
                            <div className="absolute -left-3 top-2 sm:-left-4">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent text-[0.55rem] font-semibold shadow-sm sm:h-7 sm:w-7 sm:text-[0.6rem]"
                                style={{ color: "var(--bg)" }}
                              >
                                d{day}
                              </div>
                            </div>

                            {/* Day card group */}
                            <div className="ml-6 space-y-2 sm:ml-8">
                              {steps.map((s, idx) => {
                                const meta = CHANNEL_META[s.channel];
                                const eff = CHANNEL_EFFECTIVENESS[s.channel];
                                const stepNum =
                                  sortedSteps.findIndex((x) => x.id === s.id) + 1;
                                return (
                                  <div
                                    key={s.id}
                                    className="group rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
                                  >
                                    {/* Top row */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent-soft px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-tool-accent">
                                          <span className="font-mono text-[0.7rem] leading-none text-tool-accent">
                                            {meta.glyph}
                                          </span>
                                          {meta.label}
                                        </span>
                                        <span className="text-[0.6rem] font-mono uppercase tracking-[0.15em] text-muted">
                                          touch {stepNum}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => removeStep(s.id)}
                                        className="rounded-md border border-app px-1.5 py-0.5 text-[0.7rem] text-muted opacity-0 transition group-hover:opacity-100 hover:border-rose-500/40 hover:text-rose-500"
                                        aria-label="Remove step"
                                      >
                                        ×
                                      </button>
                                    </div>

                                    {/* Body */}
                                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[64px_1fr_1fr]">
                                      <label className="flex flex-col gap-0.5">
                                        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                          Day
                                        </span>
                                        <input
                                          type="number"
                                          value={s.day}
                                          onChange={(e) =>
                                            updateStep(s.id, {
                                              day: Number(e.target.value) || 0,
                                            })
                                          }
                                          className="w-full rounded-md border border-app bg-app px-2 py-1 font-mono text-sm font-semibold text-tool-accent outline-none focus:ring-2 focus:ring-tool-accent"
                                        />
                                      </label>
                                      <label className="flex flex-col gap-0.5">
                                        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                          Channel
                                        </span>
                                        <select
                                          value={s.channel}
                                          onChange={(e) =>
                                            updateStep(s.id, {
                                              channel: e.target.value as Channel,
                                            })
                                          }
                                          className="w-full rounded-md border border-app bg-app px-2 py-1 text-xs text-app outline-none focus:ring-2 focus:ring-tool-accent"
                                        >
                                          <option value="email">Email</option>
                                          <option value="call">Call</option>
                                          <option value="linkedin">LinkedIn</option>
                                          <option value="video">Video</option>
                                        </select>
                                      </label>
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                          Reply rate
                                        </span>
                                        <div className="flex items-center gap-2 rounded-md bg-tool-accent-soft px-2 py-1">
                                          <span className="font-mono text-sm font-semibold text-tool-accent">
                                            {eff.responseRate}%
                                          </span>
                                          <span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                                            · {eff.timeCost}m
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <label className="flex flex-col gap-0.5">
                                        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                          Subject / Note
                                        </span>
                                        <input
                                          value={s.note}
                                          onChange={(e) =>
                                            updateStep(s.id, { note: e.target.value })
                                          }
                                          placeholder="e.g. Quick idea on {{topic}}"
                                          className="w-full rounded-md border border-app bg-app px-2 py-1 text-xs text-app placeholder:text-faint outline-none focus:ring-2 focus:ring-tool-accent"
                                        />
                                      </label>
                                      <label className="flex flex-col gap-0.5">
                                        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                          Preview / Template ref
                                        </span>
                                        <input
                                          value={s.template}
                                          onChange={(e) =>
                                            updateStep(s.id, {
                                              template: e.target.value,
                                            })
                                          }
                                          placeholder="Template id or first line"
                                          className="w-full rounded-md border border-app bg-app px-2 py-1 text-xs text-secondary placeholder:text-faint outline-none focus:ring-2 focus:ring-tool-accent"
                                        />
                                      </label>
                                    </div>

                                    {idx < steps.length - 1 && (
                                      <div className="mt-2 border-t border-dashed border-app" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── PREVIEW PANEL ───────── */

function PreviewPanel({
  cadence,
  sortedSteps,
}: {
  cadence: Cadence;
  sortedSteps: Step[];
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated">
      <div className="border-b border-app px-4 py-3 sm:px-5">
        <div className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
          Preview · read-only
        </div>
        <div className="mt-0.5 text-sm font-semibold text-app">{cadence.name}</div>
      </div>
      <div className="p-4 sm:p-5">
        {sortedSteps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-app bg-app px-4 py-8 text-center text-xs text-faint">
            Empty cadence.
          </div>
        ) : (
          <ol className="space-y-2">
            {sortedSteps.map((s, i) => {
              const meta = CHANNEL_META[s.channel];
              const eff = CHANNEL_EFFECTIVENESS[s.channel];
              return (
                <li
                  key={s.id}
                  className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted">
                    #{i + 1}
                  </span>
                  <span className="rounded-md bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-tool-accent">
                    d{s.day}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-tool-accent">
                        <span className="font-mono">{meta.glyph}</span>
                        {meta.label}
                      </span>
                      <span className="truncate text-xs text-app">
                        {s.note || <span className="text-faint">(no subject)</span>}
                      </span>
                    </div>
                    {s.template && (
                      <div className="mt-0.5 truncate text-[0.65rem] text-muted">
                        ↳ {s.template}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                    {eff.responseRate}% · {eff.timeCost}m
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ───────── CALENDAR PANEL ───────── */

function CalendarPanel({
  weeks,
  stepsByDay,
  totalDays,
}: {
  weeks: number[][];
  stepsByDay: Map<number, Step[]>;
  totalDays: number;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated">
      <div className="border-b border-app px-4 py-3 sm:px-5">
        <div className="text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
          Calendar · 7-day rows
        </div>
        <div className="mt-0.5 text-sm font-semibold text-app">
          {totalDays} day{totalDays === 1 ? "" : "s"} · {weeks.length} week{weeks.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {weeks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-app bg-app px-4 py-8 text-center text-xs text-faint">
            No days scheduled.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 px-1 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              {["d1", "d2", "d3", "d4", "d5", "d6", "d7"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, di) => {
                  const day = week[di];
                  const steps = day ? stepsByDay.get(day) || [] : [];
                  return (
                    <div
                      key={di}
                      className={`min-h-[88px] rounded-lg border p-2 ${
                        day
                          ? "border-app bg-app"
                          : "border-dashed border-app bg-app opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          {day ? `d${day}` : "—"}
                        </span>
                        {steps.length > 0 && (
                          <span className="rounded-sm bg-tool-accent-soft px-1 font-mono text-[0.55rem] font-semibold text-tool-accent">
                            {steps.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {steps.map((s) => {
                          const meta = CHANNEL_META[s.channel];
                          return (
                            <div
                              key={s.id}
                              title={s.note || meta.label}
                              className="flex items-center gap-1 rounded-md bg-tool-accent-soft px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-tool-accent"
                            >
                              <span className="font-mono text-tool-accent">
                                {meta.glyph}
                              </span>
                              <span className="truncate">{meta.short}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────── small presentational helpers ───────── */

function SummaryChip({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center ${
        primary
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app"
      }`}
    >
      <div className="font-mono text-base font-semibold text-tool-accent sm:text-lg">
        {value}
      </div>
      <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
    </div>
  );
}

function BigNum({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold tracking-tight sm:text-2xl ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
