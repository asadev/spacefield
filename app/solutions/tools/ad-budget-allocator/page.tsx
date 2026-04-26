"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Channel = {
  id: string;
  name: string;
  enabled: boolean;
  cpc: string; // cost per click
  convRate: string; // conversion rate %
  minShare: string; // minimum % share (floor)
  maxShare: string; // maximum % share (cap)
  cpm: string; // cost per 1000 impressions (reference)
};

// 2024 CPM benchmarks: WordStream Display Benchmarks 2024,
// Meta Q4 2024 earnings, LinkedIn Marketing Solutions 2024, TikTok Business benchmarks.
const DEFAULT_CHANNELS: Channel[] = [
  { id: "google", name: "Google Search", enabled: true, cpc: "2.80", convRate: "4.5", minShare: "0", maxShare: "100", cpm: "9.70" },
  { id: "meta", name: "Meta (FB/IG)", enabled: true, cpc: "1.60", convRate: "2.8", minShare: "0", maxShare: "100", cpm: "9.60" },
  { id: "linkedin", name: "LinkedIn", enabled: true, cpc: "8.50", convRate: "6.0", minShare: "0", maxShare: "100", cpm: "33.00" },
  { id: "tiktok", name: "TikTok", enabled: true, cpc: "1.10", convRate: "1.8", minShare: "0", maxShare: "100", cpm: "10.00" },
  { id: "youtube", name: "YouTube", enabled: false, cpc: "0.60", convRate: "1.2", minShare: "0", maxShare: "100", cpm: "9.70" },
  { id: "gdn", name: "Google Display", enabled: false, cpc: "0.75", convRate: "0.8", minShare: "0", maxShare: "100", cpm: "3.00" },
];

type Method = "equal" | "roas" | "custom" | "performance";

const STORAGE = "solutions:ad-budget-allocator:v1";

// Opacity ramp for channel differentiation off CSS var --tool-accent
const ACCENT_OPACITY = [1, 0.82, 0.66, 0.52, 0.4, 0.3];

export default function AdBudgetAllocatorPage() {
  const [budget, setBudget] = useState("50000");
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [method, setMethod] = useState<Method>("performance");
  const [targetRoas, setTargetRoas] = useState("3.0");
  const [aov, setAov] = useState("120");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const p = JSON.parse(raw);
      if (p.budget) setBudget(p.budget);
      if (Array.isArray(p.channels)) setChannels(p.channels);
      if (p.method) setMethod(p.method);
      else if (p.mode) setMethod(p.mode === "roas" ? "roas" : "performance");
      if (p.targetRoas) setTargetRoas(p.targetRoas);
      if (p.aov) setAov(p.aov);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ budget, channels, method, targetRoas, aov }));
    } catch {}
  }, [budget, channels, method, targetRoas, aov, hydrated]);

  const update = (i: number, patch: Partial<Channel>) =>
    setChannels((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const allocation = useMemo(() => {
    const b = Math.max(0, parseFloat(budget) || 0);
    const active = channels.filter((c) => c.enabled);
    if (active.length === 0 || b <= 0) return [];

    // Conversions per dollar for each active channel = convRate / CPC
    const rawConvPerDollar = active.map((c) => {
      const cpc = parseFloat(c.cpc) || 0;
      const cv = (parseFloat(c.convRate) || 0) / 100;
      return cpc > 0 ? cv / cpc : 0;
    });

    // Revenue per dollar (ROAS proxy) = aov * convRate / cpc
    const aov$ = parseFloat(aov) || 0;
    const rawRevPerDollar = rawConvPerDollar.map((v) => v * aov$);

    const floors = active.map((c) => (parseFloat(c.minShare) || 0) / 100);
    const caps = active.map((c) => Math.max(0.01, (parseFloat(c.maxShare) || 100) / 100));

    let weights: number[];
    if (method === "equal") {
      weights = active.map(() => 1);
    } else if (method === "roas") {
      // weight directly proportional to revenue per dollar
      weights = rawRevPerDollar.map((v) => Math.max(0, v));
    } else if (method === "custom") {
      // honour current min/max as the primary signal: midpoint of the channel's [floor, cap]
      weights = active.map((c) => {
        const lo = (parseFloat(c.minShare) || 0) / 100;
        const hi = Math.max(lo, (parseFloat(c.maxShare) || 100) / 100);
        return (lo + hi) / 2;
      });
    } else {
      // performance: sqrt-weighted by conversions per dollar (default behaviour)
      weights = rawConvPerDollar.map((v) => Math.sqrt(Math.max(0, v)));
    }

    const wSum = weights.reduce((a, b2) => a + b2, 0);
    let shares = weights.map((w) => (wSum > 0 ? w / wSum : 1 / active.length));

    // Iteratively clamp to floor/cap then rebalance.
    for (let iter = 0; iter < 8; iter++) {
      const clamped = shares.map((s, i) => Math.max(floors[i], Math.min(caps[i], s)));
      const sum = clamped.reduce((a, b2) => a + b2, 0);
      shares = clamped.map((s) => (sum > 0 ? s / sum : 0));
    }

    return active.map((c, i) => {
      const spend = b * shares[i];
      const clicks = parseFloat(c.cpc) > 0 ? spend / parseFloat(c.cpc) : 0;
      const convs = clicks * ((parseFloat(c.convRate) || 0) / 100);
      const cpa = convs > 0 ? spend / convs : 0;
      return {
        channel: c,
        spend,
        clicks,
        conversions: convs,
        cpa,
        share: shares[i] * 100,
      };
    });
  }, [budget, channels, method, aov]);

  const totals = useMemo(() => {
    return allocation.reduce(
      (acc, a) => ({
        spend: acc.spend + a.spend,
        clicks: acc.clicks + a.clicks,
        conversions: acc.conversions + a.conversions,
      }),
      { spend: 0, clicks: 0, conversions: 0 }
    );
  }, [allocation]);

  const roasCheck = useMemo(() => {
    const a = parseFloat(aov) || 0;
    const t = parseFloat(targetRoas) || 0;
    const revenue = totals.conversions * a;
    const actualRoas = totals.spend > 0 ? revenue / totals.spend : 0;
    const targetRevenue = totals.spend * t;
    return { revenue, actualRoas, targetRevenue, gap: revenue - targetRevenue };
  }, [totals, aov, targetRoas]);

  const maxSpend = Math.max(...allocation.map((a) => a.spend), 1);
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const totalBudget = parseFloat(budget) || 0;
  const targetRoas$ = parseFloat(targetRoas) || 0;
  const meetsTotalTarget = roasCheck.actualRoas >= (targetRoas$ || 1);

  // Donut chart geometry (SVG): cumulative arcs sized by allocation share.
  const donut = useMemo(() => {
    const r = 42;
    const c = 2 * Math.PI * r;
    let acc = 0;
    return allocation.map((a, i) => {
      const len = (a.share / 100) * c;
      const offset = c - acc;
      acc += len;
      return {
        id: a.channel.id,
        name: a.channel.name,
        share: a.share,
        spend: a.spend,
        len,
        gap: c - len,
        offset,
        opacity: ACCENT_OPACITY[i % ACCENT_OPACITY.length],
      };
    });
  }, [allocation]);

  return (
    <div data-tool-theme="marketing" data-tool="ad-budget-allocator">
      <ToolShell
        category="Marketing"
        title="Ad Budget Allocator"
        description="Enter CPC + conversion rate per channel. We split the budget toward channels with the best conversions-per-dollar, using a sqrt-weighted model so allocations aren&rsquo;t winner-take-all."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — verdict chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {fmt(totalBudget)}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                meetsTotalTarget
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-500"
              }`}
            >
              {roasCheck.actualRoas.toFixed(2)}x ROAS
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              media.plan
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {allocation.length} channel{allocation.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Media Plan · Channel Allocation
                </div>

                <div className="mt-3 text-3xl font-semibold tracking-tight text-app md:text-4xl">
                  {fmt(totalBudget)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  across {allocation.length} channel{allocation.length === 1 ? "" : "s"} · {Math.round(totals.conversions).toLocaleString()} expected conversions
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    cpa {totals.conversions > 0 ? fmt(totals.spend / totals.conversions) : "—"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    rev {fmt(roasCheck.revenue)}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    target {targetRoas$.toFixed(1)}x
                  </span>
                </div>
              </div>

              {/* Donut */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="10" />
                    {donut.map((d) => (
                      <circle
                        key={d.id}
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="var(--tool-accent)"
                        strokeOpacity={d.opacity}
                        strokeWidth="10"
                        strokeDasharray={`${d.len} ${d.gap}`}
                        strokeDashoffset={d.offset}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">mix</div>
                    <div className="text-sm font-semibold text-tool-accent">
                      {allocation.length}ch
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — allocation method as segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "equal", label: "Equal" },
                  { k: "roas", label: "ROAS-weighted" },
                  { k: "custom", label: "Custom" },
                  { k: "performance", label: "Performance" },
                ] as { k: Method; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMethod(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    method === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={method === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              {method === "equal" && "even split across enabled channels"}
              {method === "roas" && "linear weight on revenue per dollar"}
              {method === "custom" && "midpoint of each min/max range"}
              {method === "performance" && "sqrt-weighted on conversions per dollar"}
            </div>
          </div>
        </section>

        {/* ============================== BODY ============================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          <ToolCard title="Inputs" subtitle="Per-channel economics">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total budget ($)">
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={inputCls()}
                  min="0"
                  step="500"
                />
              </Field>
              <Field label="Avg order value ($)">
                <input
                  type="number"
                  value={aov}
                  onChange={(e) => setAov(e.target.value)}
                  className={inputCls()}
                  min="0"
                  step="1"
                />
              </Field>
              <Field label="Target ROAS (x)">
                <input
                  type="number"
                  value={targetRoas}
                  onChange={(e) => setTargetRoas(e.target.value)}
                  className={inputCls()}
                  min="0"
                  step="0.1"
                />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-[auto_1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-muted">
              <span />
              <span>Channel</span>
              <span>CPM $</span>
              <span>CPC $</span>
              <span>Conv %</span>
              <span>Min %</span>
              <span>Max %</span>
            </div>

            <div className="mt-1 space-y-2">
              {channels.map((c, i) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[auto_1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr] items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-tool-accent"
                  />
                  <span className={`text-xs ${c.enabled ? "text-app" : "text-faint"}`}>{c.name}</span>
                  <input
                    type="number"
                    value={c.cpm}
                    onChange={(e) => update(i, { cpm: e.target.value })}
                    className={inputCls("text-xs !px-2")}
                    min="0"
                    step="0.1"
                    disabled={!c.enabled}
                  />
                  <input
                    type="number"
                    value={c.cpc}
                    onChange={(e) => update(i, { cpc: e.target.value })}
                    className={inputCls("text-xs !px-2")}
                    min="0"
                    step="0.01"
                    disabled={!c.enabled}
                  />
                  <input
                    type="number"
                    value={c.convRate}
                    onChange={(e) => update(i, { convRate: e.target.value })}
                    className={inputCls("text-xs !px-2")}
                    min="0"
                    step="0.1"
                    disabled={!c.enabled}
                  />
                  <input
                    type="number"
                    value={c.minShare}
                    onChange={(e) => update(i, { minShare: e.target.value })}
                    className={inputCls("text-xs !px-2")}
                    min="0"
                    max="100"
                    step="1"
                    disabled={!c.enabled}
                  />
                  <input
                    type="number"
                    value={c.maxShare}
                    onChange={(e) => update(i, { maxShare: e.target.value })}
                    className={inputCls("text-xs !px-2")}
                    min="0"
                    max="100"
                    step="1"
                    disabled={!c.enabled}
                  />
                </div>
              ))}
            </div>

            <p className="mt-4 text-[0.6rem] text-muted">
              CPM defaults: WordStream Display Benchmarks 2024, Meta Q4&rsquo;24, LinkedIn Marketing Solutions 2024.
              Min/Max % clamps each channel&rsquo;s share; allocator redistributes the rest by marginal conversions.
            </p>
          </ToolCard>

          <ToolCard title="Proposed allocation" subtitle={fmt(parseFloat(budget) || 0) + " total"}>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Expected clicks" value={Math.round(totals.clicks).toLocaleString()} />
              <Stat label="Expected conversions" value={Math.round(totals.conversions).toLocaleString()} accent />
              <Stat label="Blended CPA" value={totals.conversions > 0 ? fmt(totals.spend / totals.conversions) : "—"} />
            </div>

            {/* Stacked bar of allocation, accent opacity ramp */}
            <div className="mt-5">
              <div className="mb-2 flex justify-between font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span>Channel mix</span>
                <span>100%</span>
              </div>
              <div className="flex h-5 w-full overflow-hidden rounded-lg border border-app bg-app">
                {allocation.map((a, i) => (
                  <div
                    key={a.channel.id}
                    className="h-full transition-all"
                    style={{
                      width: `${a.share}%`,
                      backgroundColor: "var(--tool-accent)",
                      opacity: ACCENT_OPACITY[i % ACCENT_OPACITY.length],
                    }}
                    title={`${a.channel.name} · ${a.share.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[0.6rem]">
                {allocation.map((a, i) => (
                  <div key={a.channel.id} className="flex items-center gap-1.5 text-secondary">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{
                        backgroundColor: "var(--tool-accent)",
                        opacity: ACCENT_OPACITY[i % ACCENT_OPACITY.length],
                      }}
                    />
                    <span className="text-app">{a.channel.name}</span>
                    <span className="text-muted">{a.share.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-channel rows */}
            <div className="mt-5 space-y-2.5">
              {allocation.map((a, i) => {
                const aov$ = parseFloat(aov) || 0;
                const channelRevenue = a.conversions * aov$;
                const channelRoas = a.spend > 0 ? channelRevenue / a.spend : 0;
                const meetsTarget = channelRoas >= (targetRoas$ || 1);
                const opacity = ACCENT_OPACITY[i % ACCENT_OPACITY.length];
                return (
                  <div
                    key={a.channel.id}
                    className="rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: "var(--tool-accent)", opacity }}
                        />
                        <span className="font-medium text-app">{a.channel.name}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.15em] ${
                            meetsTarget
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-500"
                          }`}
                        >
                          {channelRoas.toFixed(2)}x ROAS
                        </span>
                      </div>
                      <div className="text-right text-[0.7rem] text-muted">
                        <span className="font-semibold text-app">{fmt(a.spend)}</span>
                        <span className="ml-1 text-faint">· {a.share.toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Allocation slider — drag to nudge minShare/maxShare around current share */}
                    <div className="mt-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(a.share)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          const idx = channels.findIndex((c) => c.id === a.channel.id);
                          if (idx >= 0) {
                            // pin both floor and cap to the slider value to lock this channel's share
                            update(idx, { minShare: String(v), maxShare: String(v) });
                          }
                        }}
                        className="w-full accent-tool-accent"
                        aria-label={`${a.channel.name} share`}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="h-2.5 overflow-hidden rounded-full border border-app bg-app">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(a.spend / maxSpend) * 100}%`,
                            backgroundColor: "var(--tool-accent)",
                            opacity,
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[0.6rem] text-muted sm:justify-end">
                        <span className="rounded border border-app bg-app px-1.5 py-0.5 text-secondary">
                          {Math.round(a.conversions).toLocaleString()} conv
                        </span>
                        <span className="rounded border border-app bg-app px-1.5 py-0.5 text-secondary">
                          {Math.round(a.clicks).toLocaleString()} clicks
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary stat strip */}
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-tool-accent bg-tool-accent-soft p-3 sm:grid-cols-4">
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">Revenue</div>
                <div className="mt-0.5 text-sm font-semibold text-app">{fmt(roasCheck.revenue)}</div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">ROAS</div>
                <div className="mt-0.5 text-sm font-semibold text-app">{roasCheck.actualRoas.toFixed(2)}x</div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">CPA</div>
                <div className="mt-0.5 text-sm font-semibold text-app">
                  {totals.conversions > 0 ? fmt(totals.spend / totals.conversions) : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Gap vs target
                </div>
                <div
                  className={`mt-0.5 text-sm font-semibold ${
                    roasCheck.gap >= 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {fmt(roasCheck.gap)}
                </div>
              </div>
            </div>

            <p className="mt-5 text-[0.65rem] text-muted">
              Model caveats: assumes linear conversion rate (no saturation), independent channels (no halo effect),
              and stable auctions. Treat as a starting point, then rebalance monthly on actual blended CPA/ROAS.
            </p>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
