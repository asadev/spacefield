"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Outcome = "won" | "lost";

type Reason =
  | "price"
  | "timing"
  | "champion_left"
  | "competitor"
  | "product_fit"
  | "integration"
  | "security"
  | "internal_build"
  | "no_decision"
  | "other";

const REASONS: { key: Reason; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "timing", label: "Timing" },
  { key: "champion_left", label: "Champion left" },
  { key: "competitor", label: "Competitor" },
  { key: "product_fit", label: "Product fit" },
  { key: "integration", label: "Integrations" },
  { key: "security", label: "Security/compliance" },
  { key: "internal_build", label: "Built internally" },
  { key: "no_decision", label: "No decision" },
  { key: "other", label: "Other" },
];

interface Review {
  id: string;
  deal: string;
  company: string;
  amount: number;
  segment: string;
  closedAt: string;
  outcome: Outcome;
  reason: Reason;
  competitor: string;
  quotes: string;
  lessons: string;
}

interface State {
  reviews: Review[];
}

const LS_KEY = "solutions:win-loss-analyzer:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

// Industry-average win rates by segment. Source: Winning by Design Operating Handbook,
// RevOps Co-op 2024 benchmark, and SBI 2024 Sales Effectiveness Study.
const BENCHMARK_WIN_RATES: Record<string, number> = {
  SMB: 30,
  "Mid-market": 22,
  Mid: 22,
  Enterprise: 18,
  Unknown: 25,
};

// Loss-prevention playbook by reason code.
const LOSS_PREVENTION: Record<Reason, string> = {
  price:
    "Before proposal: anchor on peer price-points, quantify ROI, offer multi-year terms. If losing often here, segment pricing (SMB tier) or justify premium with measurable outcomes.",
  timing:
    "Map buying window earlier in discovery. Ask: 'What happens if this slips to next quarter?' If no cost of delay, disqualify — timing losses are often fake urgency from the seller's side.",
  champion_left:
    "Multi-thread from discovery — never rely on a single advocate. Identify backup champions in month 1. Get exec sponsor meeting before proposal.",
  competitor:
    "Know the 2–3 top alternatives. Build a battlecard. Ask: 'What would make us the obvious choice?' early. Don't trash competitors — differentiate on dimensions that matter to them.",
  product_fit:
    "Tighten ICP. Losing to product fit means your discovery missed a deal-breaker. Build a 'disqualify fast' checklist for your top 3 must-haves.",
  integration:
    "Front-load integration discovery. Have a technical lead on call #2. Offer an integration assessment as part of the sales motion, not post-sale.",
  security:
    "Get SOC 2 / ISO 27001 early in the funnel. Build a security one-pager. Introduce your CISO to their CISO before procurement.",
  internal_build:
    "When prospects say 'we'll build it', they usually underestimate maintenance + time-to-value. Quantify the hidden cost of build: eng FTE + opportunity cost + roadmap delay.",
  no_decision:
    "Biggest killer — 40–60% of 'lost' deals are actually 'no decision'. Fix with tighter qualification (BANT/MEDDPICC), mutual action plans, and exec sponsorship.",
  other:
    "Revisit this loss in a 30-minute interview with the buyer. 'Other' usually means the seller doesn't actually know why they lost.",
};

// Very lightweight sentiment classifier based on keyword polarity.
// Good enough for a local-only tool; no external API.
const POSITIVE_WORDS = [
  "love", "great", "excellent", "amazing", "perfect", "happy", "best",
  "easy", "fast", "powerful", "valuable", "impressed", "confident",
  "solved", "exceeded", "worth", "recommend", "clear", "smooth",
];
const NEGATIVE_WORDS = [
  "expensive", "pricey", "slow", "confusing", "difficult", "frustrating",
  "terrible", "broken", "issue", "problem", "bug", "failed", "poor",
  "disappointed", "concern", "unclear", "complex", "complicated", "lacking",
  "missing", "weak", "hard", "wasted", "painful",
];

function sentimentOf(text: string): "positive" | "neutral" | "negative" {
  if (!text.trim()) return "neutral";
  const t = text.toLowerCase();
  let pos = 0, neg = 0;
  POSITIVE_WORDS.forEach((w) => {
    if (new RegExp(`\\b${w}`).test(t)) pos++;
  });
  NEGATIVE_WORDS.forEach((w) => {
    if (new RegExp(`\\b${w}`).test(t)) neg++;
  });
  if (pos > neg + 1) return "positive";
  if (neg > pos + 1) return "negative";
  return "neutral";
}


function defaultState(): State {
  return {
    reviews: [
      {
        id: uid(),
        deal: "Acme — Q1",
        company: "Acme Co",
        amount: 45000,
        segment: "Mid-market",
        closedAt: new Date().toISOString().slice(0, 10),
        outcome: "won",
        reason: "product_fit",
        competitor: "",
        quotes: "'The demo was exactly what we asked for.'",
        lessons: "Lead with the reporting use case, not the automation angle.",
      },
      {
        id: uid(),
        deal: "Globex",
        company: "Globex",
        amount: 22000,
        segment: "SMB",
        closedAt: new Date().toISOString().slice(0, 10),
        outcome: "lost",
        reason: "price",
        competitor: "",
        quotes: "'Half the price from a vendor that does 80% of what we need.'",
        lessons: "Build a lightweight SMB tier — current pricing is too heavy.",
      },
    ],
  };
}

const money = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

type ViewKey = "summary" | "reason" | "competitor" | "quotes";

export default function WinLossAnalyzerPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Win/Loss Analyzer"
      description="Structured win/loss reviews. Log every closed deal with the real reason, buyer quotes, and lessons learned. Roll-up shows patterns across segments."
    >
      <Inner />
    </ToolShell>
  );
}

function Inner() {
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewKey>("summary");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as State);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const add = () =>
    setState((s) => ({
      reviews: [
        {
          id: uid(),
          deal: "New deal",
          company: "",
          amount: 0,
          segment: "",
          closedAt: new Date().toISOString().slice(0, 10),
          outcome: "won",
          reason: "product_fit",
          competitor: "",
          quotes: "",
          lessons: "",
        },
        ...s.reviews,
      ],
    }));

  const update = (id: string, patch: Partial<Review>) =>
    setState((s) => ({
      reviews: s.reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const remove = (id: string) =>
    setState((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));

  const stats = useMemo(() => {
    const won = state.reviews.filter((r) => r.outcome === "won");
    const lost = state.reviews.filter((r) => r.outcome === "lost");
    const winRate = won.length + lost.length > 0
      ? (won.length / (won.length + lost.length)) * 100
      : 0;
    const wonValue = won.reduce((s, r) => s + r.amount, 0);
    const lostValue = lost.reduce((s, r) => s + r.amount, 0);

    const lossReasons = new Map<Reason, number>();
    lost.forEach((r) => {
      lossReasons.set(r.reason, (lossReasons.get(r.reason) || 0) + 1);
    });
    const topLoss = Array.from(lossReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const bySegment = new Map<string, { w: number; l: number }>();
    state.reviews.forEach((r) => {
      const seg = r.segment || "Unknown";
      const cur = bySegment.get(seg) || { w: 0, l: 0 };
      if (r.outcome === "won") cur.w++;
      else cur.l++;
      bySegment.set(seg, cur);
    });

    // Sentiment breakdown on quotes
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    state.reviews.forEach((r) => {
      const s = sentimentOf(r.quotes);
      sentimentCounts[s]++;
    });

    // By-competitor aggregate
    const byCompetitor = new Map<string, { w: number; l: number; value: number }>();
    state.reviews.forEach((r) => {
      const key = (r.competitor || "").trim();
      if (!key) return;
      const cur = byCompetitor.get(key) || { w: 0, l: 0, value: 0 };
      if (r.outcome === "won") cur.w++;
      else cur.l++;
      cur.value += r.amount;
      byCompetitor.set(key, cur);
    });

    return { winRate, wonValue, lostValue, topLoss, bySegment, sentimentCounts, byCompetitor };
  }, [state]);

  const wonCount = state.reviews.filter((r) => r.outcome === "won").length;
  const lostCount = state.reviews.filter((r) => r.outcome === "lost").length;
  const totalDecided = wonCount + lostCount;
  const wonShare = totalDecided > 0 ? (wonCount / totalDecided) * 100 : 0;
  const lostShare = totalDecided > 0 ? 100 - wonShare : 0;

  return (
    <div data-tool-theme="crm" data-tool="win-loss-analyzer">
      {/* ============================== VERDICT HERO ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
            verdict
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {totalDecided} deal{totalDecided === 1 ? "" : "s"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            winloss.review
            <span className="text-faint">/</span>
            <span className="text-secondary">aggregate.snapshot</span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {hydrated ? "◉ autosaved" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex items-center gap-5">
              <div className="flex flex-col">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Win rate
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-5xl font-semibold tracking-tight text-tool-accent md:text-6xl">
                    {stats.winRate.toFixed(0)}
                  </span>
                  <span className="font-mono text-2xl text-secondary">%</span>
                </div>
                <div className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  {wonCount} won · {lostCount} lost
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-app bg-app px-3 py-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Won value
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-app">
                  {money(stats.wonValue)}
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app px-3 py-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  Lost value
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-secondary">
                  {money(stats.lostValue)}
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app px-3 py-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  Reviews
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-secondary">
                  {state.reviews.length}
                </div>
              </div>
            </div>
          </div>

          {/* Won vs lost stack chart */}
          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em]">
              <span className="text-tool-accent">Won {wonShare.toFixed(0)}%</span>
              <span className="text-muted">Lost {lostShare.toFixed(0)}%</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full border border-app bg-app">
              <div
                className="h-full bg-tool-accent transition-all"
                style={{ width: `${wonShare}%` }}
              />
              <div
                className="h-full bg-app-elevated transition-all"
                style={{ width: `${lostShare}%` }}
              />
            </div>
          </div>
        </div>

        {/* segmented view tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "summary", label: "Summary" },
                { k: "reason", label: "By reason" },
                { k: "competitor", label: "By competitor" },
                { k: "quotes", label: "Quotes" },
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

          <div className="ml-auto">
            <button
              onClick={add}
              className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              + Review
            </button>
          </div>
        </div>
      </section>

      {/* ============================== VIEW: SUMMARY ============================== */}
      {view === "summary" && (
        <div className="mb-6">
          <ToolCard title="Win rate by segment" subtitle="Yours vs. industry">
            {stats.bySegment.size === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                No data.
              </div>
            ) : (
              <ul className="space-y-2">
                {Array.from(stats.bySegment.entries())
                  .sort(
                    (a, b) =>
                      b[1].w / Math.max(1, b[1].w + b[1].l) -
                      a[1].w / Math.max(1, a[1].w + a[1].l)
                  )
                  .map(([seg, { w, l }]) => {
                    const rate = (w / Math.max(1, w + l)) * 100;
                    const bench =
                      BENCHMARK_WIN_RATES[seg] ??
                      BENCHMARK_WIN_RATES[
                        Object.keys(BENCHMARK_WIN_RATES).find((k) =>
                          seg.toLowerCase().includes(k.toLowerCase())
                        ) || "Unknown"
                      ] ??
                      BENCHMARK_WIN_RATES.Unknown;
                    const delta = rate - bench;
                    return (
                      <li key={seg} className="rounded-lg border border-app bg-app-elevated p-3">
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span className="font-medium text-app">{seg}</span>
                          <span className="font-mono text-xs text-secondary">
                            {w}W / {l}L · {rate.toFixed(0)}%{" "}
                            <span
                              className={
                                delta >= 0 ? "text-tool-accent" : "text-muted"
                              }
                            >
                              ({delta >= 0 ? "+" : ""}
                              {delta.toFixed(0)} vs {bench}% industry)
                            </span>
                          </span>
                        </div>
                        <div className="relative h-1.5 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full bg-tool-accent"
                            style={{ width: `${rate}%` }}
                          />
                          <div
                            className="absolute top-0 h-full w-[2px] bg-secondary"
                            style={{ left: `${bench}%` }}
                            title={`Industry benchmark: ${bench}%`}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
            <div className="mt-3 font-mono text-[0.55rem] text-faint">
              Industry benchmarks: SMB 30%, Mid-market 22%, Enterprise 18%. Source:
              Winning by Design Operating Handbook · RevOps Co-op 2024 · SBI 2024
              Sales Effectiveness Study.
            </div>
          </ToolCard>
        </div>
      )}

      {/* ============================== VIEW: BY REASON ============================== */}
      {view === "reason" && (
        <div className="mb-6">
          <ToolCard title="Common loss reasons" subtitle="Why deals slip — and the prevention play">
            {stats.topLoss.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                No losses logged.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {stats.topLoss.map(([r, count]) => {
                    const label = REASONS.find((x) => x.key === r)?.label || r;
                    return (
                      <span
                        key={`chip-${r}`}
                        className="inline-flex items-center gap-2 rounded-full border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-tool-accent"
                      >
                        <span>{label}</span>
                        <span className="rounded-full bg-tool-accent px-1.5 text-[0.6rem] font-bold" style={{ color: "var(--bg)" }}>
                          {count}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <ul className="space-y-3">
                  {stats.topLoss.map(([r, count]) => {
                    const label = REASONS.find((x) => x.key === r)?.label || r;
                    const maxCount = stats.topLoss[0][1];
                    const pct = (count / maxCount) * 100;
                    return (
                      <li key={r} className="rounded-lg border border-app bg-app-elevated p-3">
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span className="font-medium text-app">{label}</span>
                          <span className="font-mono text-xs text-muted">{count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full bg-tool-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 rounded-lg border border-tool-accent bg-tool-accent-soft p-2.5 text-[0.75rem] text-secondary">
                          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
                            Prevent
                          </span>
                          <div className="mt-1">{LOSS_PREVENTION[r]}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </ToolCard>
        </div>
      )}

      {/* ============================== VIEW: BY COMPETITOR ============================== */}
      {view === "competitor" && (
        <div className="mb-6">
          <ToolCard title="By competitor" subtitle="Where deals go when you don't get them">
            {stats.byCompetitor.size === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                No competitor data — fill in the competitor field on each review.
              </div>
            ) : (
              <ul className="space-y-2">
                {Array.from(stats.byCompetitor.entries())
                  .sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l))
                  .map(([comp, { w, l, value }]) => {
                    const total = w + l;
                    const rate = total > 0 ? (w / total) * 100 : 0;
                    return (
                      <li key={comp} className="rounded-lg border border-app bg-app-elevated p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="font-medium text-app">{comp}</span>
                          <span className="font-mono text-xs text-secondary">
                            {w}W / {l}L · {rate.toFixed(0)}% · {money(value)}
                          </span>
                        </div>
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-app">
                          <div
                            className="h-full bg-tool-accent"
                            style={{ width: `${total > 0 ? (w / total) * 100 : 0}%` }}
                          />
                          <div
                            className="h-full bg-app-elevated"
                            style={{ width: `${total > 0 ? (l / total) * 100 : 0}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </ToolCard>
        </div>
      )}

      {/* ============================== VIEW: QUOTES ============================== */}
      {view === "quotes" && (
        <div className="mb-6">
          <ToolCard title="Buyer quote sentiment" subtitle="Positive / neutral / negative">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-center">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                  Positive
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-tool-accent">
                  {stats.sentimentCounts.positive}
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app-elevated p-3 text-center">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                  Neutral
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-secondary">
                  {stats.sentimentCounts.neutral}
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app-elevated p-3 text-center">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                  Negative
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-secondary">
                  {stats.sentimentCounts.negative}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {state.reviews.filter((r) => r.quotes.trim()).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted">
                  No quotes logged yet.
                </div>
              ) : (
                state.reviews
                  .filter((r) => r.quotes.trim())
                  .map((r) => {
                    const sent = sentimentOf(r.quotes);
                    return (
                      <div
                        key={r.id}
                        className={`rounded-lg border p-3 ${
                          r.outcome === "won"
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                            {r.deal} · {r.outcome}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] ${
                              sent === "positive"
                                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                : sent === "negative"
                                ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                                : "border-app bg-app-elevated text-muted"
                            }`}
                          >
                            {sent}
                          </span>
                        </div>
                        <div className="text-sm italic text-app">{r.quotes}</div>
                      </div>
                    );
                  })
              )}
            </div>
          </ToolCard>
        </div>
      )}

      {/* ============================== DEAL REVIEWS ============================== */}
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Deal reviews
        </div>
      </div>

      <div className="space-y-3">
        {state.reviews.map((r) => {
          const isWon = r.outcome === "won";
          return (
            <div
              key={r.id}
              className={`overflow-hidden rounded-xl border bg-app-elevated ${
                isWon
                  ? "border-emerald-500/30"
                  : "border-rose-500/30"
              }`}
            >
              <div
                className={`flex items-center gap-2 border-b px-4 py-2.5 ${
                  isWon
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-rose-500/20 bg-rose-500/5"
                }`}
              >
                <span
                  className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                    isWon
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                      : "border-rose-500/40 bg-rose-500/15 text-rose-500"
                  }`}
                >
                  {r.outcome}
                </span>
                <span className="font-mono text-sm font-semibold text-app">
                  {r.deal}
                </span>
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                  {r.company || "—"} · {money(r.amount)}
                </span>
                <button
                  onClick={() => remove(r.id)}
                  className="ml-auto rounded-md border border-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  Delete
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Deal name">
                    <input
                      value={r.deal}
                      onChange={(e) => update(r.id, { deal: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Company">
                    <input
                      value={r.company}
                      onChange={(e) => update(r.id, { company: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Amount">
                    <input
                      type="number"
                      value={r.amount}
                      onChange={(e) =>
                        update(r.id, { amount: Number(e.target.value) || 0 })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Segment">
                    <input
                      value={r.segment}
                      onChange={(e) => update(r.id, { segment: e.target.value })}
                      className={inputCls()}
                      placeholder="SMB / Mid / Enterprise"
                    />
                  </Field>
                  <Field label="Closed date">
                    <input
                      type="date"
                      value={r.closedAt}
                      onChange={(e) => update(r.id, { closedAt: e.target.value })}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Outcome">
                    <select
                      value={r.outcome}
                      onChange={(e) =>
                        update(r.id, { outcome: e.target.value as Outcome })
                      }
                      className={inputCls()}
                    >
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </Field>
                  <Field label="Primary reason">
                    <select
                      value={r.reason}
                      onChange={(e) =>
                        update(r.id, { reason: e.target.value as Reason })
                      }
                      className={inputCls()}
                    >
                      {REASONS.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Competitor">
                    <input
                      value={r.competitor}
                      onChange={(e) =>
                        update(r.id, { competitor: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field
                    label="Buyer quotes"
                    hint={r.quotes ? sentimentOf(r.quotes) : undefined}
                  >
                    <textarea
                      value={r.quotes}
                      onChange={(e) => update(r.id, { quotes: e.target.value })}
                      className={inputCls("min-h-[70px]")}
                    />
                  </Field>
                  <Field label="Lessons learned">
                    <textarea
                      value={r.lessons}
                      onChange={(e) => update(r.id, { lessons: e.target.value })}
                      className={inputCls("min-h-[70px]")}
                    />
                  </Field>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
