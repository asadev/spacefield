"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { inputCls } from "../../_components/ToolCard";

type Stage = "Prospecting" | "Qualification" | "Proposal" | "Negotiation" | "Closed";

const STAGE_PROB: Record<Stage, number> = {
  Prospecting: 0.1,
  Qualification: 0.25,
  Proposal: 0.5,
  Negotiation: 0.75,
  Closed: 1.0,
};

const STAGES = Object.keys(STAGE_PROB) as Stage[];

type Deal = {
  id: string;
  name: string;
  stage: Stage;
  amount: string;
  closeDate: string;
  owner?: string;
  stageEnteredAt?: string;
};

// SaaS median stage conversion rates — Bessemer Cloud 2024 / Crunchbase SaaS Report 2024.
const STAGE_CONVERSION: Record<Stage, { next: string; rate: number }> = {
  Prospecting: { next: "Qualification", rate: 30 },
  Qualification: { next: "Proposal", rate: 50 },
  Proposal: { next: "Negotiation", rate: 65 },
  Negotiation: { next: "Closed", rate: 75 },
  Closed: { next: "—", rate: 100 },
};

const AGING_DAYS_THRESHOLD = 90;

const STORAGE_KEY = "spacefield.pipelineForecast.v1";
const VIEW_KEY = "spacefield.pipelineForecast.view.v1";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function monthKey(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  if (key === "—") return "Undated";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const DEFAULT_DEALS: Deal[] = [
  { id: newId(), name: "Acme Corp — Platform", stage: "Proposal", amount: "120000", closeDate: "2026-05-15", owner: "Sara", stageEnteredAt: "2026-03-01" },
  { id: newId(), name: "Beta Inc — Expansion", stage: "Negotiation", amount: "75000", closeDate: "2026-04-30", owner: "Mike", stageEnteredAt: "2026-04-01" },
  { id: newId(), name: "Gamma LLC — Pilot", stage: "Qualification", amount: "30000", closeDate: "2026-06-10", owner: "Sara", stageEnteredAt: "2026-04-10" },
  { id: newId(), name: "Delta Co — Renewal", stage: "Prospecting", amount: "48000", closeDate: "2026-07-01", owner: "Mike", stageEnteredAt: "2025-12-15" },
];

function daysSince(iso?: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

type ViewKey = "snapshot" | "detail" | "sensitivity";

export default function PipelineForecastPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [view, setView] = useState<ViewKey>("snapshot");
  const [quota, setQuota] = useState<string>("250000");

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDeals(parsed);
          setLoaded(true);
        }
      }
      const v = typeof window !== "undefined" ? localStorage.getItem(VIEW_KEY) : null;
      if (v === "snapshot" || v === "detail" || v === "sensitivity") setView(v);
    } catch {
      /* ignore */
    }
    setLoaded((prev) => prev || true);
    setDeals((prev) => (prev.length > 0 ? prev : DEFAULT_DEALS));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [deals, view, loaded]);

  const addDeal = () =>
    setDeals((p) => [
      ...p,
      { id: newId(), name: "New deal", stage: "Prospecting", amount: "10000", closeDate: "", owner: "", stageEnteredAt: new Date().toISOString().slice(0, 10) },
    ]);
  const removeDeal = (id: string) => setDeals((p) => p.filter((d) => d.id !== id));
  const updateDeal = (id: string, patch: Partial<Deal>) =>
    setDeals((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const resetDeals = () => setDeals(DEFAULT_DEALS);

  const owners = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => d.owner && set.add(d.owner));
    return Array.from(set).sort();
  }, [deals]);

  const filteredDeals = useMemo(
    () => (ownerFilter === "all" ? deals : deals.filter((d) => d.owner === ownerFilter)),
    [deals, ownerFilter]
  );

  const { unweighted, weighted, bestCase, commit, byMonth, byOwner, agingCount, byStage } = useMemo(() => {
    let u = 0;
    let w = 0;
    let best = 0;
    let comm = 0;
    let aging = 0;
    const byMonth = new Map<string, { weighted: number; count: number }>();
    const byOwner = new Map<string, { weighted: number; unweighted: number; count: number }>();
    const byStage = new Map<Stage, { deals: Deal[]; total: number }>();
    STAGES.forEach((s) => byStage.set(s, { deals: [], total: 0 }));
    for (const d of filteredDeals) {
      const amt = parseFloat(d.amount) || 0;
      const p = STAGE_PROB[d.stage];
      u += amt;
      w += amt * p;
      // Best case: every open deal at full value + any already-closed amount (added below)
      if (d.stage !== "Closed") best += amt;
      // Commit: Negotiation + Closed (weighted)
      if (d.stage === "Negotiation" || d.stage === "Closed") comm += amt * p;
      if (d.stage !== "Closed" && daysSince(d.stageEnteredAt) > AGING_DAYS_THRESHOLD) aging++;
      const mk = monthKey(d.closeDate);
      const cur = byMonth.get(mk) ?? { weighted: 0, count: 0 };
      cur.weighted += amt * p;
      cur.count += 1;
      byMonth.set(mk, cur);
      if (d.owner) {
        const o = byOwner.get(d.owner) ?? { weighted: 0, unweighted: 0, count: 0 };
        o.weighted += amt * p;
        o.unweighted += amt;
        o.count += 1;
        byOwner.set(d.owner, o);
      }
      const stg = byStage.get(d.stage)!;
      stg.deals.push(d);
      stg.total += amt;
    }
    // Best case = all open + closed amount
    for (const d of filteredDeals) {
      if (d.stage === "Closed") best += parseFloat(d.amount) || 0;
    }
    const entries = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
    const ownerEntries = Array.from(byOwner.entries()).sort(([, a], [, b]) => b.weighted - a.weighted);
    return { unweighted: u, weighted: w, bestCase: best, commit: comm, byMonth: entries, byOwner: ownerEntries, agingCount: aging, byStage };
  }, [filteredDeals]);

  const maxMonthValue = Math.max(...byMonth.map(([, v]) => v.weighted), 1);
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmtCompact = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return fmt(n);
  };

  const quotaNum = parseFloat(quota) || 0;
  const attainmentPct = quotaNum > 0 ? (weighted / quotaNum) * 100 : 0;
  const openCount = filteredDeals.filter((d) => d.stage !== "Closed").length;

  // forecast bar widths against best case
  const denom = Math.max(bestCase, 1);
  const commitPct = Math.min(100, (commit / denom) * 100);
  const weightedPct = Math.min(100, (weighted / denom) * 100);
  const bestPct = 100;

  return (
    <div data-tool-theme="sales" data-tool="pipeline-forecast">
      <ToolShell
        category="Sales"
        title="Pipeline Forecast"
        description="Stage probabilities: Prospecting 10%, Qualification 25%, Proposal 50%, Negotiation 75%, Closed 100%. Deals persist in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              FORECAST
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {filteredDeals.length} of {deals.length} deals
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              pipeline.forecast
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {ownerFilter === "all" ? "all-reps" : ownerFilter.toLowerCase()}.run
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {loaded ? "◉ autosaved" : ""}
            </div>
          </div>

          {/* verdict hero */}
          <div className="relative p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Weighted forecast · stage prob × deal value
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <div className="font-mono text-4xl font-bold tracking-tight text-app sm:text-5xl">
                    {fmt(weighted)}
                  </div>
                  <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-tool-accent">
                    {attainmentPct.toFixed(0)}% of quota
                  </div>
                </div>
                <div className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
                  unweighted {fmtCompact(unweighted)} · open {openCount} · aging {agingCount}
                </div>
              </div>

              {/* quota input */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2.5">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Quota
                  </div>
                  <input
                    type="number"
                    value={quota}
                    onChange={(e) => setQuota(e.target.value)}
                    className="w-28 bg-transparent font-mono text-base font-semibold text-app outline-none"
                    min="0"
                    step="10000"
                  />
                </div>
              </div>
            </div>

            {/* forecast band: commit / weighted / best */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span>Commit → Weighted → Best case</span>
                <span>{fmtCompact(bestCase)} ceiling</span>
              </div>
              <div className="relative h-9 overflow-hidden rounded-lg border border-app bg-app">
                {/* best case (lightest) */}
                <div
                  className="absolute inset-y-0 left-0 bg-tool-accent transition-all"
                  style={{ width: `${bestPct}%`, opacity: 0.18 }}
                />
                {/* weighted (mid) */}
                <div
                  className="absolute inset-y-0 left-0 bg-tool-accent transition-all"
                  style={{ width: `${weightedPct}%`, opacity: 0.45 }}
                />
                {/* commit (full) */}
                <div
                  className="absolute inset-y-0 left-0 bg-tool-accent transition-all"
                  style={{ width: `${commitPct}%`, opacity: 0.95 }}
                />
                <div className="relative flex h-full items-center justify-between px-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                  <span style={{ color: "var(--bg)" }}>commit {fmtCompact(commit)}</span>
                  <span className="text-app">best {fmtCompact(bestCase)}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[0.6rem] uppercase tracking-[0.16em]">
                <ForecastChip label="Commit" value={fmtCompact(commit)} opacity={0.95} />
                <ForecastChip label="Weighted" value={fmtCompact(weighted)} opacity={0.55} />
                <ForecastChip label="Best case" value={fmtCompact(bestCase)} opacity={0.22} />
              </div>
            </div>
          </div>

          {/* tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "snapshot", label: "Snapshot" },
                  { k: "detail", label: "Detail" },
                  { k: "sensitivity", label: "Sensitivity" },
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

            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className={inputCls("!w-auto !rounded-lg !py-1.5 font-mono !text-[0.6rem] uppercase tracking-[0.16em]")}
            >
              <option value="all">All reps</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={addDeal}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + New deal
              </button>
              <button
                onClick={resetDeals}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Reset demo
              </button>
            </div>
          </div>
        </section>

        {agingCount > 0 && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
            <span className="mt-0.5 text-lg leading-none">!</span>
            <div className="text-secondary">
              <span className="font-semibold text-amber-500">{agingCount}</span> deal{agingCount === 1 ? "" : "s"} aged &gt; {AGING_DAYS_THRESHOLD} days in current stage. Follow up or disqualify.
            </div>
          </div>
        )}

        {/* ============================== SNAPSHOT ============================== */}
        {view === "snapshot" && (
          <div className="space-y-5">
            {/* stage rows */}
            <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ stage rollup · weighted by probability
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  prob × value
                </div>
              </div>
              <div className="divide-y divide-app">
                {STAGES.map((stage) => {
                  const col = byStage.get(stage)!;
                  const prob = STAGE_PROB[stage];
                  const stageWeighted = col.total * prob;
                  const widthPct = bestCase > 0 ? (stageWeighted / bestCase) * 100 : 0;
                  return (
                    <div key={stage} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex w-36 shrink-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-tool-accent"
                          style={{ opacity: 0.25 + prob * 0.75 }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-app">{stage}</div>
                          <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                            {Math.round(prob * 100)}%
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="h-2 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full bg-tool-accent transition-all"
                            style={{ width: `${widthPct}%`, opacity: 0.4 + prob * 0.55 }}
                          />
                        </div>
                      </div>
                      <div className="w-24 text-right">
                        <div className="font-mono text-sm font-semibold text-app">
                          {fmtCompact(stageWeighted)}
                        </div>
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                          {col.deals.length} · {fmtCompact(col.total)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* close month + conversion benchmarks */}
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <ToolCard title="By close month" subtitle="Weighted">
                {byMonth.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-app p-6 text-center text-xs text-muted">
                    No deals yet. Add one to see the forecast.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {byMonth.map(([key, val]) => (
                      <div key={key}>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="font-medium text-app">{monthLabel(key)}</span>
                          <span className="font-mono text-secondary">
                            {fmt(val.weighted)}{" "}
                            <span className="text-faint">· {val.count}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full rounded-full bg-tool-accent transition-all"
                            style={{ width: `${(val.weighted / maxMonthValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ToolCard>

              <ToolCard title="Stage conversion benchmarks" subtitle="Bessemer / Crunchbase 2024">
                <div className="space-y-2 text-xs">
                  {(Object.keys(STAGE_CONVERSION) as Stage[])
                    .filter((s) => s !== "Closed")
                    .map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <span className="w-24 truncate text-secondary">{s}</span>
                        <span className="flex-1 text-faint">→ {STAGE_CONVERSION[s].next}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full bg-tool-accent"
                            style={{ width: `${STAGE_CONVERSION[s].rate}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-secondary">
                          {STAGE_CONVERSION[s].rate}%
                        </span>
                      </div>
                    ))}
                </div>
                <p className="mt-3 text-[0.6rem] text-faint">
                  Source: Bessemer Cloud 2024 / Crunchbase SaaS 2024 median win-rates by stage.
                </p>
              </ToolCard>
            </div>

            {/* rep leaderboard */}
            {byOwner.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    ▾ rep leaderboard · sorted by weighted
                  </div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    {byOwner.length} rep{byOwner.length === 1 ? "" : "s"}
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-app font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Rep</th>
                      <th className="px-3 py-2 text-right">Deals</th>
                      <th className="px-3 py-2 text-right">Unweighted</th>
                      <th className="px-3 py-2 text-right">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byOwner.map(([owner, v], i) => (
                      <tr
                        key={owner}
                        className="border-t border-app transition-colors hover:bg-tool-accent-soft"
                      >
                        <td className="px-3 py-2 font-mono text-faint">
                          {i === 0 ? (
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-tool-accent font-mono text-[0.6rem] font-bold"
                              style={{ color: "var(--bg)" }}
                            >
                              1
                            </span>
                          ) : (
                            i + 1
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-app">{owner}</td>
                        <td className="px-3 py-2 text-right font-mono text-secondary">
                          {v.count}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-secondary">
                          {fmt(v.unweighted)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-tool-accent">
                          {fmt(v.weighted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============================== DETAIL (KANBAN) ============================== */}
        {view === "detail" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((stage) => {
              const col = byStage.get(stage)!;
              const prob = STAGE_PROB[stage];
              return (
                <div
                  key={stage}
                  className="flex flex-col rounded-xl border border-app bg-app-elevated"
                >
                  <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full bg-tool-accent"
                          style={{ opacity: 0.3 + prob * 0.7 }}
                        />
                        <span className="truncate text-xs font-semibold text-app">
                          {stage}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                        {Math.round(prob * 100)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-app">
                        {fmtCompact(col.total)}
                      </div>
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                        {col.deals.length} deal{col.deals.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 p-2">
                    {col.deals.length === 0 && (
                      <div className="rounded-lg border border-dashed border-app px-2 py-4 text-center text-[0.65rem] text-muted">
                        No deals
                      </div>
                    )}
                    {col.deals.map((d) => {
                      const amt = parseFloat(d.amount) || 0;
                      const stageDays = daysSince(d.stageEnteredAt);
                      const aging = d.stage !== "Closed" && stageDays > AGING_DAYS_THRESHOLD;
                      return (
                        <div
                          key={d.id}
                          className={`group rounded-lg border bg-app p-2 text-xs transition-colors ${
                            aging
                              ? "border-amber-500/40"
                              : "border-app hover:border-tool-accent"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <input
                              value={d.name}
                              onChange={(e) => updateDeal(d.id, { name: e.target.value })}
                              className="w-full bg-transparent text-xs font-semibold text-app outline-none placeholder:text-faint focus:text-tool-accent"
                              placeholder="Deal name"
                            />
                            <button
                              onClick={() => removeDeal(d.id)}
                              className="shrink-0 text-faint opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between">
                            <input
                              type="number"
                              value={d.amount}
                              onChange={(e) => updateDeal(d.id, { amount: e.target.value })}
                              className="w-20 bg-transparent font-mono text-sm font-semibold text-tool-accent outline-none focus:ring-1 focus:ring-tool-accent"
                              min="0"
                              step="1000"
                            />
                            <span className="font-mono text-[0.65rem] text-muted">
                              = {fmtCompact(amt * prob)}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <label className="flex flex-col">
                              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted">
                                Close
                              </span>
                              <input
                                type="date"
                                value={d.closeDate}
                                onChange={(e) => updateDeal(d.id, { closeDate: e.target.value })}
                                className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[0.65rem] text-secondary outline-none focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                              />
                            </label>
                            <label className="flex flex-col">
                              <span className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-muted">
                                Owner
                              </span>
                              <input
                                value={d.owner ?? ""}
                                onChange={(e) => updateDeal(d.id, { owner: e.target.value })}
                                className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[0.65rem] text-secondary outline-none focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                                placeholder="—"
                              />
                            </label>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <select
                              value={d.stage}
                              onChange={(e) => updateDeal(d.id, { stage: e.target.value as Stage })}
                              className="rounded bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-tool-accent outline-none focus:ring-2 focus:ring-tool-accent"
                            >
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            {d.stageEnteredAt && (
                              <span
                                className={`font-mono text-[0.6rem] ${
                                  aging ? "font-semibold text-amber-500" : "text-muted"
                                }`}
                                title={`In stage since ${d.stageEnteredAt}`}
                              >
                                {stageDays}d
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ============================== SENSITIVITY ============================== */}
        {view === "sensitivity" && (
          <div className="space-y-5">
            <ToolCard
              title="Probability sensitivity"
              subtitle="What happens if every stage moves ±10pp"
            >
              <div className="overflow-hidden rounded-lg border border-app">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-app font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                      <th className="px-3 py-2 text-left">Scenario</th>
                      <th className="px-3 py-2 text-right">Forecast</th>
                      <th className="px-3 py-2 text-right">vs base</th>
                      <th className="px-3 py-2 text-right">Quota %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Bear (−10pp on every stage)", shift: -0.1 },
                      { label: "Base (current model)", shift: 0 },
                      { label: "Bull (+10pp on every stage)", shift: 0.1 },
                    ].map((row) => {
                      let val = 0;
                      for (const d of filteredDeals) {
                        const amt = parseFloat(d.amount) || 0;
                        const p = Math.max(0, Math.min(1, STAGE_PROB[d.stage] + row.shift));
                        val += amt * p;
                      }
                      const delta = val - weighted;
                      const qpct = quotaNum > 0 ? (val / quotaNum) * 100 : 0;
                      return (
                        <tr
                          key={row.label}
                          className={`border-t border-app ${
                            row.shift === 0 ? "bg-tool-accent-soft" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-secondary">{row.label}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-app">
                            {fmt(val)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${
                              delta > 0
                                ? "text-emerald-500"
                                : delta < 0
                                ? "text-rose-500"
                                : "text-muted"
                            }`}
                          >
                            {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${fmtCompact(delta)}`}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-tool-accent">
                            {qpct.toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[0.6rem] text-faint">
                Sensitivity assumes a uniform shift across stages. Real win-rates vary — replace
                stage probabilities with your own historical data when you have ≥ 50 closed deals
                per stage.
              </p>
            </ToolCard>

            <ToolCard
              title="Aging exposure"
              subtitle="Deals stuck in stage > 90 days dilute the forecast"
            >
              {filteredDeals.filter(
                (d) => d.stage !== "Closed" && daysSince(d.stageEnteredAt) > AGING_DAYS_THRESHOLD
              ).length === 0 ? (
                <div className="rounded-lg border border-dashed border-app p-6 text-center text-xs text-muted">
                  No aging deals. Pipeline is fresh.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDeals
                    .filter(
                      (d) =>
                        d.stage !== "Closed" &&
                        daysSince(d.stageEnteredAt) > AGING_DAYS_THRESHOLD
                    )
                    .sort(
                      (a, b) => daysSince(b.stageEnteredAt) - daysSince(a.stageEnteredAt)
                    )
                    .map((d) => {
                      const amt = parseFloat(d.amount) || 0;
                      const p = STAGE_PROB[d.stage];
                      return (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-app">
                              {d.name}
                            </div>
                            <div className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                              {d.stage} · {d.owner || "—"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm font-semibold text-amber-500">
                              {daysSince(d.stageEnteredAt)}d
                            </div>
                            <div className="font-mono text-[0.6rem] text-muted">
                              {fmtCompact(amt * p)} weighted
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </ToolCard>
          </div>
        )}

        <p className="mt-6 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Stage probabilities are industry defaults. Swap in your real win-rate data by stage when
          you have it.
        </p>
      </ToolShell>
    </div>
  );
}

/* ───────── local components ───────── */

function ForecastChip({
  label,
  value,
  opacity,
}: {
  label: string;
  value: string;
  opacity: number;
}) {
  return (
    <div className="rounded-md border border-app bg-app px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-sm bg-tool-accent"
          style={{ opacity }}
        />
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-app">{value}</div>
    </div>
  );
}
