"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker Estimator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no ToolShell,
   no AuthGate, no PageHeader, no back-links, no ToolRecommendations, no
   bespoke macOS chrome. Width-driven layout: <760px stacks the voters rail
   above the table area.
   All voting/distribution math, hooks and state are preserved verbatim from
   page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import type { NativeAppProps } from "@/app/tools/_data/tools-list";

type FibValue = 1 | 2 | 3 | 5 | 8 | 13 | 21 | "?";
const FIB: FibValue[] = [1, 2, 3, 5, 8, 13, 21, "?"];
const MAX_VOTERS = 8;

interface Story {
  id: string;
  title: string;
  votes: Record<string, FibValue | null>; // voter id -> value
  revealed: boolean;
}

interface Voter {
  id: string;
  name: string;
}

interface Session {
  voters: Voter[];
  stories: Story[];
  anonymous?: boolean; // if true, vote cards show "•" without voter names until revealed
}

// Discussion prompts shown when spread is high. Based on standard Scrum
// retrospective / estimation-conflict facilitation techniques.
const DISCUSSION_PROMPTS = [
  "Highest-estimate voter: what risk or edge case are you seeing that the team may be underweighting?",
  "Lowest-estimate voter: what assumption lets this be small? Is it really in scope?",
  "Is the story properly sliced? Can we split it to reduce disagreement?",
  "Do we have the information we need to estimate, or is there a discovery spike hiding here?",
  "Is the Definition of Done the same for everyone at the table?",
];

const STORAGE_KEY = "solutions:planning-poker:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT: Session = {
  voters: [
    { id: uid(), name: "Ana" },
    { id: uid(), name: "Ben" },
    { id: uid(), name: "Cam" },
    { id: uid(), name: "Dee" },
  ],
  stories: [
    { id: uid(), title: "Add OAuth login", votes: {}, revealed: false },
  ],
};

export default function PlanningPokerApp(props: NativeAppProps) {
  const { width } = props;

  /* Below 760px → single-column stack. Below 520 → ultra-narrow tweaks. */
  const isWide = width >= 760;
  const isUltra = width < 520;

  const [session, setSession] = useState<Session>(DEFAULT);
  const [activeVoterId, setActiveVoterId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Session;
        if (parsed && Array.isArray(parsed.voters) && Array.isArray(parsed.stories)) {
          setSession(parsed);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }, [session, hydrated]);

  useEffect(() => {
    if (!activeVoterId && session.voters.length > 0) {
      setActiveVoterId(session.voters[0].id);
    } else if (activeVoterId && !session.voters.find((v) => v.id === activeVoterId)) {
      setActiveVoterId(session.voters[0]?.id || "");
    }
  }, [session.voters, activeVoterId]);

  const addVoter = () => {
    if (session.voters.length >= MAX_VOTERS) return;
    setSession((prev) => ({
      ...prev,
      voters: [
        ...prev.voters,
        { id: uid(), name: `Voter ${prev.voters.length + 1}` },
      ],
    }));
  };
  const renameVoter = (id: string, name: string) =>
    setSession((prev) => ({
      ...prev,
      voters: prev.voters.map((v) => (v.id === id ? { ...v, name } : v)),
    }));
  const removeVoter = (id: string) =>
    setSession((prev) => ({
      ...prev,
      voters: prev.voters.filter((v) => v.id !== id),
      stories: prev.stories.map((s) => {
        const { [id]: _omit, ...rest } = s.votes;
        return { ...s, votes: rest };
      }),
    }));

  const addStory = () =>
    setSession((prev) => ({
      ...prev,
      stories: [
        ...prev.stories,
        { id: uid(), title: "", votes: {}, revealed: false },
      ],
    }));
  const updateStoryTitle = (id: string, title: string) =>
    setSession((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => (s.id === id ? { ...s, title } : s)),
    }));
  const removeStory = (id: string) =>
    setSession((prev) => ({
      ...prev,
      stories: prev.stories.filter((s) => s.id !== id),
    }));

  const setVote = (storyId: string, voterId: string, value: FibValue) =>
    setSession((prev) => ({
      ...prev,
      stories: prev.stories.map((s) =>
        s.id === storyId ? { ...s, votes: { ...s.votes, [voterId]: value } } : s
      ),
    }));
  const resetStory = (storyId: string) =>
    setSession((prev) => ({
      ...prev,
      stories: prev.stories.map((s) =>
        s.id === storyId ? { ...s, votes: {}, revealed: false } : s
      ),
    }));
  const toggleReveal = (storyId: string) =>
    setSession((prev) => ({
      ...prev,
      stories: prev.stories.map((s) =>
        s.id === storyId ? { ...s, revealed: !s.revealed } : s
      ),
    }));

  return (
    <div
      data-tool-theme="productivity"
      data-tool="planning-poker"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <div className="px-4 pb-8 pt-5 sm:px-6">
        {/* Estimation table */}
        <section className="relative overflow-hidden rounded-2xl border border-app bg-app-elevated p-4 sm:p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 50% 0%, var(--tool-accent-soft), transparent 60%), radial-gradient(ellipse at 50% 100%, var(--tool-accent-soft), transparent 55%)",
            }}
          />

          {/* Session header strip */}
          <header className="tool-hero relative mb-4 overflow-hidden rounded-xl border border-app bg-app px-4 py-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 opacity-60"
              style={{ backgroundImage: "var(--tool-hero-gradient)" }}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-app bg-tool-accent-soft text-tool-accent">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="6" height="9" rx="1.5" />
                    <rect x="15" y="12" width="6" height="9" rx="1.5" />
                    <path d="M9 7h6" />
                    <path d="M9 17h6" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-app">Estimation table</div>
                  <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                    {session.stories.length} {session.stories.length === 1 ? "story" : "stories"} ·{" "}
                    {session.voters.length}/{MAX_VOTERS} voters
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isUltra && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-3 py-1 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Fibonacci 1·2·3·5·8·13·21
                  </span>
                )}
                {session.anonymous && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1 text-[0.65rem] font-medium text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Anonymous
                  </span>
                )}
                {activeVoterId && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1 text-[0.65rem] font-medium text-app">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Voting as {session.voters.find((v) => v.id === activeVoterId)?.name || "—"}
                  </span>
                )}
              </div>
            </div>
          </header>

          <div
            className={isWide ? "relative grid gap-5" : "relative flex flex-col gap-5"}
            style={isWide ? { gridTemplateColumns: "260px 1fr" } : undefined}
          >
            {/* Voters rail — designed as a stack of seat chips */}
            <aside className="rounded-xl border border-app bg-app p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-app">
                  Players at the table
                </h2>
                <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  {session.voters.length}/{MAX_VOTERS}
                </span>
              </div>

              <div className="space-y-2">
                {session.voters.map((v, i) => {
                  const isActive = activeVoterId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                        isActive
                          ? "border-tool-accent bg-tool-accent-soft"
                          : "border-app bg-app-elevated hover:border-tool-accent"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveVoterId(v.id)}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold transition-colors ${
                          isActive
                            ? "border-tool-accent bg-tool-accent text-white"
                            : "border-app bg-app text-secondary group-hover:border-tool-accent group-hover:text-tool-accent"
                        }`}
                        aria-label={`Set active voter ${v.name}`}
                        title={`Vote as ${v.name}`}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => renameVoter(v.id, e.target.value)}
                        className="flex-1 rounded-md border border-app bg-app px-2 py-1 text-xs text-app placeholder:text-muted focus:border-app-focus focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeVoter(v.id)}
                        className="rounded-md border border-app px-2 py-0.5 text-muted transition-colors hover:border-tool-accent hover:text-tool-accent"
                        aria-label={`Remove ${v.name}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addVoter}
                disabled={session.voters.length >= MAX_VOTERS}
                className="mt-3 w-full rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:brightness-110 disabled:opacity-40"
              >
                + Add player
              </button>

              <label className="mt-4 flex cursor-pointer select-none items-center gap-2 rounded-md border border-app bg-app-elevated px-3 py-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={!!session.anonymous}
                  onChange={(e) => setSession((prev) => ({ ...prev, anonymous: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--tool-accent)]"
                />
                <span>
                  Anonymous voting
                  <span className="ml-1 text-muted">(hide until reveal)</span>
                </span>
              </label>

              <div className="mt-4 rounded-md border border-app bg-app-elevated p-3 text-xs leading-relaxed text-secondary">
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                  How to play
                </p>
                <p className="mt-1.5">
                  Tap a seat letter to take that player&apos;s turn. Then deal a Fibonacci card from
                  the bottom rail. Flip the story when everyone&apos;s in.
                </p>
              </div>
            </aside>

            {/* Stories — main felt area */}
            <div className="space-y-5">
              {session.stories.map((s, idx) => {
                const values = session.voters
                  .map((v) => s.votes[v.id])
                  .filter((x): x is FibValue => x != null && x !== "?");
                const median = values.length > 0 ? medianOf(values as number[]) : null;
                const spread =
                  values.length > 0
                    ? Math.max(...(values as number[])) - Math.min(...(values as number[]))
                    : 0;
                const disagreement = spread >= 8;
                const castCount = session.voters.filter((v) => s.votes[v.id] != null).length;
                const allCast = castCount === session.voters.length && session.voters.length > 0;

                // Build distribution counts for the bar chart
                const distribution = FIB.map((val) => {
                  const count = session.voters.filter((v) => s.votes[v.id] === val).length;
                  return { val, count };
                });
                const maxCount = Math.max(1, ...distribution.map((d) => d.count));

                return (
                  <article
                    key={s.id}
                    className="relative overflow-hidden rounded-2xl border border-app bg-app p-5"
                  >
                    {/* HERO — story title card */}
                    <div className="tool-hero relative mb-5 overflow-hidden rounded-xl border border-app bg-tool-accent-soft p-4 sm:p-5">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
                        style={{ backgroundImage: "var(--tool-hero-gradient)" }}
                      />
                      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-sm border border-app bg-app px-1.5 font-mono text-[0.6rem] text-app">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            Story
                            <span className="text-muted">·</span>
                            <span className="text-tool-accent">
                              {castCount}/{session.voters.length} cast
                            </span>
                            {s.revealed && (
                              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] tracking-[0.16em] text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                                <span className="h-1 w-1 rounded-full bg-tool-accent" />
                                Revealed
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={s.title}
                            onChange={(e) => updateStoryTitle(s.id, e.target.value)}
                            placeholder="Untitled story — tap to name it"
                            className="mt-2 w-full bg-transparent text-xl font-semibold tracking-tight text-app placeholder:text-muted focus:outline-none sm:text-2xl"
                          />
                          {/* progress sliver */}
                          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-app-elevated">
                            <div
                              className="h-full rounded-full bg-tool-accent transition-all duration-500"
                              style={{
                                width:
                                  session.voters.length === 0
                                    ? "0%"
                                    : `${(castCount / session.voters.length) * 100}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                          <button
                            type="button"
                            onClick={() => toggleReveal(s.id)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] transition-colors ${
                              s.revealed
                                ? "border-app bg-app-elevated text-app hover:border-tool-accent"
                                : allCast
                                ? "border-tool-accent bg-tool-accent text-white"
                                : "border-tool-accent bg-tool-accent-soft text-tool-accent hover:brightness-110"
                            }`}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              {s.revealed ? (
                                <>
                                  <path d="M2 2l20 20" />
                                  <path d="M6.7 6.7C4.6 8.2 3 10.5 2 12c2 3.5 6 6 10 6 1.7 0 3.3-.4 4.7-1.1" />
                                  <path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c4 0 8 2.5 10 6a13 13 0 0 1-2.7 3.3" />
                                </>
                              ) : (
                                <>
                                  <path d="M2 12c2-3.5 6-6 10-6s8 2.5 10 6c-2 3.5-6 6-10 6S4 15.5 2 12z" />
                                  <circle cx="12" cy="12" r="3" />
                                </>
                              )}
                            </svg>
                            {s.revealed ? "Hide" : "Reveal"}
                          </button>
                          <button
                            type="button"
                            onClick={() => resetStory(s.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStory(s.id)}
                            className="rounded-md border border-app px-2 py-1.5 text-muted transition-colors hover:border-tool-accent hover:text-tool-accent"
                            aria-label="Remove story"
                            title="Remove story"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* MIDDLE — vote distribution bar chart */}
                    <div className="mb-5 rounded-xl border border-app bg-app-elevated p-4">
                      <div className="mb-3 flex items-baseline justify-between">
                        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                          Vote distribution
                        </div>
                        <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                          {s.revealed ? "Live counts" : "Hidden until reveal"}
                        </div>
                      </div>

                      <div className="grid grid-cols-8 items-end gap-1.5 sm:gap-2">
                        {distribution.map((d) => {
                          const heightPct = (d.count / maxCount) * 100;
                          const visible = s.revealed || d.count === 0;
                          return (
                            <div key={String(d.val)} className="flex flex-col items-center gap-1.5">
                              <div className="relative flex h-20 w-full items-end overflow-hidden rounded-md border border-app bg-app sm:h-24">
                                {d.count > 0 && (
                                  <div
                                    className={`w-full rounded-sm transition-all duration-500 ${
                                      visible ? "bg-tool-accent" : "bg-app-elevated"
                                    }`}
                                    style={{ height: `${Math.max(8, heightPct)}%` }}
                                    aria-label={`${d.count} votes for ${d.val}`}
                                  />
                                )}
                                {d.count > 0 && (
                                  <span
                                    className={`pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[0.6rem] font-semibold ${
                                      visible ? "text-app" : "text-muted"
                                    }`}
                                  >
                                    {visible ? d.count : "·"}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-[0.65rem] font-mono font-semibold ${
                                  d.count > 0 ? "text-tool-accent" : "text-muted"
                                }`}
                              >
                                {d.val}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Voter chips under chart */}
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-app pt-3">
                        {session.voters.map((v) => {
                          const vote = s.votes[v.id];
                          const hideName = session.anonymous && !s.revealed;
                          return (
                            <div
                              key={v.id}
                              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] transition-colors ${
                                vote == null
                                  ? "border-app bg-app text-muted"
                                  : s.revealed
                                  ? "border-tool-accent bg-tool-accent-soft text-app"
                                  : "border-app bg-app-elevated text-secondary"
                              }`}
                            >
                              <span>{hideName ? "••••" : v.name}</span>
                              <span
                                className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded font-mono text-[0.6rem] ${
                                  vote == null
                                    ? "text-muted"
                                    : s.revealed
                                    ? "bg-tool-accent text-white"
                                    : "bg-app text-secondary"
                                }`}
                              >
                                {vote == null ? "–" : s.revealed ? vote : "•"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* BOTTOM — Fibonacci poker card deck */}
                    <div className="rounded-xl border border-app bg-app-elevated p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                          {activeVoterId
                            ? `Deal a card · ${
                                session.voters.find((v) => v.id === activeVoterId)?.name || ""
                              }`
                            : "Pick a player to deal"}
                        </div>
                        <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                          Tap to vote
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3">
                        {FIB.map((val) => {
                          const selected = !!activeVoterId && s.votes[activeVoterId] === val;
                          return (
                            <button
                              key={String(val)}
                              type="button"
                              disabled={!activeVoterId}
                              onClick={() =>
                                activeVoterId && setVote(s.id, activeVoterId, val)
                              }
                              className={`group relative flex h-20 w-14 shrink-0 flex-col items-center justify-between rounded-lg border p-1.5 text-center font-semibold transition-all duration-200 sm:h-24 sm:w-16 ${
                                selected
                                  ? "-translate-y-1.5 border-tool-accent bg-tool-accent-soft text-app ring-2 ring-[color:var(--tool-accent-ring)]"
                                  : "border-app bg-app text-app hover:-translate-y-1 hover:border-tool-accent hover:bg-tool-accent-soft"
                              } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0`}
                            >
                              <span className="self-start text-[0.6rem] font-mono text-muted">
                                {val}
                              </span>
                              <span className="text-xl font-bold sm:text-2xl">{val}</span>
                              <span className="self-end rotate-180 text-[0.6rem] font-mono text-muted">
                                {val}
                              </span>
                              {selected && (
                                <span className="pointer-events-none absolute inset-x-2 top-1.5 h-px bg-tool-accent" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Disagreement prompts */}
                    {s.revealed && disagreement && (
                      <div className="mt-5 rounded-xl border border-tool-accent bg-tool-accent-soft p-4 text-xs">
                        <div className="flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 9v4" />
                            <path d="M12 17h.01" />
                            <path d="M10.3 3.86l-9 16A2 2 0 0 0 3 23h18a2 2 0 0 0 1.7-3.14l-9-16a2 2 0 0 0-3.4 0z" />
                          </svg>
                          Disagreement — try these prompts
                        </div>
                        <ul className="mt-2 space-y-1 text-secondary">
                          {DISCUSSION_PROMPTS.slice(0, 4).map((p, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-tool-accent">·</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Result tiles */}
                    <div
                      className="mt-5 grid gap-2"
                      style={{
                        gridTemplateColumns: isUltra
                          ? "repeat(2, minmax(0, 1fr))"
                          : "repeat(4, minmax(0, 1fr))",
                      }}
                    >
                      <Mini label="Votes cast" value={`${castCount}/${session.voters.length}`} />
                      <Mini
                        label="Consensus"
                        value={
                          s.revealed && median != null
                            ? String(nearestFib(median))
                            : "—"
                        }
                        accent={s.revealed && median != null}
                      />
                      <Mini label="Spread" value={s.revealed ? String(spread) : "—"} />
                      <Mini
                        label="Needs discussion"
                        value={s.revealed && disagreement ? "Yes" : s.revealed ? "No" : "—"}
                        warn={s.revealed && disagreement}
                      />
                    </div>
                  </article>
                );
              })}

              <button
                type="button"
                onClick={addStory}
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-tool-accent bg-tool-accent-soft px-3 py-3 text-[0.7rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:brightness-110"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Add story
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-3 transition-colors ${
        warn || accent
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <div
        className={`text-[0.55rem] uppercase tracking-[0.18em] ${
          warn || accent ? "text-tool-accent" : "text-muted"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tracking-tight text-app">
        {value}
      </div>
    </div>
  );
}

function medianOf(vals: number[]): number {
  const arr = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

function nearestFib(v: number): number {
  const nums = [1, 2, 3, 5, 8, 13, 21];
  let best = nums[0];
  let bestDiff = Infinity;
  nums.forEach((n) => {
    const d = Math.abs(n - v);
    if (d < bestDiff) {
      bestDiff = d;
      best = n;
    }
  });
  return best;
}
