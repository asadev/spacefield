"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { Field, inputCls } from "../../_components/ToolCard";

type Platform = "instagram" | "x" | "linkedin" | "tiktok" | "youtube";
type IndustryBand = "general" | "b2b" | "b2c" | "finance" | "fashion" | "tech" | "gaming";

// 2026 benchmark ranges for mid-tier accounts (10k-100k followers).
// Industry-specific multipliers tuned from RivalIQ 2024 + Socialinsider 2024.
// Base bench: { poor, average, great } as decimal %
const BASE_BENCHMARKS: Record<Platform, { poor: number; average: number; great: number; basis: string }> = {
  instagram: { poor: 0.5, average: 1.2, great: 3.0, basis: "followers" },
  x: { poor: 0.3, average: 0.8, great: 1.8, basis: "followers" },
  linkedin: { poor: 1.5, average: 3.5, great: 6.5, basis: "followers" },
  tiktok: { poor: 2.5, average: 5.5, great: 10.0, basis: "views" },
  youtube: { poor: 1.5, average: 4.0, great: 8.0, basis: "views" },
};

// Industry multiplier vs base (1.0 = general). Source: RivalIQ Social Benchmark 2024.
const INDUSTRY_MULT: Record<IndustryBand, { label: string; mult: Record<Platform, number> }> = {
  general: { label: "General", mult: { instagram: 1.0, x: 1.0, linkedin: 1.0, tiktok: 1.0, youtube: 1.0 } },
  b2b: { label: "B2B / SaaS", mult: { instagram: 0.7, x: 1.1, linkedin: 1.4, tiktok: 0.6, youtube: 0.9 } },
  b2c: { label: "B2C retail", mult: { instagram: 1.1, x: 0.9, linkedin: 0.6, tiktok: 1.2, youtube: 1.0 } },
  finance: { label: "Finance / Banking", mult: { instagram: 0.8, x: 1.2, linkedin: 1.3, tiktok: 0.7, youtube: 0.8 } },
  fashion: { label: "Fashion / Beauty", mult: { instagram: 1.4, x: 0.8, linkedin: 0.5, tiktok: 1.5, youtube: 1.1 } },
  tech: { label: "Tech / Hardware", mult: { instagram: 1.0, x: 1.3, linkedin: 1.2, tiktok: 1.0, youtube: 1.3 } },
  gaming: { label: "Gaming / Esports", mult: { instagram: 1.3, x: 1.5, linkedin: 0.4, tiktok: 1.8, youtube: 1.6 } },
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const PLATFORM_GLYPH: Record<Platform, string> = {
  instagram: "IG",
  x: "X",
  linkedin: "in",
  tiktok: "TT",
  youtube: "YT",
};

export default function EngagementRatePage() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [industryBand, setIndustryBand] = useState<IndustryBand>("general");
  const [followers, setFollowers] = useState("25000");
  const [views, setViews] = useState("12000");
  const [likes, setLikes] = useState("850");
  const [comments, setComments] = useState("45");
  const [shares, setShares] = useState("20");
  const [saves, setSaves] = useState("60");

  const { rate, totalInteractions, denom, denomLabel } = useMemo(() => {
    const f = parseFloat(followers) || 0;
    const v = parseFloat(views) || 0;
    const l = parseFloat(likes) || 0;
    const c = parseFloat(comments) || 0;
    const sh = parseFloat(shares) || 0;
    const sa = parseFloat(saves) || 0;

    let interactions = 0;
    let denom = 0;
    let denomLabel = "";

    switch (platform) {
      case "instagram":
        interactions = l + c + sh + sa;
        denom = f;
        denomLabel = "followers";
        break;
      case "x":
        interactions = l + c + sh;
        denom = f;
        denomLabel = "followers";
        break;
      case "linkedin":
        // LinkedIn ER = (reactions + comments + shares) / followers
        interactions = l + c + sh;
        denom = f;
        denomLabel = "followers";
        break;
      case "tiktok":
        // TikTok ER = (likes + comments + shares + saves) / views
        interactions = l + c + sh + sa;
        denom = v;
        denomLabel = "views";
        break;
      case "youtube":
        // YouTube ER = (likes + comments) / views
        interactions = l + c;
        denom = v;
        denomLabel = "views";
        break;
    }

    const rate = denom > 0 ? (interactions / denom) * 100 : 0;
    return { rate, totalInteractions: interactions, denom, denomLabel };
  }, [platform, followers, views, likes, comments, shares, saves]);

  const baseBench = BASE_BENCHMARKS[platform];
  const mult = INDUSTRY_MULT[industryBand].mult[platform];
  const b = {
    poor: baseBench.poor * mult,
    average: baseBench.average * mult,
    great: baseBench.great * mult,
    basis: baseBench.basis,
  };
  const verdict =
    rate >= b.great ? "Great" : rate >= b.average ? "Average" : rate >= b.poor ? "Below average" : "Poor";
  const verdictTone: "good" | "ok" | "bad" =
    rate >= b.average ? "good" : rate >= b.poor ? "ok" : "bad";

  const usesViews = b.basis === "views";

  // Numbers for grid card breakdown
  const lN = parseFloat(likes) || 0;
  const cN = parseFloat(comments) || 0;
  const shN = parseFloat(shares) || 0;
  const saN = parseFloat(saves) || 0;
  const totalForBars = Math.max(1, lN + cN + shN + saN);

  const metrics: { label: string; value: number; show: boolean }[] = [
    { label: platform === "linkedin" ? "Reactions" : "Likes", value: lN, show: true },
    { label: "Comments", value: cN, show: true },
    { label: platform === "x" ? "Retweets" : "Shares", value: shN, show: platform !== "youtube" },
    { label: "Saves", value: saN, show: platform === "instagram" || platform === "tiktok" },
  ].filter((m) => m.show);

  // Marker position on benchmark band — clamp to band visualization scale
  const bandMax = b.great * 1.5;
  const markerPct = Math.max(0, Math.min(99, (rate / bandMax) * 100));
  const poorEnd = (b.poor / bandMax) * 100;
  const avgEnd = (b.average / bandMax) * 100;
  const greatEnd = (b.great / bandMax) * 100;

  const verdictBlurb =
    platform === "linkedin"
      ? "LinkedIn rewards text + carousels over links. If you're below 1.5% you're pushing too many URLs."
      : platform === "tiktok"
      ? "TikTok averages ~5.5% on views. Below that means the hook isn't holding — rework the first 2 seconds."
      : platform === "youtube"
      ? "YouTube: likes + comments ÷ views. Watch time matters more for reach, but ER still signals affinity."
      : platform === "x"
      ? "X engagement collapsed post-algorithm changes. 0.8%+ on followers is now respectable."
      : "Instagram: saves weight heaviest algorithmically. Measure saves trend, not just likes.";

  return (
    <ToolShell
      category="Marketing"
      title="Social Engagement Rate"
      description="Platform-specific engagement rate using the right denominator (followers vs views) and 2026 benchmarks per network."
    >
      <div data-tool-theme="marketing" data-tool="engagement-rate" className="space-y-6">
        {/* Platform tabs — segmented pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-app bg-app-elevated p-1.5">
          {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                platform === p
                  ? "bg-tool-accent text-app-elevated"
                  : "text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
              }`}
              style={platform === p ? { color: "var(--bg)" } : undefined}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-md text-[0.55rem] font-bold ${
                  platform === p ? "bg-app-elevated/20 text-app-elevated" : "bg-tool-accent-soft text-tool-accent"
                }`}
                style={platform === p ? { color: "var(--bg)" } : undefined}
              >
                {PLATFORM_GLYPH[p]}
              </span>
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>

        {/* Verdict hero */}
        <section className="tool-hero relative overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="relative px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                  {PLATFORM_LABEL[platform]} · {INDUSTRY_MULT[industryBand].label} · 10k–100k accounts
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <div className="font-mono text-5xl font-bold tabular-nums text-app sm:text-6xl">
                    {rate.toFixed(2)}%
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.7rem] font-semibold ${
                      verdictTone === "good"
                        ? "bg-tool-accent text-app-elevated"
                        : verdictTone === "ok"
                        ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/30"
                        : "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/30"
                    }`}
                    style={verdictTone === "good" ? { color: "var(--bg)" } : undefined}
                  >
                    {verdict}
                  </span>
                </div>
                <div className="mt-1 text-[0.7rem] tabular-nums text-muted">
                  {Math.round(totalInteractions).toLocaleString()} interactions ÷ {Math.round(denom).toLocaleString()} {denomLabel}
                </div>
              </div>
              <div className="grid min-w-[14rem] grid-cols-3 gap-2 text-center">
                <BenchCell label="Poor" value={`< ${b.poor.toFixed(2)}%`} tone="bad" />
                <BenchCell label="Avg" value={`${b.average.toFixed(2)}%`} tone="ok" />
                <BenchCell label="Great" value={`> ${b.great.toFixed(2)}%`} tone="good" />
              </div>
            </div>

            {/* Benchmark band */}
            <div className="mt-6">
              <div className="relative h-3 overflow-hidden rounded-full bg-app">
                <div
                  className="absolute inset-y-0 left-0 bg-rose-500/30"
                  style={{ width: `${poorEnd}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-amber-500/30"
                  style={{ left: `${poorEnd}%`, width: `${avgEnd - poorEnd}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-emerald-500/35"
                  style={{ left: `${avgEnd}%`, width: `${greatEnd - avgEnd}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-emerald-500/55"
                  style={{ left: `${greatEnd}%`, right: 0 }}
                />
                <div
                  className="absolute -top-1 h-5 w-[3px] rounded-full bg-tool-accent"
                  style={{ left: `${markerPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[0.6rem] tabular-nums text-muted">
                <span>0%</span>
                <span>poor</span>
                <span>average</span>
                <span>great</span>
                <span>{(bandMax).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Inputs row */}
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-app">Post inputs</div>
              <div className="text-[0.65rem] text-muted">Per-post metrics — denominator switches with platform</div>
            </div>
            <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold text-tool-accent">
              ÷ {denomLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Industry band">
              <select value={industryBand} onChange={(e) => setIndustryBand(e.target.value as IndustryBand)} className={inputCls()}>
                {(Object.keys(INDUSTRY_MULT) as IndustryBand[]).map((i) => (
                  <option key={i} value={i}>
                    {INDUSTRY_MULT[i].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Followers">
              <input
                type="number"
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
                className={inputCls()}
                min="0"
              />
            </Field>
            <Field label="Views" hint={usesViews ? "used as denominator" : "optional"}>
              <input
                type="number"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                className={inputCls()}
                min="0"
              />
            </Field>
            <Field label={platform === "linkedin" ? "Reactions" : "Likes"}>
              <input
                type="number"
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                className={inputCls()}
                min="0"
              />
            </Field>
            <Field label="Comments">
              <input
                type="number"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className={inputCls()}
                min="0"
              />
            </Field>
            {platform !== "youtube" && (
              <Field label={platform === "x" ? "Retweets" : "Shares"}>
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className={inputCls()}
                  min="0"
                />
              </Field>
            )}
            {(platform === "instagram" || platform === "tiktok") && (
              <Field label="Saves">
                <input
                  type="number"
                  value={saves}
                  onChange={(e) => setSaves(e.target.value)}
                  className={inputCls()}
                  min="0"
                />
              </Field>
            )}
          </div>
        </div>

        {/* Social-post grid cards: this post + variant per industry */}
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-app">Post breakdown · cross-industry view</div>
              <div className="text-[0.65rem] text-muted">
                Your post compared against every industry band on {PLATFORM_LABEL[platform]}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Primary: this post */}
            <PostCard
              isPrimary
              platform={platform}
              industryLabel={INDUSTRY_MULT[industryBand].label}
              rate={rate}
              bench={b}
              metrics={metrics}
              totalForBars={totalForBars}
            />
            {(Object.keys(INDUSTRY_MULT) as IndustryBand[])
              .filter((ind) => ind !== industryBand)
              .map((ind) => {
                const m = INDUSTRY_MULT[ind].mult[platform];
                const indB = {
                  poor: baseBench.poor * m,
                  average: baseBench.average * m,
                  great: baseBench.great * m,
                  basis: baseBench.basis,
                };
                return (
                  <PostCard
                    key={ind}
                    platform={platform}
                    industryLabel={INDUSTRY_MULT[ind].label}
                    rate={rate}
                    bench={indB}
                    metrics={metrics}
                    totalForBars={totalForBars}
                  />
                );
              })}
          </div>
        </div>

        {/* Verdict footer */}
        <div className="rounded-xl border border-app border-l-2 border-l-tool-accent bg-tool-accent-soft p-4 text-xs leading-relaxed text-secondary">
          <span className="font-semibold text-app">Verdict: {verdict}.</span>{" "}
          {verdictBlurb}
          <div className="mt-1.5 text-[0.6rem] text-muted">
            Benchmarks: RivalIQ Social Benchmark 2024, Socialinsider 2024.
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

function BenchCell({ label, value, tone }: { label: string; value: string; tone: "good" | "ok" | "bad" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/25"
      : tone === "ok"
      ? "bg-amber-500/10 text-amber-500 ring-amber-500/25"
      : "bg-rose-500/10 text-rose-500 ring-rose-500/25";
  return (
    <div className={`rounded-lg ring-1 ${cls} px-2 py-1.5`}>
      <div className="text-[0.55rem] uppercase tracking-[0.2em] opacity-80">{label}</div>
      <div className="text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PostCard({
  isPrimary = false,
  platform,
  industryLabel,
  rate,
  bench,
  metrics,
  totalForBars,
}: {
  isPrimary?: boolean;
  platform: Platform;
  industryLabel: string;
  rate: number;
  bench: { poor: number; average: number; great: number; basis: string };
  metrics: { label: string; value: number }[];
  totalForBars: number;
}) {
  const tone: "good" | "ok" | "bad" =
    rate >= bench.average ? "good" : rate >= bench.poor ? "ok" : "bad";
  const chipCls =
    tone === "good"
      ? "bg-tool-accent text-app-elevated"
      : tone === "ok"
      ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/30"
      : "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/30";
  const bandMax = bench.great * 1.5;
  const markerPct = Math.max(0, Math.min(99, (rate / bandMax) * 100));
  const avgEnd = (bench.average / bandMax) * 100;
  const greatEnd = (bench.great / bandMax) * 100;

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        isPrimary
          ? "border-tool-accent ring-1 ring-tool-accent/30 bg-app-elevated"
          : "border-app bg-app-elevated"
      }`}
    >
      {/* Mock post preview */}
      <div className="tool-hero relative aspect-[4/3] border-b border-app">
        <div className="absolute left-3 top-3 inline-flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-tool-accent text-[0.6rem] font-bold"
            style={{ color: "var(--bg)" }}
          >
            {PLATFORM_GLYPH[platform]}
          </span>
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
            {industryLabel}
          </span>
        </div>
        {isPrimary && (
          <span
            className="absolute right-3 top-3 rounded-full bg-tool-accent px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider"
            style={{ color: "var(--bg)" }}
          >
            Your post
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`font-mono text-3xl font-bold tabular-nums ${isPrimary ? "text-app" : "text-secondary"}`}>
              {rate.toFixed(2)}%
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-semibold ${chipCls}`}
              style={tone === "good" ? { color: "var(--bg)" } : undefined}
            >
              {tone === "good" ? "On / above avg" : tone === "ok" ? "Below avg" : "Poor"}
            </span>
          </div>
        </div>
        {/* Mini benchmark band overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5">
          <div className="relative h-full bg-app">
            <div className="absolute inset-y-0 bg-amber-500/40" style={{ left: 0, width: `${avgEnd}%` }} />
            <div className="absolute inset-y-0 bg-emerald-500/45" style={{ left: `${avgEnd}%`, width: `${greatEnd - avgEnd}%` }} />
            <div className="absolute inset-y-0 bg-emerald-500/65" style={{ left: `${greatEnd}%`, right: 0 }} />
            <div
              className="absolute -top-0.5 h-2.5 w-[2px] bg-tool-accent"
              style={{ left: `${markerPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metric mini-bars */}
      <div className="space-y-2.5 p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Breakdown
          </div>
          <div className="text-[0.6rem] tabular-nums text-muted">
            avg {bench.average.toFixed(2)}% · great {bench.great.toFixed(2)}%
          </div>
        </div>
        {metrics.map((m) => {
          const pct = (m.value / totalForBars) * 100;
          return (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between text-[0.7rem]">
                <span className="text-secondary">{m.label}</span>
                <span className="font-semibold tabular-nums text-tool-accent">
                  {Math.round(m.value).toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-app">
                <div
                  className="h-full rounded-full bg-tool-accent transition-all"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
