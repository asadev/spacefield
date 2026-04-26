"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// Illustrative all-in (base + bonus + equity) midpoints in USD, drawn from
// publicly reported ranges on Levels.fyi, Glassdoor medians, and national
// compensation surveys. Numbers are conservative midpoints, not offers.
// For each {role,level,market}: [low, p50, high] in thousands USD.

type LevelKey = "I" | "II" | "III" | "Sr" | "Staff" | "Principal" | "Director";
type MarketKey = "us-sf" | "us-ny" | "us-nat" | "uk-lon" | "uae-dxb" | "eu-ber";

const MARKETS: { key: MarketKey; label: string; short: string; flag: string }[] = [
  { key: "us-sf", label: "US — San Francisco Bay Area", short: "SF Bay", flag: "US" },
  { key: "us-ny", label: "US — New York metro", short: "NY metro", flag: "US" },
  { key: "us-nat", label: "US — National average", short: "US avg", flag: "US" },
  { key: "uk-lon", label: "UK — London", short: "London", flag: "UK" },
  { key: "uae-dxb", label: "UAE — Dubai / Abu Dhabi", short: "Dubai", flag: "AE" },
  { key: "eu-ber", label: "EU — Berlin / Amsterdam", short: "Berlin", flag: "EU" },
];

const LEVELS: LevelKey[] = ["I", "II", "III", "Sr", "Staff", "Principal", "Director"];

type Range = [number, number, number]; // low, p50, high (thousands USD)

interface RoleDef {
  slug: string;
  title: string;
  marketMult: Record<MarketKey, number>;
  byLevel: Partial<Record<LevelKey, Range>>;
}

const MARKET_MULT_TECH: Record<MarketKey, number> = {
  "us-sf": 1.35,
  "us-ny": 1.2,
  "us-nat": 1.0,
  "uk-lon": 0.72,
  "uae-dxb": 0.78,
  "eu-ber": 0.62,
};

const MARKET_MULT_BIZ: Record<MarketKey, number> = {
  "us-sf": 1.2,
  "us-ny": 1.25,
  "us-nat": 1.0,
  "uk-lon": 0.82,
  "uae-dxb": 0.88,
  "eu-ber": 0.7,
};

const ROLES: RoleDef[] = [
  { slug: "swe", title: "Software Engineer", marketMult: MARKET_MULT_TECH, byLevel: { I: [100, 130, 160], II: [130, 165, 200], III: [170, 210, 260], Sr: [210, 265, 340], Staff: [280, 360, 470], Principal: [360, 470, 620], Director: [380, 500, 700] } },
  { slug: "pm", title: "Product Manager", marketMult: MARKET_MULT_TECH, byLevel: { I: [110, 140, 170], II: [140, 175, 215], III: [170, 215, 270], Sr: [210, 265, 340], Staff: [275, 350, 450], Principal: [340, 440, 570], Director: [360, 470, 650] } },
  { slug: "designer", title: "Product Designer", marketMult: MARKET_MULT_TECH, byLevel: { I: [90, 115, 140], II: [115, 145, 180], III: [145, 180, 225], Sr: [180, 230, 290], Staff: [230, 295, 370], Principal: [290, 370, 470], Director: [320, 410, 540] } },
  { slug: "data-scientist", title: "Data Scientist", marketMult: MARKET_MULT_TECH, byLevel: { I: [105, 135, 165], II: [135, 170, 210], III: [170, 215, 275], Sr: [215, 275, 350], Staff: [275, 355, 460], Principal: [345, 450, 590], Director: [370, 490, 680] } },
  { slug: "devops-sre", title: "DevOps / SRE", marketMult: MARKET_MULT_TECH, byLevel: { I: [100, 130, 160], II: [130, 165, 205], III: [165, 210, 265], Sr: [210, 270, 345], Staff: [275, 355, 460], Principal: [350, 460, 600], Director: [370, 490, 670] } },
  { slug: "ml-engineer", title: "ML / AI Engineer", marketMult: MARKET_MULT_TECH, byLevel: { I: [120, 155, 190], II: [155, 200, 250], III: [200, 260, 330], Sr: [260, 340, 440], Staff: [340, 450, 600], Principal: [440, 600, 820], Director: [470, 640, 900] } },
  { slug: "ae-b2b-saas", title: "Account Executive (B2B SaaS)", marketMult: MARKET_MULT_BIZ, byLevel: { I: [75, 100, 130], II: [100, 135, 170], III: [140, 180, 225], Sr: [180, 230, 300], Staff: [230, 300, 400], Principal: [290, 380, 520], Director: [310, 420, 600] } },
  { slug: "marketing-mgr", title: "Marketing Manager", marketMult: MARKET_MULT_BIZ, byLevel: { I: [65, 85, 110], II: [85, 110, 140], III: [110, 140, 175], Sr: [140, 175, 225], Staff: [175, 225, 290], Principal: [225, 290, 380], Director: [260, 340, 460] } },
  { slug: "finance", title: "Finance / FP&A", marketMult: MARKET_MULT_BIZ, byLevel: { I: [70, 90, 115], II: [90, 115, 145], III: [115, 145, 185], Sr: [145, 185, 240], Staff: [185, 240, 310], Principal: [235, 310, 410], Director: [275, 370, 510] } },
  { slug: "hr-bp", title: "HR Business Partner", marketMult: MARKET_MULT_BIZ, byLevel: { I: [65, 85, 105], II: [85, 105, 130], III: [105, 130, 165], Sr: [130, 165, 210], Staff: [165, 210, 270], Principal: [210, 270, 350], Director: [240, 310, 420] } },
];

function rangeFor(role: RoleDef, level: LevelKey, market: MarketKey): Range | null {
  const base = role.byLevel[level];
  if (!base) return null;
  const m = role.marketMult[market];
  return [base[0] * m, base[1] * m, base[2] * m];
}

function fmtK(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}M`;
  return `$${Math.round(n)}k`;
}

const SENIORITY_STEPS: { key: string; label: string; mult: number }[] = [
  { key: "step1", label: "Entering level (step 1)", mult: 0.92 },
  { key: "step2", label: "Solid / performing (step 2)", mult: 1.0 },
  { key: "step3", label: "Top-of-level (step 3)", mult: 1.12 },
];

type ViewKey = "band" | "comparison" | "geo" | "offer";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "band", label: "Band" },
  { key: "comparison", label: "Compare roles" },
  { key: "geo", label: "Geo spread" },
  { key: "offer", label: "Offer sheet" },
];

export default function SalaryBenchmarkPage() {
  const [roleSlug, setRoleSlug] = useState<string>("swe");
  const [level, setLevel] = useState<LevelKey>("Sr");
  const [market, setMarket] = useState<MarketKey>("us-sf");
  const [step, setStep] = useState<string>("step2");
  const [candidateName, setCandidateName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [yourNumber, setYourNumber] = useState<string>("");
  const [view, setView] = useState<ViewKey>("band");

  const role = useMemo(() => ROLES.find((r) => r.slug === roleSlug) || ROLES[0], [roleSlug]);
  const rawSelected = rangeFor(role, level, market);
  const stepMult = SENIORITY_STEPS.find((s) => s.key === step)?.mult ?? 1.0;
  const selected: Range | null = rawSelected
    ? [rawSelected[0] * stepMult, rawSelected[1] * stepMult, rawSelected[2] * stepMult]
    : null;

  // derive percentile values p10 / p25 / p50 / p75 / p90 from low/mid/high
  const percentiles = useMemo(() => {
    if (!selected) return null;
    const [low, mid, high] = selected;
    const p10 = low - (mid - low) * 0.6; // stretch below low
    const p25 = low;
    const p50 = mid;
    const p75 = high;
    const p90 = high + (high - mid) * 0.6; // stretch above high
    return { p10, p25, p50, p75, p90 };
  }, [selected]);

  // position of a value on the bar as percentage (0..100), domain p10..p90
  function posOnBar(value: number): number | null {
    if (!percentiles) return null;
    const { p10, p90 } = percentiles;
    if (p90 === p10) return 50;
    const pct = ((value - p10) / (p90 - p10)) * 100;
    return Math.max(-4, Math.min(104, pct));
  }

  const yourNum = parseFloat(yourNumber.replace(/[^0-9.]/g, ""));
  const yourPos = !isNaN(yourNum) && yourNum > 0 ? posOnBar(yourNum) : null;
  const yourVerdict = useMemo(() => {
    if (!percentiles || isNaN(yourNum) || yourNum <= 0) return null;
    if (yourNum < percentiles.p25) return { label: "Below band", tone: "warn" as const };
    if (yourNum < percentiles.p50) return { label: "Lower half", tone: "mid" as const };
    if (yourNum < percentiles.p75) return { label: "Upper half", tone: "good" as const };
    if (yourNum < percentiles.p90) return { label: "Top quartile", tone: "great" as const };
    return { label: "Off the chart", tone: "wow" as const };
  }, [percentiles, yourNum]);

  function downloadOfferSheet() {
    if (!selected) return;
    const marketLabel = MARKETS.find((m) => m.key === market)?.label || market;
    const stepLabel = SENIORITY_STEPS.find((s) => s.key === step)?.label || step;
    const low = Math.round(selected[0]) * 1000;
    const mid = Math.round(selected[1]) * 1000;
    const high = Math.round(selected[2]) * 1000;
    const baseShare = 0.7;
    const bonusShare = 0.12;
    const equityShare = 0.18;
    const text = `OFFER SHEET (DRAFT)
================================
Company:       ${companyName || "[Company]"}
Candidate:     ${candidateName || "[Candidate]"}
Role:          ${role.title}
Level:         ${level} — ${stepLabel}
Market:        ${marketLabel}
Prepared:      ${new Date().toISOString().slice(0, 10)}

COMPENSATION RANGE (All-in, USD)
================================
Low (p25):     $${low.toLocaleString()}
Midpoint:      $${mid.toLocaleString()}
High (p75):    $${high.toLocaleString()}

SUGGESTED MIDPOINT OFFER SPLIT
================================
Base salary    (${(baseShare * 100).toFixed(0)}%): $${Math.round(mid * baseShare).toLocaleString()}
Target bonus   (${(bonusShare * 100).toFixed(0)}%): $${Math.round(mid * bonusShare).toLocaleString()}
Equity (annual) (${(equityShare * 100).toFixed(0)}%): $${Math.round(mid * equityShare).toLocaleString()}

BENEFITS SUMMARY (TEMPLATE)
================================
- Health, dental, vision — employer covers 85%
- 401(k) / pension match up to 4% of base
- 20 days PTO + 10 company holidays
- Remote / hybrid flexibility
- Learning budget $2,000/yr
- Parental leave per company policy

NOTES
================================
Ranges are illustrative midpoints drawn from Levels.fyi, Radford Tech
Compensation Survey 2024, and Glassdoor medians. Final offer should reflect
candidate's evidence, calibration against current team, and current comp
bands reviewed with People Ops.
`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offer-sheet-${(candidateName || "candidate").replace(/\s+/g, "-")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // "Similar roles" — same level + market, delta vs selected midpoint
  const similar = useMemo(() => {
    if (!selected) return [];
    const myMid = selected[1];
    return ROLES
      .filter((r) => r.slug !== role.slug)
      .map((r) => {
        const rr = rangeFor(r, level, market);
        if (!rr) return null;
        const mid = rr[1] * stepMult;
        return { slug: r.slug, title: r.title, mid, delta: mid - myMid };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs((a!.delta)) - Math.abs((b!.delta))) as {
        slug: string; title: string; mid: number; delta: number;
      }[];
  }, [role, level, market, stepMult, selected]);

  const marketObj = MARKETS.find((m) => m.key === market);

  return (
    <ToolShell
      category="HR & People"
      title="Salary Benchmark"
      description="Compare role salaries across key global markets. Illustrative midpoints — cross-check with current sources before negotiating."
    >
      <div data-tool-theme="hr" data-tool="salary-benchmark" className="space-y-5">
        {/* ============================== HERO ============================== */}
        <section className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-app-elevated">
          {/* Title strip with role + level pills */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              comp.benchmark
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {role.title}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              L:{level}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {marketObj?.short}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {SENIORITY_STEPS.find((s) => s.key === step)?.label.split(" ")[0]}
            </span>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              USD · annualized · all-in
            </div>
          </div>

          {/* Hero percentile distribution chart */}
          <div className="px-5 py-7 sm:px-8">
            {!percentiles ? (
              <div className="text-sm text-muted">No data for this combination.</div>
            ) : (
              <>
                <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Percentile distribution · p10 → p90
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-app sm:text-3xl">
                  {fmtK(percentiles.p50)}
                  <span className="ml-2 text-base font-normal text-muted">median band</span>
                </h2>

                {/* Distribution chart */}
                <div className="relative mt-8 pt-12 pb-16">
                  {/* Employee marker (your number) */}
                  {yourPos !== null && (
                    <div
                      className="absolute top-0 z-10 -translate-x-1/2"
                      style={{ left: `${yourPos}%` }}
                    >
                      <div className="flex flex-col items-center">
                        <span className="rounded-md bg-tool-accent px-2 py-0.5 font-mono text-[0.6rem] font-bold tabular-nums text-app-elevated shadow-sm" style={{ color: "var(--bg)" }}>
                          YOU · {fmtK(yourNum)}
                        </span>
                        <span className="h-2.5 w-0.5 bg-tool-accent" />
                        {/* Employee dot marker */}
                        <span className="h-3 w-3 -translate-y-1 rounded-full border-2 border-app-elevated bg-tool-accent shadow-sm" />
                      </div>
                    </div>
                  )}

                  {/* Distribution curve (bell-shaped via stacked rectangles) */}
                  <div className="relative h-12">
                    {(() => {
                      // five buckets p10..p25, p25..p50, p50..p75, p75..p90, with p50 being the tallest
                      const heights = [22, 56, 96, 56, 22]; // % heights forming a bell
                      return heights.map((h, i) => {
                        const left = (i / heights.length) * 100;
                        const width = 100 / heights.length;
                        return (
                          <div
                            key={i}
                            className="absolute bottom-0 bg-tool-accent-soft border-t border-tool-accent"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              height: `${h}%`,
                              opacity: 0.55 + h / 250,
                            }}
                          />
                        );
                      });
                    })()}
                  </div>

                  {/* Baseline */}
                  <div className="relative h-px bg-tool-accent" />

                  {/* Percentile tick marks */}
                  {(["p10", "p25", "p50", "p75", "p90"] as const).map((pk) => {
                    const val = percentiles[pk];
                    const pos = posOnBar(val) ?? 0;
                    const emphasized = pk === "p50";
                    return (
                      <div
                        key={pk}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${pos}%`, top: "calc(48px + 12px)" }}
                      >
                        <div className="flex flex-col items-center">
                          <div
                            className={
                              emphasized
                                ? "h-4 w-[3px] rounded-b-full bg-tool-accent"
                                : "h-3 w-px bg-tool-accent opacity-60"
                            }
                          />
                          <div className="mt-1.5 text-center">
                            <div
                              className={
                                emphasized
                                  ? "font-mono text-sm font-bold tabular-nums text-tool-accent"
                                  : "font-mono text-xs font-semibold tabular-nums text-secondary"
                              }
                            >
                              {fmtK(val)}
                            </div>
                            <div className="mt-0.5 font-mono text-[0.55rem] font-medium uppercase tracking-[0.18em] text-muted">
                              {pk}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Five percentile cards */}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <PercentileCard label="p10" sub="Floor" value={fmtK(percentiles.p10)} />
                  <PercentileCard label="p25" sub="Entry" value={fmtK(percentiles.p25)} />
                  <PercentileCard label="p50" sub="Median" value={fmtK(percentiles.p50)} emphasized />
                  <PercentileCard label="p75" sub="Top quartile" value={fmtK(percentiles.p75)} />
                  <PercentileCard label="p90" sub="Outlier" value={fmtK(percentiles.p90)} />
                </div>
              </>
            )}
          </div>

          {/* Inline query selectors — role+level+market+step+your-number */}
          <div className="border-t border-app bg-app px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <QueryField label="Role">
                <select
                  value={roleSlug}
                  onChange={(e) => setRoleSlug(e.target.value)}
                  className={fieldCls}
                >
                  {ROLES.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.title}</option>
                  ))}
                </select>
              </QueryField>
              <QueryField label="Level">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as LevelKey)}
                  className={fieldCls}
                >
                  {LEVELS.map((l) => (<option key={l} value={l}>{l}</option>))}
                </select>
              </QueryField>
              <QueryField label="Location">
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value as MarketKey)}
                  className={fieldCls}
                >
                  {MARKETS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </QueryField>
              <QueryField label="Step">
                <select
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  className={fieldCls}
                >
                  {SENIORITY_STEPS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </QueryField>
              <QueryField label="Your number (k)">
                <input
                  value={yourNumber}
                  onChange={(e) => setYourNumber(e.target.value)}
                  placeholder="e.g. 265"
                  inputMode="numeric"
                  className={fieldCls}
                />
              </QueryField>
            </div>
            {yourVerdict && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-medium text-tool-accent">
                  {yourVerdict.label}
                </span>
                <span className="text-secondary">
                  {yourVerdict.tone === "warn" && "You're below the published entry of the band."}
                  {yourVerdict.tone === "mid" && "Sitting in the lower half of market. Room to push."}
                  {yourVerdict.tone === "good" && "Upper half of the band — healthy position."}
                  {yourVerdict.tone === "great" && "Top quartile territory. Defend hard in negotiation."}
                  {yourVerdict.tone === "wow" && "Above p90 — either unique scope or an outlier offer."}
                </span>
              </div>
            )}
          </div>

          {/* Sub-tab strip — state buttons */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    view === v.key
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              {ROLES.length} roles · {MARKETS.length} markets · {LEVELS.length} levels
            </div>
          </div>
        </section>

        {/* ============================== COMPARISON ============================== */}
        {view === "comparison" && similar.length > 0 && selected && (
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-5 py-3">
              <div>
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Side-by-side comparison
                </div>
                <h3 className="text-sm font-semibold text-app">
                  Similar roles · {level} · {marketObj?.short}
                </h3>
              </div>
              <div className="font-mono text-[0.6rem] tabular-nums text-muted">
                Δ vs {fmtK(selected[1])}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app bg-app text-left">
                    <th className="px-5 py-2.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-right font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                      Median
                    </th>
                    <th className="px-3 py-2.5 text-right font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                      Δ vs you
                    </th>
                    <th className="px-5 py-2.5 text-right font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Selected role highlighted */}
                  <tr className="border-b border-app bg-tool-accent-soft">
                    <td className="px-5 py-2.5 font-semibold text-app">
                      <span className="mr-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">▸ you</span>
                      {role.title}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-tool-accent">
                      {fmtK(selected[1])}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">—</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-muted">—</td>
                  </tr>
                  {similar.map((s) => {
                    const pct = selected[1] ? (s.delta / selected[1]) * 100 : 0;
                    const positive = s.delta > 0;
                    return (
                      <tr key={s.slug} className="border-b border-app last:border-b-0 hover:bg-app">
                        <td className="px-5 py-2.5 text-app">{s.title}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-secondary">
                          {fmtK(s.mid)}
                        </td>
                        <td
                          className={
                            "px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums " +
                            (positive ? "text-emerald-500" : "text-rose-500")
                          }
                        >
                          {positive ? "+" : ""}
                          {fmtK(Math.abs(s.delta))}
                        </td>
                        <td
                          className={
                            "px-5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums " +
                            (positive ? "text-emerald-500" : "text-rose-500")
                          }
                        >
                          {positive ? "+" : ""}
                          {pct.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ============================== GEO SPREAD ============================== */}
        {view === "geo" && (
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="border-b border-app bg-app px-5 py-3">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Geographic spread
              </div>
              <h3 className="text-sm font-semibold text-app">
                {role.title} · {level} across markets
              </h3>
            </div>
            <div className="px-5 py-4">
              {(() => {
                const matrix = MARKETS.map((m) => ({ market: m, range: rangeFor(role, level, m.key) }));
                const maxHigh = Math.max(...matrix.map((m) => (m.range ? m.range[2] : 0)), 1);
                return (
                  <div className="space-y-2.5">
                    {matrix.map(({ market: m, range }) => {
                      const isCurrent = m.key === market;
                      return (
                        <div key={m.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-sm">
                          <div className={`w-32 ${isCurrent ? "font-semibold text-tool-accent" : "text-app"}`}>
                            {isCurrent && <span className="mr-1 font-mono text-[0.6rem]">▸</span>}
                            {m.short}
                          </div>
                          {range ? (
                            <>
                              <div className="relative h-2.5 w-full rounded-full bg-app">
                                <div
                                  className="absolute h-2.5 rounded-full bg-tool-accent-soft"
                                  style={{
                                    left: `${(range[0] / maxHigh) * 100}%`,
                                    width: `${((range[2] - range[0]) / maxHigh) * 100}%`,
                                  }}
                                />
                                <div
                                  className="absolute -top-1 h-4 w-0.5 bg-tool-accent"
                                  style={{ left: `${(range[1] / maxHigh) * 100}%` }}
                                />
                              </div>
                              <div className={`w-28 text-right font-mono text-xs tabular-nums ${isCurrent ? "font-semibold text-tool-accent" : "text-secondary"}`}>
                                {fmtK(range[1])}
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2 text-xs text-muted">No data</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* ============================== OFFER SHEET ============================== */}
        {view === "offer" && (
          <section className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="border-b border-app bg-app px-5 py-3">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Export
              </div>
              <h3 className="text-sm font-semibold text-app">Offer sheet</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <QueryField label="Company">
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={fieldCls}
                    placeholder="Your company"
                  />
                </QueryField>
                <QueryField label="Candidate">
                  <input
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    className={fieldCls}
                    placeholder="Candidate name"
                  />
                </QueryField>
              </div>
              <button
                type="button"
                onClick={downloadOfferSheet}
                disabled={!selected}
                className="inline-flex items-center gap-2 rounded-lg bg-tool-accent px-4 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-40"
                style={{ color: "var(--bg)" }}
              >
                <span>↓</span> Download offer sheet (.txt)
              </button>
              <p className="text-[0.65rem] text-muted">
                Includes company/candidate, role, band, suggested base/bonus/equity split (70/12/18), and a benefits template.
              </p>
            </div>
          </section>
        )}

        {/* ============================== FOOTNOTES ============================== */}
        <div className="rounded-2xl border border-app bg-app-elevated p-5 text-xs text-secondary">
          <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Pay-equity footnote
          </div>
          <p>
            OECD 2024: the unadjusted gender pay gap across OECD countries is ~11.1%. Even after controlling for occupation and experience, a residual 4–7% gap persists. When setting offers, calibrate against the band for the role — not the candidate&apos;s salary history.
          </p>
        </div>

        <div className="rounded-2xl border border-app bg-app-elevated p-5 text-xs text-secondary">
          <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            Methodology
          </div>
          <p>
            Figures are illustrative all-in compensation midpoints in USD (base + target bonus + equity run-rate). Composed from Levels.fyi, Glassdoor medians, and regional surveys, adjusted with a per-market index. Use as a first-pass check only — cross-reference with a current primary source before making offers.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}

/* Sub-components */

const fieldCls =
  "w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app shadow-sm outline-none transition focus:border-tool-accent focus:ring-2 focus:ring-tool-accent placeholder:text-faint";

function QueryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function PercentileCard({
  label,
  sub,
  value,
  emphasized = false,
}: {
  label: string;
  sub: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app")
      }
    >
      <div className="flex items-baseline justify-between">
        <span
          className={
            "font-mono text-[0.55rem] font-bold uppercase tracking-[0.2em] " +
            (emphasized ? "text-tool-accent" : "text-muted")
          }
        >
          {label}
        </span>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">{sub}</span>
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-base font-semibold text-app")
        }
      >
        {value}
      </div>
    </div>
  );
}
