"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ToolRecommendations from "@/components/ToolRecommendations";
import AuthGate from "@/components/AuthGate";
import { communities, Community, DATA_UPDATED } from "@/lib/neighborhood-data";
import { computeAllScores, getScoreLabel, CommunityScores } from "@/lib/neighborhood-scoring";
import ExportButton from "@/components/ExportButton";
import { useCanvasTone } from "@/lib/useCanvasTone";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const BUDGET_OPTIONS = [
  { label: "All Budgets", value: "all" },
  { label: "Under 1M", value: "under-1m" },
  { label: "1M – 2M", value: "1m-2m" },
  { label: "2M – 5M", value: "2m-5m" },
  { label: "5M – 10M", value: "5m-10m" },
  { label: "10M+", value: "10m-plus" },
];

const PROPERTY_OPTIONS = [
  { label: "All Types", value: "all" },
  { label: "Apartment", value: "apartment" },
  { label: "Villa", value: "villa" },
  { label: "Townhouse", value: "townhouse" },
];

const SORT_OPTIONS = [
  { label: "Overall Score", value: "score" },
  { label: "Price (Low)", value: "price-asc" },
  { label: "Price (High)", value: "price-desc" },
  { label: "Yield", value: "yield" },
  { label: "Name", value: "name" },
];

const SUB_TABS = [
  { value: "overview", label: "Overview" },
  { value: "scores", label: "Scores" },
  { value: "directory", label: "Directory" },
] as const;
type SubTab = typeof SUB_TABS[number]["value"];

const CATEGORY_LABELS: { key: keyof CommunityScores; label: string; initial: string; narrative: string }[] = [
  { key: "investment", label: "Investment", initial: "I", narrative: "Capital appreciation potential and rental returns signal this neighborhood's long-term value trajectory." },
  { key: "connectivity", label: "Connectivity", initial: "C", narrative: "Commute times, metro access and road networks define how the rest of the city feels from here." },
  { key: "livability", label: "Livability", initial: "L", narrative: "Daily quality of life — quiet streets, green space, the small comforts that shape a neighborhood's mood." },
  { key: "family", label: "Family", initial: "F", narrative: "Schools, pediatric care, playgrounds and community — how well a family can root itself here." },
  { key: "growth", label: "Growth", initial: "G", narrative: "Infrastructure in motion and pipeline projects hint at where this area is headed in five years." },
  { key: "value", label: "Value", initial: "V", narrative: "Price per sqft against amenities and desirability — what you actually get for the money." },
];

const COMPARE_TONES = [
  { name: "primary", varAccent: "var(--tool-accent)", varSoft: "var(--tool-accent-soft)" },
  { name: "secondary", varAccent: "var(--text)", varSoft: "var(--surface)" },
  { name: "tertiary", varAccent: "var(--text-muted)", varSoft: "var(--surface)" },
];

const MAX_COMPARE = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

type ScoredCommunity = Community & { scores: CommunityScores };

// ---------------------------------------------------------------------------
// Score Ring (SVG donut, recolored to tool-accent tokens)
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 72, stroke = 6, showLabel = true }: { score: number; size?: number; stroke?: number; showLabel?: boolean }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 10));
  const offset = circ * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--tool-accent-soft)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--tool-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums leading-none text-tool-accent">{score.toFixed(1)}</span>
        {showLabel && <span className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-muted">/10</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-overlay Radar Chart for Comparison (kept for modal)
// ---------------------------------------------------------------------------

function ComparisonRadarChart({ items, size = 280 }: { items: { scores: CommunityScores; color: string; name: string }[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const categories: { key: keyof CommunityScores; label: string }[] = CATEGORY_LABELS.map(c => ({ key: c.key, label: c.initial }));
  const n = categories.length;
  const tone = useCanvasTone();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 30;

    for (let ring = 1; ring <= 4; ring++) {
      const rr = (r * ring) / 4;
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + rr * Math.cos(angle);
        const y = cy + rr * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.fillStyle = `rgba(${tone},0.5)`;
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.stroke();

      const lx = cx + (r + 18) * Math.cos(angle);
      const ly = cy + (r + 18) * Math.sin(angle);
      ctx.fillText(CATEGORY_LABELS[i].label, lx, ly);
    }

    items.forEach(({ scores, color }) => {
      ctx.fillStyle = color + "20";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
        const val = Math.min(scores[categories[idx].key] / 10, 1);
        const x = cx + r * val * Math.cos(angle);
        const y = cy + r * val * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const val = Math.min(scores[categories[i].key] / 10, 1);
        const x = cx + r * val * Math.cos(angle);
        const y = cy + r * val * Math.sin(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [items, size, categories, n, tone]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}

// ---------------------------------------------------------------------------
// Comparison Modal
// ---------------------------------------------------------------------------

function ComparisonModal({ items, onClose }: { items: ScoredCommunity[]; onClose: () => void }) {
  // Resolve theme colors for canvas/inline styling (CSS vars not usable in canvas)
  const [resolved, setResolved] = useState<{ accent: string; text: string; muted: string }>({
    accent: "#f59e0b",
    text: "#ffffff",
    muted: "#888888",
  });

  useEffect(() => {
    const root = document.querySelector('[data-tool-theme="research"]');
    if (!root) return;
    const cs = getComputedStyle(root);
    setResolved({
      accent: cs.getPropertyValue("--tool-accent").trim() || "#f59e0b",
      text: cs.getPropertyValue("--text").trim() || "#ffffff",
      muted: cs.getPropertyValue("--text-muted").trim() || "#888888",
    });
  }, []);

  const palette = [resolved.accent, resolved.text, resolved.muted];
  const coloredItems = items.map((item, i) => ({ ...item, hex: palette[i] || palette[0] }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4 pt-12 pb-12"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.97 }}
        transition={{ duration: 0.3, ease }}
        className="relative w-full max-w-[900px] rounded-2xl border border-app bg-app-elevated p-6 sm:p-8 shadow-elevated"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-app tracking-tight">Neighborhood Comparison</h2>
          <button onClick={onClose} className="rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-secondary hover:text-app hover:border-app-strong transition-colors">
            Close ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          {coloredItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.hex }} />
              <span className="text-sm text-secondary">{item.name}</span>
              <span className="text-sm font-medium tabular-nums text-tool-accent">{item.scores.overall.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col items-center justify-center rounded-xl border border-app bg-app p-6">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-4">Score Overlay</h3>
            <ComparisonRadarChart
              items={coloredItems.map(c => ({ scores: c.scores, color: c.hex, name: c.name }))}
              size={260}
            />
          </div>

          <div className="rounded-xl border border-app bg-app p-6">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-4">Category Scores</h3>
            <div className="space-y-4">
              {CATEGORY_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <div className="text-xs text-muted mb-1.5">{label}</div>
                  {coloredItems.map((item) => {
                    const score = item.scores[key];
                    return (
                      <div key={item.id} className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.hex }} />
                        <div className="flex-1 h-2 rounded-full bg-tool-accent-soft overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score * 10}%`, backgroundColor: item.hex }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums w-8 text-right text-secondary">{score.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-app bg-app p-6 overflow-x-auto">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-4">Key Statistics</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-app">
                <th className="pb-2 pr-4">Metric</th>
                {coloredItems.map(item => (
                  <th key={item.id} className="pb-2 pr-4" style={{ color: item.hex }}>{item.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-secondary">
              <tr className="border-b border-app">
                <td className="py-2 pr-4 text-muted">Overall Score</td>
                {coloredItems.map(item => (
                  <td key={item.id} className="py-2 pr-4 font-semibold tabular-nums text-tool-accent">{item.scores.overall.toFixed(1)}</td>
                ))}
              </tr>
              <tr className="border-b border-app">
                <td className="py-2 pr-4 text-muted">Price/sqft (AED)</td>
                {coloredItems.map(item => (
                  <td key={item.id} className="py-2 pr-4">{item.pricing.pricePerSqft.min.toLocaleString()}–{item.pricing.pricePerSqft.max.toLocaleString()}</td>
                ))}
              </tr>
              <tr className="border-b border-app">
                <td className="py-2 pr-4 text-muted">Rental Yield</td>
                {coloredItems.map(item => (
                  <td key={item.id} className="py-2 pr-4">{item.investment.rentalYieldPct.min}–{item.investment.rentalYieldPct.max}%</td>
                ))}
              </tr>
              <tr className="border-b border-app">
                <td className="py-2 pr-4 text-muted">Nearest Metro</td>
                {coloredItems.map(item => (
                  <td key={item.id} className="py-2 pr-4">{item.connectivity.nearestMetro.name} ({item.connectivity.nearestMetro.distanceKm} km)</td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-4 text-muted">Service Charge/sqft</td>
                {coloredItems.map(item => (
                  <td key={item.id} className="py-2 pr-4">AED {item.pricing.serviceChargePerSqft.min}–{item.pricing.serviceChargePerSqft.max}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Featured Neighborhood Spotlight (theme-aware hero)
// ---------------------------------------------------------------------------

function NeighborhoodSpotlight({ community }: { community: ScoredCommunity }) {
  const strengths = CATEGORY_LABELS
    .map(c => ({ ...c, score: community.scores[c.key] }))
    .sort((a, b) => b.score - a.score);

  const great = strengths.slice(0, 2);
  const tricky = strengths.slice(-2).reverse();

  return (
    <div className="rounded-3xl border border-app bg-app-elevated overflow-hidden shadow-card">
      {/* Hero strip — theme-aware via tool-hero className */}
      <div className="tool-hero relative px-8 py-10 sm:px-12 sm:py-14 border-b border-app">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-tool-accent mb-3 font-medium">
              Featured Report · {community.status}
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light text-app tracking-tight leading-[0.95] mb-3">
              {community.name}
            </h1>
            <div className="h-[2px] w-24 bg-tool-accent mb-4" />
            <p className="text-base sm:text-lg text-secondary leading-relaxed max-w-xl font-light">
              {community.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xs uppercase tracking-wider text-muted">
              <span>Developer · <span className="text-secondary normal-case tracking-normal">{community.developer}</span></span>
              <span>Type · <span className="text-secondary normal-case tracking-normal">{community.freeholdStatus}</span></span>
            </div>
          </div>

          {/* Overall score banner */}
          <div className="shrink-0 flex items-center gap-5 rounded-2xl border border-app bg-app-elevated px-6 py-5 shadow-card">
            <ScoreRing score={community.scores.overall} size={96} stroke={8} />
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-1">Overall</div>
              <div className="text-4xl text-app tabular-nums leading-none font-semibold">
                {Math.round(community.scores.overall * 10)}
                <span className="text-xl text-muted">/100</span>
              </div>
              <div className="mt-1 text-xs text-secondary">{getScoreLabel(community.scores.overall)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Six dimension cards — numbered with accent chips */}
      <div className="p-6 sm:p-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">The Six Dimensions</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Score / 10</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORY_LABELS.map((cat, i) => {
            const score = community.scores[cat.key];
            const dataPoints: string[] = (() => {
              switch (cat.key) {
                case "investment":
                  return [
                    `Yield ${community.investment.rentalYieldPct.min}–${community.investment.rentalYieldPct.max}%`,
                    `Price ${formatPrice(community.pricing.priceRangeAed[0])}–${formatPrice(community.pricing.priceRangeAed[1])} AED`,
                  ];
                case "connectivity":
                  return [
                    `${community.connectivity.nearestMetro.name}`,
                    `${community.connectivity.nearestMetro.distanceKm} km to metro`,
                  ];
                case "value":
                  return [
                    `AED ${community.pricing.pricePerSqft.min.toLocaleString()}–${community.pricing.pricePerSqft.max.toLocaleString()}/sqft`,
                    `Service AED ${community.pricing.serviceChargePerSqft.min}–${community.pricing.serviceChargePerSqft.max}`,
                  ];
                default:
                  return [
                    `${community.tags[i % Math.max(1, community.tags.length)] || community.status}`,
                    getScoreLabel(score),
                  ];
              }
            })();

            return (
              <motion.div
                key={cat.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 * i, ease }}
                className="rounded-xl border border-app bg-app-elevated p-5 hover:border-app-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-tool-accent-soft text-tool-accent text-xs font-semibold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="text-base text-app tracking-tight font-semibold">{cat.label}</h3>
                  </div>
                  <ScoreRing score={score} size={52} stroke={5} showLabel={false} />
                </div>
                <p className="text-[13px] leading-relaxed text-secondary mb-3 font-light">
                  {cat.narrative}
                </p>
                <div className="space-y-1 border-t border-app pt-3">
                  {dataPoints.map((dp, j) => (
                    <div key={j} className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="w-1 h-1 rounded-full bg-tool-accent" />
                      <span className="text-secondary">{dp}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* What's great / tricky */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-app border-t border-app">
        <div className="bg-app-elevated p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">What&rsquo;s Great</h3>
          </div>
          <ul className="space-y-2.5">
            {great.map(g => (
              <li key={g.key} className="flex items-start gap-3 text-sm text-secondary">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-tool-accent shrink-0" />
                <span>
                  <span className="font-medium text-app">Strong {g.label.toLowerCase()}</span>
                  <span className="text-muted"> — scoring {g.score.toFixed(1)}/10, among the top dimensions here.</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-app-elevated p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">What&rsquo;s Tricky</h3>
          </div>
          <ul className="space-y-2.5">
            {tricky.map(t => (
              <li key={t.key} className="flex items-start gap-3 text-sm text-secondary">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-tool-accent shrink-0" />
                <span>
                  <span className="font-medium text-app">Watch {t.label.toLowerCase()}</span>
                  <span className="text-muted"> — {t.score.toFixed(1)}/10, one to weigh carefully for this area.</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Content
// ---------------------------------------------------------------------------

function NeighborhoodReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isFramed = searchParams?.get("frame") === "1";

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [budget, setBudget] = useState(searchParams.get("budget") || "all");
  const [propertyType, setPropertyType] = useState(searchParams.get("type") || "all");
  const [sort, setSort] = useState(searchParams.get("sort") || "score");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SubTab>("overview");
  const resultsRef = useRef<HTMLDivElement>(null);

  const updateURL = useCallback((params: Record<string, string>) => {
    const url = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v && v !== "all" && v !== "score" && v !== "") url.set(k, v);
    });
    const qs = url.toString();
    router.replace(`/tools/neighborhood-report${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router]);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    updateURL({ q: v, budget, type: propertyType, sort });
  }, [budget, propertyType, sort, updateURL]);

  const handleBudget = useCallback((v: string) => {
    setBudget(v);
    updateURL({ q: search, budget: v, type: propertyType, sort });
  }, [search, propertyType, sort, updateURL]);

  const handlePropertyType = useCallback((v: string) => {
    setPropertyType(v);
    updateURL({ q: search, budget, type: v, sort });
  }, [search, budget, sort, updateURL]);

  const handleSort = useCallback((v: string) => {
    setSort(v);
    updateURL({ q: search, budget, type: propertyType, sort: v });
  }, [search, budget, propertyType, updateURL]);

  const allScores = useMemo(() => computeAllScores(communities), []);
  const defaultScores: CommunityScores = { overall: 0, investment: 0, livability: 0, connectivity: 0, family: 0, value: 0, growth: 0 };

  const scoredCommunities: ScoredCommunity[] = useMemo(
    () => communities.map((c) => ({ ...c, scores: allScores.get(c.id) ?? defaultScores })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allScores]
  );

  const filtered = useMemo(() => {
    let result = scoredCommunities;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.developer.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (budget !== "all") {
      result = result.filter((c) => {
        const min = c.pricing.priceRangeAed[0];
        const max = c.pricing.priceRangeAed[1];
        switch (budget) {
          case "under-1m": return min < 1_000_000;
          case "1m-2m": return min <= 2_000_000 && max >= 1_000_000;
          case "2m-5m": return min <= 5_000_000 && max >= 2_000_000;
          case "5m-10m": return min <= 10_000_000 && max >= 5_000_000;
          case "10m-plus": return max >= 10_000_000;
          default: return true;
        }
      });
    }

    if (propertyType !== "all") {
      result = result.filter((c) =>
        c.propertyTypes.some((pt) => pt.toLowerCase().includes(propertyType))
      );
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "score": return b.scores.overall - a.scores.overall;
        case "price-asc": return a.pricing.priceRangeAed[0] - b.pricing.priceRangeAed[0];
        case "price-desc": return b.pricing.priceRangeAed[0] - a.pricing.priceRangeAed[0];
        case "yield":
          return (
            (b.investment.rentalYieldPct.min + b.investment.rentalYieldPct.max) / 2 -
            (a.investment.rentalYieldPct.min + a.investment.rentalYieldPct.max) / 2
          );
        case "name": return a.name.localeCompare(b.name);
        default: return 0;
      }
    });

    return result;
  }, [scoredCommunities, search, budget, propertyType, sort]);

  const featured = useMemo(() => {
    if (featuredId) {
      const found = scoredCommunities.find(c => c.id === featuredId);
      if (found) return found;
    }
    return filtered[0] ?? scoredCommunities[0];
  }, [featuredId, scoredCommunities, filtered]);

  const avgScore = useMemo(() => {
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, c) => sum + c.scores.overall, 0) / filtered.length;
  }, [filtered]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleCompareMode = useCallback(() => {
    setCompareMode(prev => {
      if (prev) {
        setSelectedIds(new Set());
        setShowComparison(false);
      }
      return !prev;
    });
  }, []);

  const selectedCommunities = useMemo(
    () => scoredCommunities.filter(c => selectedIds.has(c.id)),
    [scoredCommunities, selectedIds]
  );

  const selectClasses = "rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-app-focus appearance-none cursor-pointer";

  return (
    <div data-tool-theme="research" data-tool="neighborhood-report" className="min-h-screen bg-app text-app">
      <div ref={resultsRef} className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-10 pt-6 pb-24">
        {/* ============================================================= */}
        {/* IN-TOOL HEADER                                                 */}
        {/* ============================================================= */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-app bg-app-elevated px-4 sm:px-5 py-3 shadow-card"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-2.5 w-2.5 rounded-full bg-tool-accent" />
              <h1 className="text-base sm:text-lg text-app tracking-tight whitespace-nowrap font-semibold">
                Neighborhood Report
              </h1>
            </div>

            {/* Area selector pill */}
            <div className="ml-2 sm:ml-4 min-w-0 flex-1 hidden md:flex items-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-app bg-app px-3 py-1.5 min-w-0">
                <svg className="h-3.5 w-3.5 text-tool-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <select
                  value={featured?.id || ""}
                  onChange={(e) => setFeaturedId(e.target.value)}
                  className="bg-transparent text-sm text-app outline-none appearance-none cursor-pointer min-w-0 max-w-[220px] truncate"
                >
                  {scoredCommunities.map(c => (
                    <option key={c.id} value={c.id} className="bg-app-elevated">{c.name}</option>
                  ))}
                </select>
                <svg className="h-3 w-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ExportButton targetRef={resultsRef} filename={`neighborhood-report-${featured?.id || "results"}`} />
          </div>
        </motion.div>

        {/* Mobile area selector */}
        <div className="md:hidden mb-6">
          <div className="inline-flex w-full items-center gap-2 rounded-full border border-app bg-app-elevated px-3 py-2">
            <svg className="h-3.5 w-3.5 text-tool-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <select
              value={featured?.id || ""}
              onChange={(e) => setFeaturedId(e.target.value)}
              className="flex-1 bg-transparent text-sm text-app outline-none appearance-none cursor-pointer truncate"
            >
              {scoredCommunities.map(c => (
                <option key={c.id} value={c.id} className="bg-app-elevated">{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ============================================================= */}
        {/* SUB-TABS — overview / scores / directory                       */}
        {/* ============================================================= */}
        <div className="mb-6 flex items-center gap-1 rounded-xl border border-app bg-app-elevated p-1 w-fit">
          {SUB_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-all ${
                activeTab === t.value
                  ? "bg-tool-accent-soft text-tool-accent font-medium"
                  : "text-secondary hover:text-app"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ============================================================= */}
        {/* OVERVIEW TAB — Featured spotlight                              */}
        {/* ============================================================= */}
        {activeTab === "overview" && featured && (
          <motion.div
            key={featured.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="mb-12"
          >
            <NeighborhoodSpotlight community={featured} />
            <div className="mt-4 flex justify-end">
              <Link
                href={`/tools/neighborhood-report/${featured.id}`}
                className="inline-flex items-center gap-2 text-sm text-tool-accent hover:opacity-80 transition-opacity"
              >
                Open full report
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* SCORES TAB — Just the six-dimension grid for quick reading     */}
        {/* ============================================================= */}
        {activeTab === "scores" && featured && (
          <motion.div
            key={`scores-${featured.id}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="mb-12 rounded-3xl border border-app bg-app-elevated p-6 sm:p-8 shadow-card"
          >
            <div className="mb-6 flex items-baseline justify-between border-b border-app pb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-1 font-semibold">Score Breakdown</div>
                <h2 className="text-2xl text-app tracking-tight font-semibold">{featured.name}</h2>
              </div>
              <ScoreRing score={featured.scores.overall} size={72} stroke={6} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CATEGORY_LABELS.map((cat, i) => {
                const score = featured.scores[cat.key];
                return (
                  <motion.div
                    key={cat.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.04 * i, ease }}
                    className="rounded-xl border border-app bg-app p-4 flex items-center gap-4"
                  >
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-tool-accent-soft text-tool-accent text-xs font-semibold tabular-nums shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className="text-sm text-app font-medium">{cat.label}</h3>
                        <span className="text-sm tabular-nums text-tool-accent font-semibold">{score.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-tool-accent-soft overflow-hidden">
                        <div
                          className="h-full rounded-full bg-tool-accent transition-all duration-700"
                          style={{ width: `${score * 10}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">{getScoreLabel(score)}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* DIRECTORY TAB                                                  */}
        {/* ============================================================= */}
        {activeTab === "directory" && (
          <>
            <div className="mb-5 flex items-end justify-between gap-4 border-b border-app pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-1 font-semibold">The Directory</div>
                <h2 className="text-2xl text-app tracking-tight font-semibold">Every Neighborhood, Scored</h2>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-0.5">Average</div>
                <div className="text-xl tabular-nums text-tool-accent font-semibold">
                  {avgScore.toFixed(1)}<span className="text-muted text-sm">/10</span>
                </div>
              </div>
            </div>

            {/* Filters row */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease }}
              className="mb-6 flex flex-wrap items-center gap-2.5"
            >
              <div className="relative flex-1 min-w-[220px]">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search neighborhood, developer, vibe…"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full rounded-lg border border-app bg-app-elevated pl-10 pr-3 py-2 text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-app-focus"
                />
              </div>

              <select value={budget} onChange={(e) => handleBudget(e.target.value)} className={selectClasses}>
                {BUDGET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>
                ))}
              </select>

              <select value={propertyType} onChange={(e) => handlePropertyType(e.target.value)} className={selectClasses}>
                {PROPERTY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>
                ))}
              </select>

              <select value={sort} onChange={(e) => handleSort(e.target.value)} className={selectClasses}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>
                ))}
              </select>

              <button
                onClick={toggleCompareMode}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  compareMode
                    ? "border-app-strong bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:text-app hover:border-app-strong"
                }`}
              >
                {compareMode ? "✕ Exit Compare" : "⚖ Compare"}
              </button>

              <span className="ml-auto text-xs text-muted">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </span>
            </motion.div>

            {/* Directory list */}
            <div className="space-y-2.5">
              {filtered.map((c, i) => {
                const isSelected = selectedIds.has(c.id);
                const isFeatured = featured?.id === c.id;
                const yieldRange = `${c.investment.rentalYieldPct.min}–${c.investment.rentalYieldPct.max}%`;

                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.02 * Math.min(i, 15), ease }}
                  >
                    <div className={`group rounded-xl border transition-colors p-4 sm:p-5 ${
                      isSelected
                        ? "border-app-strong bg-tool-accent-soft"
                        : isFeatured
                        ? "border-app-strong bg-app-elevated"
                        : "border-app bg-app-elevated hover:border-app-strong"
                    }`}>
                      <div className="flex items-start gap-4">
                        {compareMode && (
                          <button
                            onClick={() => toggleSelect(c.id)}
                            className={`mt-2 flex-shrink-0 w-5 h-5 rounded border transition-colors ${
                              isSelected
                                ? "bg-tool-accent-soft border-app-strong"
                                : selectedIds.size >= MAX_COMPARE
                                ? "border-app bg-app opacity-40 cursor-not-allowed"
                                : "border-app bg-app hover:border-app-strong"
                            } flex items-center justify-center`}
                            disabled={!isSelected && selectedIds.size >= MAX_COMPARE}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-tool-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        )}

                        <ScoreRing score={c.scores.overall} size={64} stroke={5} showLabel={false} />

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <button
                              onClick={() => setFeaturedId(c.id)}
                              className="text-left"
                            >
                              <h3 className="text-base text-app font-semibold group-hover:text-tool-accent transition-colors">
                                {c.name}
                              </h3>
                            </button>
                            {isFeatured && (
                              <span className="inline-block rounded-full bg-tool-accent-soft border border-app-strong px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-tool-accent">
                                Featured
                              </span>
                            )}
                            <span className="inline-block rounded-full bg-app border border-app px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-secondary">
                              {c.status}
                            </span>
                          </div>

                          <p className="text-xs text-muted mb-2 font-light">{c.developer} · {c.description.slice(0, 80)}{c.description.length > 80 ? "…" : ""}</p>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                            {CATEGORY_LABELS.map(({ key, initial }) => {
                              const score = c.scores[key];
                              return (
                                <div key={key} className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-tool-accent w-2.5 font-semibold">{initial}</span>
                                  <div className="w-[54px] h-1 rounded-full bg-tool-accent-soft overflow-hidden">
                                    <div className="h-full rounded-full bg-tool-accent" style={{ width: `${score * 10}%` }} />
                                  </div>
                                  <span className="text-[10px] font-medium tabular-nums text-secondary">{score.toFixed(1)}</span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted mt-1.5">
                            <span>AED {c.pricing.pricePerSqft.min.toLocaleString()}–{c.pricing.pricePerSqft.max.toLocaleString()}/sqft</span>
                            <span>Yield {yieldRange}</span>
                            <span>Metro · {c.connectivity.nearestMetro.name}</span>
                          </div>
                        </div>

                        <div className="hidden sm:flex flex-col items-end gap-2 self-center shrink-0">
                          <button
                            onClick={() => { setFeaturedId(c.id); setActiveTab("overview"); }}
                            className="rounded-full border border-app bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent hover:border-app-strong transition-colors whitespace-nowrap"
                          >
                            Preview ↑
                          </button>
                          <Link
                            href={`/tools/neighborhood-report/${c.id}`}
                            className="text-xs text-secondary hover:text-tool-accent transition-colors whitespace-nowrap"
                          >
                            Full report →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-16 text-center rounded-2xl border border-app bg-app-elevated py-12">
                <p className="text-xl text-secondary">No neighborhoods match.</p>
                <button
                  onClick={() => {
                    handleSearch("");
                    handleBudget("all");
                    handlePropertyType("all");
                  }}
                  className="mt-4 text-sm text-tool-accent hover:opacity-80 transition-opacity"
                >
                  Clear all filters
                </button>
              </motion.div>
            )}
          </>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8, ease }}
          className="mt-16 text-center text-[11px] text-muted uppercase tracking-[0.2em]"
        >
          Data as of {DATA_UPDATED}
        </motion.p>
      </div>

      {/* ============================================================= */}
      {/* STICKY COMPARE BAR                                             */}
      {/* ============================================================= */}
      <AnimatePresence>
        {compareMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-app bg-app-elevated backdrop-blur-md shadow-elevated"
          >
            <div className="mx-auto max-w-[1240px] px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-tool-accent">{selectedIds.size}/{MAX_COMPARE} selected:</span>
                {selectedCommunities.map((c, i) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft border border-app-strong px-2.5 py-1 text-xs text-app">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: i === 0 ? "var(--tool-accent)" : i === 1 ? "var(--text)" : "var(--text-muted)" }}
                    />
                    {c.name}
                    <button onClick={() => toggleSelect(c.id)} className="ml-0.5 text-secondary hover:text-app">✕</button>
                  </span>
                ))}
              </div>
              <button
                onClick={() => selectedIds.size >= 2 && setShowComparison(true)}
                disabled={selectedIds.size < 2}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  selectedIds.size >= 2
                    ? "bg-tool-accent text-app-elevated hover:opacity-90"
                    : "border border-app bg-app text-muted cursor-not-allowed"
                }`}
                style={selectedIds.size >= 2 ? { color: "var(--bg)" } : undefined}
              >
                Compare Now →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showComparison && selectedCommunities.length >= 2 && (
          <ComparisonModal
            items={selectedCommunities}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>

      {/* Quiet hint that frame mode is active — keeps frame=1 logic intact */}
      {isFramed && <span className="sr-only">Framed view</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Export
// ---------------------------------------------------------------------------

export default function NeighborhoodReportPage() {
  return (
    <AuthGate>
      <main className="min-h-screen bg-app text-app">
        <Suspense fallback={
          <div className="mx-auto max-w-[1240px] px-6 py-24 text-center text-muted">Loading the neighborhood…</div>
        }>
          <NeighborhoodReportContent />
        </Suspense>

        <div className="mx-auto max-w-[1240px] px-6 lg:px-10 pb-20">
          <ToolRecommendations slug="neighborhood-report" />
        </div>
      </main>
    </AuthGate>
  );
}
