"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

const LS_KEY = "solutions:rule-of-40:v1";

type MarginKind = "fcf" | "ebitda";

interface State {
  growth: string;
  margin: string;
  marginKind: MarginKind;
}

const defaultState: State = {
  growth: "35",
  margin: "10",
  marginKind: "fcf",
};

// Public SaaS peer data (approximate trailing TTM, Q4 2024 earnings).
// Source: company 10-Qs/10-Ks via Meritech / Clouded Judgement Q4 2024.
// growth = revenue YoY %, margin = FCF margin %. Used for quadrant chart.
const BENCHMARKS: { name: string; growth: number; margin: number; note: string }[] = [
  { name: "Snowflake", growth: 28, margin: 34, note: "Hyper-growth + strong FCF" },
  { name: "CrowdStrike", growth: 29, margin: 26, note: "Best-in-class" },
  { name: "ServiceNow", growth: 22, margin: 32, note: "Durable compounder" },
  { name: "Datadog", growth: 26, margin: 28, note: "Developer platform" },
  { name: "Cloudflare", growth: 28, margin: 12, note: "Infra growth" },
  { name: "Zscaler", growth: 26, margin: 23, note: "Security growth" },
  { name: "HubSpot", growth: 21, margin: 18, note: "SMB marketing" },
  { name: "MongoDB", growth: 22, margin: 8, note: "DBaaS" },
  { name: "Salesforce", growth: 9, margin: 32, note: "Mature SaaS cash machine" },
  { name: "Zoom", growth: 3, margin: 35, note: "Margin over growth" },
  { name: "Okta", growth: 12, margin: 19, note: "Recovering" },
  { name: "Box", growth: 5, margin: 25, note: "Slow & steady" },
];

function verdict(score: number): {
  label: string;
  band: "world" | "strong" | "average" | "weak" | "losing";
} {
  if (score >= 60) return { label: "World-class", band: "world" };
  if (score >= 40) return { label: "Strong", band: "strong" };
  if (score >= 20) return { label: "Average", band: "average" };
  if (score >= 0) return { label: "Weak", band: "weak" };
  return { label: "Losing ground", band: "losing" };
}

const fieldInput =
  "w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

function FinanceField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="text-[0.55rem] italic text-muted">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

// Sub-tab style "state buttons" for switching analysis views.
type AnalysisTab = "peers" | "table";

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

export default function RuleOf40Page() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("peers");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {}
    const shared = readShareState<State>();
    if (shared) setState({ ...defaultState, ...shared });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const { growthN, marginN, score, v } = useMemo(() => {
    const g = parseFloat(state.growth) || 0;
    const m = parseFloat(state.margin) || 0;
    const s = g + m;
    return { growthN: g, marginN: m, score: s, v: verdict(s) };
  }, [state]);

  const healthy = score >= 40;
  const bandClasses = healthy
    ? {
        text: "text-tool-accent",
        chip: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
        dot: "bg-tool-accent",
        fill: "bg-tool-accent",
        fillSoft: "bg-tool-accent/55",
        border: "border-tool-accent/25",
      }
    : v.band === "losing"
      ? {
          text: "text-rose-500",
          chip: "bg-rose-500/10 text-rose-500 border-rose-500/30",
          dot: "bg-rose-500 animate-pulse",
          fill: "bg-rose-500",
          fillSoft: "bg-rose-500/55",
          border: "border-rose-500/30",
        }
      : {
          text: "text-amber-500",
          chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
          dot: "bg-amber-500",
          fill: "bg-amber-500",
          fillSoft: "bg-amber-500/55",
          border: "border-amber-500/30",
        };

  // Stacked-bar contributions on a 60-point scale for visual headroom above 40.
  const STACK_MAX = 60;
  const stackPos = (val: number) =>
    Math.max(0, Math.min(100, (val / STACK_MAX) * 100));
  const growthStack = stackPos(Math.max(0, growthN));
  const marginPosStack = stackPos(Math.max(0, marginN));
  const marginNegStack = stackPos(Math.max(0, -marginN));
  const thresholdPct = (40 / STACK_MAX) * 100;
  const growthShare =
    Math.max(0, growthN) + Math.max(0, marginN) === 0
      ? 0
      : Math.max(0, growthN) / (Math.max(0, growthN) + Math.max(0, marginN));
  const marginShare = 1 - growthShare;

  // Peer percentile: where the user's R40 sits in the sorted peer set.
  const peerScores = useMemo(
    () => BENCHMARKS.map((b) => b.growth + b.margin).sort((a, b) => a - b),
    []
  );
  const userPercentile = useMemo(() => {
    const below = peerScores.filter((s) => s <= score).length;
    return Math.round((below / peerScores.length) * 100);
  }, [peerScores, score]);

  const asOfStamp = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  return (
    <ToolShell
      category="Finance"
      title="Rule of 40 Calculator"
      description="The classic SaaS health check: growth rate plus profitability margin. Benchmarks included."
    >
      <div
        data-tool-theme="finance"
        data-tool="rule-of-40"
        className="space-y-6 text-app"
      >
        {/* Tool hero */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · SaaS health
              </div>
              <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
                Rule of 40
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                Growth + margin should clear 40. The line between premium SaaS and the rest.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>
        </header>

        {/* Combined-score hero — Growth% + Margin% with verdict pill + stacked bar */}
        <section
          className={`relative overflow-hidden rounded-2xl border bg-tool-surface px-6 py-7 shadow-sm ${bandClasses.border}`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "100% 2.25rem",
            }}
          />

          <div className="relative flex flex-wrap items-end justify-between gap-6">
            {/* Combined score: Growth% + Margin% = total */}
            <div>
              <div className="mb-3 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Combined score · Growth + Margin
              </div>
              <div className="flex items-baseline gap-3">
                <span className={`font-tool-heading text-7xl font-semibold tabular-nums leading-none tracking-tight sm:text-8xl ${bandClasses.text}`}>
                  {score.toFixed(0)}
                </span>
                <span className="font-mono text-2xl tabular-nums text-muted">
                  / 40
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] ${bandClasses.chip}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
                  {v.label}
                </span>
                <span className="font-mono text-[0.65rem] tabular-nums text-secondary">
                  {growthN.toFixed(1)}%
                  <span className="text-muted"> growth</span>
                  {" + "}
                  {marginN.toFixed(1)}%
                  <span className="text-muted"> {state.marginKind === "fcf" ? "FCF" : "EBITDA"}</span>
                </span>
              </div>
            </div>

            {/* Mini ledger: top-line numbers */}
            <div className="grid w-full max-w-sm grid-cols-3 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:w-auto">
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Growth
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {growthN.toFixed(1)}%
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Margin
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {marginN.toFixed(1)}%
                </div>
              </div>
              <div className="bg-app-elevated p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  R40
                </div>
                <div className={`mt-1 tabular-nums font-semibold ${bandClasses.text}`}>
                  {score.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Stacked bar: growth + margin contributions on 0..60 scale with 40 marker */}
          <div className="relative mt-7">
            <div className="mb-1.5 flex items-baseline justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span>Stacked composition</span>
              <span className="tabular-nums text-secondary">
                0 — 40 — 60+
              </span>
            </div>
            <div className="relative h-6 overflow-hidden rounded-full border border-app bg-app">
              {/* Margin (negative) sits on the left, anchored to zero */}
              {marginN < 0 && (
                <div
                  className="absolute top-0 h-full bg-rose-500/55"
                  style={{ width: `${marginNegStack}%`, left: 0 }}
                  title={`Margin drag: ${marginN.toFixed(1)}%`}
                />
              )}
              {/* Growth contribution */}
              <div
                className="absolute left-0 top-0 h-full bg-tool-accent transition-all"
                style={{ width: `${growthStack}%` }}
                title={`Growth: ${growthN.toFixed(1)}%`}
              />
              {/* Margin (positive) stacked after growth */}
              {marginN > 0 && (
                <div
                  className="absolute top-0 h-full bg-tool-accent/55 transition-all"
                  style={{
                    width: `${marginPosStack}%`,
                    left: `${growthStack}%`,
                  }}
                  title={`Margin: ${marginN.toFixed(1)}%`}
                />
              )}
              {/* 40 threshold marker */}
              <div
                className="absolute top-0 h-full w-px bg-app-elevated"
                style={{ left: `${thresholdPct}%` }}
              />
              <div
                className="absolute -top-1 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent"
                style={{ left: `${thresholdPct}%`, top: "-1.1rem" }}
              >
                40
              </div>
            </div>

            {/* Legend + share split */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" />
                Growth · {(growthShare * 100).toFixed(0)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent/55" />
                Margin · {(marginShare * 100).toFixed(0)}%
              </span>
              {marginN < 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/55" />
                  Margin drag
                </span>
              )}
              <span className="ml-auto text-secondary">
                {healthy ? (
                  <>
                    Above the 40 line. Premium SaaS multiples live here.
                  </>
                ) : score >= 20 ? (
                  <>
                    Below the bar — push growth or margin without breaking the other.
                  </>
                ) : score >= 0 ? (
                  <span className="text-amber-500">
                    Both levers underperforming.
                  </span>
                ) : (
                  <span className="text-rose-500">
                    Burning growth and margin together.
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Inputs + analysis grid */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* Inputs */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  01 · Inputs
                </div>
                <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                  Company numbers
                </h2>
              </div>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                TTM
              </span>
            </div>
            <div className="space-y-4">
              <FinanceField label="Revenue growth YoY" hint="%">
                <div className="relative">
                  <input
                    type="number"
                    value={state.growth}
                    onChange={(e) => setState((s) => ({ ...s, growth: e.target.value }))}
                    className={fieldInput + " pr-7"}
                    step="1"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    %
                  </span>
                </div>
              </FinanceField>

              <div>
                <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Margin type
                </div>
                <div className="flex gap-2">
                  {(["fcf", "ebitda"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setState((s) => ({ ...s, marginKind: k }))}
                      className={`flex-1 rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
                        state.marginKind === k
                          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
                      }`}
                    >
                      {k === "fcf" ? "FCF margin" : "EBITDA margin"}
                    </button>
                  ))}
                </div>
              </div>

              <FinanceField
                label={`${state.marginKind === "fcf" ? "FCF" : "EBITDA"} margin`}
                hint="can be negative"
              >
                <div className="relative">
                  <input
                    type="number"
                    value={state.margin}
                    onChange={(e) => setState((s) => ({ ...s, margin: e.target.value }))}
                    className={fieldInput + " pr-7"}
                    step="1"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                    %
                  </span>
                </div>
              </FinanceField>

              {/* Sum line */}
              <div className="flex items-center justify-between rounded-md border border-dashed border-app bg-app-elevated px-3 py-2 font-mono text-[0.7rem]">
                <span className="text-muted">Growth + margin</span>
                <span className={`tabular-nums font-semibold ${bandClasses.text}`}>
                  {score.toFixed(1)} {healthy ? "≥" : "<"} 40
                </span>
              </div>
            </div>
          </div>

          {/* Analysis (peer percentile + table) — sub-tabs as state buttons */}
          <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  02 · Peer analysis
                </div>
                <h2 className="mt-1 font-tool-heading text-base font-semibold tracking-tight text-app">
                  Public SaaS · Q4 2024
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <TabButton
                  active={analysisTab === "peers"}
                  onClick={() => setAnalysisTab("peers")}
                >
                  Percentile
                </TabButton>
                <TabButton
                  active={analysisTab === "table"}
                  onClick={() => setAnalysisTab("table")}
                >
                  Table
                </TabButton>
              </div>
            </div>

            {analysisTab === "peers" ? (
              <PeerPercentileChart
                peerScores={peerScores}
                userScore={score}
                userPercentile={userPercentile}
                bandClasses={bandClasses}
                benchmarks={BENCHMARKS}
              />
            ) : (
              <div className="overflow-hidden rounded-md border border-app">
                <table className="w-full font-mono text-xs">
                  <thead className="bg-app-elevated text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                        Company
                      </th>
                      <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                        Growth
                      </th>
                      <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                        Margin
                      </th>
                      <th className="px-3 py-2 text-right text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                        R40
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...BENCHMARKS]
                      .sort((a, b) => b.growth + b.margin - (a.growth + a.margin))
                      .map((b) => {
                        const r40 = b.growth + b.margin;
                        return (
                          <tr
                            key={b.name}
                            className="border-t border-app text-secondary"
                          >
                            <td className="px-3 py-2 font-sans font-medium text-app">
                              {b.name}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.growth}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.margin}%</td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                r40 >= 40 ? "text-tool-accent" : "text-muted"
                              }`}
                            >
                              {r40}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
              Source: company earnings (10-Q/10-K), Clouded Judgement Q4 2024 · TTM revenue growth & FCF margin
            </p>
          </div>
        </section>

        <p className="text-[0.65rem] leading-relaxed text-muted">
          Rule of 40 = revenue growth (%) + profitability margin (%). Above 40 is the bar public
          markets pay premium multiples for. FCF is the harder, cleaner test; EBITDA is the
          friendlier one.
        </p>
      </div>

      <ScenarioBar<State>
        slug="rule-of-40"
        state={state}
        onLoad={(d) => setState({ ...defaultState, ...d })}
        exports={{
          csv: () =>
            toCsv([
              ["Metric", "Value"],
              ["Growth %", growthN],
              ["Margin %", marginN],
              ["Rule of 40", score],
              ["Verdict", v.label],
              ["Peer percentile", userPercentile],
            ]),
          json: () => ({ state, score, verdict: v.label, percentile: userPercentile }),
          markdown: () =>
            `# Rule of 40\n\n- Growth: ${growthN.toFixed(1)}%\n- ${state.marginKind.toUpperCase()} margin: ${marginN.toFixed(1)}%\n- **Score: ${score.toFixed(1)}** (${v.label})\n- Peer percentile: P${userPercentile}\n`,
        }}
      />
    </ToolShell>
  );
}

// Percentile-vs-peers chart — horizontal track of all peer scores plus
// the user's marker, with the 40 threshold called out and a percentile chip.
function PeerPercentileChart({
  peerScores,
  userScore,
  userPercentile,
  bandClasses,
  benchmarks,
}: {
  peerScores: number[];
  userScore: number;
  userPercentile: number;
  bandClasses: { text: string; chip: string; dot: string; fill: string };
  benchmarks: { name: string; growth: number; margin: number }[];
}) {
  const lo = Math.min(0, peerScores[0] ?? 0, userScore);
  const hi = Math.max(80, peerScores[peerScores.length - 1] ?? 80, userScore);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          Where you sit vs {peerScores.length} listed peers
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] ${bandClasses.chip}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${bandClasses.dot}`} />
          P{userPercentile}
        </span>
      </div>

      {/* Percentile track */}
      <div className="relative h-14">
        {/* Baseline track */}
        <div className="absolute inset-x-0 top-7 h-1 rounded-full bg-app" />
        {/* Healthy zone (>=40) */}
        <div
          className="absolute top-7 h-1 rounded-r-full bg-tool-accent/30"
          style={{ left: `${pos(40)}%`, right: 0 }}
        />
        {/* 40 threshold marker */}
        <div
          className="absolute top-3 h-9 w-px bg-tool-accent/60"
          style={{ left: `${pos(40)}%` }}
        />
        <div
          className="absolute top-0 -translate-x-1/2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent"
          style={{ left: `${pos(40)}%` }}
        >
          R40
        </div>
        {/* Peer dots */}
        {benchmarks.map((b) => {
          const score = b.growth + b.margin;
          const isHealthy = score >= 40;
          return (
            <div
              key={b.name}
              title={`${b.name}: ${score} (G ${b.growth}% / M ${b.margin}%)`}
              className={`absolute top-7 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                isHealthy ? "bg-tool-accent/70" : "bg-app-elevated border border-app"
              }`}
              style={{ left: `${pos(score)}%` }}
            />
          );
        })}
        {/* User marker */}
        <div
          className={`absolute top-7 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${bandClasses.fill} ring-4 ring-app shadow`}
          style={{ left: `${pos(userScore)}%` }}
          title={`You: ${userScore.toFixed(1)}`}
        />
        <div
          className={`absolute top-11 -translate-x-1/2 whitespace-nowrap font-mono text-[0.6rem] font-semibold ${bandClasses.text}`}
          style={{ left: `${pos(userScore)}%` }}
        >
          You · {userScore.toFixed(0)}
        </div>
        {/* Endpoints */}
        <div className="absolute -bottom-3 left-0 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {lo.toFixed(0)}
        </div>
        <div className="absolute -bottom-3 right-0 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {hi.toFixed(0)}
        </div>
      </div>

      {/* Histogram of peer scores in 8 bins */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          <span>Peer distribution</span>
          <span className="tabular-nums text-secondary">
            {peerScores.filter((s) => s >= 40).length}/{peerScores.length} above 40
          </span>
        </div>
        {(() => {
          const bins = 8;
          const binW = span / bins;
          const counts = new Array(bins).fill(0);
          for (const s of peerScores) {
            const idx = Math.min(bins - 1, Math.max(0, Math.floor((s - lo) / binW)));
            counts[idx]++;
          }
          const peak = Math.max(...counts, 1);
          const userBin = Math.min(
            bins - 1,
            Math.max(0, Math.floor((userScore - lo) / binW))
          );
          return (
            <div className="flex h-16 items-end gap-1 rounded-md border border-app bg-app-elevated p-2">
              {counts.map((c, i) => {
                const binStart = lo + i * binW;
                const isHealthyBin = binStart + binW / 2 >= 40;
                const isUserBin = i === userBin;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t transition-colors ${
                      isUserBin
                        ? bandClasses.fill
                        : isHealthyBin
                          ? "bg-tool-accent/45"
                          : "bg-app"
                    }`}
                    style={{ height: `${(c / peak) * 100}%`, minHeight: c > 0 ? "4px" : 0 }}
                    title={`${binStart.toFixed(0)}–${(binStart + binW).toFixed(0)}: ${c} peers`}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
