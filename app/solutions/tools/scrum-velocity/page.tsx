"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Stat } from "../../_components/ToolCard";

interface Sprint {
  id: string;
  number: string;
  committed: string;
  completed: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT: Sprint[] = [
  { id: uid(), number: "1", committed: "30", completed: "24" },
  { id: uid(), number: "2", committed: "28", completed: "26" },
  { id: uid(), number: "3", committed: "32", completed: "30" },
  { id: uid(), number: "4", committed: "30", completed: "29" },
  { id: uid(), number: "5", committed: "28", completed: "27" },
  { id: uid(), number: "6", committed: "30", completed: "31" },
];

type AnalysisTab = "ledger" | "burndown";

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

export default function ScrumVelocityPage() {
  const [sprints, setSprints] = useState<Sprint[]>(DEFAULT);
  const [tab, setTab] = useState<AnalysisTab>("ledger");

  const update = (id: string, patch: Partial<Sprint>) =>
    setSprints((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = () =>
    setSprints((prev) => [
      ...prev,
      { id: uid(), number: String(prev.length + 1), committed: "", completed: "" },
    ]);
  const remove = (id: string) =>
    setSprints((prev) => prev.filter((s) => s.id !== id));

  const stats = useMemo(() => {
    const completed = sprints
      .map((s) => parseFloat(s.completed))
      .filter((n) => isFinite(n) && n >= 0);
    const committed = sprints
      .map((s) => parseFloat(s.committed))
      .filter((n) => isFinite(n) && n >= 0);
    const n = completed.length;
    if (n === 0) {
      return {
        avg: 0,
        stdev: 0,
        low: 0,
        high: 0,
        trend: 0,
        reliability: 0,
        max: 0,
      };
    }
    const avg = completed.reduce((a, b) => a + b, 0) / n;
    const variance =
      completed.reduce((sum, v) => sum + (v - avg) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    const low = Math.max(0, avg - stdev);
    const high = avg + stdev;
    // linear regression slope (x = index)
    const xs = completed.map((_, i) => i);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - xMean) * (completed[i] - avg), 0);
    const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0) || 1;
    const trend = num / den;
    // commitment reliability
    const pairs = sprints
      .map((s) => ({ c: parseFloat(s.committed), d: parseFloat(s.completed) }))
      .filter((p) => isFinite(p.c) && isFinite(p.d) && p.c > 0);
    const reliability =
      pairs.length > 0
        ? (pairs.reduce((sum, p) => sum + Math.min(p.d / p.c, 1.5), 0) /
            pairs.length) *
          100
        : 0;
    const max = Math.max(...completed, ...committed, 1);
    return { avg, stdev, low, high, trend, reliability, max };
  }, [sprints]);

  const trendLabel =
    stats.trend > 0.5
      ? "Improving"
      : stats.trend < -0.5
      ? "Declining"
      : "Stable";
  const trendColor =
    stats.trend > 0.5
      ? "text-emerald-400"
      : stats.trend < -0.5
      ? "text-rose-400"
      : "text-app";

  // Median (visual line only — does not change math)
  const median = useMemo(() => {
    const arr = sprints
      .map((s) => parseFloat(s.completed))
      .filter((n) => isFinite(n) && n >= 0)
      .sort((a, b) => a - b);
    if (arr.length === 0) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }, [sprints]);

  // Spillover totals for ledger summary chip
  const spilloverTotal = useMemo(
    () =>
      sprints.reduce((acc, s) => {
        const c = parseFloat(s.committed) || 0;
        const d = parseFloat(s.completed) || 0;
        return acc + Math.max(0, c - d);
      }, 0),
    [sprints]
  );
  const overflowTotal = useMemo(
    () =>
      sprints.reduce((acc, s) => {
        const c = parseFloat(s.committed) || 0;
        const d = parseFloat(s.completed) || 0;
        return acc + Math.max(0, d - c);
      }, 0),
    [sprints]
  );

  return (
    <div data-tool-theme="productivity" data-tool="scrum-velocity">
      <ToolShell
        category="Productivity"
        title="Scrum Velocity Tracker"
        description="Enter past sprints to compute average velocity, variance, trend direction, and a predicted range for the next sprint."
      >
        {/* Header summary strip — predicted next-sprint capacity + key chips */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tool-accent-soft ring-1 ring-tool-accent/30">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-tool-accent"
              >
                <path d="M3 3v18h18" />
                <rect x="6" y="13" width="3" height="5" rx="0.5" />
                <rect x="11" y="9" width="3" height="9" rx="0.5" />
                <rect x="16" y="6" width="3" height="12" rx="0.5" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-app">
                Velocity overview
              </div>
              <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                {sprints.length} {sprints.length === 1 ? "sprint" : "sprints"} ·
                avg {stats.avg.toFixed(1)} pts · σ ±{stats.stdev.toFixed(1)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-3 py-1 text-[0.7rem] font-medium text-tool-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
              Next sprint {stats.low.toFixed(0)}–{stats.high.toFixed(0)} pts
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-medium ${
                stats.trend > 0.5
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
                  : stats.trend < -0.5
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-400"
                  : "border-app bg-app-elevated text-secondary"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  stats.trend > 0.5
                    ? "bg-emerald-400"
                    : stats.trend < -0.5
                    ? "bg-rose-400"
                    : "bg-tool-accent/60"
                }`}
              />
              Trend {trendLabel}
              <span className="font-mono tabular-nums opacity-70">
                {stats.trend > 0 ? "+" : ""}
                {stats.trend.toFixed(2)}/sp
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1 text-[0.7rem] font-medium text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent/70" />
              Reliability {stats.reliability.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* HERO — sprint-velocity bar chart with avg/median lines */}
        <section className="mb-6 overflow-hidden rounded-2xl border border-app">
          <div className="tool-hero flex flex-wrap items-center justify-between gap-3 border-b border-tool-accent/30 px-4 py-3">
            <div>
              <div className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Sprint velocity
              </div>
              <div className="mt-0.5 text-sm font-semibold text-app">
                Last {sprints.length} sprints — committed vs completed
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm border border-app bg-app-elevated" />
                Committed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" />
                Completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400" />
                Avg
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dotted border-amber-400" />
                Median
              </span>
            </div>
          </div>

          <div className="bg-app-elevated px-4 py-5">
            {sprints.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted">
                Add sprints below to populate the velocity chart.
              </div>
            ) : (
              (() => {
                const H = 220;
                const W = 720;
                const pad = { l: 36, r: 16, t: 16, b: 32 };
                const innerW = W - pad.l - pad.r;
                const innerH = H - pad.t - pad.b;
                const yMax = stats.max || 1;
                const yScale = (v: number) =>
                  pad.t + innerH - (v / yMax) * innerH;
                const groupW = innerW / Math.max(1, sprints.length);
                const barPad = Math.max(2, groupW * 0.12);
                const barW = Math.max(
                  4,
                  (groupW - barPad * 3) / 2
                );
                const gridSteps = 4;
                return (
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="h-auto w-full overflow-visible"
                    role="img"
                    aria-label="Sprint velocity bar chart"
                  >
                    {/* grid lines */}
                    {Array.from({ length: gridSteps + 1 }).map((_, i) => {
                      const v = (yMax / gridSteps) * i;
                      const y = yScale(v);
                      return (
                        <g key={i}>
                          <line
                            x1={pad.l}
                            x2={W - pad.r}
                            y1={y}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity="0.12"
                            strokeDasharray="2 4"
                            className="text-app"
                          />
                          <text
                            x={pad.l - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill="currentColor"
                            className="text-muted"
                          >
                            {v.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}
                    {/* axes */}
                    <line
                      x1={pad.l}
                      x2={W - pad.r}
                      y1={pad.t + innerH}
                      y2={pad.t + innerH}
                      stroke="currentColor"
                      strokeOpacity="0.3"
                      className="text-app"
                    />
                    <line
                      x1={pad.l}
                      x2={pad.l}
                      y1={pad.t}
                      y2={pad.t + innerH}
                      stroke="currentColor"
                      strokeOpacity="0.3"
                      className="text-app"
                    />

                    {/* bars */}
                    {sprints.map((s, i) => {
                      const c = parseFloat(s.committed) || 0;
                      const d = parseFloat(s.completed) || 0;
                      const gx = pad.l + i * groupW + barPad;
                      const cy = yScale(c);
                      const dy = yScale(d);
                      const ch = pad.t + innerH - cy;
                      const dh = pad.t + innerH - dy;
                      return (
                        <g key={s.id}>
                          {/* committed (ghost) */}
                          <rect
                            x={gx}
                            y={cy}
                            width={barW}
                            height={Math.max(0, ch)}
                            rx={2}
                            fill="currentColor"
                            fillOpacity="0.18"
                            className="text-app"
                          />
                          {/* completed (accent) */}
                          <rect
                            x={gx + barW + barPad}
                            y={dy}
                            width={barW}
                            height={Math.max(0, dh)}
                            rx={2}
                            className="fill-tool-accent"
                          />
                          {/* sprint label */}
                          <text
                            x={gx + barW + barPad / 2}
                            y={pad.t + innerH + 14}
                            textAnchor="middle"
                            fontSize="9"
                            fill="currentColor"
                            className="text-muted"
                          >
                            S{s.number || i + 1}
                          </text>
                          {/* completed value above bar */}
                          {d > 0 && (
                            <text
                              x={gx + barW + barPad + barW / 2}
                              y={Math.max(pad.t + 8, dy - 4)}
                              textAnchor="middle"
                              fontSize="8.5"
                              className="fill-tool-accent font-mono"
                            >
                              {d}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* avg line */}
                    {stats.avg > 0 && (
                      <g>
                        <line
                          x1={pad.l}
                          x2={W - pad.r}
                          y1={yScale(stats.avg)}
                          y2={yScale(stats.avg)}
                          stroke="#34d399"
                          strokeWidth="1.5"
                          strokeDasharray="6 4"
                        />
                        <rect
                          x={W - pad.r - 50}
                          y={yScale(stats.avg) - 14}
                          width={48}
                          height={12}
                          rx={3}
                          fill="#34d399"
                          fillOpacity="0.15"
                          stroke="#34d399"
                          strokeOpacity="0.6"
                        />
                        <text
                          x={W - pad.r - 26}
                          y={yScale(stats.avg) - 5}
                          textAnchor="middle"
                          fontSize="8.5"
                          fill="#34d399"
                          className="font-mono"
                        >
                          avg {stats.avg.toFixed(1)}
                        </text>
                      </g>
                    )}
                    {/* median line */}
                    {median > 0 && (
                      <g>
                        <line
                          x1={pad.l}
                          x2={W - pad.r}
                          y1={yScale(median)}
                          y2={yScale(median)}
                          stroke="#fbbf24"
                          strokeWidth="1.25"
                          strokeDasharray="2 3"
                        />
                        <text
                          x={pad.l + 4}
                          y={yScale(median) - 4}
                          fontSize="8.5"
                          fill="#fbbf24"
                          className="font-mono"
                        >
                          med {median.toFixed(1)}
                        </text>
                      </g>
                    )}
                  </svg>
                );
              })()
            )}
          </div>
        </section>

        {/* Predicted next-sprint capacity chip + sub-tab state buttons */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-tool-accent">
            <span className="text-[0.55rem] uppercase tracking-[0.2em] opacity-80">
              Predicted next sprint
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {stats.low.toFixed(0)}–{stats.high.toFixed(0)} pts
            </span>
            <span className="text-[0.6rem] opacity-70">
              best {stats.avg.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TabButton active={tab === "ledger"} onClick={() => setTab("ledger")}>
              Story-point ledger
            </TabButton>
            <TabButton active={tab === "burndown"} onClick={() => setTab("burndown")}>
              Burndown overlay
            </TabButton>
          </div>
        </div>

        {/* Two-column: ledger or burndown + analysis */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_1fr]">
          {tab === "ledger" ? (
            <ToolCard title="Story-point ledger" subtitle="Per sprint">
              <div className="-mt-2 mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[0.65rem] font-medium text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Spillover {spilloverTotal.toFixed(0)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Overflow +{overflowTotal.toFixed(0)}
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-app">
                <div className="grid grid-cols-[64px_minmax(70px,0.9fr)_minmax(70px,0.9fr)_minmax(80px,1fr)_minmax(110px,1.4fr)_36px] gap-px bg-app text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                  <div className="bg-app-elevated px-3 py-2">Sprint</div>
                  <div className="bg-app-elevated px-3 py-2 text-right">
                    Committed
                  </div>
                  <div className="bg-app-elevated px-3 py-2 text-right">
                    Completed
                  </div>
                  <div className="bg-app-elevated px-3 py-2 text-right">
                    Δ Spillover
                  </div>
                  <div className="bg-app-elevated px-3 py-2">Visual</div>
                  <div className="bg-app-elevated" />
                </div>

                {sprints.map((s) => {
                  const c = parseFloat(s.committed) || 0;
                  const d = parseFloat(s.completed) || 0;
                  const delta = c - d; // positive = spillover, negative = overflow
                  const deltaTone =
                    delta > 0
                      ? "text-rose-400"
                      : delta < 0
                      ? "text-emerald-400"
                      : "text-muted";
                  const cWidth = stats.max > 0 ? (c / stats.max) * 100 : 0;
                  const dWidth = stats.max > 0 ? (d / stats.max) * 100 : 0;
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[64px_minmax(70px,0.9fr)_minmax(70px,0.9fr)_minmax(80px,1fr)_minmax(110px,1.4fr)_36px] gap-px border-t border-app bg-app-elevated transition-colors hover:bg-app"
                    >
                      <input
                        type="text"
                        value={s.number}
                        onChange={(e) =>
                          update(s.id, { number: e.target.value })
                        }
                        placeholder="#"
                        className="bg-transparent px-3 py-2 font-mono text-sm text-app placeholder:text-muted focus:outline-none"
                      />
                      <input
                        type="number"
                        value={s.committed}
                        onChange={(e) =>
                          update(s.id, { committed: e.target.value })
                        }
                        placeholder="0"
                        min="0"
                        className="bg-transparent px-3 py-2 text-right font-mono text-sm text-app placeholder:text-muted focus:outline-none"
                      />
                      <input
                        type="number"
                        value={s.completed}
                        onChange={(e) =>
                          update(s.id, { completed: e.target.value })
                        }
                        placeholder="0"
                        min="0"
                        className="bg-transparent px-3 py-2 text-right font-mono text-sm text-tool-accent placeholder:text-muted focus:outline-none"
                      />
                      <div
                        className={`px-3 py-2 text-right font-mono text-sm tabular-nums ${deltaTone}`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(0)}
                      </div>
                      <div className="flex flex-col justify-center gap-1 px-3 py-2">
                        <div className="h-1.5 overflow-hidden rounded-full border border-app bg-app">
                          <div
                            className="h-full bg-app-elevated"
                            style={{ width: `${cWidth}%` }}
                          />
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full border border-app bg-app">
                          <div
                            className="h-full bg-tool-accent shadow-sm shadow-tool-accent/30"
                            style={{ width: `${dWidth}%` }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        className="text-muted transition-colors hover:text-rose-400"
                        aria-label="Remove sprint"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {sprints.length === 0 && (
                  <div className="border-t border-app bg-app-elevated p-6 text-center text-sm text-muted">
                    No sprints yet.
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[0.65rem] text-muted">
                  Spillover = committed − completed. Negative Δ means the team
                  pulled in extra work.
                </p>
                <button
                  type="button"
                  onClick={add}
                  className="inline-flex items-center gap-1.5 rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-[0.7rem] font-medium text-tool-accent transition-colors hover:bg-tool-accent/15"
                >
                  <span className="text-base leading-none">+</span> Sprint
                </button>
              </div>
            </ToolCard>
          ) : (
            <ToolCard
              title="Cumulative burndown overlay"
              subtitle="Committed vs delivered"
            >
              {sprints.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  Add sprints to render the burndown overlay.
                </div>
              ) : (
                (() => {
                  const H = 220;
                  const W = 720;
                  const pad = { l: 40, r: 20, t: 18, b: 28 };
                  const cumCommitted: number[] = [];
                  const cumCompleted: number[] = [];
                  let cc = 0,
                    cd = 0;
                  sprints.forEach((s) => {
                    cc += parseFloat(s.committed) || 0;
                    cd += parseFloat(s.completed) || 0;
                    cumCommitted.push(cc);
                    cumCompleted.push(cd);
                  });
                  const maxY = Math.max(...cumCommitted, ...cumCompleted, 1);
                  const innerW = W - pad.l - pad.r;
                  const innerH = H - pad.t - pad.b;
                  const xStep =
                    sprints.length > 1
                      ? innerW / (sprints.length - 1)
                      : innerW;
                  const y = (v: number) =>
                    pad.t + innerH - (v / maxY) * innerH;
                  const x = (i: number) =>
                    sprints.length === 1
                      ? pad.l + innerW / 2
                      : pad.l + i * xStep;
                  const pathFor = (arr: number[]) =>
                    arr
                      .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`)
                      .join(" ");
                  const areaFor = (arr: number[]) => {
                    if (arr.length === 0) return "";
                    const top = arr
                      .map(
                        (v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`
                      )
                      .join(" ");
                    return `${top} L ${x(arr.length - 1)} ${pad.t + innerH} L ${x(0)} ${pad.t + innerH} Z`;
                  };
                  const gridSteps = 4;
                  const gap =
                    cumCommitted[cumCommitted.length - 1] -
                    cumCompleted[cumCompleted.length - 1];
                  return (
                    <>
                      <svg
                        viewBox={`0 0 ${W} ${H}`}
                        className="h-auto w-full overflow-visible"
                        role="img"
                        aria-label="Cumulative burndown overlay"
                      >
                        <defs>
                          <linearGradient
                            id="completedFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="currentColor"
                              stopOpacity="0.18"
                              className="text-tool-accent"
                            />
                            <stop
                              offset="100%"
                              stopColor="currentColor"
                              stopOpacity="0"
                              className="text-tool-accent"
                            />
                          </linearGradient>
                        </defs>
                        {/* grid */}
                        {Array.from({ length: gridSteps + 1 }).map((_, i) => {
                          const v = (maxY / gridSteps) * i;
                          const yy = y(v);
                          return (
                            <g key={i}>
                              <line
                                x1={pad.l}
                                x2={W - pad.r}
                                y1={yy}
                                y2={yy}
                                stroke="currentColor"
                                strokeOpacity="0.12"
                                strokeDasharray="2 4"
                                className="text-app"
                              />
                              <text
                                x={pad.l - 6}
                                y={yy + 3}
                                textAnchor="end"
                                fontSize="9"
                                fill="currentColor"
                                className="text-muted"
                              >
                                {v.toFixed(0)}
                              </text>
                            </g>
                          );
                        })}
                        {/* axes */}
                        <line
                          x1={pad.l}
                          x2={W - pad.r}
                          y1={pad.t + innerH}
                          y2={pad.t + innerH}
                          stroke="currentColor"
                          strokeOpacity="0.3"
                          className="text-app"
                        />
                        <line
                          x1={pad.l}
                          x2={pad.l}
                          y1={pad.t}
                          y2={pad.t + innerH}
                          stroke="currentColor"
                          strokeOpacity="0.3"
                          className="text-app"
                        />
                        {/* completed area */}
                        <path
                          d={areaFor(cumCompleted)}
                          fill="url(#completedFill)"
                        />
                        {/* committed dashed */}
                        <path
                          d={pathFor(cumCommitted)}
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.55"
                          strokeWidth="1.75"
                          strokeDasharray="5 4"
                          className="text-app"
                        />
                        {/* completed solid */}
                        <path
                          d={pathFor(cumCompleted)}
                          fill="none"
                          className="stroke-tool-accent"
                          strokeWidth="2.5"
                        />
                        {/* points */}
                        {cumCompleted.map((v, i) => (
                          <circle
                            key={`d-${i}`}
                            cx={x(i)}
                            cy={y(v)}
                            r="3.5"
                            className="fill-tool-accent"
                            stroke="white"
                            strokeOpacity="0.6"
                            strokeWidth="0.75"
                          />
                        ))}
                        {cumCommitted.map((v, i) => (
                          <circle
                            key={`c-${i}`}
                            cx={x(i)}
                            cy={y(v)}
                            r="2.5"
                            fill="currentColor"
                            fillOpacity="0.55"
                            className="text-app"
                          />
                        ))}
                        {/* x labels */}
                        {sprints.map((s, i) => (
                          <text
                            key={s.id}
                            x={x(i)}
                            y={pad.t + innerH + 14}
                            textAnchor="middle"
                            fontSize="9"
                            fill="currentColor"
                            className="text-muted"
                          >
                            S{s.number || i + 1}
                          </text>
                        ))}
                      </svg>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-app" />
                            Cumulative committed
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-0.5 w-6 bg-tool-accent" />
                            Cumulative completed
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.65rem] font-medium ${
                            gap > 0
                              ? "border-rose-400/30 bg-rose-500/10 text-rose-400"
                              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              gap > 0 ? "bg-rose-400" : "bg-emerald-400"
                            }`}
                          />
                          Gap{gap > 0 ? " " : " +"}
                          {(-gap).toFixed(0)} pts
                        </span>
                      </div>
                      <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">
                        Burndown overlay complements per-sprint velocity — it
                        shows whether cumulative delivery is keeping pace with
                        commitment. If the completed line flattens while the
                        committed keeps climbing, commit-load is outstripping
                        delivery.
                      </p>
                    </>
                  );
                })()
              )}
            </ToolCard>
          )}

          {/* Analysis column */}
          <ToolCard title="Analysis" subtitle="Computed">
            <div className="space-y-3">
              <div className="rounded-md border border-tool-accent/30 bg-tool-accent-soft p-4">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent/80">
                  Predicted next-sprint capacity
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                    {stats.low.toFixed(0)}–{stats.high.toFixed(0)}
                  </span>
                  <span className="text-xs text-secondary">
                    pts (avg ± 1σ)
                  </span>
                </div>
                <div className="mt-2 text-[0.65rem] text-muted">
                  Best estimate:{" "}
                  <span className="font-mono">{stats.avg.toFixed(1)}</span> pts.
                </div>
              </div>

              <Stat label="Average velocity" value={stats.avg.toFixed(1)} accent />
              <Stat
                label="Standard deviation"
                value={`± ${stats.stdev.toFixed(1)}`}
              />
              <Stat
                label="Commitment reliability"
                value={`${stats.reliability.toFixed(0)}%`}
              />
              <div className="rounded-md border border-app bg-app-elevated p-4">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Trend
                </div>
                <div
                  className={`mt-1.5 text-xl font-semibold tracking-tight ${trendColor}`}
                >
                  {trendLabel}
                  <span className="ml-2 text-sm font-normal text-secondary">
                    {stats.trend > 0 ? "+" : ""}
                    {stats.trend.toFixed(2)} / sprint
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-app bg-app-elevated p-4 text-xs leading-relaxed text-secondary">
              <p className="font-medium text-app">How to read this</p>
              <p className="mt-1.5">
                Predicted range uses one standard deviation, so roughly 68% of
                well-behaved teams land inside it. If stdev is high, your team
                either has outliers (a bad sprint) or inconsistent scoping.
              </p>
              <p className="mt-2">
                Reliability above 90% plus a flat trend is what you want. Rapid
                growth in velocity usually means re-scoring, not productivity
                gains.
              </p>
            </div>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
