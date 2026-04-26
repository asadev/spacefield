"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface Round {
  id: string;
  name: string;
  pre: string;
  raise: string;
  pool: string; // % post
  timing: "pre" | "post";
}

const LS_KEY = "solutions:venture-dilution-modeler:v1";

interface Holder {
  id: string;
  name: string;
  shares: number; // existing shares pre-round
}

interface State {
  preMoney: string;
  raise: string;
  optionPoolPct: string;
  optionPoolTiming: "pre" | "post";
  existingShares: string; // total existing shares (pre new pool)
  holders: Holder[];
}

const uid = () => Math.random().toString(36).slice(2, 9);

const defaultState: State = {
  preMoney: "20000000",
  raise: "5000000",
  optionPoolPct: "10",
  optionPoolTiming: "pre",
  existingShares: "8000000",
  holders: [
    { id: uid(), name: "Founder A", shares: 4000000 },
    { id: uid(), name: "Founder B", shares: 3000000 },
    { id: uid(), name: "Seed Investors", shares: 1000000 },
  ],
};

const DEFAULT_ROUNDS: Round[] = [
  { id: "r1", name: "Seed", pre: "8000000", raise: "2000000", pool: "12", timing: "pre" },
  { id: "r2", name: "Series A", pre: "30000000", raise: "8000000", pool: "10", timing: "pre" },
  { id: "r3", name: "Series B", pre: "100000000", raise: "25000000", pool: "8", timing: "pre" },
  { id: "r4", name: "Series C", pre: "300000000", raise: "60000000", pool: "5", timing: "pre" },
];

// Ledger-style input — finance theme, tabular numbers for column alignment.
// Foundation tokens only (border-app, bg-surface, text-app, etc.) — no dark: duals.
const ledgerInput =
  "w-full rounded-md border border-app bg-surface px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

const ledgerSelect = ledgerInput;

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
          <span className="text-[0.55rem] italic text-faint">
            {hint}
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

export default function VentureDilutionPage() {
  const [state, setState] = useState<State>(defaultState);
  const [rounds, setRounds] = useState<Round[]>(DEFAULT_ROUNDS);
  const [hydrated, setHydrated] = useState(false);
  // Round anchor — sub-tab state buttons (seed → A → B → C). Lets users
  // pin a snapshot to inspect, while the cap-table math below stays
  // global. Defaults to the latest round in the deck.
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.holders))
          setState({ ...defaultState, ...parsed });
      }
      const rawRounds = localStorage.getItem("solutions:venture-dilution:rounds:v1");
      if (rawRounds) {
        const parsedR = JSON.parse(rawRounds);
        if (Array.isArray(parsedR)) setRounds(parsedR);
      }
    } catch {}
    const shared = readShareState<State & { rounds?: Round[] }>();
    if (shared) {
      setState({ ...defaultState, ...shared });
      if (shared.rounds) setRounds(shared.rounds);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        "solutions:venture-dilution:rounds:v1",
        JSON.stringify(rounds)
      );
    } catch {}
  }, [rounds, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const model = useMemo(() => {
    const preMoney = parseFloat(state.preMoney) || 0;
    const raise = parseFloat(state.raise) || 0;
    const poolPct = (parseFloat(state.optionPoolPct) || 0) / 100;
    const existing = parseFloat(state.existingShares) || 0;
    const postMoney = preMoney + raise;

    // Price per share: preMoney / (existing + pre-money option pool top-up) if pool is "pre"
    // Canonical: if pool added pre-money, founders bear the dilution.
    // Post-money fully diluted share count = existing + newPoolShares + investorShares
    // Pool is poolPct of POST-money fully diluted.
    // investor ownership = raise / postMoney
    const investorPct = postMoney > 0 ? raise / postMoney : 0;

    let newPoolShares: number;
    let investorShares: number;
    let pricePerShare: number;
    let existingOut = existing;

    if (state.optionPoolTiming === "pre") {
      // Solve so: newPool / (existing + newPool + investorShares) = poolPct
      // investorShares = (existing + newPool) * investorPct / (1 - investorPct)
      // After some algebra using the standard method:
      // fullyDiluted = existing / (1 - investorPct - poolPct)
      const denom = 1 - investorPct - poolPct;
      const fd = denom > 0 ? existing / denom : 0;
      newPoolShares = fd * poolPct;
      investorShares = fd * investorPct;
      pricePerShare = fd > 0 ? postMoney / fd : 0;
    } else {
      // Pool added post-money: investors + existing bear dilution proportionally.
      // fullyDiluted = (existing + investorShares) / (1 - poolPct)
      // investorShares = fullyDiluted * investorPct
      // => fullyDiluted = existing / ((1 - poolPct) - investorPct)
      const denom = 1 - poolPct - investorPct;
      const fd = denom > 0 ? existing / denom : 0;
      newPoolShares = fd * poolPct;
      investorShares = fd * investorPct;
      pricePerShare = fd > 0 ? postMoney / fd : 0;
    }

    const fullyDiluted = existingOut + newPoolShares + investorShares;

    // Pre-round holder % = holder.shares / existing
    // Post-round holder % = holder.shares / fullyDiluted
    const holderBreakdown = state.holders.map((h) => {
      const preShare = existing > 0 ? h.shares / existing : 0;
      const postShare = fullyDiluted > 0 ? h.shares / fullyDiluted : 0;
      const dilution = preShare > 0 ? (preShare - postShare) / preShare : 0;
      return {
        ...h,
        preShare,
        postShare,
        dilution,
      };
    });

    return {
      preMoney,
      postMoney,
      investorPct,
      investorShares,
      newPoolShares,
      pricePerShare,
      fullyDiluted,
      holderBreakdown,
      poolPct,
    };
  }, [state]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const fmtCompact = (n: number) => {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const addHolder = () => {
    setState((s) => ({
      ...s,
      holders: [...s.holders, { id: uid(), name: "New holder", shares: 0 }],
    }));
  };
  const updateHolder = (id: string, patch: Partial<Holder>) =>
    setState((s) => ({
      ...s,
      holders: s.holders.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  const removeHolder = (id: string) =>
    setState((s) => ({ ...s, holders: s.holders.filter((h) => h.id !== id) }));

  // Multi-round simulation — produced once, consumed by waterfall + summary table.
  const roundResults = useMemo(() => {
    let founderPct = 1;
    let cumulativeInvestorPct = 0;
    let cumulativePoolPct = 0;
    const results: {
      id: string;
      name: string;
      founder: number;
      investor: number;
      pool: number;
      post: number;
      pre: number;
      raise: number;
      poolPct: number;
      timing: "pre" | "post";
      founderDilution: number;
    }[] = [];
    let prevFounder = 1;
    for (const r of rounds) {
      const pre = parseFloat(r.pre) || 0;
      const raise = parseFloat(r.raise) || 0;
      const post = pre + raise;
      const inv = post > 0 ? raise / post : 0;
      const pool = (parseFloat(r.pool) || 0) / 100;
      const dilutionToFounders = r.timing === "pre" ? inv + pool : inv;
      prevFounder = founderPct;
      founderPct = founderPct * (1 - dilutionToFounders);
      cumulativeInvestorPct =
        cumulativeInvestorPct * (1 - dilutionToFounders) + inv;
      cumulativePoolPct =
        cumulativePoolPct * (1 - dilutionToFounders) + pool;
      const founderDilution =
        prevFounder > 0 ? (prevFounder - founderPct) / prevFounder : 0;
      results.push({
        id: r.id,
        name: r.name,
        founder: founderPct,
        investor: cumulativeInvestorPct,
        pool: cumulativePoolPct,
        post,
        pre,
        raise,
        poolPct: pool,
        timing: r.timing,
        founderDilution,
      });
    }
    return results;
  }, [rounds]);

  // Resolve the "active" round snapshot for the sub-tab anchor. Falls back
  // to the latest round when nothing is pinned (or the pinned round was
  // removed).
  const activeRound = useMemo(() => {
    if (!roundResults.length) return null;
    if (activeRoundId) {
      const found = roundResults.find((r) => r.id === activeRoundId);
      if (found) return found;
    }
    return roundResults[roundResults.length - 1];
  }, [roundResults, activeRoundId]);

  // Founder / investor / pool segments for current single-round model — used in pie hero.
  const founderShareNow = Math.max(
    0,
    1 - model.investorPct - model.poolPct
  );
  const pieSegments = [
    { label: "Founders + existing", value: founderShareNow, color: "var(--tool-accent)" },
    { label: "New investors", value: model.investorPct, color: "color-mix(in srgb, var(--tool-accent) 55%, white 45%)" },
    { label: "Option pool", value: model.poolPct, color: "color-mix(in srgb, var(--tool-accent) 25%, white 75%)" },
  ];

  // Pie geometry (donut). 360° split by segment values.
  const pieRadius = 64;
  const pieStroke = 22;
  const pieCirc = 2 * Math.PI * pieRadius;
  let pieOffset = 0;

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
      title="Venture Dilution Modeler"
      description="See the cap table after a priced round. Includes the option-pool shuffle — the one where founders silently eat the pool."
    >
      <div
        data-tool-theme="finance"
        data-tool="venture-dilution-modeler"
        className="space-y-6 text-app"
      >
        {/* ─── Hero: ownership pie + headline stats ─────────────────────── */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-6 shadow-card">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                Finance · Cap Table
              </div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-app">
                Post-round ownership
              </h1>
              <p className="mt-1 max-w-xl text-sm text-secondary">
                The option-pool shuffle, made visible. Founders absorb the top-up under the market norm.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-surface px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              As of {asOfStamp}
            </div>
          </div>

          {/* Pie + KPI strip */}
          <div className="relative mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[auto_1fr]">
            {/* Donut pie */}
            <div className="flex items-center justify-center rounded-xl border border-app bg-surface p-5">
              <div className="relative">
                <svg
                  width={pieRadius * 2 + pieStroke}
                  height={pieRadius * 2 + pieStroke}
                  viewBox={`0 0 ${pieRadius * 2 + pieStroke} ${pieRadius * 2 + pieStroke}`}
                  aria-label="Ownership donut chart"
                  className="-rotate-90"
                >
                  <circle
                    cx={pieRadius + pieStroke / 2}
                    cy={pieRadius + pieStroke / 2}
                    r={pieRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.06"
                    strokeWidth={pieStroke}
                  />
                  {pieSegments.map((seg, i) => {
                    const len = seg.value * pieCirc;
                    const dasharray = `${len} ${pieCirc - len}`;
                    const dashoffset = -pieOffset;
                    pieOffset += len;
                    return (
                      <circle
                        key={i}
                        cx={pieRadius + pieStroke / 2}
                        cy={pieRadius + pieStroke / 2}
                        r={pieRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={pieStroke}
                        strokeDasharray={dasharray}
                        strokeDashoffset={dashoffset}
                        strokeLinecap="butt"
                      />
                    );
                  })}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-mono text-[0.5rem] uppercase tracking-[0.22em] text-faint">
                    Founder
                  </div>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-tool-accent">
                    {(founderShareNow * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* KPI stat strip + legend */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-surface font-mono text-sm sm:grid-cols-4">
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                    Post-money
                  </div>
                  <div className="mt-1 text-lg tabular-nums text-tool-accent">
                    {fmtCompact(model.postMoney)}
                  </div>
                </div>
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                    Investor %
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {(model.investorPct * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                    Pool %
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    {(model.poolPct * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="bg-tool-surface p-3">
                  <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                    Price / share
                  </div>
                  <div className="mt-1 tabular-nums text-app">
                    ${model.pricePerShare.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-app bg-surface px-3 py-2 text-xs">
                {pieSegments.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: seg.color }}
                    />
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                      {seg.label}
                    </span>
                    <span className="font-mono text-[0.7rem] tabular-nums text-app">
                      {(seg.value * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
                <div className="ml-auto flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Fully diluted ·
                  <span className="font-mono tabular-nums text-secondary">
                    {model.fullyDiluted.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  shares
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ─── Working surface: round terms + post-round cap table ───────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
          {/* Round terms ledger */}
          <section className="relative overflow-hidden rounded-xl border border-app bg-tool-surface p-5">
            <header className="mb-4 flex items-baseline justify-between">
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Round terms
                </div>
                <h2 className="mt-1 font-mono text-base font-semibold tracking-tight text-app">
                  Pre-money · raise · pool
                </h2>
              </div>
            </header>

            <div className="space-y-4">
              <FinanceField label="Pre-money valuation ($)">
                <input
                  type="number"
                  value={state.preMoney}
                  onChange={(e) =>
                    setState((s) => ({ ...s, preMoney: e.target.value }))
                  }
                  className={ledgerInput}
                  min="0"
                  step="100000"
                />
              </FinanceField>
              <FinanceField label="Raise amount ($)">
                <input
                  type="number"
                  value={state.raise}
                  onChange={(e) =>
                    setState((s) => ({ ...s, raise: e.target.value }))
                  }
                  className={ledgerInput}
                  min="0"
                  step="100000"
                />
              </FinanceField>
              <FinanceField label="Option pool (% post)">
                <input
                  type="number"
                  value={state.optionPoolPct}
                  onChange={(e) =>
                    setState((s) => ({ ...s, optionPoolPct: e.target.value }))
                  }
                  className={ledgerInput}
                  min="0"
                  step="0.5"
                />
              </FinanceField>

              <div>
                <div className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Pool timing
                </div>
                <div className="flex gap-2">
                  {(["pre", "post"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() =>
                        setState((s) => ({ ...s, optionPoolTiming: k }))
                      }
                      className={`flex-1 rounded-md border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                        state.optionPoolTiming === k
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-surface text-muted hover:border-tool-accent/40 hover:text-app"
                      }`}
                    >
                      {k === "pre" ? "Pre · founders bear" : "Post · shared"}
                    </button>
                  ))}
                </div>
              </div>

              <FinanceField
                label="Existing shares outstanding"
                hint="Before new pool + investor"
              >
                <input
                  type="number"
                  value={state.existingShares}
                  onChange={(e) =>
                    setState((s) => ({ ...s, existingShares: e.target.value }))
                  }
                  className={ledgerInput}
                  min="0"
                  step="10000"
                />
              </FinanceField>

              <div className="pt-2">
                <div className="mb-2 text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Existing holders
                </div>
                <div className="space-y-2">
                  {state.holders.map((h) => (
                    <div
                      key={h.id}
                      className="grid grid-cols-[2fr_1.2fr_auto] gap-2"
                    >
                      <input
                        value={h.name}
                        onChange={(e) =>
                          updateHolder(h.id, { name: e.target.value })
                        }
                        className={ledgerInput}
                      />
                      <input
                        type="number"
                        value={h.shares}
                        onChange={(e) =>
                          updateHolder(h.id, {
                            shares: Number(e.target.value) || 0,
                          })
                        }
                        className={ledgerInput}
                      />
                      <button
                        onClick={() => removeHolder(h.id)}
                        className="rounded-md border border-app px-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-faint transition-colors hover:border-rose-400/40 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addHolder}
                    className="w-full rounded-md border border-dashed border-app bg-surface px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-tool-accent/50 hover:text-tool-accent"
                  >
                    + Add holder
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Post-round cap table */}
          <section className="relative overflow-hidden rounded-xl border border-app bg-tool-surface p-5">
            <header className="mb-4 flex items-baseline justify-between">
              <div>
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Post-round cap table
                </div>
                <h2 className="mt-1 font-mono text-base font-semibold tracking-tight text-app">
                  Fully diluted ledger
                </h2>
              </div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                {model.holderBreakdown.length + 2} rows
              </div>
            </header>

            <div className="overflow-hidden rounded-lg border border-app">
              <table className="w-full font-mono text-xs tabular-nums">
                <thead className="bg-surface text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Holder
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Pre %
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Post %
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Dilution
                    </th>
                  </tr>
                </thead>
                <tbody className="text-app">
                  {model.holderBreakdown.map((h) => (
                    <tr
                      key={h.id}
                      className="border-t border-app"
                    >
                      <td className="px-3 py-2 font-sans">{h.name}</td>
                      <td className="px-3 py-2 text-right text-muted">
                        {(h.preShare * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-app">
                        {(h.postShare * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-rose-500 dark:text-rose-300">
                        −{(h.dilution * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-app bg-tool-accent-soft">
                    <td className="px-3 py-2 font-sans text-tool-accent">
                      New investors
                    </td>
                    <td className="px-3 py-2 text-right text-faint">
                      —
                    </td>
                    <td className="px-3 py-2 text-right text-tool-accent">
                      {(model.investorPct * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                  <tr className="border-t border-app bg-tool-accent-soft/60">
                    <td className="px-3 py-2 font-sans text-tool-accent">
                      Option pool
                    </td>
                    <td className="px-3 py-2 text-right text-faint">
                      —
                    </td>
                    <td className="px-3 py-2 text-right text-tool-accent">
                      {(model.poolPct * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[0.65rem] italic text-muted">
              Pre-money pool timing is the market norm — founders absorb the
              top-up. Negotiate the pool size, not just the valuation.
            </p>
          </section>
        </div>

        {/* ─── Multi-round cap-table waterfall ───────────────────────────── */}
        <section className="relative overflow-hidden rounded-xl border border-app bg-tool-surface p-5">
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Cap-table waterfall
              </div>
              <h2 className="mt-1 font-mono text-base font-semibold tracking-tight text-app">
                Seed → A → B → C
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-secondary">
                Each column is a priced round. Stacked bars show ownership at
                that snapshot — founders shrink, investors stack, the pool
                refreshes per timing rule.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-app bg-surface px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {[
                { l: "Founder", c: "var(--tool-accent)" },
                { l: "Investor", c: "color-mix(in srgb, var(--tool-accent) 55%, white 45%)" },
                { l: "Pool", c: "color-mix(in srgb, var(--tool-accent) 25%, white 75%)" },
              ].map((s) => (
                <span key={s.l} className="flex items-center gap-1.5 font-mono">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: s.c }}
                  />
                  {s.l}
                </span>
              ))}
            </div>
          </header>

          {/* Round anchor sub-tabs — state buttons. Click to pin a snapshot. */}
          {roundResults.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                Snapshot
              </span>
              {roundResults.map((r) => {
                const isActive = activeRound?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setActiveRoundId(isActive ? null : r.id)
                    }
                    className={`rounded-md border px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                      isActive
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-surface text-muted hover:border-tool-accent/40 hover:text-app"
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Active snapshot detail strip — driven by sub-tab anchor */}
          {activeRound && (
            <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-surface font-mono text-sm sm:grid-cols-4">
              <div className="bg-tool-surface p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  {activeRound.name} · post-money
                </div>
                <div className="mt-1 tabular-nums text-tool-accent">
                  {fmtCompact(activeRound.post)}
                </div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  Founder %
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {(activeRound.founder * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  Investor %
                </div>
                <div className="mt-1 tabular-nums text-app">
                  {(activeRound.investor * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-tool-surface p-3">
                <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                  This-round dilution
                </div>
                <div className="mt-1 tabular-nums text-rose-500 dark:text-rose-300">
                  −{(activeRound.founderDilution * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Waterfall: bars grid */}
          {roundResults.length > 0 && (
            <div className="mb-5 overflow-hidden rounded-xl border border-app bg-surface p-4">
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `auto repeat(${roundResults.length}, minmax(0, 1fr))`,
                }}
              >
                {/* Y-axis labels */}
                <div className="flex h-44 flex-col justify-between py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  <span>100%</span>
                  <span>75%</span>
                  <span>50%</span>
                  <span>25%</span>
                  <span>0%</span>
                </div>

                {/* Bars */}
                {roundResults.map((r) => {
                  const founderH = Math.max(0, r.founder) * 100;
                  const investorH = Math.max(0, r.investor) * 100;
                  const poolH = Math.max(0, r.pool) * 100;
                  const isActive = activeRound?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setActiveRoundId(isActive ? null : r.id)
                      }
                      className="flex flex-col items-center gap-2 outline-none"
                      title={`${r.name} · founder ${(r.founder * 100).toFixed(1)}% · investor ${(r.investor * 100).toFixed(1)}% · pool ${(r.pool * 100).toFixed(1)}%`}
                    >
                      <div
                        className={`relative flex h-44 w-full max-w-[64px] flex-col justify-end overflow-hidden rounded-md border bg-surface transition-colors ${
                          isActive
                            ? "border-tool-accent ring-1 ring-tool-accent"
                            : "border-app hover:border-tool-accent/40"
                        }`}
                      >
                        {/* gridlines */}
                        {[25, 50, 75].map((g) => (
                          <span
                            key={g}
                            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-app"
                            style={{ bottom: `${g}%` }}
                          />
                        ))}
                        <div
                          className="w-full transition-all"
                          style={{
                            height: `${poolH}%`,
                            background:
                              "color-mix(in srgb, var(--tool-accent) 25%, white 75%)",
                          }}
                        />
                        <div
                          className="w-full transition-all"
                          style={{
                            height: `${investorH}%`,
                            background:
                              "color-mix(in srgb, var(--tool-accent) 55%, white 45%)",
                          }}
                        />
                        <div
                          className="w-full transition-all"
                          style={{
                            height: `${founderH}%`,
                            background: "var(--tool-accent)",
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-app">
                          {r.name}
                        </div>
                        <div className="font-mono text-[0.6rem] tabular-nums text-tool-accent">
                          {(r.founder * 100).toFixed(1)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Per-round chips: valuation + dilution */}
              <div
                className="mt-4 grid gap-2"
                style={{
                  gridTemplateColumns: `auto repeat(${roundResults.length}, minmax(0, 1fr))`,
                }}
              >
                <div />
                {roundResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="rounded-full border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                      {fmtCompact(r.post)} post
                    </span>
                    <span className="rounded-full border border-rose-300/30 bg-rose-500/[0.08] px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-rose-500 dark:text-rose-300">
                      −{(r.founderDilution * 100).toFixed(1)}% dil
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Round editor */}
          <div className="space-y-2">
            <div className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
              Edit rounds
            </div>
            {rounds.map((r, idx) => (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-app bg-surface p-3 md:grid-cols-[1fr_1fr_1fr_0.8fr_1.2fr_2rem]"
              >
                <input
                  value={r.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRounds((p) =>
                      p.map((x, i) => (i === idx ? { ...x, name: v } : x))
                    );
                  }}
                  className={ledgerInput}
                  placeholder="Name"
                />
                <input
                  type="number"
                  value={r.pre}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRounds((p) =>
                      p.map((x, i) => (i === idx ? { ...x, pre: v } : x))
                    );
                  }}
                  className={ledgerInput}
                  placeholder="Pre-money"
                />
                <input
                  type="number"
                  value={r.raise}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRounds((p) =>
                      p.map((x, i) => (i === idx ? { ...x, raise: v } : x))
                    );
                  }}
                  className={ledgerInput}
                  placeholder="Raise"
                />
                <input
                  type="number"
                  value={r.pool}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRounds((p) =>
                      p.map((x, i) => (i === idx ? { ...x, pool: v } : x))
                    );
                  }}
                  className={ledgerInput}
                  placeholder="Pool %"
                />
                <select
                  value={r.timing}
                  onChange={(e) => {
                    const v = e.target.value as "pre" | "post";
                    setRounds((p) =>
                      p.map((x, i) => (i === idx ? { ...x, timing: v } : x))
                    );
                  }}
                  className={ledgerSelect}
                >
                  <option value="pre">Pre-money pool</option>
                  <option value="post">Post-money pool</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setRounds((p) => p.filter((_, i) => i !== idx))
                  }
                  className="rounded-md border border-app font-mono text-[0.65rem] uppercase tracking-[0.15em] text-faint transition-colors hover:border-rose-400/40 hover:text-rose-500"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRounds((p) => [
                  ...p,
                  {
                    id: Math.random().toString(36).slice(2),
                    name: `Round ${p.length + 1}`,
                    pre: "50000000",
                    raise: "10000000",
                    pool: "8",
                    timing: "pre",
                  },
                ])
              }
              className="w-full rounded-md border border-dashed border-app bg-surface px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-tool-accent/50 hover:text-tool-accent"
            >
              + Add round
            </button>
          </div>

          {/* Summary table — same data, ledger format */}
          {roundResults.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-app">
              <table className="w-full font-mono text-xs tabular-nums">
                <thead className="bg-surface text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Round
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Post-money
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Founder %
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Investor %
                    </th>
                    <th className="px-3 py-2 text-right text-[0.6rem] font-medium uppercase tracking-[0.18em]">
                      Pool %
                    </th>
                  </tr>
                </thead>
                <tbody className="text-app">
                  {roundResults.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-t border-app ${
                        activeRound?.id === r.id ? "bg-tool-accent-soft" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-sans text-app">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(r.post)}</td>
                      <td className="px-3 py-2 text-right text-tool-accent">
                        {(r.founder * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(r.investor * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(r.pool * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ScenarioBar<State & { rounds: Round[] }>
          slug="venture-dilution-modeler"
          state={{ ...state, rounds }}
          onLoad={(d) => {
            setState({ ...defaultState, ...d });
            if (d?.rounds) setRounds(d.rounds);
          }}
          exports={{
            csv: () =>
              toCsv([
                ["Holder", "Pre %", "Post %", "Dilution %"],
                ...model.holderBreakdown.map((h) => [
                  h.name,
                  (h.preShare * 100).toFixed(2),
                  (h.postShare * 100).toFixed(2),
                  (h.dilution * 100).toFixed(2),
                ]),
                ["New investors", "—", (model.investorPct * 100).toFixed(2), "—"],
                ["Option pool", "—", (model.poolPct * 100).toFixed(2), "—"],
              ]),
            json: () => ({ state, rounds, model }),
            markdown: () =>
              `# Cap table\n\n- Pre-money: ${fmt(model.preMoney)}\n- Raise: ${fmt(parseFloat(state.raise) || 0)}\n- Post-money: ${fmt(model.postMoney)}\n- Investor %: ${(model.investorPct * 100).toFixed(2)}%\n- Price/share: $${model.pricePerShare.toFixed(4)}\n`,
          }}
        />
      </div>
    </ToolShell>
  );
}
