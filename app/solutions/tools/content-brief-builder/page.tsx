"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Intent = "informational" | "commercial" | "transactional";
type Template =
  | "pillar"
  | "comparison"
  | "listicle"
  | "howto"
  | "case-study"
  | "product-review";

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function titleOptions(keyword: string, intent: Intent, template: Template): string[] {
  const k = cap(keyword.trim());
  if (!k) return [];
  const year = new Date().getFullYear();

  // Template-specific title lines take priority.
  if (template === "listicle") {
    return [
      `7 ${k} Tactics That Actually Work in ${year}`,
      `10 ${k} Mistakes Draining Your Results (and the Fixes)`,
      `12 ${k} Ideas You Can Steal Today`,
      `15 Underrated ${k} Moves Pros Quietly Use`,
      `5 ${k} Rules I Wish Someone Had Told Me`,
    ];
  }
  if (template === "howto") {
    return [
      `How to ${k} — A Step-by-Step Playbook (${year})`,
      `How to Nail ${k} in Under 30 Minutes`,
      `The Beginner's Guide: How to ${k} Without Getting Stuck`,
      `How to ${k} Fast (Without Skipping the Details)`,
      `${k}: A 7-Step Walkthrough with Examples`,
    ];
  }
  if (template === "comparison") {
    return [
      `${k} vs Alternatives: Which Actually Wins in ${year}?`,
      `The Best ${k} Tools Compared Side-by-Side`,
      `${k}: Top Options, Honestly Ranked`,
      `${k} Showdown — Pricing, Features, Verdict`,
      `Pick the Right ${k}: A No-BS Comparison`,
    ];
  }
  if (template === "case-study") {
    return [
      `How We Used ${k} to Grow 3x in 90 Days`,
      `Case Study: ${k} in the Wild`,
      `${k} Case Study — Numbers, Mistakes, Lessons`,
      `Inside a Real ${k} Launch (The Good and the Ugly)`,
      `From Zero to Scale with ${k}: A Case Study`,
    ];
  }
  if (template === "product-review") {
    return [
      `${k} Review (${year}): Honest Pros, Cons, Verdict`,
      `Is ${k} Worth It? A Straightforward Review`,
      `${k} Reviewed: What Works, What Doesn't`,
      `${k} Hands-On Review — With Screenshots`,
      `${k} Review: Who Should Actually Use This`,
    ];
  }

  // Default = pillar, tuned by intent.
  if (intent === "informational") {
    return [
      `The Complete Guide to ${k} (${year})`,
      `What Is ${k}? A Plain-English Breakdown`,
      `${k}: Everything You Need to Know Before You Start`,
      `How to ${k} — Step-by-Step with Examples`,
      `7 Things Nobody Tells You About ${k}`,
    ];
  }
  if (intent === "commercial") {
    return [
      `Best ${k} Tools Compared (Honest Review)`,
      `${k} vs Alternatives: Which Actually Wins?`,
      `The ${k} Buyer's Guide — What Matters, What Doesn't`,
      `Top 10 ${k} Options, Ranked by Real Users`,
      `Is ${k} Worth It? A Straight Answer`,
    ];
  }
  return [
    `Get ${k} — Fast, Simple, Free to Start`,
    `${k} Pricing, Plans, and What You Actually Get`,
    `How to Buy ${k} Without Regret`,
    `${k} Checkout Made Simple`,
    `Start with ${k} in Under 5 Minutes`,
  ];
}

type Section = { h2: string; h3: string[]; wordTarget: number };

function outlineForTemplate(template: Template, intent: Intent, keyword: string): Section[] {
  const k = keyword.trim() || "the topic";
  const Cap = cap(k);

  if (template === "listicle") {
    return [
      { h2: `Why ${Cap} matters right now`, h3: [`The problem this list solves`, `Who this is for`], wordTarget: 250 },
      { h2: `The 10 ${k} moves`, h3: [`Item 1 — short rationale + example`, `Item 2 — short rationale + example`, `Item 3 — short rationale + example`, `Item 4-10 — same pattern, one per H3 block`], wordTarget: 1000 },
      { h2: `How to prioritize this list`, h3: [`If you have 30 minutes`, `If you have a week`, `If you have a quarter`], wordTarget: 300 },
      { h2: `Wrap-up + next step`, h3: [`Top 3 takeaways`, `Primary CTA`], wordTarget: 200 },
    ];
  }
  if (template === "howto") {
    return [
      { h2: `What you'll build / achieve`, h3: [`The outcome`, `Who this is for`, `What you need first`], wordTarget: 250 },
      { h2: `The step-by-step`, h3: [`Step 1 — what, why, screenshot`, `Step 2 — what, why, screenshot`, `Step 3+ — same pattern`, `Common snag + fix`], wordTarget: 900 },
      { h2: `Troubleshooting`, h3: [`If you see X`, `If you see Y`, `Where to ask for help`], wordTarget: 300 },
      { h2: `Next steps`, h3: [`Level-up guides`, `Primary CTA`], wordTarget: 200 },
    ];
  }
  if (template === "comparison") {
    return [
      { h2: `What to look for in ${k}`, h3: [`Must-have features`, `Nice-to-have features`, `Red flags`], wordTarget: 300 },
      { h2: `Top options reviewed`, h3: [`Option 1 — summary, pros, cons, pricing`, `Option 2 — summary, pros, cons, pricing`, `Option 3 — summary, pros, cons, pricing`], wordTarget: 800 },
      { h2: `Head-to-head matrix`, h3: [`Feature matrix`, `Pricing matrix`, `Who each is for`], wordTarget: 400 },
      { h2: `Verdict`, h3: [`Our top pick and why`, `Runner-up`, `When to skip all of these`], wordTarget: 250 },
    ];
  }
  if (template === "case-study") {
    return [
      { h2: `Background — who and why`, h3: [`The company / team`, `The starting situation`, `The goal + constraints`], wordTarget: 300 },
      { h2: `What we tried that didn't work`, h3: [`Attempt 1 + why it failed`, `Attempt 2 + why it failed`], wordTarget: 350 },
      { h2: `What actually worked`, h3: [`The approach`, `Key decisions`, `What we'd do differently`], wordTarget: 500 },
      { h2: `Results`, h3: [`The numbers`, `Secondary outcomes`, `Timeline`], wordTarget: 300 },
      { h2: `Takeaways you can steal`, h3: [`For small teams`, `For larger orgs`, `Primary CTA`], wordTarget: 250 },
    ];
  }
  if (template === "product-review") {
    return [
      { h2: `${Cap} at a glance`, h3: [`TL;DR verdict`, `Who it's for`, `Who should skip`], wordTarget: 250 },
      { h2: `What ${Cap} does well`, h3: [`Feature 1 + real use`, `Feature 2 + real use`, `Feature 3 + real use`], wordTarget: 500 },
      { h2: `Where ${Cap} falls short`, h3: [`Limitation 1`, `Limitation 2`, `Workarounds`], wordTarget: 350 },
      { h2: `Pricing and plans`, h3: [`Plan comparison`, `Hidden costs`, `Fair price check`], wordTarget: 300 },
      { h2: `Alternatives worth considering`, h3: [`Cheaper option`, `More powerful option`, `Different approach`], wordTarget: 300 },
      { h2: `Final verdict`, h3: [`Rating + why`, `Primary CTA`], wordTarget: 200 },
    ];
  }

  // Pillar — intent-aware
  if (intent === "informational") {
    return [
      { h2: `What is ${k}? — A quick definition`, h3: [`Why ${k} matters right now`, `Common misconceptions`], wordTarget: 250 },
      { h2: `How ${k} works`, h3: [`The core mechanism`, `A simple example`, `Edge cases to know`], wordTarget: 400 },
      { h2: `Step-by-step: getting started with ${k}`, h3: [`What you need first`, `The exact sequence`, `What to avoid`], wordTarget: 450 },
      { h2: `Pros, cons, and trade-offs`, h3: [`When ${k} wins`, `When it's the wrong tool`], wordTarget: 300 },
      { h2: `Advanced patterns`, h3: [`For bigger teams`, `For tighter budgets`, `For faster ROI`], wordTarget: 300 },
      { h2: `FAQ`, h3: [`Is ${k} free?`, `How long does it take?`, `What's the best alternative?`], wordTarget: 250 },
    ];
  }
  if (intent === "commercial") {
    return [
      { h2: `What to look for in ${k}`, h3: [`Must-have features`, `Nice-to-have features`, `Red flags`], wordTarget: 300 },
      { h2: `Top options reviewed`, h3: [`Option 1 — summary, pros, cons, pricing`, `Option 2 — summary, pros, cons, pricing`, `Option 3 — summary, pros, cons, pricing`], wordTarget: 700 },
      { h2: `Head-to-head comparison`, h3: [`Feature matrix`, `Pricing matrix`, `Who each one is for`], wordTarget: 400 },
      { h2: `How to choose`, h3: [`If you're a small team`, `If you're scaling`, `If budget is tight`], wordTarget: 250 },
      { h2: `Verdict`, h3: [`Our top pick and why`, `Runner-up`], wordTarget: 200 },
    ];
  }
  return [
    { h2: `${Cap} at a glance`, h3: [`What you get`, `Who it's for`], wordTarget: 200 },
    { h2: `Pricing and plans`, h3: [`Starter`, `Pro`, `Enterprise`], wordTarget: 300 },
    { h2: `How it works — the quick version`, h3: [`Sign up`, `Set up`, `First win`], wordTarget: 250 },
    { h2: `Why customers pick us`, h3: [`Social proof`, `Two short case studies`, `Guarantees`], wordTarget: 350 },
    { h2: `Get started`, h3: [`Primary CTA`, `Secondary CTA`, `FAQ anchors`], wordTarget: 150 },
  ];
}

// Extract plausible subtopic keywords from competitor URL paths (heuristic —
// no fetching). URLs like /blog/email-automation-guide get tokenized into
// ["email", "automation", "guide"] and merged across competitors.
const URL_STOP = new Set(
  `a the in of and for with how why what guide tips ways best top review reviews www com net org io co uk us blog post posts article articles resources resource learn guides ultimate complete 2024 2025 2026 new`.split(
    /\s+/,
  ),
);

type CompetitorTokens = { url: string; tokens: string[] };

function competitorTokenize(competitors: string): CompetitorTokens[] {
  return competitors
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => {
      let url = raw;
      let path = raw;
      try {
        const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
        url = u.href;
        path = u.pathname + " " + u.hostname;
      } catch {}
      const tokens = (path.toLowerCase().match(/[a-z]{3,}/g) || []).filter(
        (t) => !URL_STOP.has(t),
      );
      return { url, tokens: Array.from(new Set(tokens)) };
    });
}

function competitorGap(competitors: CompetitorTokens[], outlineText: string, keyword: string) {
  // A token that appears in 2+ competitor URLs is "commonly covered".
  const freq = new Map<string, number>();
  for (const c of competitors) {
    for (const t of c.tokens) freq.set(t, (freq.get(t) || 0) + 1);
  }
  const outlineLow = outlineText.toLowerCase();
  const kTokens = new Set(
    (keyword.toLowerCase().match(/[a-z]{3,}/g) || []).filter((t) => !URL_STOP.has(t)),
  );

  const covered: string[] = [];
  const gaps: string[] = [];
  const uniqueToUs: string[] = [];

  for (const [t, c] of freq.entries()) {
    if (kTokens.has(t)) continue;
    if (c < 2) continue; // at least 2 competitors mention it
    if (outlineLow.includes(t)) covered.push(t);
    else gaps.push(t);
  }

  // Unique angles: tokens that appear only in 1 competitor — could inspire
  // a differentiating subtopic.
  for (const [t, c] of freq.entries()) {
    if (c === 1 && !kTokens.has(t) && !outlineLow.includes(t)) uniqueToUs.push(t);
  }

  return {
    covered: covered.sort(),
    gaps: gaps.sort(),
    unique: uniqueToUs.sort().slice(0, 12),
  };
}

const STORAGE_KEY = "solutions:content-brief-builder:state:v1";
const MODE_LS_KEY = "solutions:content-brief-builder:mode:v1";

function hostnameOf(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.pathname || "/";
  } catch {
    return "";
  }
}

type ModeKey = "build" | "preview" | "export";

export default function ContentBriefBuilderPage() {
  const [keyword, setKeyword] = useState("email marketing automation");
  const [audience, setAudience] = useState("B2B SaaS marketers at 10-50 person startups");
  const [intent, setIntent] = useState<Intent>("informational");
  const [template, setTemplate] = useState<Template>("pillar");
  const [cta, setCta] = useState("Book a 15-minute strategy call");
  const [wordTarget, setWordTarget] = useState(1800);
  const [competitors, setCompetitors] = useState(
    "https://hubspot.com/marketing/email-automation-guide\nhttps://mailchimp.com/resources/email-deliverability-workflows\nhttps://activecampaign.com/learn/lead-nurture-automation",
  );
  const [mode, setMode] = useState<ModeKey>("build");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.keyword === "string") setKeyword(s.keyword);
        if (typeof s.audience === "string") setAudience(s.audience);
        if (
          s.intent === "informational" ||
          s.intent === "commercial" ||
          s.intent === "transactional"
        )
          setIntent(s.intent);
        if (
          ["pillar", "comparison", "listicle", "howto", "case-study", "product-review"].includes(
            s.template,
          )
        )
          setTemplate(s.template);
        if (typeof s.cta === "string") setCta(s.cta);
        if (typeof s.wordTarget === "number") setWordTarget(s.wordTarget);
        if (typeof s.competitors === "string") setCompetitors(s.competitors);
      }
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "build" || m === "preview" || m === "export") setMode(m as ModeKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ keyword, audience, intent, template, cta, wordTarget, competitors }),
      );
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [keyword, audience, intent, template, cta, wordTarget, competitors, mode, hydrated]);

  const titles = useMemo(
    () => titleOptions(keyword, intent, template),
    [keyword, intent, template],
  );
  const sections = useMemo(
    () => outlineForTemplate(template, intent, keyword),
    [template, intent, keyword],
  );

  const competitorTokens = useMemo(() => competitorTokenize(competitors), [competitors]);

  const outlineText = useMemo(() => {
    return sections
      .map((s) => s.h2 + " " + s.h3.join(" "))
      .join(" ");
  }, [sections]);

  const gap = useMemo(
    () => competitorGap(competitorTokens, outlineText, keyword),
    [competitorTokens, outlineText, keyword],
  );

  const metaDesc = useMemo(() => {
    const k = keyword.trim();
    if (!k) return "";
    const verb =
      intent === "commercial"
        ? "Compare"
        : intent === "transactional"
          ? "Get started with"
          : "Learn";
    return `${verb} ${k} — a focused guide for ${audience}. Practical, specific, and written for teams who ship.`.slice(0, 160);
  }, [keyword, intent, audience]);

  const markdown = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# Content Brief: ${keyword || "—"}`);
    lines.push(``);
    lines.push(`**Target keyword:** ${keyword}`);
    lines.push(`**Audience:** ${audience}`);
    lines.push(`**Search intent:** ${intent}`);
    lines.push(`**Template:** ${template}`);
    lines.push(`**Primary CTA:** ${cta}`);
    lines.push(`**Target word count:** ${wordTarget.toLocaleString()}`);
    lines.push(``);
    lines.push(`## Title options`);
    titles.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push(``);
    lines.push(`## Meta description draft`);
    lines.push(`> ${metaDesc}`);
    lines.push(``);
    lines.push(`## Outline`);
    const totalTarget = sections.reduce((s, x) => s + x.wordTarget, 0);
    const scale = totalTarget > 0 ? wordTarget / totalTarget : 1;
    sections.forEach((s) => {
      const w = Math.round(s.wordTarget * scale);
      lines.push(``);
      lines.push(`### ${s.h2}  _(~${w} words)_`);
      s.h3.forEach((h) => lines.push(`- ${h}`));
    });
    lines.push(``);
    lines.push(`## Competitors / reference`);
    competitorTokens.forEach((c) => lines.push(`- ${c.url}`));
    if (gap.gaps.length > 0) {
      lines.push(``);
      lines.push(`## Competitor-gap subtopics to consider adding`);
      gap.gaps.forEach((g) => lines.push(`- **${g}** — covered by 2+ competitors but missing from your outline.`));
    }
    if (gap.unique.length > 0) {
      lines.push(``);
      lines.push(`## Differentiation angles (only 1 competitor mentioned)`);
      gap.unique.forEach((g) => lines.push(`- ${g}`));
    }
    lines.push(``);
    lines.push(`## Internal link suggestions`);
    lines.push(`- Link to a related pillar piece on ${keyword.split(/\s+/)[0] || "the topic"}`);
    lines.push(`- Link to a product/feature page that matches the CTA`);
    lines.push(`- Link to a relevant case study or customer story`);
    lines.push(`- Link to an FAQ or glossary page for key terms`);
    lines.push(``);
    lines.push(`## Notes for writer`);
    lines.push(
      `- Match intent: ${intent === "informational" ? "explain, don't sell." : intent === "commercial" ? "compare honestly; link options." : "reduce friction to action."}`,
    );
    lines.push(`- Voice: direct, specific, no fluff.`);
    lines.push(`- Include one concrete example per H2.`);
    lines.push(`- Close with the primary CTA: "${cta}".`);
    return lines.join("\n");
  }, [keyword, audience, intent, template, cta, wordTarget, competitorTokens, titles, sections, metaDesc, gap]);

  const copy = () => navigator.clipboard?.writeText(markdown);
  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brief-${(keyword || "content").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const templateLabel: Record<Template, string> = {
    pillar: "Pillar post",
    comparison: "Comparison",
    listicle: "Listicle",
    howto: "How-to",
    "case-study": "Case study",
    "product-review": "Product review",
  };

  const totalOutlineWords = sections.reduce((s, x) => s + x.wordTarget, 0);
  const scale = totalOutlineWords > 0 ? wordTarget / totalOutlineWords : 1;

  // slug for breadcrumb
  const slug = useMemo(() => {
    const k = (keyword || "untitled").toLowerCase().trim().replace(/\s+/g, "-");
    return k || "untitled";
  }, [keyword]);

  return (
    <div data-tool-theme="content" data-tool="content-brief-builder">
      <ToolShell
        category="Writing & Content"
        title="Content Brief Builder"
        description="Generate a writer-ready brief: content-type templates, intent-aware H2/H3 outlines, competitor-gap suggestions, auto-distributed word targets, markdown export."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — intent + template chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {intent}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {templateLabel[template]}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              brief.editorial
              <span className="text-faint">/</span>
              <span className="text-secondary">{slug}.md</span>
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
                  Editorial Brief · Writer Playbook
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {sections.length} h2 · {sections.reduce((acc, s) => acc + s.h3.length, 0)} h3
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {wordTarget.toLocaleString()} words
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {competitorTokens.length} ref{competitorTokens.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="email marketing automation"
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
                  {metaDesc || "Set a target keyword and audience to draft a meta description."}
                </p>
              </div>

              {/* meta-length dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${Math.min(100, (metaDesc.length / 160) * 100)}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {metaDesc.length}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Meta length
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {metaDesc.length} / 160
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "build", label: "Build" },
                  { k: "preview", label: "Preview" },
                  { k: "export", label: "Export" },
                ] as { k: ModeKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={copy}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy .md
              </button>
              <button
                onClick={download}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Export .md
              </button>
            </div>
          </div>
        </section>

        {mode === "preview" || mode === "export" ? (
          <ToolCard title="Markdown preview" subtitle={`${metaDesc.length}/160 meta · ${wordTarget.toLocaleString()} target words`}>
            <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app p-4 font-mono text-xs text-app">
              {markdown}
            </pre>
          </ToolCard>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
            {/* INPUTS */}
            <ToolCard title="Inputs" subtitle="Configure the brief">
              <div className="space-y-3">
                <Field label="Target keyword">
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputCls()} />
                </Field>
                <Field label="Audience">
                  <input value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls()} />
                </Field>
                <Field label="Content-type template">
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(templateLabel) as Template[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTemplate(t)}
                        className={`rounded-lg border px-2 py-1.5 text-[0.6rem] font-mono uppercase tracking-[0.14em] transition-colors ${
                          template === t
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                        }`}
                      >
                        {templateLabel[t]}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Search intent">
                  <div className="grid grid-cols-3 gap-2">
                    {(["informational", "commercial", "transactional"] as Intent[]).map((i) => (
                      <button
                        key={i}
                        onClick={() => setIntent(i)}
                        className={`rounded-lg border px-2 py-1.5 text-[0.6rem] font-mono uppercase tracking-[0.14em] transition-colors ${
                          intent === i
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                        }`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Primary CTA">
                  <input value={cta} onChange={(e) => setCta(e.target.value)} className={inputCls()} />
                </Field>
                <Field label="Target word count" hint="auto-distributed">
                  <input
                    type="number"
                    min={300}
                    max={10000}
                    value={wordTarget}
                    onChange={(e) => setWordTarget(parseInt(e.target.value) || 1500)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Competitors (one URL per line, up to 3)">
                  <textarea
                    value={competitors}
                    onChange={(e) => setCompetitors(e.target.value)}
                    className={inputCls("min-h-[100px] font-mono text-xs")}
                  />
                </Field>
              </div>
            </ToolCard>

            {/* MAIN */}
            <div className="space-y-5">
              {/* 01 — Goal */}
              <ToolCard title="01 — Goal" subtitle="What this piece needs to do">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-app bg-app-elevated p-3.5">
                    <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      ◇ Search intent
                    </div>
                    <div className="text-sm font-semibold capitalize text-app">
                      {intent}
                    </div>
                    <p className="mt-1.5 text-[0.7rem] leading-relaxed text-secondary">
                      {intent === "informational"
                        ? "Explain, don't sell. Reader is learning."
                        : intent === "commercial"
                          ? "Compare honestly. Reader is evaluating."
                          : "Reduce friction. Reader is ready to act."}
                    </p>
                  </div>
                  <div className="rounded-lg border border-app bg-app-elevated p-3.5">
                    <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      ▸ Primary CTA
                    </div>
                    <div className="text-sm font-semibold text-app">
                      {cta || "—"}
                    </div>
                    <p className="mt-1.5 text-[0.7rem] leading-relaxed text-secondary">
                      Close every section with this in mind; place the actual CTA at the end.
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    ▸ Title options
                  </div>
                  <ol className="space-y-1.5">
                    {titles.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-app bg-app-elevated px-3 py-2 text-xs text-app"
                      >
                        <span className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-md bg-tool-accent-soft font-mono text-[0.55rem] font-semibold text-tool-accent">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </ToolCard>

              {/* 02 — Audience */}
              <ToolCard title="02 — Audience" subtitle="Who you're writing for">
                <div className="rounded-lg border border-app bg-app-elevated p-4">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    ◆ Persona
                  </div>
                  <p className="text-base leading-snug text-app">
                    {audience || "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(audience.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?/g) || [])
                      .slice(0, 8)
                      .map((tok, i) => (
                        <span
                          key={`${tok}-${i}`}
                          className="rounded-full bg-tool-accent-soft px-2.5 py-0.5 font-mono text-[0.6rem] text-tool-accent"
                        >
                          {tok}
                        </span>
                      ))}
                  </div>
                </div>
              </ToolCard>

              {/* 03 — Tone */}
              <ToolCard title="03 — Tone & voice" subtitle="How it should read">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { k: "Direct", d: "No throat-clearing." },
                    { k: "Specific", d: "Examples over adjectives." },
                    { k: "Confident", d: "Pick a side, defend it." },
                  ].map((v) => (
                    <div
                      key={v.k}
                      className="rounded-lg border border-app bg-app-elevated p-3"
                    >
                      <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                        ▸ {v.k.toLowerCase()}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-app">
                        {v.k}
                      </div>
                      <p className="mt-0.5 text-[0.7rem] leading-relaxed text-secondary">{v.d}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                  <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    ▾ Meta description
                  </div>
                  <p className="text-xs leading-relaxed text-app">{metaDesc || "—"}</p>
                  <p className="mt-1 font-mono text-[0.6rem] text-muted">{metaDesc.length}/160</p>
                </div>
              </ToolCard>

              {/* 04 — Sources */}
              {competitorTokens.length > 0 && (
                <ToolCard
                  title="04 — Sources"
                  subtitle={`${competitorTokens.length} reference${competitorTokens.length === 1 ? "" : "s"} · gap analysis`}
                >
                  <ul className="space-y-2">
                    {competitorTokens.map((c, i) => (
                      <li
                        key={c.url}
                        className="group rounded-lg border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft font-mono text-xs font-semibold text-tool-accent">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-app">
                              {hostnameOf(c.url)}
                            </div>
                            <div className="truncate font-mono text-[0.65rem] text-muted">
                              {pathOf(c.url)}
                            </div>
                            {c.tokens.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {c.tokens.slice(0, 6).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] text-tool-accent"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-amber-500">
                        ▾ Gaps to add ({gap.gaps.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.gaps.length === 0 && (
                          <span className="text-[0.7rem] text-muted">No shared gaps.</span>
                        )}
                        {gap.gaps.map((g) => (
                          <span
                            key={g}
                            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[0.65rem] text-amber-500"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-emerald-500">
                        ✓ Already covered ({gap.covered.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.covered.length === 0 && (
                          <span className="text-[0.7rem] text-muted">—</span>
                        )}
                        {gap.covered.map((g) => (
                          <span
                            key={g}
                            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.65rem] text-emerald-500"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                      <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                        ◆ Differentiation ({gap.unique.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.unique.length === 0 && (
                          <span className="text-[0.7rem] text-muted">—</span>
                        )}
                        {gap.unique.map((g) => (
                          <span
                            key={g}
                            className="rounded-md bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.65rem] text-tool-accent"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-[0.6rem] text-muted">
                    Heuristic: tokens extracted from competitor URL paths + hostnames (no fetching). A token in 2+ competitors but missing from your outline is flagged as a gap. Tokens in only 1 competitor are flagged as possible differentiation.
                  </p>
                </ToolCard>
              )}

              {/* 05 — Outline */}
              <ToolCard
                title="05 — Outline"
                subtitle={`H2 / H3 tree · ${wordTarget.toLocaleString()} words auto-distributed`}
              >
                <ol className="space-y-2.5">
                  {sections.map((s, i) => {
                    const w = Math.round(s.wordTarget * scale);
                    const pct = wordTarget > 0 ? (w / wordTarget) * 100 : 0;
                    return (
                      <li
                        key={i}
                        className="rounded-lg border border-app bg-app-elevated p-4"
                      >
                        <div className="mb-2 flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-tool-accent bg-tool-accent-soft font-mono text-[0.65rem] font-semibold text-tool-accent">
                            H2
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-sm font-semibold leading-snug text-app">
                                {s.h2}
                              </span>
                              <span className="font-mono text-[0.6rem] tabular-nums text-tool-accent">
                                ~{w} words · {pct.toFixed(0)}%
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full border border-app bg-app">
                              <div
                                className="h-full bg-tool-accent transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <ul className="ml-9 space-y-1 border-l border-app pl-4">
                          {s.h3.map((h, j) => (
                            <li key={j} className="flex items-start gap-2 text-[0.72rem] text-secondary">
                              <span className="mt-0.5 inline-flex h-4 flex-none items-center justify-center rounded-md border border-app bg-app px-1 font-mono text-[0.5rem] font-semibold uppercase tracking-wider text-muted">
                                H3
                              </span>
                              <span className="leading-relaxed">{h}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              </ToolCard>
            </div>
          </div>
        )}
      </ToolShell>
    </div>
  );
}
