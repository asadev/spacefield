"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// Word lists adapted from the CoSchedule Emotional Marketing Value (EMV)
// word banks and common copywriter "power word" references (Jon Morrow,
// Smart Blogger, etc). Categories follow the CoSchedule-style breakdown:
// emotional (EMV), power (persuasive), common (stop-wordish), uncommon
// (rare/striking). These are heuristic — not a replacement for testing.
// Sources: CoSchedule Headline Analyzer EMV list; Smart Blogger 800+
// power words; AIDA copywriting frameworks.

// ~150 emotional words
const EMOTIONAL_WORDS = new Set(
  `love hate fear joy pain shock scary terrifying surprising heartbreaking inspiring hope dream remarkable beloved devastating brilliant genius ridiculous absurd crazy insane wild shocking painful miserable happy furious angry blissful cheerful delighted ecstatic elated euphoric glad gleeful gratified jubilant overjoyed pleased thrilled upbeat amazed astonished astounded stunned dazzled bewildered breathless panicked anxious worried desperate hopeless broken bitter resentful enraged livid outraged heartache grief sorrow regret ashamed embarrassed humiliated proud triumphant victorious vindicated inspired motivated encouraged hopeful optimistic confident fearless bold daring brave courageous doubt confused uncertain nervous scared afraid terrified horrified spooked chilling creepy haunting sinister tragic dreadful agony torture nightmare paradise heaven blessed sacred divine eternal intimate tender loving passionate romantic sensual seductive tempting alluring magnetic captivating enchanting mesmerizing spellbinding hypnotic irresistible compelling riveting gripping electrifying exhilarating breathtaking jaw-dropping unforgettable haunting magical mystical wondrous miraculous extraordinary epic legendary iconic fateful destiny betrayed abandoned rejected lonely empty heartbroken vulnerable raw fragile wounded scarred cherished adored worshipped`.split(
    /\s+/,
  ),
);

// ~100 power words (persuasion / marketing)
const POWER_WORDS = new Set(
  `free instant proven guaranteed secret exclusive ultimate essential powerful revolutionary breakthrough effortless stunning amazing incredible extraordinary unstoppable undeniable irresistible killer dominate unleash transform master unlock skyrocket explode crush demolish bonus limited urgent rare never-before new first now today only save discover reveal uncover expose hidden exposed banned forbidden insider elite premium advanced expert professional quick simple easy smart proven tested backed certified warranted results-driven boost accelerate amplify magnify double triple multiply guaranteed lifetime forever permanent lasting reliable trusted foolproof bulletproof hack trick shortcut formula blueprint framework system method strategy tactic recipe playbook cheatsheet loophole risk-free no-brainer must-have game-changer can't-miss`.split(
    /\s+/,
  ),
);

// ~100 common words (articles, pronouns, auxiliaries, small glue)
const COMMON_WORDS = new Set(
  `the a an of to in for on at by with from is are was were be been being am and or but if as how why what when where who which this that these those you your yours we our ours us i me my mine he him his she her hers they them their theirs it its do does did done doing have has had having will would shall should can could may might must ought about into onto over under through between among against around above below within without upon across after before during while since until unless than then there here now also just only very more most`.split(
    /\s+/,
  ),
);

const POSITIVE_WORDS = new Set(
  `best better great awesome good win winning success successful smart clever brilliant love boost grow gain improve easy simple fast quick fresh new perfect excellent top thrilling delightful joyful happy pleasant favorable positive`.split(
    /\s+/,
  ),
);
const NEGATIVE_WORDS = new Set(
  `worst bad terrible awful hate fail failure broken wrong dead dumb stupid hard painful difficult impossible lose lost losing never avoid stop quit dangerous risky toxic harmful disastrous catastrophic`.split(
    /\s+/,
  ),
);

// ~80 uncommon / striking words that catch the eye
const UNCOMMON_WORDS = new Set(
  `kaleidoscope quixotic labyrinth paradox ephemeral serendipity zeitgeist juxtapose epiphany metamorphosis conundrum enigma manifesto renaissance mirage obelisk alchemy odyssey crucible pantheon vanguard linchpin archetype echelon threshold catalyst beacon citadel bastion sanctum pinnacle zenith apex acumen cadence cascade cipher cipher-like distill fracture fathom forge heretical herald heretic iconoclast imperative juggernaut kindred luminary lodestar maelstrom magnum opus monolith nexus oasis paragon prism quagmire quintessence rapture reckoning sanctuary silhouette symposium tapestry tempest torrent trove vessel vortex whisperer cipher hallmark fulcrum keystone tether`.split(
    /\s+/,
  ),
);

type Breakdown = {
  score: number;
  length: number;
  lengthScore: number;
  wordCount: number;
  powerCount: number;
  emotionalCount: number;
  commonCount: number;
  commonPct: number;
  uncommonCount: number;
  emotionalPct: number;
  powerPct: number;
  sentiment: "positive" | "neutral" | "negative";
  isQuestion: boolean;
  hasNumber: boolean;
  specific: boolean;
  clarityScore: number;
  suggestions: string[];
  components: { label: string; value: number; max: number }[];
};

function analyze(headline: string): Breakdown | null {
  const h = headline.trim();
  if (!h) return null;
  const words = (h.match(/\b[a-zA-Z0-9']+\b/g) || []).map((w) => w.toLowerCase());
  if (words.length === 0) return null;

  let power = 0;
  let emotional = 0;
  let common = 0;
  let uncommon = 0;
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POWER_WORDS.has(w)) power++;
    if (EMOTIONAL_WORDS.has(w)) emotional++;
    if (COMMON_WORDS.has(w)) common++;
    if (UNCOMMON_WORDS.has(w)) uncommon++;
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }

  const commonPct = (common / words.length) * 100;
  const emotionalPct = (emotional / words.length) * 100;
  const powerPct = (power / words.length) * 100;
  const sentiment: "positive" | "neutral" | "negative" =
    pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
  const isQuestion = /\?$|^(how|why|what|when|where|who|which|can|will|do|does|is|are)\b/i.test(h);
  const hasNumber = /\d/.test(h);
  const specific = hasNumber || uncommon > 0 || power > 0;

  // Length scoring — ideal 50-60
  const len = h.length;
  let lengthScore = 0;
  if (len >= 50 && len <= 60) lengthScore = 20;
  else if (len >= 40 && len <= 70) lengthScore = 15;
  else if (len >= 30 && len <= 80) lengthScore = 10;
  else lengthScore = 5;

  // Clarity: words per headline, preference for 6-12 words; avoid jargon bomb
  const clarityScore = (() => {
    let s = 10;
    if (words.length >= 6 && words.length <= 12) s = 15;
    else if (words.length < 5 || words.length > 14) s = 5;
    // complex word penalty: >3 syllables approximation — count uncommon non-emotional
    return Math.max(0, s);
  })();

  const emotionalScore = Math.min(20, emotional * 7 + power * 5);
  const commonScore =
    commonPct >= 20 && commonPct <= 50 ? 15 : commonPct > 0 && commonPct < 80 ? 10 : 5;
  const uncommonScore = uncommon > 0 ? 10 : 0;
  const structureScore = (isQuestion ? 8 : 0) + (hasNumber ? 12 : 0);
  const sentimentScore = sentiment !== "neutral" ? 5 : 0;

  const score = Math.min(
    100,
    Math.max(
      0,
      lengthScore +
        emotionalScore +
        commonScore +
        uncommonScore +
        structureScore +
        sentimentScore +
        (specific ? 10 : 0) +
        clarityScore,
    ),
  );

  const suggestions: string[] = [];
  if (len < 40) suggestions.push("Headline is short — consider expanding to 50-60 characters for better SEO + social.");
  if (len > 70) suggestions.push("Headline is long — search engines truncate around 60 chars. Trim.");
  if (power === 0 && emotional === 0) suggestions.push("No power or emotional words detected. Add one to pull attention (e.g. proven, instant, shocking).");
  if (!hasNumber) suggestions.push("No numbers — list headlines with specific numbers (7 Ways, 3 Rules) tend to outperform.");
  if (sentiment === "neutral") suggestions.push("Tone is neutral. A clear positive or negative angle lifts click-through.");
  if (commonPct < 20) suggestions.push("Too few common words — readers skim common-word scaffolding. Make it more conversational.");
  if (commonPct > 60) suggestions.push("Too many filler words. Cut stopwords, keep strong verbs and nouns.");
  if (!isQuestion && words.length < 6) suggestions.push("Consider framing as a question or statement with clearer promise.");
  if (uncommon === 0 && emotional === 0) suggestions.push("Add one striking or rare word — pattern-interrupts pull attention.");

  const components = [
    { label: "Length", value: lengthScore, max: 20 },
    { label: "Emotional / power", value: emotionalScore, max: 20 },
    { label: "Common-word balance", value: commonScore, max: 15 },
    { label: "Clarity (word count)", value: clarityScore, max: 15 },
    { label: "Specificity", value: specific ? 10 : 0, max: 10 },
    { label: "Uncommon word", value: uncommonScore, max: 10 },
    { label: "Structure (Q / #)", value: structureScore, max: 20 },
    { label: "Sentiment", value: sentimentScore, max: 5 },
  ];

  return {
    score,
    length: len,
    lengthScore,
    wordCount: words.length,
    powerCount: power,
    emotionalCount: emotional,
    commonCount: common,
    commonPct,
    uncommonCount: uncommon,
    emotionalPct,
    powerPct,
    sentiment,
    isQuestion,
    hasNumber,
    specific,
    clarityScore,
    suggestions,
    components,
  };
}

function scoreBand(score: number): { label: string; tone: "great" | "ok" | "poor" } {
  if (score >= 70) return { label: "Great", tone: "great" };
  if (score >= 50) return { label: "OK", tone: "ok" };
  return { label: "Poor", tone: "poor" };
}

// A/B headline variant generators — templated around the topic.
function generateVariants(topic: string): string[] {
  const t = topic.trim().replace(/^(the|a|an)\s+/i, "").trim();
  if (!t) return [];
  const Cap = t.charAt(0).toUpperCase() + t.slice(1);
  const year = new Date().getFullYear();
  return [
    `7 Proven Ways to Master ${Cap} (Without the Fluff)`,
    `Why ${Cap} Is Broken — and What Actually Works in ${year}`,
    `The Secret ${Cap} Playbook Nobody Shares`,
    `How to Nail ${Cap} in Under 10 Minutes`,
    `${Cap}: The Beginner's Guide That Skips the Jargon`,
    `Stop Wasting Time on ${Cap} — Try This Instead`,
    `3 Mistakes Killing Your ${Cap} (and How to Fix Them Today)`,
    `The Ultimate ${Cap} Checklist for ${year}`,
    `What Every Expert Wishes You Knew About ${Cap}`,
    `${Cap} Without the Guesswork: A Straightforward System`,
  ];
}

const STORAGE_H = "solutions:headline-analyzer:headline:v1";
const STORAGE_T = "solutions:headline-analyzer:topic:v1";
const STORAGE_TAB = "solutions:headline-analyzer:tab:v1";

type Tab = "score" | "suggestions" | "variants";

export default function HeadlineAnalyzerPage() {
  const [headline, setHeadline] = useState("7 Proven Ways to Write Headlines That Get Clicks");
  const [topic, setTopic] = useState("email marketing for B2B SaaS");
  const [tab, setTab] = useState<Tab>("score");

  useEffect(() => {
    try {
      const h = localStorage.getItem(STORAGE_H);
      if (h != null) setHeadline(h);
      const t = localStorage.getItem(STORAGE_T);
      if (t != null) setTopic(t);
      const tb = localStorage.getItem(STORAGE_TAB) as Tab | null;
      if (tb === "score" || tb === "suggestions" || tb === "variants") setTab(tb);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_H, headline);
    } catch {}
  }, [headline]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_T, topic);
    } catch {}
  }, [topic]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TAB, tab);
    } catch {}
  }, [tab]);

  const b = useMemo(() => analyze(headline), [headline]);

  const variants = useMemo(() => {
    return generateVariants(topic).map((v) => ({
      headline: v,
      analysis: analyze(v),
    }));
  }, [topic]);

  const sortedVariants = useMemo(() => {
    return variants.slice().sort((a, b) => (b.analysis?.score || 0) - (a.analysis?.score || 0));
  }, [variants]);

  const band = b ? scoreBand(b.score) : null;
  const ringPct = b ? Math.max(0, Math.min(100, b.score)) : 0;
  const RADIUS = 70;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC - (ringPct / 100) * CIRC;

  const bandPillCls = band
    ? band.tone === "great"
      ? "bg-tool-accent text-black"
      : band.tone === "ok"
        ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
        : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
    : "";

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "score", label: "Score" },
    { id: "suggestions", label: "Suggestions", count: b?.suggestions.length || 0 },
    { id: "variants", label: "A / B Variants", count: variants.length },
  ];

  return (
    <ToolShell
      category="Writing & Content"
      title="Headline Analyzer"
      description="Score headlines 0-100 across length, emotional pull, power words, common-word balance, clarity, specificity, sentiment and structure. Generate A/B variants from a topic."
    >
      <div data-tool-theme="content" data-tool="headline-analyzer">
        {/* Hero — serif headline editor */}
        <div className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-app bg-tool-surface px-5 py-6 sm:px-8 sm:py-7">
          <div className="absolute inset-0 -z-10 opacity-50 [background-image:radial-gradient(circle_at_85%_-20%,var(--tool-accent-soft),transparent_55%)]" />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-tool-accent-soft px-3 py-1 text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              Live scoring
            </div>
            <div className="flex items-center gap-3 text-[0.65rem] tabular-nums text-muted">
              <span>{headline.length} chars</span>
              <span aria-hidden>·</span>
              <span>{b ? b.wordCount : 0} words</span>
              <span aria-hidden>·</span>
              <span
                className={
                  headline.length >= 50 && headline.length <= 60
                    ? "font-semibold text-tool-accent"
                    : ""
                }
              >
                ideal 50-60
              </span>
            </div>
          </div>

          <label className="mb-2 block text-[0.6rem] uppercase tracking-[0.22em] text-muted">
            Headline
          </label>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Type or paste a headline..."
            spellCheck={false}
            className="font-tool-heading w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-muted focus:outline-none sm:text-3xl"
          />
          <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[color:var(--tool-accent-ring)] to-transparent" />
        </div>

        {/* Sub-tabs */}
        <div className="mb-5 flex flex-wrap gap-1.5 rounded-xl border border-app bg-tool-surface p-1.5">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  active
                    ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                    : "text-secondary hover:text-app"
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === "number" && (
                  <span
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[0.6rem] tabular-nums ${
                      active
                        ? "bg-tool-accent text-black"
                        : "bg-app-elevated text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab: Score */}
        {tab === "score" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Score ring panel */}
            <div className="relative overflow-hidden rounded-2xl border border-app bg-tool-surface p-6">
              {!b ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted">
                  Enter a headline to score it.
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative h-56 w-56">
                    <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
                      <circle
                        cx="80"
                        cy="80"
                        r={RADIUS}
                        fill="none"
                        className="stroke-app"
                        strokeWidth="10"
                        opacity="0.35"
                      />
                      <circle
                        cx="80"
                        cy="80"
                        r={RADIUS}
                        fill="none"
                        className="stroke-tool-accent transition-all duration-500"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={dashOffset}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="font-tool-heading text-6xl font-bold tabular-nums text-app">
                        {b.score}
                      </div>
                      <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                        out of 100
                      </div>
                    </div>
                  </div>

                  {band && (
                    <div className="mt-5 flex flex-col items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${bandPillCls}`}
                      >
                        {band.label}
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-muted">
                        <span className="rounded-full bg-app-elevated px-2 py-0.5">
                          {b.sentiment}
                        </span>
                        <span className="rounded-full bg-app-elevated px-2 py-0.5">
                          {b.isQuestion ? "question" : "statement"}
                        </span>
                        <span className="rounded-full bg-app-elevated px-2 py-0.5">
                          {b.specific ? "specific" : "vague"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Components + word mix */}
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl border border-app bg-tool-surface p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <div className="font-tool-heading text-base font-semibold text-app">
                    Score components
                  </div>
                  <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                    8 signals
                  </div>
                </div>
                {!b ? (
                  <div className="rounded-xl border border-dashed border-app p-6 text-center text-xs text-muted">
                    Live breakdown will appear here.
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {b.components.map((c) => {
                      const pct = c.max > 0 ? (c.value / c.max) * 100 : 0;
                      return (
                        <li key={c.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-secondary">{c.label}</span>
                            <span className="font-semibold tabular-nums text-tool-accent">
                              {c.value}
                              <span className="text-muted"> / {c.max}</span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-app-elevated">
                            <div
                              className="h-full rounded-full bg-tool-accent transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-app bg-tool-surface p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <div className="font-tool-heading text-base font-semibold text-app">
                    Word mix
                  </div>
                  <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                    Composition
                  </div>
                </div>
                {!b ? (
                  <div className="rounded-xl border border-dashed border-app p-6 text-center text-xs text-muted">
                    Word breakdown will appear here.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Chip
                      label="Power"
                      value={`${b.powerCount} (${b.powerPct.toFixed(0)}%)`}
                      active={b.powerCount > 0}
                    />
                    <Chip
                      label="Emotional"
                      value={`${b.emotionalCount} (${b.emotionalPct.toFixed(0)}%)`}
                      active={b.emotionalCount > 0}
                    />
                    <Chip
                      label="Common"
                      value={`${b.commonPct.toFixed(0)}%`}
                      active={b.commonPct >= 20 && b.commonPct <= 50}
                    />
                    <Chip
                      label="Uncommon"
                      value={String(b.uncommonCount)}
                      active={b.uncommonCount > 0}
                    />
                    <Chip
                      label={b.hasNumber ? "Has number" : "No number"}
                      value=""
                      active={b.hasNumber}
                    />
                    <Chip
                      label={b.isQuestion ? "Question" : "Statement"}
                      value=""
                      active={b.isQuestion}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Suggestions */}
        {tab === "suggestions" && (
          <div className="rounded-2xl border border-app bg-tool-surface p-5 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <div className="font-tool-heading text-base font-semibold text-app">
                  Suggestions
                </div>
                <div className="text-[0.65rem] text-muted">
                  Concrete fixes to lift the score
                </div>
              </div>
              <span className="rounded-full bg-tool-accent-soft px-2.5 py-1 text-[0.65rem] font-semibold tabular-nums text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                {b?.suggestions.length || 0}
              </span>
            </div>
            {!b || b.suggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-muted">
                {b
                  ? "Nothing to flag — your headline checks out."
                  : "Enter a headline to see suggestions."}
              </div>
            ) : (
              <ul className="space-y-2">
                {b.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border-l-2 border-tool-accent bg-app-elevated p-3.5 text-sm leading-relaxed text-secondary"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-[0.65rem] font-bold tabular-nums text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tab: Variants */}
        {tab === "variants" && (
          <div className="rounded-2xl border border-app bg-tool-surface p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="font-tool-heading text-base font-semibold text-app">
                  A / B variant generator
                </div>
                <div className="text-[0.65rem] text-muted">
                  Enter a topic — get 10 scored variants. Click any row to load it into the analyzer.
                </div>
              </div>
            </div>

            <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.22em] text-muted">
              Topic
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. email marketing for B2B SaaS"
              className="mb-5 w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-muted focus:border-app-focus focus:outline-none"
            />

            {sortedVariants.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-muted">
                Add a topic to generate variants.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-app">
                <div className="grid grid-cols-[3rem_1fr_5rem] gap-3 border-b border-app bg-app-elevated px-4 py-2 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                  <span>Rank</span>
                  <span>Variant</span>
                  <span className="text-right">Score</span>
                </div>
                <ul>
                  {sortedVariants.map((v, i) => {
                    const sc = v.analysis?.score || 0;
                    const tone = sc >= 70 ? "great" : sc >= 50 ? "ok" : "poor";
                    const badgeCls =
                      tone === "great"
                        ? "bg-tool-accent text-black"
                        : tone === "ok"
                          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
                          : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30";
                    return (
                      <li
                        key={i}
                        className="border-b border-app last:border-b-0"
                      >
                        <button
                          onClick={() => {
                            setHeadline(v.headline);
                            setTab("score");
                          }}
                          className="grid w-full grid-cols-[3rem_1fr_5rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app-elevated"
                          title="Click to load into analyzer"
                        >
                          <span className="font-tool-heading text-xs font-semibold tabular-nums text-muted">
                            #{i + 1}
                          </span>
                          <span className="font-tool-heading truncate text-sm text-app">
                            {v.headline}
                          </span>
                          <span className="flex justify-end">
                            <span
                              className={`inline-flex min-w-[2.75rem] justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums ${badgeCls}`}
                            >
                              {sc}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 text-[0.6rem] text-muted">
          Heuristic — CoSchedule EMV, Smart Blogger / Jon Morrow power words, classic stopword + rare-word dictionaries. Not a replacement for testing.
        </div>
      </div>
    </ToolShell>
  );
}

function Chip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${
        active
          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
          : "bg-app-elevated text-muted ring-1 ring-app"
      }`}
    >
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      {value && <span className="tabular-nums opacity-90">{value}</span>}
    </span>
  );
}
