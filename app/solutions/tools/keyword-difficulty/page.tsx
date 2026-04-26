"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Competitor = { dr: string; wordCount: string; backlinks: string; type: SerpType };
type SerpType = "homepage" | "pillar" | "blog" | "product" | "directory" | "forum" | "video";

const SERP_TYPE_LABEL: Record<SerpType, string> = {
  homepage: "Homepage",
  pillar: "Pillar page",
  blog: "Blog post",
  product: "Product page",
  directory: "Directory/listicle",
  forum: "Forum (Reddit/Quora)",
  video: "Video/YouTube",
};

// Difficulty multiplier by SERP type — high-DR homepages harder to displace than forum posts.
const SERP_TYPE_MULT: Record<SerpType, number> = {
  homepage: 1.15,
  pillar: 1.1,
  blog: 1.0,
  product: 1.05,
  directory: 0.9,
  forum: 0.7,
  video: 0.8,
};
type Intent = "exact" | "strong" | "partial" | "weak";

const INTENT_SCORE: Record<Intent, number> = { exact: 100, strong: 75, partial: 50, weak: 25 };
const INTENT_LABEL: Record<Intent, string> = {
  exact: "Exact — your page answers the query directly",
  strong: "Strong — you cover the topic in depth",
  partial: "Partial — related but not the primary answer",
  weak: "Weak — only tangentially related",
};

// Difficulty components normalized to 0-100 each, then weighted.
// DR 40%, content quality 25%, backlinks 20%, intent 15% (inverse — stronger intent = lower difficulty).
const DR_W = 0.4;
const CONTENT_W = 0.25;
const BACKLINK_W = 0.2;
const INTENT_W = 0.15;

// Visual-only mock SERP rows, derived from competitor inputs for display.
const MOCK_SERP_TITLES = [
  "The Ultimate Guide — what works in 2026",
  "Top picks reviewed by experts",
  "How to choose: a buyer's checklist",
  "Best tools compared (with pricing)",
  "Reddit thread: real user opinions",
  "Listicle: 12 options ranked",
  "YouTube: 8-min explainer",
  "Pricing & feature breakdown",
  "Case studies from real teams",
  "Why most guides get this wrong",
];
const MOCK_DOMAINS = [
  "hubspot.com",
  "zapier.com",
  "g2.com",
  "capterra.com",
  "reddit.com",
  "forbes.com",
  "youtube.com",
  "techradar.com",
  "trustradius.com",
  "softwareadvice.com",
];

const MOCK_VOLUME = "4.4K";
const MOCK_CPC = "$12.40";
const MOCK_RELATED = [
  "best crm software",
  "crm for startups",
  "free crm tools",
  "small business crm comparison",
  "hubspot vs salesforce",
  "crm pricing 2026",
  "easy crm for solopreneurs",
  "best crm reddit",
];

type ViewKey = "single" | "bulk" | "compare";

export default function KeywordDifficultyPage() {
  const [keyword, setKeyword] = useState("best crm for small business");
  const [intent, setIntent] = useState<Intent>("strong");
  const [yourDr, setYourDr] = useState("35");
  const [view, setView] = useState<ViewKey>("single");
  const [competitors, setCompetitors] = useState<Competitor[]>([
    { dr: "78", wordCount: "3200", backlinks: "480", type: "pillar" },
    { dr: "72", wordCount: "2800", backlinks: "310", type: "blog" },
    { dr: "65", wordCount: "2100", backlinks: "180", type: "blog" },
    { dr: "60", wordCount: "1800", backlinks: "90", type: "directory" },
    { dr: "52", wordCount: "1600", backlinks: "55", type: "forum" },
  ]);

  const addCompetitor = () =>
    setCompetitors((p) => [...p, { dr: "50", wordCount: "1500", backlinks: "50", type: "blog" }]);
  const removeCompetitor = (i: number) =>
    setCompetitors((p) => p.filter((_, idx) => idx !== i));
  const updateCompetitor = (i: number, patch: Partial<Competitor>) =>
    setCompetitors((p) => p.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const { difficulty, drScore, contentScore, backlinkScore, intentScore, avgDr, avgWords, avgLinks, gap, typeCounts, typeMultAvg, opportunity } =
    useMemo(() => {
      const n = competitors.length || 1;
      const drVals = competitors.map((c) => parseFloat(c.dr) || 0);
      const wordVals = competitors.map((c) => parseFloat(c.wordCount) || 0);
      const linkVals = competitors.map((c) => parseFloat(c.backlinks) || 0);

      const avgDr = drVals.reduce((a, b) => a + b, 0) / n;
      const avgWords = wordVals.reduce((a, b) => a + b, 0) / n;
      const avgLinks = linkVals.reduce((a, b) => a + b, 0) / n;

      // DR score: avg DR is already 0-100.
      const drScore = Math.min(100, avgDr);
      // Content score: 3,000 words ~ 100 difficulty, floor 20 for any top-10 page.
      const contentScore = Math.min(100, 20 + (avgWords / 3000) * 80);
      // Backlinks: logarithmic — 500 avg backlinks ~ 100.
      const backlinkScore = Math.min(100, (Math.log10(avgLinks + 1) / Math.log10(501)) * 100);
      // Intent: inverse — stronger intent reduces difficulty.
      const intentScore = 100 - INTENT_SCORE[intent];

      // SERP-type multiplier: avg across top competitors
      const typeMultAvg = competitors.reduce((s, c) => s + (SERP_TYPE_MULT[c.type] ?? 1), 0) / n;

      const rawDiff =
        drScore * DR_W + contentScore * CONTENT_W + backlinkScore * BACKLINK_W + intentScore * INTENT_W;
      const difficulty = Math.min(100, rawDiff * typeMultAvg);

      const gap = avgDr - (parseFloat(yourDr) || 0);

      // SERP type breakdown
      const typeCounts = {} as Record<SerpType, number>;
      (Object.keys(SERP_TYPE_LABEL) as SerpType[]).forEach((t) => (typeCounts[t] = 0));
      competitors.forEach((c) => (typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1));

      // Opportunity score: inverse of difficulty, weighted by intent strength
      const opportunity = Math.max(
        0,
        Math.min(100, (100 - difficulty) * (0.6 + INTENT_SCORE[intent] / 250))
      );

      return { difficulty, drScore, contentScore, backlinkScore, intentScore, avgDr, avgWords, avgLinks, gap, typeCounts, typeMultAvg, opportunity };
    }, [competitors, intent, yourDr]);

  const verdict =
    difficulty < 35 ? "Go" : difficulty < 55 ? "Worth it" : difficulty < 75 ? "Hard" : "Skip";

  // Difficulty band — keeps semantic colors (easy/medium/hard/very-hard).
  const band =
    difficulty < 35
      ? {
          label: "Easy",
          tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-500",
          bar: "bg-emerald-500",
          verdictTone: "text-emerald-500",
        }
      : difficulty < 55
      ? {
          label: "Medium",
          tone: "border-amber-500/40 bg-amber-500/15 text-amber-500",
          bar: "bg-amber-500",
          verdictTone: "text-amber-500",
        }
      : difficulty < 75
      ? {
          label: "Hard",
          tone: "border-orange-500/40 bg-orange-500/15 text-orange-500",
          bar: "bg-orange-500",
          verdictTone: "text-orange-500",
        }
      : {
          label: "Very Hard",
          tone: "border-rose-500/40 bg-rose-500/15 text-rose-500",
          bar: "bg-rose-500",
          verdictTone: "text-rose-500",
        };

  return (
    <div data-tool-theme="marketing" data-tool="keyword-difficulty">
      <ToolShell
        category="Marketing"
        title="Keyword Difficulty Estimator"
        description="Heuristic difficulty score 0-100 weighted across competitor DR (40%), content length (25%), backlinks (20%), and intent match (15%). Gather the inputs from your SEO tool — this is the math layer."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — verdict + keyword chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${band.tone}`}
            >
              {band.label}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              kw:{(keyword || "untitled").toLowerCase().split(/\s+/).slice(0, 2).join("-")}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              keyword.difficulty
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(keyword || "untitled").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.score
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {competitors.length} competitor{competitors.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Target Keyword · Difficulty Estimator
                </div>

                <div className="mt-3">
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="best crm for small business"
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    vol <span className="ml-1 text-app">{MOCK_VOLUME}/mo</span>
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    cpc <span className="ml-1 text-app">{MOCK_CPC}</span>
                  </span>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    opp {opportunity.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* difficulty score readout */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-4 py-3">
                <div className="text-right">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Difficulty
                  </div>
                  <div className="font-mono text-4xl font-bold leading-none text-tool-accent">
                    {difficulty.toFixed(0)}
                  </div>
                  <div className={`mt-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${band.verdictTone}`}>
                    {verdict}
                  </div>
                </div>
                <div className="h-14 w-px bg-app" />
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    0 — 100
                  </div>
                  <div className="mt-1 h-2 w-24 overflow-hidden rounded-full border border-app bg-app">
                    <div
                      className={`h-full ${band.bar}`}
                      style={{ width: `${Math.min(100, Math.max(0, difficulty))}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[0.5rem] uppercase tracking-[0.14em] text-faint">
                    <span>easy</span>
                    <span>brutal</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "single", label: "Single" },
                  { k: "bulk", label: "Bulk" },
                  { k: "compare", label: "Compare" },
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

            <div className="ml-auto flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              <span className="text-tool-accent">▸</span>
              type mult
              <span className="text-app">{typeMultAvg.toFixed(2)}x</span>
            </div>
          </div>
        </section>

        {view === "bulk" && (
          <ToolCard title="Bulk mode" subtitle="Coming next — paste a list of keywords" className="mb-6">
            <p className="text-sm text-secondary">
              Bulk scoring runs the same heuristic across a list of keywords. For now, switch back to{" "}
              <button
                onClick={() => setView("single")}
                className="font-semibold text-tool-accent underline-offset-2 hover:underline"
              >
                Single
              </button>{" "}
              to score one keyword at a time.
            </p>
          </ToolCard>
        )}

        {view === "compare" && (
          <ToolCard title="Compare mode" subtitle="Coming next — A/B two keywords side-by-side" className="mb-6">
            <p className="text-sm text-secondary">
              Compare mode will line up two keywords with their difficulty + opportunity scores. For now, switch to{" "}
              <button
                onClick={() => setView("single")}
                className="font-semibold text-tool-accent underline-offset-2 hover:underline"
              >
                Single
              </button>
              .
            </p>
          </ToolCard>
        )}

        {view === "single" && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
              <ToolCard title="Inputs" subtitle="Target + top 10 rough estimates">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Your domain DR / DA (0-100)">
                      <input
                        type="number"
                        value={yourDr}
                        onChange={(e) => setYourDr(e.target.value)}
                        className={inputCls()}
                        min="0"
                        max="100"
                      />
                    </Field>
                    <Field label="Intent match">
                      <select value={intent} onChange={(e) => setIntent(e.target.value as Intent)} className={inputCls()}>
                        <option value="exact">Exact</option>
                        <option value="strong">Strong</option>
                        <option value="partial">Partial</option>
                        <option value="weak">Weak</option>
                      </select>
                    </Field>
                  </div>
                  <p className="text-[0.65rem] text-muted">{INTENT_LABEL[intent]}</p>

                  <div>
                    <div className="mb-2 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                      <span>Top-10 competitors</span>
                      <button
                        onClick={addCompetitor}
                        className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                        style={{ ["--hover-color" as string]: "var(--bg)" }}
                      >
                        + add
                      </button>
                    </div>
                    <div className="grid grid-cols-[0.8fr_0.8fr_0.8fr_1.2fr_auto] gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
                      <span>DR</span>
                      <span>Words</span>
                      <span>Links</span>
                      <span>SERP type</span>
                      <span />
                    </div>
                    <div className="mt-1 space-y-2">
                      {competitors.map((c, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-[0.8fr_0.8fr_0.8fr_1.2fr_auto] gap-1.5 rounded-lg border border-app bg-app-elevated p-1.5"
                        >
                          <input
                            type="number"
                            value={c.dr}
                            onChange={(e) => updateCompetitor(i, { dr: e.target.value })}
                            className={inputCls("text-xs !px-2")}
                            min="0"
                            max="100"
                          />
                          <input
                            type="number"
                            value={c.wordCount}
                            onChange={(e) => updateCompetitor(i, { wordCount: e.target.value })}
                            className={inputCls("text-xs !px-2")}
                            min="0"
                          />
                          <input
                            type="number"
                            value={c.backlinks}
                            onChange={(e) => updateCompetitor(i, { backlinks: e.target.value })}
                            className={inputCls("text-xs !px-2")}
                            min="0"
                          />
                          <select
                            value={c.type}
                            onChange={(e) => updateCompetitor(i, { type: e.target.value as SerpType })}
                            className={inputCls("text-xs !px-2")}
                          >
                            {(Object.keys(SERP_TYPE_LABEL) as SerpType[]).map((t) => (
                              <option key={t} value={t}>{SERP_TYPE_LABEL[t]}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeCompetitor(i)}
                            className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                            aria-label="Remove competitor"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ToolCard>

              <ToolCard title="Difficulty" subtitle={keyword || "Your keyword"}>
                <Stat label="Overall difficulty" value={`${difficulty.toFixed(0)} / 100`} accent />

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Stat label="DR component (40%)" value={drScore.toFixed(0)} />
                  <Stat label="Content (25%)" value={contentScore.toFixed(0)} />
                  <Stat label="Backlinks (20%)" value={backlinkScore.toFixed(0)} />
                  <Stat label="Intent (15%)" value={intentScore.toFixed(0)} />
                </div>

                <div className="mt-5 rounded-lg border border-app bg-app-elevated p-4 text-xs text-secondary">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Competitor averages</div>
                  <div className="flex justify-between">
                    <span>Avg DR</span>
                    <span className="text-app">{avgDr.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg word count</span>
                    <span className="text-app">{Math.round(avgWords).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg backlinks</span>
                    <span className="text-app">{Math.round(avgLinks).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-app pt-2">
                    <span>DR gap vs you</span>
                    <span
                      className={
                        gap > 20
                          ? "text-rose-500"
                          : gap > 0
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      {gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-sm">
                  <span className="text-muted">Verdict: </span>
                  <span className={`${band.verdictTone} font-semibold`}>{verdict}</span>
                  <span className="text-muted">
                    {" "}
                    — Heuristic only. Pair with SERP analysis: if intent matches and you can out-depth the top 3, DR gap is surmountable.
                  </span>
                </p>

                <div className="mt-4 rounded-lg border border-app bg-app-elevated p-4">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    SERP composition · type mult {typeMultAvg.toFixed(2)}x
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {(Object.keys(SERP_TYPE_LABEL) as SerpType[])
                      .filter((t) => typeCounts[t] > 0)
                      .map((t) => {
                        const pct = (typeCounts[t] / competitors.length) * 100;
                        const mult = SERP_TYPE_MULT[t];
                        return (
                          <div key={t} className="flex items-center gap-2">
                            <span className="w-36 text-secondary">{SERP_TYPE_LABEL[t]}</span>
                            <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-app">
                              <div
                                className={`h-full ${
                                  mult < 1
                                    ? "bg-emerald-500/60"
                                    : mult > 1
                                    ? "bg-rose-500/60"
                                    : "bg-tool-accent"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-16 text-right text-muted">
                              {typeCounts[t]}× ({mult}x)
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="mt-2 text-[0.6rem] text-muted">
                    Forum/video SERPs are easier to displace; high-DR homepages/pillar pages harder.
                    Multiplier tunes the final score accordingly.
                  </p>
                </div>
              </ToolCard>
            </div>

            {/* SERP-style results + related keywords */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
              <ToolCard title="Top 10 SERP preview" subtitle="Mock Google rows · DA/PA chips per result">
                <div className="space-y-3">
                  {competitors.slice(0, 10).map((c, i) => {
                    const dr = parseFloat(c.dr) || 0;
                    const pa = Math.max(5, Math.round(dr - 6 - i * 1.5));
                    const drChip =
                      dr >= 70
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                        : dr >= 50
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-500";
                    const domain = MOCK_DOMAINS[i % MOCK_DOMAINS.length];
                    const title = MOCK_SERP_TITLES[i % MOCK_SERP_TITLES.length];
                    const slug = (keyword || "topic")
                      .toLowerCase()
                      .replace(/\s+/g, "-")
                      .replace(/[^a-z0-9-]/g, "");
                    return (
                      <div
                        key={i}
                        className="group rounded-xl border border-app bg-app-elevated p-3.5 transition-colors hover:border-tool-accent"
                      >
                        <div className="flex items-center gap-2 font-mono text-[0.65rem] text-muted">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-app bg-app font-mono text-[0.6rem] font-semibold text-secondary">
                            {i + 1}
                          </span>
                          <span className="truncate">{domain}</span>
                          <span className="text-faint">›</span>
                          <span className="truncate text-faint">{slug}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-tool-accent">
                          {title}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[0.6rem]">
                          <span className={`rounded-full border px-2 py-[2px] uppercase tracking-[0.14em] ${drChip}`}>
                            DA {dr.toFixed(0)}
                          </span>
                          <span className="rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-[2px] uppercase tracking-[0.14em] text-tool-accent">
                            PA {pa}
                          </span>
                          <span className="rounded-full border border-app bg-app px-2 py-[2px] uppercase tracking-[0.14em] text-secondary">
                            {SERP_TYPE_LABEL[c.type]}
                          </span>
                          <span className="rounded-full border border-app bg-app px-2 py-[2px] uppercase tracking-[0.14em] text-secondary">
                            {(parseFloat(c.wordCount) || 0).toLocaleString()} words
                          </span>
                          <span className="rounded-full border border-app bg-app px-2 py-[2px] uppercase tracking-[0.14em] text-secondary">
                            {(parseFloat(c.backlinks) || 0).toLocaleString()} backlinks
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {competitors.length === 0 && (
                    <div className="rounded-xl border border-dashed border-app bg-app p-6 text-center text-xs text-muted">
                      Add competitors to preview the SERP.
                    </div>
                  )}
                </div>
              </ToolCard>

              <ToolCard title="Related keywords" subtitle="Expansion ideas">
                <ul className="space-y-2">
                  {MOCK_RELATED.map((kw, i) => (
                    <li
                      key={kw}
                      className="flex items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2 text-xs transition-colors hover:border-tool-accent"
                    >
                      <span className="flex items-center gap-2 truncate text-secondary">
                        <span className="font-mono text-faint">#{i + 1}</span>
                        <span className="truncate text-app">{kw}</span>
                      </span>
                      <span className="ml-2 flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full border border-app bg-app px-2 py-[1px] font-mono text-[0.55rem] uppercase tracking-[0.14em] text-muted">
                          vol {(1 + ((i * 7) % 9)) * 110}
                        </span>
                        <span className="h-1.5 w-12 overflow-hidden rounded-full border border-app bg-app">
                          <span
                            className="block h-full bg-tool-accent"
                            style={{ width: `${30 + ((i * 13) % 60)}%` }}
                          />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.6rem] text-muted">
                  Illustrative only — pull true volumes from your SEO source and feed them into the inputs above.
                </p>
              </ToolCard>
            </div>
          </>
        )}
      </ToolShell>
    </div>
  );
}
