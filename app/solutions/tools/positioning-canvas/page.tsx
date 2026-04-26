"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

const LS_KEY = "solutions:positioning-canvas:v1";
const MODE_LS_KEY = "solutions:positioning-canvas:mode:v1";

// April Dunford canonical examples — "Obviously Awesome" 2019 + "Sales Pitch" 2023.
const DUNFORD_EXAMPLES: Array<{
  product: string;
  category: string;
  alternatives: string;
  uniqueAttrs: string;
  value: string;
  audience: string;
  bestFor: string;
}> = [
  {
    product: "Help Scout",
    category: "Customer support platform built for email-first teams",
    alternatives: "Zendesk, shared Gmail inbox, generic ticketing systems",
    uniqueAttrs: "Feels like email to customers (no tickets); team assignment/collision detection; Docs + in-app messaging in one workspace",
    value: "Deliver better email support without the ticketing-system baggage",
    audience: "Growing SaaS / e-comm teams (10-500 people) whose customers live in email",
    bestFor: "Teams that outgrew shared Gmail but think Zendesk is overkill",
  },
  {
    product: "Tettra",
    category: "Internal Q&A knowledge base",
    alternatives: "Notion/Confluence wikis, Slack search, SharePoint",
    uniqueAttrs: "Deep Slack integration; automated content verification; Q&A focus instead of hierarchy-of-pages",
    value: "Stop answering the same questions in Slack over and over",
    audience: "100-1000 person companies with heavy Slack usage",
    bestFor: "Teams where Slack is the primary work OS and wikis rot",
  },
  {
    product: "Levelset (by Procore)",
    category: "Construction payment compliance software",
    alternatives: "Manual paper lien notices, lawyer-drafted docs, generic AP software",
    uniqueAttrs: "Pre-built state-specific lien forms; auto-calendar of deadlines; marketplace of payment experts",
    value: "Get paid faster in construction without hiring a lien attorney",
    audience: "Sub-contractors and material suppliers in US construction",
    bestFor: "Sub-contractors burned by slow-paying GCs who can't afford legal overhead",
  },
  {
    product: "Ramp",
    category: "Corporate card with finance automation",
    alternatives: "Brex, Amex corporate, Expensify + bank cards",
    uniqueAttrs: "Real cash-back (1.5%); built-in AP automation; explicit goal of saving money (not spending it)",
    value: "Cut corporate spend by 3%+ automatically",
    audience: "Series A–D startups and mid-market finance teams",
    bestFor: "Teams with CFOs/Controllers who measure success in cost savings",
  },
  {
    product: "Superhuman",
    category: "Speed-focused email client for professionals",
    alternatives: "Gmail, Apple Mail, Outlook, Hey",
    uniqueAttrs: "Keyboard-first UX; every action < 100ms; undo send, split inbox, read statuses",
    value: "Get through email twice as fast",
    audience: "Knowledge workers doing 100+ emails/day (founders, execs, sales)",
    bestFor: "People whose email volume makes them hate email",
  },
];

interface State {
  productName: string;
  competitiveAlternatives: string;
  uniqueAttributes: string;
  valueTheme: string;
  targetAudience: string;
  marketCategory: string;
  bestFor: string;
}

const defaultState: State = {
  productName: "Acme Analytics",
  competitiveAlternatives:
    "Spreadsheets, BI dashboards (Looker, Mode), custom SQL",
  uniqueAttributes:
    "One-click warehouse connectors; AI-generated explanations on every chart; row-level permissions",
  valueTheme:
    "Non-technical operators can answer their own data questions in minutes",
  targetAudience:
    "RevOps and CS leaders at Series B–D SaaS companies (50–500 employees)",
  marketCategory: "Self-serve BI for operators",
  bestFor:
    "Teams stuck in the 'wait on the data analyst' queue but not ready for a full BI overhaul",
};

// Six canvas blocks — Strategyzer-style grid layout.
const CANVAS_BLOCKS: Array<{
  id: keyof State;
  label: string;
  hint: string;
  glyph: string;
  wing: string;
  rows: number;
  span: string;
}> = [
  {
    id: "targetAudience",
    label: "Audience",
    hint: "Specific, not 'everyone'",
    glyph: "◉",
    wing: "Who",
    rows: 3,
    span: "lg:[grid-area:audience]",
  },
  {
    id: "valueTheme",
    label: "Problem / Value",
    hint: "The one benefit they actually care about",
    glyph: "✦",
    wing: "Why",
    rows: 3,
    span: "lg:[grid-area:value]",
  },
  {
    id: "marketCategory",
    label: "Category",
    hint: "The frame of reference you want",
    glyph: "▣",
    wing: "What it is",
    rows: 3,
    span: "lg:[grid-area:category]",
  },
  {
    id: "competitiveAlternatives",
    label: "Alternatives",
    hint: "What they'd do if you didn't exist",
    glyph: "↹",
    wing: "Versus",
    rows: 3,
    span: "lg:[grid-area:alternatives]",
  },
  {
    id: "uniqueAttributes",
    label: "Unique Value",
    hint: "Capabilities only you have",
    glyph: "✸",
    wing: "How",
    rows: 4,
    span: "lg:[grid-area:unique]",
  },
  {
    id: "bestFor",
    label: "Proof / Best-for",
    hint: "The sub-group you win for — clearly",
    glyph: "✓",
    wing: "For whom it wins",
    rows: 3,
    span: "lg:[grid-area:proof]",
  },
];

type TabKey = "build" | "preview" | "export";

export default function PositioningCanvasPage() {
  const [state, setState] = useState<State>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<TabKey>("build");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "build" || m === "preview" || m === "export") setMode(m as TabKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [state, mode, hydrated]);

  const statement = `For ${state.targetAudience || "[audience]"} who want ${
    state.valueTheme || "[value]"
  }, ${state.productName || "[product]"} is a ${
    state.marketCategory || "[category]"
  } that delivers ${state.uniqueAttributes || "[unique attributes]"}. Unlike ${
    state.competitiveAlternatives || "[alternatives]"
  }, ${state.productName || "[product]"} is best for ${
    state.bestFor || "[best-for segment]"
  }.`;

  const tagline = `${state.productName}: ${state.valueTheme}.`;

  const markdown = `# ${state.productName} — Positioning Canvas

## Competitive Alternatives
${state.competitiveAlternatives}

## Unique Attributes
${state.uniqueAttributes}

## Value Theme
${state.valueTheme}

## Target Audience
${state.targetAudience}

## Market Category
${state.marketCategory}

## Best-for Segment
${state.bestFor}

---

## Positioning Statement
${statement}

## Tagline
${tagline}
`;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    alert("Copied.");
  };

  const update = (k: keyof State) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((s) => ({ ...s, [k]: e.target.value }));

  // Filled-block count — gives the canvas a "draft → done" sense of progress.
  const filledCount = CANVAS_BLOCKS.filter((b) => (state[b.id] || "").trim().length > 0).length;
  const pct = (filledCount / CANVAS_BLOCKS.length) * 100;

  // Tighter slug for the console chrome
  const slug = useMemo(() => {
    const m = (state.productName || "").trim().toLowerCase().replace(/\s+/g, "-");
    return m || "untitled";
  }, [state.productName]);

  return (
    <div data-tool-theme="growth" data-tool="positioning-canvas">
      <ToolShell
        category="Growth & Strategy"
        title="Positioning Canvas"
        description="April Dunford-style positioning builder. Six fields → positioning statement + tagline. Copy the markdown and move on."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              Dunford
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {filledCount}/6 blocks
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              positioning.canvas
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
                  Positioning Canvas · April Dunford method
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <label className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Product
                  </label>
                  <input
                    value={state.productName}
                    onChange={update("productName")}
                    className="flex-1 min-w-[220px] bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                    placeholder="Name your thing"
                  />
                </div>
              </div>

              {/* progress dial */}
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
                      strokeDasharray={`${pct}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {pct.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Blocks filled
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {filledCount} / {CANVAS_BLOCKS.length}
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
                ] as { k: TabKey; label: string }[]
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
                onClick={() => copy(statement)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy statement
              </button>
              <button
                onClick={() => copy(markdown)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy .md
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Print
              </button>
            </div>
          </div>
        </section>

        {mode === "build" && (
          <>
            {/* ─── 6-block canvas grid ─────────────────────────────────────────
                Strategyzer-style: 3 columns × 2 rows on desktop. The wider
                "unique" cell sits center-stage — it's the answer to "why us". */}
            <div className="relative grid grid-cols-1 gap-3 rounded-xl border border-app bg-app-elevated p-3 md:grid-cols-2 lg:grid-cols-3 lg:[grid-template-areas:'audience_unique_alternatives''value_unique_proof''category_unique_proof']">
              {/* Decorative corner brackets — Strategyzer "canvas" feel */}
              <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-tool-accent" />
              <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-tool-accent" />
              <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-tool-accent" />
              <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-tool-accent" />

              {CANVAS_BLOCKS.map((b) => {
                const filled = (state[b.id] || "").trim().length > 0;
                return (
                  <div
                    key={b.id}
                    className={`group relative flex flex-col rounded-xl border p-4 transition-colors ${
                      filled
                        ? "border-tool-accent bg-app-elevated"
                        : "border-app bg-app hover:border-tool-accent"
                    } ${b.span}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md text-[0.7rem] ${
                            filled
                              ? "bg-tool-accent-soft text-tool-accent"
                              : "bg-app-elevated text-muted"
                          }`}
                        >
                          {b.glyph}
                        </span>
                        <span className="text-sm font-semibold tracking-tight text-app">
                          {b.label}
                        </span>
                      </div>
                      <span className="font-mono text-[0.5rem] uppercase tracking-[0.2em] text-faint">
                        {b.wing}
                      </span>
                    </div>
                    <p className="mb-2 text-[0.65rem] leading-snug text-muted">
                      {b.hint}
                    </p>
                    <textarea
                      value={state[b.id]}
                      onChange={update(b.id)}
                      rows={b.rows}
                      className={inputCls("flex-1 resize-none text-sm leading-relaxed")}
                      placeholder={`Write the ${b.label.toLowerCase()}…`}
                    />
                  </div>
                );
              })}
            </div>

            {/* ─── Examples bank + side-by-side ────────────────────────────── */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolCard title="Dunford examples bank" subtitle="Real-world positioning">
                <div className="space-y-2">
                  {DUNFORD_EXAMPLES.map((ex) => (
                    <div
                      key={ex.product}
                      className="group rounded-lg border border-app bg-app p-3 transition-colors hover:border-tool-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-app">
                            {ex.product}
                          </div>
                          <div className="mt-0.5 truncate text-[0.65rem] text-tool-accent">
                            {ex.category}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setState({
                              productName: ex.product,
                              competitiveAlternatives: ex.alternatives,
                              uniqueAttributes: ex.uniqueAttrs,
                              valueTheme: ex.value,
                              targetAudience: ex.audience,
                              marketCategory: ex.category,
                              bestFor: ex.bestFor,
                            })
                          }
                          className="shrink-0 rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                        >
                          Load
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-secondary">{ex.value}</p>
                      <p className="mt-1 text-[0.65rem] leading-relaxed text-muted">
                        Best for: {ex.bestFor}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[0.6rem] text-muted">
                  Source: April Dunford, <em>Obviously Awesome</em> (2019), <em>Sales Pitch</em> (2023).
                </p>
              </ToolCard>

              <ThreeCompSideBySide state={state} />
            </div>
          </>
        )}

        {mode === "preview" && (
          <ToolCard title="Positioning statement" subtitle="The assembled narrative">
            <div className="rounded-xl border border-app bg-app-elevated p-6">
              <div className="mb-4 flex items-baseline justify-between border-b border-app pb-3">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Positioning · Dunford method
                  </div>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-app">
                    {state.productName || "Untitled"}
                  </h3>
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Draft
                </div>
              </div>

              <p className="text-base leading-relaxed text-app">
                For{" "}
                <span className="font-semibold text-tool-accent">
                  {state.targetAudience || "[audience]"}
                </span>{" "}
                who want{" "}
                <span className="font-semibold text-tool-accent">
                  {state.valueTheme || "[value]"}
                </span>
                ,{" "}
                <span className="font-semibold text-tool-accent">
                  {state.productName || "[product]"}
                </span>{" "}
                is a{" "}
                <span className="font-semibold text-tool-accent">
                  {state.marketCategory || "[category]"}
                </span>{" "}
                that delivers{" "}
                <span className="font-semibold text-tool-accent">
                  {state.uniqueAttributes || "[unique attributes]"}
                </span>
                . Unlike{" "}
                <span className="font-semibold text-tool-accent">
                  {state.competitiveAlternatives || "[alternatives]"}
                </span>
                ,{" "}
                <span className="font-semibold text-tool-accent">
                  {state.productName || "[product]"}
                </span>{" "}
                is best for{" "}
                <span className="font-semibold text-tool-accent">
                  {state.bestFor || "[best-for segment]"}
                </span>
                .
              </p>

              <div className="mt-5 rounded-lg border-l-2 border-tool-accent bg-tool-accent-soft px-4 py-3 text-lg font-medium tracking-tight text-app">
                {tagline}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-xs leading-relaxed sm:grid-cols-2">
                <div className="text-secondary">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Audience</span>
                  <div className="mt-0.5 text-app">{state.targetAudience || "—"}</div>
                </div>
                <div className="text-secondary">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Category</span>
                  <div className="mt-0.5 text-app">{state.marketCategory || "—"}</div>
                </div>
                <div className="text-secondary">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Alternatives</span>
                  <div className="mt-0.5 text-app">{state.competitiveAlternatives || "—"}</div>
                </div>
                <div className="text-secondary">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">Best for</span>
                  <div className="mt-0.5 text-app">{state.bestFor || "—"}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => copy(statement)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy statement
              </button>
              <button
                onClick={() => copy(tagline)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy tagline
              </button>
            </div>
          </ToolCard>
        )}

        {mode === "export" && (
          <ToolCard title="Markdown source" subtitle="Ready to copy">
            <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app p-4 font-mono text-xs text-app">
              {markdown}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => copy(markdown)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy .md
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Print
              </button>
            </div>
          </ToolCard>
        )}
      </ToolShell>
    </div>
  );
}

function ThreeCompSideBySide({ state }: { state: State }) {
  const [comps, setComps] = useState<Array<{ name: string; alternatives: string; unique: string; audience: string }>>([
    { name: "Competitor A", alternatives: "Spreadsheets, legacy BI", unique: "Enterprise SSO, complex governance", audience: "Fortune 500" },
    { name: "Competitor B", alternatives: "Custom SQL, Looker", unique: "Data scientist-focused, heavy modeling", audience: "Data teams" },
    { name: "Competitor C", alternatives: "Mode, Metabase", unique: "Cheap, open-source core", audience: "Startups" },
  ]);

  return (
    <ToolCard title="3-competitor side-by-side" subtitle="See how yours stacks up">
      <div className="space-y-3">
        <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
              You · {state.productName}
            </div>
            <span className="rounded-md bg-tool-accent px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.18em]" style={{ color: "var(--bg)" }}>
              Anchor
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-app">
            <div><span className="text-muted">Alt · </span>{state.competitiveAlternatives}</div>
            <div><span className="text-muted">Unique · </span>{state.uniqueAttributes}</div>
            <div><span className="text-muted">Best for · </span>{state.bestFor}</div>
          </div>
        </div>
        {comps.map((c, i) => (
          <div key={i} className="rounded-lg border border-app bg-app p-3 transition-colors hover:border-tool-accent">
            <input
              value={c.name}
              onChange={(e) => setComps((p) => p.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
              className={inputCls("!px-2 !py-1 text-xs font-semibold")}
            />
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              <Field label="Alternatives">
                <input
                  value={c.alternatives}
                  onChange={(e) => setComps((p) => p.map((x, idx) => (idx === i ? { ...x, alternatives: e.target.value } : x)))}
                  className={inputCls("text-xs !py-1")}
                />
              </Field>
              <Field label="Unique attributes">
                <input
                  value={c.unique}
                  onChange={(e) => setComps((p) => p.map((x, idx) => (idx === i ? { ...x, unique: e.target.value } : x)))}
                  className={inputCls("text-xs !py-1")}
                />
              </Field>
              <Field label="Audience">
                <input
                  value={c.audience}
                  onChange={(e) => setComps((p) => p.map((x, idx) => (idx === i ? { ...x, audience: e.target.value } : x)))}
                  className={inputCls("text-xs !py-1")}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </ToolCard>
  );
}
