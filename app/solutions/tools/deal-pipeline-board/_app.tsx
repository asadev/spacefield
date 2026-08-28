"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Deal Pipeline Board — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome, no WorkspaceSwitcher. Width-driven layout (no sm:/md:/lg:
   viewport-prefixed Tailwind classes — uses inline styles keyed off
   props.width). All pipeline state, hooks, and features (kanban DnD, list,
   forecast, conversion funnel, stuck-deal detection, team sync) preserved
   verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

type Stage =
  | "Prospecting"
  | "Qualified"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

const STAGES: Stage[] = [
  "Prospecting",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

// Typical sales-stage win-probability weights (used for weighted forecast).
const STAGE_PROBABILITY: Record<Stage, number> = {
  Prospecting: 0.1,
  Qualified: 0.3,
  Proposal: 0.5,
  Negotiation: 0.75,
  "Closed Won": 1,
  "Closed Lost": 0,
};

interface Deal {
  id: string;
  name: string;
  amount: number;
  contact: string;
  closeDate: string;
  stage: Stage;
  owner: string;
  stageEnteredAt?: string; // ISO — when deal entered current stage
}

const STUCK_DAYS_THRESHOLD = 30;

function daysSince(iso?: string): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

interface State {
  deals: Deal[];
}

const LS_KEY = "solutions:deal-pipeline-board:v1";
const NAMESPACE = "pipeline-board";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    deals: [
      {
        id: uid(),
        name: "Acme — Q2 expansion",
        amount: 45000,
        contact: "Jane Doe",
        closeDate: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10),
        stage: "Qualified",
        owner: "Alex",
      },
      {
        id: uid(),
        name: "Globex — pilot",
        amount: 12000,
        contact: "John Chen",
        closeDate: new Date(Date.now() + 14 * 86400000)
          .toISOString()
          .slice(0, 10),
        stage: "Proposal",
        owner: "Alex",
      },
      {
        id: uid(),
        name: "Initech — renewal",
        amount: 80000,
        contact: "Priya Singh",
        closeDate: new Date(Date.now() + 60 * 86400000)
          .toISOString()
          .slice(0, 10),
        stage: "Negotiation",
        owner: "Alex",
      },
    ],
  };
}

const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

type ViewKey = "kanban" | "list" | "forecast";

// ---- Local stat tile (ToolCard/Stat replacement using foundation tokens) --

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        accent
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1.5 text-base font-semibold tracking-tight tabular-nums ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      {(title || subtitle) && (
        <header className="mb-4">
          {subtitle && (
            <div className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              {subtitle}
            </div>
          )}
          {title && (
            <h2 className="mt-1.5 text-base font-semibold tracking-tight text-app">
              {title}
            </h2>
          )}
        </header>
      )}
      {children}
    </div>
  );
}

// ─── Default export — native app entry ───────────────────────────────────

export default function DealPipelineBoardApp(props: NativeAppProps) {
  const { width } = props;

  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [view, setView] = useState<ViewKey>("kanban");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

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
        setState(data && Array.isArray(data.deals) ? data : defaultState());
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

  const totals = useMemo(() => {
    const t: Record<Stage, number> = {
      Prospecting: 0,
      Qualified: 0,
      Proposal: 0,
      Negotiation: 0,
      "Closed Won": 0,
      "Closed Lost": 0,
    };
    state.deals.forEach((d) => {
      t[d.stage] += d.amount;
    });
    return t;
  }, [state]);

  const openTotal =
    totals.Prospecting + totals.Qualified + totals.Proposal + totals.Negotiation;
  const won = totals["Closed Won"];
  const lost = totals["Closed Lost"];
  const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;

  const weightedPipeline = useMemo(
    () =>
      state.deals
        .filter((d) => !d.stage.startsWith("Closed"))
        .reduce((sum, d) => sum + d.amount * STAGE_PROBABILITY[d.stage], 0),
    [state.deals]
  );

  const openDealCount = useMemo(
    () => state.deals.filter((d) => !d.stage.startsWith("Closed")).length,
    [state.deals]
  );

  const addDeal = () => {
    setState((s) => ({
      deals: [
        {
          id: uid(),
          name: "New deal",
          amount: 0,
          contact: "",
          closeDate: new Date().toISOString().slice(0, 10),
          stage: "Prospecting",
          owner: "",
          stageEnteredAt: new Date().toISOString(),
        },
        ...s.deals,
      ],
    }));
  };

  const update = (id: string, patch: Partial<Deal>) =>
    setState((s) => ({
      deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));

  const remove = (id: string) => {
    setState((s) => ({ deals: s.deals.filter((d) => d.id !== id) }));
  };

  const moveToStage = (id: string, stage: Stage) => {
    const d = state.deals.find((x) => x.id === id);
    if (!d || d.stage === stage) return;
    update(id, { stage, stageEnteredAt: new Date().toISOString() });
  };

  const stageCounts = useMemo(() => {
    const c: Record<Stage, number> = {
      Prospecting: 0,
      Qualified: 0,
      Proposal: 0,
      Negotiation: 0,
      "Closed Won": 0,
      "Closed Lost": 0,
    };
    state.deals.forEach((d) => c[d.stage]++);
    return c;
  }, [state]);

  const stuckDeals = useMemo(
    () =>
      state.deals.filter(
        (d) =>
          !d.stage.startsWith("Closed") &&
          daysSince(d.stageEnteredAt) > STUCK_DAYS_THRESHOLD
      ),
    [state.deals]
  );

  const syncLabel = syncing
    ? "saving…"
    : syncedAt
    ? `saved ${syncedAt}`
    : "ready";

  // Width-keyed responsive grids (no Tailwind viewport prefixes).
  const statsCols = width < 560 ? 2 : width < 880 ? 3 : 5;
  const forecastCols = width < 560 ? 2 : 3;
  const heroStack = width < 560;

  return (
    <div
      data-tool-theme="crm"
      data-tool="deal-pipeline-board"
      className="h-full w-full overflow-y-auto bg-app p-4 text-app"
    >
      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            Pipeline
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {current.kind === "team" ? "team" : "personal"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            crm.pipeline
            <span className="text-faint">/</span>
            <span className="text-secondary">board.kanban</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? `◉ ${syncLabel}` : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div
            className="relative flex flex-wrap items-start justify-between gap-4"
            style={heroStack ? { flexDirection: "column" } : undefined}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Weighted forecast · live
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <div
                  className="font-semibold tracking-tight tabular-nums text-app"
                  style={{ fontSize: width < 560 ? "1.75rem" : "2.25rem" }}
                >
                  {money(weightedPipeline)}
                </div>
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                  {openDealCount} open · {state.deals.length} total
                </span>
              </div>

              <div className="mt-2 text-sm text-secondary">
                Open pipeline {money(openTotal)} · won {money(won)} · win rate{" "}
                {winRate.toFixed(0)}%
                {stuckDeals.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-rose-500">
                      {stuckDeals.length} stuck
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Win rate
              </div>
              <div className="text-2xl font-semibold tabular-nums text-tool-accent">
                {winRate.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* sub-tab strip — segmented view pills + add deal action */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "kanban", label: "Kanban" },
                { k: "list", label: "List" },
                { k: "forecast", label: "Forecast" },
              ] as { k: ViewKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={addDeal}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + Deal
            </button>
          </div>
        </div>
      </section>

      {/* Top-line stats */}
      <div
        className="mb-6 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${statsCols}, minmax(0, 1fr))` }}
      >
        <Stat label="Open pipeline" value={money(openTotal)} accent />
        <Stat label="Closed won" value={money(won)} />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} />
        <Stat label="Stuck > 30d" value={String(stuckDeals.length)} />
        <Stat
          label={current.kind === "team" ? "Team mode" : "Personal mode"}
          value={
            syncing ? "Saving…" : syncedAt ? `Saved ${syncedAt}` : "Ready"
          }
        />
      </div>

      {/* Conversion funnel */}
      <div className="mb-6 rounded-xl border border-app bg-app-elevated p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            Conversion funnel
          </div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            Stage-to-stage conversion · count
          </div>
        </div>
        <div className="space-y-1.5">
          {STAGES.filter((s) => s !== "Closed Lost").map((stage, idx, arr) => {
            const count = stageCounts[stage];
            const maxCount = Math.max(...arr.map((x) => stageCounts[x]), 1);
            const widthPct = (count / maxCount) * 100;
            const prev = idx > 0 ? arr[idx - 1] : null;
            const conversionPct =
              prev && stageCounts[prev] > 0
                ? (count / stageCounts[prev]) * 100
                : null;
            const isWon = stage === "Closed Won";
            // opacity ramp across stages — early stages lighter, late stages darker
            const opacityPct = 35 + (idx / Math.max(arr.length - 1, 1)) * 65;
            return (
              <div key={stage} className="flex items-center gap-3 text-xs">
                <div className="w-32 truncate text-secondary">{stage}</div>
                <div className="relative h-5 flex-1 overflow-hidden rounded border border-app bg-app">
                  <div
                    className={
                      isWon ? "h-full bg-emerald-500/60" : "h-full bg-tool-accent"
                    }
                    style={{
                      width: `${widthPct}%`,
                      opacity: isWon ? 1 : opacityPct / 100,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-2 font-mono text-[0.6rem] text-app">
                    {count} · {money(totals[stage])}
                  </div>
                </div>
                <div className="w-20 text-right font-mono text-muted">
                  {conversionPct !== null
                    ? `${conversionPct.toFixed(0)}% ↓`
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {stuckDeals.length > 0 && (
        <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-rose-500">
            Stuck deals ({stuckDeals.length}) — {STUCK_DAYS_THRESHOLD}+ days in
            stage
          </div>
          <ul className="flex flex-wrap gap-2 text-xs text-secondary">
            {stuckDeals.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5"
              >
                {d.name || "(unnamed)"} · {d.stage} ·{" "}
                {daysSince(d.stageEnteredAt)}d
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "forecast" ? (
        <ForecastView
          deals={state.deals}
          totals={totals}
          gridCols={forecastCols}
        />
      ) : view === "list" ? (
        <ListView
          deals={state.deals}
          update={update}
          remove={remove}
          moveToStage={moveToStage}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage, stageIdx) => {
            const dealsInStage = state.deals.filter((d) => d.stage === stage);
            const stageTotal = totals[stage];
            const isClosedWon = stage === "Closed Won";
            const isClosedLost = stage === "Closed Lost";
            // stage-progress opacity ramp (Prospecting → Negotiation deepens)
            const progressOpacity = 0.35 + (stageIdx / 3) * 0.65;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage);
                }}
                onDragLeave={() =>
                  setDragOver((s) => (s === stage ? null : s))
                }
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveToStage(dragId, stage);
                  setDragId(null);
                  setDragOver(null);
                }}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-app-elevated transition-colors ${
                  dragOver === stage
                    ? "border-tool-accent bg-tool-accent-soft"
                    : "border-app"
                }`}
              >
                <div
                  className={`flex items-center justify-between rounded-t-xl border-b px-3 py-2 ${
                    isClosedWon
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : isClosedLost
                      ? "border-app bg-app"
                      : "border-app bg-app"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isClosedWon
                          ? "bg-emerald-500"
                          : isClosedLost
                          ? "bg-faint"
                          : "bg-tool-accent"
                      }`}
                      style={
                        !isClosedWon && !isClosedLost
                          ? { opacity: progressOpacity }
                          : undefined
                      }
                    />
                    <div
                      className={`font-mono text-[0.6rem] uppercase tracking-[0.18em] ${
                        isClosedWon
                          ? "text-emerald-500"
                          : isClosedLost
                          ? "text-muted"
                          : "text-tool-accent"
                      }`}
                    >
                      {stage}
                    </div>
                    <span className="rounded-full border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.55rem] text-secondary">
                      {dealsInStage.length}
                    </span>
                  </div>
                  <div
                    className={`font-mono text-xs tabular-nums ${
                      isClosedWon
                        ? "text-emerald-500"
                        : isClosedLost
                        ? "text-muted"
                        : "text-tool-accent"
                    }`}
                  >
                    {money(stageTotal)}
                  </div>
                </div>

                {/* stage-progress indicator strip */}
                {!isClosedWon && !isClosedLost && (
                  <div
                    className="h-0.5 bg-tool-accent"
                    style={{ opacity: progressOpacity }}
                  />
                )}

                <div className="flex-1 space-y-2 p-3">
                  {dealsInStage.map((d) => {
                    const inStageDays = daysSince(d.stageEnteredAt);
                    const isStuck =
                      !d.stage.startsWith("Closed") &&
                      inStageDays > STUCK_DAYS_THRESHOLD;
                    return (
                      <div
                        key={d.id}
                        draggable
                        onDragStart={() => setDragId(d.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOver(null);
                        }}
                        className={`group cursor-grab rounded-xl border bg-app p-3 transition-colors active:cursor-grabbing hover:border-tool-accent ${
                          isStuck ? "border-rose-500/40" : "border-app"
                        } ${dragId === d.id ? "opacity-50" : ""}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] tabular-nums text-tool-accent">
                            {money(d.amount)}
                          </div>
                          {isStuck ? (
                            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-rose-500">
                              Stuck {inStageDays}d
                            </div>
                          ) : (
                            <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                              {inStageDays}d
                            </div>
                          )}
                        </div>
                        <input
                          value={d.name}
                          onChange={(e) =>
                            update(d.id, { name: e.target.value })
                          }
                          className="w-full bg-transparent text-sm font-medium text-app placeholder:text-faint outline-none"
                        />
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <label className="block">
                            <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                              Amount
                            </span>
                            <input
                              type="number"
                              value={d.amount}
                              onChange={(e) =>
                                update(d.id, {
                                  amount: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full rounded-lg border border-app bg-app-elevated px-2 py-1 text-app focus:border-tool-accent focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                              Close
                            </span>
                            <input
                              type="date"
                              value={d.closeDate}
                              onChange={(e) =>
                                update(d.id, { closeDate: e.target.value })
                              }
                              className="w-full rounded-lg border border-app bg-app-elevated px-2 py-1 text-app focus:border-tool-accent focus:outline-none"
                            />
                          </label>
                        </div>
                        <input
                          value={d.contact}
                          placeholder="Contact"
                          onChange={(e) =>
                            update(d.id, { contact: e.target.value })
                          }
                          className="mt-2 w-full rounded-lg border border-app bg-app-elevated px-2 py-1 text-xs text-secondary placeholder:text-faint focus:border-tool-accent focus:outline-none"
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-[0.55rem] font-semibold uppercase text-tool-accent">
                            {(d.owner || "?").trim().slice(0, 1).toUpperCase()}
                          </span>
                          <input
                            value={d.owner}
                            placeholder="Owner"
                            onChange={(e) =>
                              update(d.id, { owner: e.target.value })
                            }
                            className="w-full rounded-lg border border-app bg-app-elevated px-2 py-1 text-xs text-secondary placeholder:text-faint focus:border-tool-accent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => remove(d.id)}
                          className="mt-2 w-full rounded-lg border border-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                  {dealsInStage.length === 0 && (
                    <div className="rounded-lg border border-dashed border-app p-6 text-center font-mono text-[0.65rem] uppercase tracking-[0.15em] text-faint">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListView({
  deals,
  update,
  remove,
  moveToStage,
}: {
  deals: Deal[];
  update: (id: string, patch: Partial<Deal>) => void;
  remove: (id: string) => void;
  moveToStage: (id: string, stage: Stage) => void;
}) {
  return (
    <Card title="All deals" subtitle="Flat list view">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Stage</th>
              <th className="py-2 pr-3 text-right">Amount</th>
              <th className="py-2 pr-3">Close</th>
              <th className="py-2 pr-3">Owner</th>
              <th className="py-2 pr-3">Age</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const age = daysSince(d.stageEnteredAt);
              const stuck =
                !d.stage.startsWith("Closed") && age > STUCK_DAYS_THRESHOLD;
              return (
                <tr key={d.id} className="border-b border-app">
                  <td className="py-2 pr-3">
                    <input
                      value={d.name}
                      onChange={(e) => update(d.id, { name: e.target.value })}
                      className="w-full bg-transparent text-app placeholder:text-faint outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={d.stage}
                      onChange={(e) =>
                        moveToStage(d.id, e.target.value as Stage)
                      }
                      className="rounded-lg border border-app bg-app-elevated px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-secondary outline-none focus:border-tool-accent"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-tool-accent">
                    <input
                      type="number"
                      value={d.amount}
                      onChange={(e) =>
                        update(d.id, { amount: Number(e.target.value) || 0 })
                      }
                      className="w-28 rounded-lg border border-app bg-app-elevated px-2 py-1 text-right text-app focus:border-tool-accent focus:outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="date"
                      value={d.closeDate}
                      onChange={(e) =>
                        update(d.id, { closeDate: e.target.value })
                      }
                      className="rounded-lg border border-app bg-app-elevated px-2 py-1 text-secondary focus:border-tool-accent focus:outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={d.owner}
                      onChange={(e) => update(d.id, { owner: e.target.value })}
                      placeholder="Owner"
                      className="w-24 rounded-lg border border-app bg-app-elevated px-2 py-1 text-secondary placeholder:text-faint focus:border-tool-accent focus:outline-none"
                    />
                  </td>
                  <td
                    className={`py-2 pr-3 font-mono text-xs ${
                      stuck ? "text-rose-500" : "text-muted"
                    }`}
                  >
                    {age}d
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => remove(d.id)}
                      className="rounded-lg border border-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {deals.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-6 text-center text-sm text-muted"
                >
                  No deals. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ForecastView({
  deals,
  totals,
  gridCols,
}: {
  deals: Deal[];
  totals: Record<Stage, number>;
  gridCols: number;
}) {
  const rows = STAGES.filter((s) => !s.startsWith("Closed")).map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const raw = totals[stage];
    const prob = STAGE_PROBABILITY[stage];
    return {
      stage,
      count: stageDeals.length,
      raw,
      prob,
      weighted: raw * prob,
    };
  });
  const weightedTotal = rows.reduce((s, r) => s + r.weighted, 0);
  const rawTotal = rows.reduce((s, r) => s + r.raw, 0);

  return (
    <Card
      title="Weighted forecast"
      subtitle="Pipeline value × stage probability"
    >
      <div
        className="mb-4 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        <Stat label="Raw open pipeline" value={money(rawTotal)} />
        <Stat label="Weighted forecast" value={money(weightedTotal)} accent />
        <Stat
          label="Avg probability"
          value={`${
            rows.length > 0
              ? ((weightedTotal / Math.max(rawTotal, 1)) * 100).toFixed(0)
              : 0
          }%`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <th className="py-2 pr-3">Stage</th>
              <th className="py-2 pr-3 text-right">Count</th>
              <th className="py-2 pr-3 text-right">Raw $</th>
              <th className="py-2 pr-3 text-right">Probability</th>
              <th className="py-2 pr-3 text-right">Weighted $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage} className="border-b border-app">
                <td className="py-2 pr-3 text-secondary">{r.stage}</td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-app">
                  {r.count}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-app">
                  {money(r.raw)}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-secondary">
                  {(r.prob * 100).toFixed(0)}%
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-tool-accent">
                  {money(r.weighted)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                Total
              </td>
              <td className="py-2 pr-3"></td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-app">
                {money(rawTotal)}
              </td>
              <td className="py-2 pr-3"></td>
              <td className="py-2 pr-3 text-right font-mono font-semibold tabular-nums text-tool-accent">
                {money(weightedTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
