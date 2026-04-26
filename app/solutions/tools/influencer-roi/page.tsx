"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Tier = "nano" | "micro" | "macro" | "mega";
type MetricMode = "roi" | "cpm" | "cpe" | "cpa";

// Benchmarks from HypeAuditor 2024 State of Influencer Marketing + Influencer Marketing Hub 2024.
const TIER_BENCH: Record<
  Tier,
  { label: string; range: string; er: number; reachPct: number; cpmUsd: number; conv: number; note: string }
> = {
  nano: {
    label: "Nano (1k-10k)",
    range: "1k-10k",
    er: 7.0,
    reachPct: 40,
    cpmUsd: 45,
    conv: 4.0,
    note: "Highest ER, lowest reach. Great for authentic seeding.",
  },
  micro: {
    label: "Micro (10k-100k)",
    range: "10k-100k",
    er: 3.5,
    reachPct: 25,
    cpmUsd: 30,
    conv: 3.0,
    note: "Sweet spot for niche brands. Best ROI in most categories.",
  },
  macro: {
    label: "Macro (100k-1M)",
    range: "100k-1M",
    er: 2.0,
    reachPct: 20,
    cpmUsd: 20,
    conv: 1.8,
    note: "Scale and credibility. ER drops vs micro.",
  },
  mega: {
    label: "Mega (1M+)",
    range: "1M+",
    er: 1.2,
    reachPct: 15,
    cpmUsd: 15,
    conv: 1.0,
    note: "Celebrity-tier awareness. Treat as brand, not performance.",
  },
};

interface Creator {
  name: string;
  tier: Tier;
  cost: string;
  followers: string;
  reachPct: string;
  er: string;
  ctr: string;
  cvr: string;
}

const STORAGE = "solutions:influencer-roi:v1";

function emptyCreator(tier: Tier = "micro", name = "Creator"): Creator {
  const b = TIER_BENCH[tier];
  return {
    name,
    tier,
    cost: "5000",
    followers: tier === "nano" ? "8000" : tier === "micro" ? "50000" : tier === "macro" ? "400000" : "2000000",
    reachPct: String(b.reachPct),
    er: String(b.er),
    ctr: "2",
    cvr: String(b.conv),
  };
}

function tierGlyph(tier: Tier) {
  return tier === "nano" ? "n" : tier === "micro" ? "m" : tier === "macro" ? "M" : "*";
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export default function InfluencerRoiPage() {
  const [mode, setMode] = useState<"single" | "campaign">("single");
  const [metricMode, setMetricMode] = useState<MetricMode>("roi");
  const [aov, setAov] = useState("80");
  const [creators, setCreators] = useState<Creator[]>([
    { name: "Primary creator", tier: "macro", cost: "5000", followers: "150000", reachPct: "25", er: "3.5", ctr: "2", cvr: "3" },
    emptyCreator("micro", "Creator B"),
    emptyCreator("nano", "Creator C"),
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.mode) setMode(p.mode);
      if (p.aov) setAov(p.aov);
      if (Array.isArray(p.creators) && p.creators.length) setCreators(p.creators);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ mode, aov, creators }));
    } catch {}
  }, [mode, aov, creators]);

  const updateCreator = (i: number, patch: Partial<Creator>) =>
    setCreators((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCreator = () =>
    setCreators((p) => [...p, emptyCreator("micro", `Creator ${String.fromCharCode(65 + p.length)}`)]);
  const removeCreator = (i: number) => setCreators((p) => p.filter((_, idx) => idx !== i));
  const applyTierBench = (i: number) => {
    const c = creators[i];
    const b = TIER_BENCH[c.tier];
    updateCreator(i, { reachPct: String(b.reachPct), er: String(b.er), cvr: String(b.conv) });
  };

  const results = useMemo(() => {
    const aovN = parseFloat(aov) || 0;
    return creators.map((c) => {
      const f = parseFloat(c.followers) || 0;
      const reach = f * ((parseFloat(c.reachPct) || 0) / 100);
      const eng = reach * ((parseFloat(c.er) || 0) / 100);
      const clicks = eng * ((parseFloat(c.ctr) || 0) / 100);
      const convs = clicks * ((parseFloat(c.cvr) || 0) / 100);
      const revenue = convs * aovN;
      const cost = parseFloat(c.cost) || 0;
      const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
      const roiX = cost > 0 ? revenue / cost : 0;
      const cpm = reach > 0 ? (cost / reach) * 1000 : 0;
      const cpe = eng > 0 ? cost / eng : 0;
      const cpa = convs > 0 ? cost / convs : 0;
      return { reach, eng, clicks, convs, revenue, cost, roi, roiX, cpm, cpe, cpa };
    });
  }, [creators, aov]);

  const primary = creators[0];
  const primaryResult = results[0];

  const blended = useMemo(() => {
    const totals = results.reduce(
      (acc, r) => ({
        cost: acc.cost + r.cost,
        reach: acc.reach + r.reach,
        eng: acc.eng + r.eng,
        clicks: acc.clicks + r.clicks,
        convs: acc.convs + r.convs,
        revenue: acc.revenue + r.revenue,
      }),
      { cost: 0, reach: 0, eng: 0, clicks: 0, convs: 0, revenue: 0 }
    );
    const roi = totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : 0;
    const roiX = totals.cost > 0 ? totals.revenue / totals.cost : 0;
    const cpm = totals.reach > 0 ? (totals.cost / totals.reach) * 1000 : 0;
    const cpe = totals.eng > 0 ? totals.cost / totals.eng : 0;
    const cpa = totals.convs > 0 ? totals.cost / totals.convs : 0;
    return { ...totals, roi, roiX, cpm, cpe, cpa };
  }, [results]);

  // Sensitivity for primary creator
  const sensitivity = useMemo(() => {
    const p = primary;
    const aovN = parseFloat(aov) || 0;
    const f = parseFloat(p.followers) || 0;
    const reach = f * ((parseFloat(p.reachPct) || 0) / 100);
    const eng = reach * ((parseFloat(p.er) || 0) / 100);
    const clicks = eng * ((parseFloat(p.ctr) || 0) / 100);
    const baseCvr = (parseFloat(p.cvr) || 0) / 100;
    const cost = parseFloat(p.cost) || 0;
    return [-20, -10, 0, 10, 20].map((d) => {
      const adj = baseCvr * (1 + d / 100);
      const convs = clicks * adj;
      const rev = convs * aovN;
      const roi = cost > 0 ? ((rev - cost) / cost) * 100 : 0;
      return { delta: d, convRate: adj * 100, convs, revenue: rev, roi };
    });
  }, [primary, aov]);

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const verdict = primaryResult.roi >= 100 ? "Strong" : primaryResult.roi >= 0 ? "Marginal" : "Negative";
  const verdictTone =
    primaryResult.roi >= 100
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : primaryResult.roi >= 0
      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
      : "border-rose-500/40 bg-rose-500/10 text-rose-500";

  // Top / bottom performer (across full roster)
  const ranked = useMemo(() => {
    const idx = creators.map((c, i) => ({ creator: c, result: results[i], i }));
    const valid = idx.filter((x) => (parseFloat(x.creator.cost) || 0) > 0);
    if (valid.length === 0) return { top: null as null | (typeof idx)[number], bottom: null as null | (typeof idx)[number] };
    const sorted = [...valid].sort((a, b) => b.result.roi - a.result.roi);
    return { top: sorted[0], bottom: sorted[sorted.length - 1] };
  }, [creators, results]);

  // Funnel max for primary (for opacity-ramp bars)
  const funnelMax = Math.max(
    primaryResult.reach,
    primaryResult.eng,
    primaryResult.clicks,
    primaryResult.convs,
    1
  );

  // Metric mode display selector
  const metricLabel: Record<MetricMode, string> = {
    roi: "ROI",
    cpm: "CPM",
    cpe: "Cost / engagement",
    cpa: "CPA",
  };

  return (
    <ToolShell
      category="Marketing"
      title="Influencer ROI"
      description="Single-creator or multi-creator campaign. Reach, engagements, clicks, conversions, revenue, ROI. Tier benchmarks baked in (nano/micro/macro/mega)."
    >
      <div data-tool-theme="marketing" data-tool="influencer-roi" className="space-y-6">
        {/* ============================== HERO ============================== */}
        <section className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              campaign.roi
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {creators.length} creator{creators.length === 1 ? "" : "s"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              spend <span className="text-secondary">{fmtMoney(blended.cost)}</span>
              <span className="text-faint">/</span>
              revenue <span className="text-secondary">{fmtMoney(blended.revenue)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[1.1fr_1fr]">
            {/* ROI multiple + revenue chip */}
            <div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-tool-accent">
                Portfolio ROI · {metricLabel[metricMode]}
              </div>
              <div className="mt-2 flex items-end gap-3">
                <div className="font-mono text-5xl font-semibold tracking-tight text-app md:text-6xl">
                  {metricMode === "roi"
                    ? `${blended.roiX.toFixed(2)}×`
                    : metricMode === "cpm"
                    ? fmtMoney(blended.cpm)
                    : metricMode === "cpe"
                    ? blended.cpe > 0
                      ? `$${blended.cpe.toFixed(3)}`
                      : "—"
                    : blended.cpa > 0
                    ? fmtMoney(blended.cpa)
                    : "—"}
                </div>
                <span className="mb-2 rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                  {fmtMoney(blended.revenue)}
                </span>
                <span
                  className={`mb-2 rounded-md border px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${verdictTone}`}
                >
                  {blended.roi >= 100 ? "Strong" : blended.roi >= 0 ? "Marginal" : "Negative"}
                </span>
              </div>
              <div className="mt-2 text-xs text-secondary">
                Net <span className="text-app">{fmtMoney(blended.revenue - blended.cost)}</span> ·
                ROI <span className="text-app">{blended.roi.toFixed(0)}%</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem]">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-secondary">
                  CPM <span className="text-app">{blended.cpm > 0 ? fmtMoney(blended.cpm) : "—"}</span>
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-secondary">
                  CPA <span className="text-app">{blended.cpa > 0 ? fmtMoney(blended.cpa) : "—"}</span>
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-secondary">
                  Reach <span className="text-app">{Math.round(blended.reach).toLocaleString()}</span>
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono uppercase tracking-[0.14em] text-secondary">
                  Conv <span className="text-app">{Math.round(blended.convs).toLocaleString()}</span>
                </span>
              </div>
            </div>

            {/* Top / bottom callouts */}
            <div className="space-y-2">
              {ranked.top && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                  <div className="flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-emerald-500">
                    <span>Top performer</span>
                    <span>{TIER_BENCH[ranked.top.creator.tier].range}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-app">{ranked.top.creator.name}</div>
                    <div className="font-mono text-lg font-semibold text-emerald-500">
                      {ranked.top.result.roiX.toFixed(2)}×
                    </div>
                  </div>
                  <div className="mt-0.5 text-[0.65rem] text-muted">
                    {fmtMoney(ranked.top.result.revenue)} revenue · {fmtMoney(parseFloat(ranked.top.creator.cost) || 0)} cost
                  </div>
                </div>
              )}
              {ranked.bottom && ranked.bottom.i !== ranked.top?.i && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3">
                  <div className="flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-rose-500">
                    <span>Drag on the mix</span>
                    <span>{TIER_BENCH[ranked.bottom.creator.tier].range}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-app">{ranked.bottom.creator.name}</div>
                    <div
                      className={`font-mono text-lg font-semibold ${
                        ranked.bottom.result.roi >= 0 ? "text-amber-500" : "text-rose-500"
                      }`}
                    >
                      {ranked.bottom.result.roiX.toFixed(2)}×
                    </div>
                  </div>
                  <div className="mt-0.5 text-[0.65rem] text-muted">
                    {fmtMoney(ranked.bottom.result.revenue)} revenue · {fmtMoney(parseFloat(ranked.bottom.creator.cost) || 0)} cost
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* segmented metric pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "roi", label: "ROI ×" },
                  { k: "cpm", label: "CPM" },
                  { k: "cpe", label: "CPE" },
                  { k: "cpa", label: "CPA" },
                ] as { k: MetricMode; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMetricMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    metricMode === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={metricMode === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(["single", "campaign"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === m
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={mode === m ? { color: "var(--bg)" } : undefined}
                >
                  {m === "single" ? "Single" : "Multi-creator"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ============================== CREATOR CARDS ============================== */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {creators.map((c, i) => {
            const r = results[i];
            const followersN = parseFloat(c.followers) || 0;
            const isTop = ranked.top?.i === i;
            const isBottom = ranked.bottom?.i === i && ranked.bottom?.i !== ranked.top?.i;
            const roiTone =
              r.roi >= 100 ? "text-emerald-500" : r.roi >= 0 ? "text-amber-500" : "text-rose-500";
            return (
              <div
                key={i}
                className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${
                  isTop
                    ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                    : isBottom
                    ? "border-rose-500/30 bg-rose-500/[0.04]"
                    : "border-app bg-app-elevated hover:border-tool-accent"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-11 w-11 shrink-0">
                    <div
                      className="flex h-full w-full items-center justify-center rounded-full font-mono text-base font-semibold ring-1 ring-tool-accent/30"
                      style={{
                        backgroundImage: `linear-gradient(135deg, var(--tool-accent), color-mix(in srgb, var(--tool-accent) 30%, transparent))`,
                        color: "var(--bg)",
                      }}
                      aria-hidden
                    >
                      {(c.name?.trim()?.[0] || "?").toUpperCase()}
                    </div>
                    <span
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-app bg-app font-mono text-[0.55rem] font-bold uppercase tracking-wider text-tool-accent"
                      title={TIER_BENCH[c.tier].label}
                    >
                      {tierGlyph(c.tier)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      value={c.name}
                      onChange={(e) => updateCreator(i, { name: e.target.value })}
                      className="-mx-1 w-full rounded bg-transparent px-1 text-sm font-semibold text-app outline-none focus:ring-1 focus:ring-tool-accent"
                    />
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.65rem] text-muted">
                      <span>@{(c.name || "creator").toLowerCase().replace(/\s+/g, "")}</span>
                      <span className="text-faint">·</span>
                      <span>{formatFollowers(followersN)} followers</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-secondary">
                    {TIER_BENCH[c.tier].range}
                  </span>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-tool-accent">
                    CPM {r.cpm > 0 ? fmtMoney(r.cpm) : "—"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-secondary">
                    ER {parseFloat(c.er || "0").toFixed(1)}%
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-2">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">ROI</div>
                    <div className={`font-mono text-3xl font-semibold tracking-tight ${roiTone}`}>
                      {r.roiX.toFixed(2)}×
                    </div>
                  </div>
                  <div className="text-right text-[0.65rem] text-muted">
                    <div className="text-app">{fmtMoney(r.revenue)}</div>
                    <div className="text-faint">on {fmtMoney(parseFloat(c.cost) || 0)}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[0.6rem]">
                  <div className="rounded-md border border-app bg-app py-1">
                    <div className="text-muted">Reach</div>
                    <div className="text-app">{formatFollowers(r.reach)}</div>
                  </div>
                  <div className="rounded-md border border-app bg-app py-1">
                    <div className="text-muted">Clicks</div>
                    <div className="text-app">{formatFollowers(r.clicks)}</div>
                  </div>
                  <div className="rounded-md border border-app bg-app py-1">
                    <div className="text-muted">Conv</div>
                    <div className="text-app">{Math.round(r.convs).toLocaleString()}</div>
                  </div>
                </div>

                {(isTop || isBottom) && (
                  <div
                    className={`absolute right-2 top-2 rounded-md px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${
                      isTop ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"
                    }`}
                  >
                    {isTop ? "Top" : "Bottom"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ============================== INPUTS + OUTCOME ============================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          <ToolCard title="Deal inputs — primary creator" subtitle="What you&rsquo;re buying">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tier">
                  <select
                    value={primary.tier}
                    onChange={(e) => updateCreator(0, { tier: e.target.value as Tier })}
                    className={inputCls()}
                  >
                    {(Object.keys(TIER_BENCH) as Tier[]).map((t) => (
                      <option key={t} value={t}>{TIER_BENCH[t].label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="AOV ($)">
                  <input
                    type="number"
                    value={aov}
                    onChange={(e) => setAov(e.target.value)}
                    className={inputCls()}
                    min="0"
                    step="1"
                  />
                </Field>
              </div>
              <button
                onClick={() => applyTierBench(0)}
                className="w-full rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                style={undefined}
              >
                Apply tier benchmark (ER, Reach, CVR)
              </button>
              <Field label="Influencer cost ($)">
                <input
                  type="number"
                  value={primary.cost}
                  onChange={(e) => updateCreator(0, { cost: e.target.value })}
                  className={inputCls()}
                  min="0"
                  step="100"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Followers">
                  <input type="number" value={primary.followers} onChange={(e) => updateCreator(0, { followers: e.target.value })} className={inputCls()} min="0" step="1000" />
                </Field>
                <Field label="Reach (%)" hint={`bench ${TIER_BENCH[primary.tier].reachPct}%`}>
                  <input type="number" value={primary.reachPct} onChange={(e) => updateCreator(0, { reachPct: e.target.value })} className={inputCls()} min="0" max="100" step="0.5" />
                </Field>
                <Field label="Engagement (%)" hint={`bench ${TIER_BENCH[primary.tier].er}%`}>
                  <input type="number" value={primary.er} onChange={(e) => updateCreator(0, { er: e.target.value })} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
                <Field label="Click-through (%)">
                  <input type="number" value={primary.ctr} onChange={(e) => updateCreator(0, { ctr: e.target.value })} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
                <Field label="Conversion rate (%)" hint={`bench ${TIER_BENCH[primary.tier].conv}%`}>
                  <input type="number" value={primary.cvr} onChange={(e) => updateCreator(0, { cvr: e.target.value })} className={inputCls()} min="0" max="100" step="0.1" />
                </Field>
              </div>

              <div className="mt-2 rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-xs">
                <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  {TIER_BENCH[primary.tier].label}
                </div>
                <p className="text-secondary">{TIER_BENCH[primary.tier].note}</p>
                <p className="mt-1 text-[0.6rem] text-muted">
                  Typical CPM ${TIER_BENCH[primary.tier].cpmUsd}. Source: HypeAuditor 2024, Influencer Marketing Hub 2024.
                </p>
              </div>
            </div>
          </ToolCard>

          <ToolCard title="Projected outcome" subtitle="Primary creator · base case">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Reach" value={Math.round(primaryResult.reach).toLocaleString()} />
              <Stat label="Engagements" value={Math.round(primaryResult.eng).toLocaleString()} />
              <Stat label="Clicks" value={Math.round(primaryResult.clicks).toLocaleString()} />
              <Stat label="Conversions" value={Math.round(primaryResult.convs).toLocaleString()} />
              <Stat label="Revenue" value={fmtMoney(primaryResult.revenue)} />
              <Stat label="ROI" value={`${primaryResult.roiX.toFixed(2)}×`} accent />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="CPM" value={fmtMoney(primaryResult.cpm)} />
              <Stat label="Cost / engagement" value={primaryResult.cpe > 0 ? `$${primaryResult.cpe.toFixed(3)}` : "—"} />
              <Stat label="CPA" value={primaryResult.cpa > 0 ? fmtMoney(primaryResult.cpa) : "—"} />
            </div>

            {/* Funnel bars — opacity ramp on --tool-accent */}
            <div className="mt-5 rounded-lg border border-app bg-app p-4">
              <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                Conversion funnel
              </div>
              <div className="space-y-2">
                {(
                  [
                    { label: "Reach", value: primaryResult.reach, alpha: 1.0 },
                    { label: "Engagements", value: primaryResult.eng, alpha: 0.75 },
                    { label: "Clicks", value: primaryResult.clicks, alpha: 0.5 },
                    { label: "Conversions", value: primaryResult.convs, alpha: 0.3 },
                  ] as const
                ).map((row) => {
                  const pct = funnelMax > 0 ? Math.max(2, (row.value / funnelMax) * 100) : 0;
                  return (
                    <div key={row.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                      <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                        {row.label}
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full border border-app bg-app-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `color-mix(in srgb, var(--tool-accent) ${row.alpha * 100}%, transparent)`,
                          }}
                        />
                      </div>
                      <div className="font-mono text-xs text-app">
                        {Math.round(row.value).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-app bg-app p-4">
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                Sensitivity — ±20% on conversion rate
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                    <th className="py-1 text-left">Δ</th>
                    <th className="py-1 text-right">CVR</th>
                    <th className="py-1 text-right">Conv</th>
                    <th className="py-1 text-right">Revenue</th>
                    <th className="py-1 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivity.map((s) => (
                    <tr
                      key={s.delta}
                      className={`border-t border-app ${
                        s.delta === 0 ? "bg-tool-accent-soft text-app" : "text-secondary"
                      }`}
                    >
                      <td className="py-1.5 font-mono">{s.delta > 0 ? `+${s.delta}%` : `${s.delta}%`}</td>
                      <td className="py-1.5 text-right font-mono">{s.convRate.toFixed(2)}%</td>
                      <td className="py-1.5 text-right font-mono">{Math.round(s.convs).toLocaleString()}</td>
                      <td className="py-1.5 text-right font-mono">{fmtMoney(s.revenue)}</td>
                      <td
                        className={`py-1.5 text-right font-mono font-semibold ${
                          s.roi >= 100 ? "text-emerald-500" : s.roi >= 0 ? "text-amber-500" : "text-rose-500"
                        }`}
                      >
                        {s.roi.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-sm">
              <span className="text-secondary">Verdict: </span>
              <span
                className={`font-semibold ${
                  primaryResult.roi >= 100
                    ? "text-emerald-500"
                    : primaryResult.roi >= 0
                    ? "text-amber-500"
                    : "text-rose-500"
                }`}
              >
                {verdict}
              </span>
              <span className="text-muted">
                {" "}
                — Watch for bot followers: if ER &gt; 8% on 100k+ accounts, audit before paying.
              </span>
            </p>
          </ToolCard>
        </div>

        {/* ============================== CAMPAIGN ROSTER ============================== */}
        {mode === "campaign" && (
          <div>
            <ToolCard
              title="Campaign roster"
              subtitle={`${creators.length} creators · blended ROI ${blended.roiX.toFixed(2)}×`}
            >
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total spend" value={fmtMoney(blended.cost)} />
                <Stat label="Blended reach" value={Math.round(blended.reach).toLocaleString()} />
                <Stat label="Conversions" value={Math.round(blended.convs).toLocaleString()} />
                <Stat label="Blended ROI" value={`${blended.roiX.toFixed(2)}×`} accent />
              </div>

              <div className="overflow-x-auto rounded-lg border border-app bg-app">
                <table className="w-full min-w-[820px] text-xs">
                  <thead>
                    <tr className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                      <th className="px-3 py-2 text-left">Creator</th>
                      <th className="px-3 py-2 text-left">Tier</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Followers</th>
                      <th className="px-3 py-2 text-right">Reach %</th>
                      <th className="px-3 py-2 text-right">ER %</th>
                      <th className="px-3 py-2 text-right">CVR %</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                      <th className="px-3 py-2 text-right">ROI</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {creators.map((c, i) => {
                      const r = results[i];
                      return (
                        <tr key={i} className="border-t border-app bg-app-elevated">
                          <td className="px-3 py-1.5">
                            <input value={c.name} onChange={(e) => updateCreator(i, { name: e.target.value })} className={inputCls("!px-2 !py-1 text-xs")} />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={c.tier} onChange={(e) => updateCreator(i, { tier: e.target.value as Tier })} className={inputCls("!px-2 !py-1 text-xs")}>
                              {(Object.keys(TIER_BENCH) as Tier[]).map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-1.5"><input type="number" value={c.cost} onChange={(e) => updateCreator(i, { cost: e.target.value })} className={inputCls("!px-2 !py-1 text-xs !text-right w-20")} /></td>
                          <td className="px-3 py-1.5"><input type="number" value={c.followers} onChange={(e) => updateCreator(i, { followers: e.target.value })} className={inputCls("!px-2 !py-1 text-xs !text-right w-24")} /></td>
                          <td className="px-3 py-1.5"><input type="number" value={c.reachPct} onChange={(e) => updateCreator(i, { reachPct: e.target.value })} className={inputCls("!px-2 !py-1 text-xs !text-right w-16")} /></td>
                          <td className="px-3 py-1.5"><input type="number" value={c.er} onChange={(e) => updateCreator(i, { er: e.target.value })} className={inputCls("!px-2 !py-1 text-xs !text-right w-16")} /></td>
                          <td className="px-3 py-1.5"><input type="number" value={c.cvr} onChange={(e) => updateCreator(i, { cvr: e.target.value })} className={inputCls("!px-2 !py-1 text-xs !text-right w-16")} /></td>
                          <td className="px-3 py-1.5 text-right font-mono text-app">{fmtMoney(r.revenue)}</td>
                          <td
                            className={`px-3 py-1.5 text-right font-mono font-semibold ${
                              r.roi >= 100 ? "text-emerald-500" : r.roi >= 0 ? "text-amber-500" : "text-rose-500"
                            }`}
                          >
                            {r.roiX.toFixed(2)}×
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {creators.length > 1 && i !== 0 && (
                              <button
                                onClick={() => removeCreator(i)}
                                className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                                aria-label="Remove creator"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                onClick={addCreator}
                className="mt-4 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                + Creator
              </button>
            </ToolCard>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
