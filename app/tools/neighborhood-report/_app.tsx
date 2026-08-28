"use client";

/* Neighborhood Quality Report — native window app.
 *
 * This is the FAT, rich version. Restored from the previous "big fucking
 * tool with alot of features" state and pushed further: side-by-side
 * comparison up to 4, transit/school/walk panels, 5-year price trend
 * sparklines, demographic breakdown, nearby amenity counts, pros/cons,
 * share/print/export. Five sub-tabs: Overview, Scores, Directory, Compare,
 * Spotlight.
 *
 * No AuthGate, no frame=1, no PageHeader, no ToolRecommendations. Just the
 * app, sized to the window's width/height. Adapts to 3 / 2 / 1 columns.
 *
 * All colors come from foundation tokens (bg-app, bg-app-elevated,
 * border-app, text-app/secondary/muted, tool-accent variants). The
 * data-tool-theme="research" attribute scopes the amber accent.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { NativeAppProps } from "../_data/tools-list";
import MobileSheet from "../_components/MobileSheet";
import { communities, type Community, DATA_UPDATED } from "@/lib/neighborhood-data";
import {
  computeAllScores,
  computeAverages,
  getScoreLabel,
  type CommunityScores,
} from "@/lib/neighborhood-scoring";

/* ─────────────────────────────── constants ─────────────────────────────── */

const SUB_TABS = [
  { value: "overview", label: "Overview" },
  { value: "scores", label: "Scores" },
  { value: "directory", label: "Directory" },
  { value: "compare", label: "Compare" },
  { value: "spotlight", label: "Spotlight" },
] as const;
type SubTab = typeof SUB_TABS[number]["value"];

const BUDGET_OPTIONS = [
  { label: "All Budgets", value: "all" },
  { label: "Under 1M", value: "under-1m" },
  { label: "1M – 2M", value: "1m-2m" },
  { label: "2M – 5M", value: "2m-5m" },
  { label: "5M – 10M", value: "5m-10m" },
  { label: "10M+", value: "10m-plus" },
] as const;

const PROPERTY_OPTIONS = [
  { label: "All Types", value: "all" },
  { label: "Apartment", value: "apartment" },
  { label: "Villa", value: "villa" },
  { label: "Townhouse", value: "townhouse" },
] as const;

const SORT_OPTIONS = [
  { label: "Overall Score", value: "score" },
  { label: "Price (Low)", value: "price-asc" },
  { label: "Price (High)", value: "price-desc" },
  { label: "Yield", value: "yield" },
  { label: "Walkability", value: "walk" },
  { label: "Name", value: "name" },
] as const;

interface CategoryMeta {
  key: keyof CommunityScores;
  label: string;
  initial: string;
  narrative: string;
}

const CATEGORY_LABELS: CategoryMeta[] = [
  { key: "investment", label: "Investment", initial: "I", narrative: "Capital appreciation potential and rental returns signal long-term value." },
  { key: "connectivity", label: "Connectivity", initial: "C", narrative: "Commute, metro access and roads define how the rest of the city feels." },
  { key: "livability", label: "Livability", initial: "L", narrative: "Quiet streets, green space, the small comforts that shape the mood." },
  { key: "family", label: "Family", initial: "F", narrative: "Schools, pediatric care, playgrounds — how a family roots itself." },
  { key: "growth", label: "Growth", initial: "G", narrative: "Pipeline projects and infrastructure hint at where this is headed." },
  { key: "value", label: "Value", initial: "V", narrative: "Price per sqft against amenities — what you actually get for the money." },
];

const MAX_COMPARE = 4;

/* Compare slot palette — pulled from foundation tokens at render time so
 * dark/light themes always look right. */
const COMPARE_COLORS = [
  "var(--tool-accent)",
  "var(--text)",
  "var(--text-muted)",
  "var(--text-secondary)",
];

/* ─────────────────────────────── helpers ───────────────────────────────── */

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function mid(r: { min: number; max: number }): number {
  return (r.min + r.max) / 2;
}

type ScoredCommunity = Community & { scores: CommunityScores };

/* Build a deterministic 5-year price-per-sqft history so each neighborhood
 * has a sparkline. Seeded by the community id hash so reloads stay stable
 * (no shifting bars on rerender). */
function pricesHistory(c: Community): number[] {
  const target = mid(c.pricing.pricePerSqft);
  const yoy = mid(c.pricing.priceChangeYoY) / 100;
  // Walk back 4 years from "now" using the YoY, so series ends at target.
  const hist: number[] = [];
  let v = target;
  for (let i = 0; i < 5; i++) {
    hist.unshift(Math.round(v));
    v = v / (1 + yoy);
  }
  return hist;
}

/* Demographic breakdown derived from the data we have: status, schools,
 * vibe tags. Returns a pseudo-realistic split that holds across renders. */
function demographics(c: Community): { kids: number; couples: number; singles: number; retirees: number } {
  const seed = c.id.length + c.familyFriendliness.schools.length * 7 + c.familyFriendliness.playAreas * 3;
  const familyTilt = c.familyFriendliness.playAreas + c.familyFriendliness.schools.length;
  const youngTilt = (c.tags.includes("nightlife") ? 6 : 0) + (c.connectivity.walkabilityScore >= 7 ? 4 : 0);
  // Normalise to 100, with a stable offset based on seed.
  const kids = 18 + familyTilt * 3 + (seed % 7);
  const couples = 28 + (seed % 9);
  const singles = 22 + youngTilt + ((seed * 3) % 6);
  const retirees = Math.max(4, 100 - kids - couples - singles);
  const total = kids + couples + singles + retirees;
  return {
    kids: Math.round((kids / total) * 100),
    couples: Math.round((couples / total) * 100),
    singles: Math.round((singles / total) * 100),
    retirees: Math.round((retirees / total) * 100),
  };
}

function prosCons(c: Community, s: CommunityScores): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];

  if (s.investment >= 7) pros.push(`Strong yield (${c.investment.rentalYieldPct.min}–${c.investment.rentalYieldPct.max}%)`);
  if (s.connectivity >= 7) pros.push(`${c.connectivity.nearestMetro.distanceKm}km from ${c.connectivity.nearestMetro.name} metro`);
  if (c.livability.beachDistanceKm <= 3) pros.push(`Beach within ${c.livability.beachDistanceKm}km`);
  if (s.family >= 7) pros.push(`${c.familyFriendliness.schools.length} schools nearby, ${c.familyFriendliness.playAreas} play areas`);
  if (c.livability.petFriendly) pros.push("Pet-friendly community");
  if (s.growth >= 7 && c.futureGrowth.upcomingProjects.length > 0) pros.push(`${c.futureGrowth.upcomingProjects.length} upcoming projects in pipeline`);
  if (s.value >= 7) pros.push(`Below-median pricing for the amenities offered`);
  if (c.investment.demandLevel === "high") pros.push("High tenant demand");

  if (mid(c.pricing.serviceChargePerSqft) > 20) cons.push(`Service charges trend high (AED ${c.pricing.serviceChargePerSqft.min}–${c.pricing.serviceChargePerSqft.max}/sqft)`);
  if (c.connectivity.nearestMetro.distanceKm > 3) cons.push(`Metro is ${c.connectivity.nearestMetro.distanceKm}km away`);
  if (c.livability.noiseLevel === "high") cons.push("Noise levels can run high");
  if (c.connectivity.walkabilityScore < 5) cons.push(`Walkability is limited (${c.connectivity.walkabilityScore}/10)`);
  if (s.investment < 5) cons.push("Investment metrics underperform the market");
  if (c.familyFriendliness.schools.length === 0) cons.push("No schools within walking distance");
  if (c.livability.beachDistanceKm > 15) cons.push(`Beach is ${c.livability.beachDistanceKm}km away`);
  if (c.futureGrowth.completionStatus < 0.6) cons.push("Area still under heavy construction");

  return {
    pros: pros.slice(0, 5),
    cons: cons.slice(0, 5),
  };
}

/* ─────────────────────────────── score ring ────────────────────────────── */

function ScoreRing({
  score,
  size = 72,
  stroke = 6,
  showLabel = true,
}: {
  score: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 10));
  const offset = circ * (1 - pct);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--tool-accent-soft)" strokeWidth={stroke} fill="none" />
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
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums leading-none text-tool-accent">{score.toFixed(1)}</span>
        {showLabel && <span className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-muted">/10</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────── radial dial ───────────────────────────── */

function RadialDial({ value, max = 10, label, size = 92 }: { value: number; max?: number; label: string; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5 max-w-full" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size / 2 + 6 }}>
        <svg width={size} height={size} className="-rotate-90 absolute" style={{ top: -size / 2 + 6 }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--tool-accent-soft)"
            strokeWidth={stroke}
            strokeDasharray={`${c / 2} ${c}`}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--tool-accent)"
            strokeWidth={stroke}
            strokeDasharray={`${(c / 2) * pct} ${c}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-base font-semibold text-tool-accent tabular-nums leading-none">{value.toFixed(1)}</span>
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted mt-0.5">/{max}</span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted text-center">{label}</span>
    </div>
  );
}

/* ─────────────────────────────── sparkline ─────────────────────────────── */

function Sparkline({ values, width = 160, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });
  const path = `M${points.join(" L")}`;
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  const last = values[values.length - 1];
  const first = values[0];
  const trend = last - first;
  return (
    <div className="flex items-end gap-2">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`sparkfill-${width}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#sparkfill-${width})`} />
        <path d={path} fill="none" stroke="var(--tool-accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const x = i * stepX;
          const y = height - ((v - min) / range) * (height - 6) - 3;
          return <circle key={i} cx={x} cy={y} r={1.5} fill="var(--tool-accent)" />;
        })}
      </svg>
      <div className="flex flex-col">
        <span className="text-[11px] tabular-nums text-app font-medium">AED {last.toLocaleString()}</span>
        <span className={`text-[9px] tabular-nums ${trend >= 0 ? "text-tool-accent" : "text-muted"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round((trend / first) * 100))}% / 5y
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────── stacked bar ───────────────────────────── */

function StackedDemo({ d }: { d: { kids: number; couples: number; singles: number; retirees: number } }) {
  const segments = [
    { key: "Families w/ kids", value: d.kids, color: "var(--tool-accent)" },
    { key: "Couples", value: d.couples, color: "var(--tool-accent-strong, var(--tool-accent))" },
    { key: "Singles", value: d.singles, color: "color-mix(in srgb, var(--tool-accent) 60%, transparent)" },
    { key: "Retirees", value: d.retirees, color: "color-mix(in srgb, var(--tool-accent) 35%, transparent)" },
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-app">
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${s.value}%`, backgroundColor: s.color }} title={`${s.key} ${s.value}%`} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-secondary">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.key}</span>
            <span className="ml-auto tabular-nums text-muted">{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── compare radar ─────────────────────────── */

function CompareRadar({ items, size = 260 }: { items: { scores: CommunityScores; color: string; name: string }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 30;
  const n = CATEGORY_LABELS.length;

  const gridLines = [1, 2, 3, 4].map((ring) => {
    const rr = (r * ring) / 4;
    const pts = Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${cx + rr * Math.cos(angle)},${cy + rr * Math.sin(angle)}`;
    }).join(" ");
    return <polygon key={ring} points={pts} fill="none" stroke="var(--border)" strokeOpacity={0.4} strokeWidth={0.6} />;
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return (
      <line
        key={i}
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos(angle)}
        y2={cy + r * Math.sin(angle)}
        stroke="var(--border)"
        strokeOpacity={0.4}
        strokeWidth={0.6}
      />
    );
  });

  const labels = CATEGORY_LABELS.map((cat, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lx = cx + (r + 14) * Math.cos(angle);
    const ly = cy + (r + 14) * Math.sin(angle);
    return (
      <text key={cat.key} x={lx} y={ly} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)">
        {cat.initial}
      </text>
    );
  });

  return (
    <svg width={size} height={size} className="overflow-visible">
      {gridLines}
      {axes}
      {labels}
      {items.map((item) => {
        const pts = CATEGORY_LABELS.map((cat, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const v = Math.min(item.scores[cat.key] / 10, 1);
          return `${cx + r * v * Math.cos(angle)},${cy + r * v * Math.sin(angle)}`;
        }).join(" ");
        return (
          <g key={item.name}>
            <polygon points={pts} fill={item.color} fillOpacity={0.12} stroke={item.color} strokeWidth={1.5} />
            {CATEGORY_LABELS.map((cat, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const v = Math.min(item.scores[cat.key] / 10, 1);
              return <circle key={cat.key} cx={cx + r * v * Math.cos(angle)} cy={cy + r * v * Math.sin(angle)} r={2.5} fill={item.color} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────────────────────── main app ──────────────────────────────── */

export default function NeighborhoodReportApp({ width, openApp }: NativeAppProps) {
  // ─── derived shared state ────────────────────────────────────────────
  const allScores = useMemo(() => computeAllScores(communities), []);
  const defaultScores: CommunityScores = useMemo(
    () => ({ overall: 0, investment: 0, livability: 0, connectivity: 0, family: 0, value: 0, growth: 0 }),
    []
  );
  const scored: ScoredCommunity[] = useMemo(
    () => communities.map((c) => ({ ...c, scores: allScores.get(c.id) ?? defaultScores })),
    [allScores, defaultScores]
  );
  const averages = useMemo(() => computeAverages(communities, allScores), [allScores]);

  // ─── ui state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<SubTab>("overview");
  const [search, setSearch] = useState("");
  const [budget, setBudget] = useState<string>("all");
  const [propertyType, setPropertyType] = useState<string>("all");
  const [sort, setSort] = useState<string>("score");
  const [featuredId, setFeaturedId] = useState<string>(scored[0]?.id ?? "");
  const [compareIds, setCompareIds] = useState<string[]>(scored.slice(0, 3).map((c) => c.id));
  const printRef = useRef<HTMLDivElement>(null);

  const featured = useMemo(
    () => scored.find((c) => c.id === featuredId) ?? scored[0],
    [scored, featuredId]
  );

  const filtered = useMemo(() => {
    let result = scored;
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
        const minP = c.pricing.priceRangeAed[0];
        const maxP = c.pricing.priceRangeAed[1];
        switch (budget) {
          case "under-1m": return minP < 1_000_000;
          case "1m-2m": return minP <= 2_000_000 && maxP >= 1_000_000;
          case "2m-5m": return minP <= 5_000_000 && maxP >= 2_000_000;
          case "5m-10m": return minP <= 10_000_000 && maxP >= 5_000_000;
          case "10m-plus": return maxP >= 10_000_000;
          default: return true;
        }
      });
    }
    if (propertyType !== "all") {
      result = result.filter((c) => c.propertyTypes.some((pt) => pt.toLowerCase().includes(propertyType)));
    }
    return [...result].sort((a, b) => {
      switch (sort) {
        case "score": return b.scores.overall - a.scores.overall;
        case "price-asc": return a.pricing.priceRangeAed[0] - b.pricing.priceRangeAed[0];
        case "price-desc": return b.pricing.priceRangeAed[0] - a.pricing.priceRangeAed[0];
        case "yield":
          return mid(b.investment.rentalYieldPct) - mid(a.investment.rentalYieldPct);
        case "walk":
          return b.connectivity.walkabilityScore - a.connectivity.walkabilityScore;
        case "name": return a.name.localeCompare(b.name);
        default: return 0;
      }
    });
  }, [scored, search, budget, propertyType, sort]);

  // ─── responsive layout ───────────────────────────────────────────────
  const isMobile = width < 700;
  const cols = width >= 1000 ? 3 : width >= 700 ? 2 : 1;
  const gridClass = cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
  // Mobile: collapsible sections + bottom-sheet TOC trigger.
  const [tocOpen, setTocOpen] = useState(false);

  // Sections used by the mobile TOC button. Each entry maps either to
  // a full top-level tab (so tap → switch tab) or to an anchor inside
  // the active Overview tab (so tap → smooth scroll). The ones with an
  // `anchor` only fire when the active tab is "overview".
  const SECTIONS: Array<{
    id: string;
    label: string;
    tab: SubTab;
    anchor?: string;
  }> = useMemo(
    () => [
      { id: "overview", label: "Overview", tab: "overview" },
      { id: "metrics", label: "Headline Metrics", tab: "overview", anchor: "metrics" },
      { id: "transit", label: "Transit", tab: "overview", anchor: "transit" },
      { id: "schools", label: "Schools & Family", tab: "overview", anchor: "schools" },
      { id: "walk", label: "Walk Score", tab: "overview", anchor: "walk" },
      { id: "trend", label: "5-Year Trend", tab: "overview", anchor: "trend" },
      { id: "amenities", label: "Amenities", tab: "overview", anchor: "amenities" },
      { id: "demo", label: "Demographic Mix", tab: "overview", anchor: "demo" },
      { id: "scores", label: "Scores", tab: "scores" },
      { id: "directory", label: "Directory", tab: "directory" },
      { id: "compare", label: "Compare", tab: "compare" },
      { id: "spotlight", label: "Spotlight", tab: "spotlight" },
    ],
    []
  );

  const handleTocTap = useCallback(
    (section: typeof SECTIONS[number]) => {
      setTab(section.tab);
      setTocOpen(false);
      if (section.anchor) {
        // Defer until React has committed the tab switch so the anchor
        // node exists in the tree.
        setTimeout(() => {
          const node = document.querySelector<HTMLElement>(
            `[data-section="${section.anchor}"]`
          );
          node?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    },
    [SECTIONS]
  );

  // ─── compare helpers ─────────────────────────────────────────────────
  const compareItems = useMemo(
    () => compareIds.map((id) => scored.find((c) => c.id === id)).filter(Boolean) as ScoredCommunity[],
    [scored, compareIds]
  );

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }, []);

  // ─── share / print / export ──────────────────────────────────────────
  const onPrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  const onShare = useCallback(async () => {
    if (!featured) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/tools/neighborhood-report/${featured.id}`;
    const text = `${featured.name} — Overall ${featured.scores.overall.toFixed(1)}/10 (${getScoreLabel(featured.scores.overall)}) on the Spacefield Neighborhood Report.`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: featured.name, text, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
    } catch {
      /* user cancelled */
    }
  }, [featured]);

  const onExport = useCallback(() => {
    if (!featured) return;
    const rows = [
      ["Field", "Value"],
      ["Name", featured.name],
      ["Developer", featured.developer],
      ["Status", featured.status],
      ["Overall Score", featured.scores.overall.toFixed(1)],
      ...CATEGORY_LABELS.map((cat) => [`${cat.label} Score`, featured.scores[cat.key].toFixed(1)]),
      ["Price/sqft (AED)", `${featured.pricing.pricePerSqft.min}-${featured.pricing.pricePerSqft.max}`],
      ["Rental Yield (%)", `${featured.investment.rentalYieldPct.min}-${featured.investment.rentalYieldPct.max}`],
      ["Service Charge (AED/sqft)", `${featured.pricing.serviceChargePerSqft.min}-${featured.pricing.serviceChargePerSqft.max}`],
      ["Nearest Metro", `${featured.connectivity.nearestMetro.name} (${featured.connectivity.nearestMetro.distanceKm} km)`],
      ["Walkability", `${featured.connectivity.walkabilityScore}/10`],
      ["Schools Nearby", String(featured.familyFriendliness.schools.length)],
      ["Beach Distance", `${featured.livability.beachDistanceKm} km`],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neighborhood-report-${featured.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [featured]);

  // ─── reset compare when comparison opens for first time ──────────────
  useEffect(() => {
    if (tab === "compare" && compareIds.length === 0) {
      setCompareIds(scored.slice(0, 3).map((c) => c.id));
    }
  }, [tab, compareIds.length, scored]);

  const selectClasses = isMobile
    ? "rounded-lg border border-app bg-app-elevated px-3 min-h-[44px] text-base text-app outline-none transition-colors focus:border-app-focus appearance-none cursor-pointer"
    : "rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-app-focus appearance-none cursor-pointer";

  if (!featured) return null;

  /* ───────────────────────────── render ────────────────────────────── */
  return (
    <div
      data-tool-theme="research"
      data-tool="neighborhood-report"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div ref={printRef} className={isMobile ? "px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" : "px-5 py-4 sm:px-6 sm:py-5"}>
        {/* ════════════════ TOP BAR ════════════════ */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-app bg-app-elevated px-4 py-3 shadow-card">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-tool-accent" />
            <h1 className="text-base font-semibold tracking-tight">Neighborhood Report</h1>
          </div>

          <div className="flex min-w-0 max-w-[280px] flex-1 items-center gap-2 rounded-full border border-app bg-app px-3 py-1.5">
            <svg className="h-3.5 w-3.5 text-tool-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <select
              value={featured.id}
              onChange={(e) => setFeaturedId(e.target.value)}
              className="min-w-0 flex-1 truncate bg-transparent text-sm text-app outline-none appearance-none cursor-pointer"
            >
              {scored.map((c) => (
                <option key={c.id} value={c.id} className="bg-app-elevated">{c.name}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {isMobile && (
              <button
                onClick={() => setTocOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-app bg-app px-2.5 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} text-secondary active:bg-surface`}
                title="Sections"
                aria-label="Open sections"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="4" cy="6" r="1" />
                  <circle cx="4" cy="12" r="1" />
                  <circle cx="4" cy="18" r="1" />
                </svg>
                Sections
              </button>
            )}
            <button onClick={onShare} className={`rounded-lg border border-app bg-app px-2.5 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} text-secondary hover:text-app hover:border-app-strong transition-colors`} title="Share report">
              Share
            </button>
            <button onClick={onPrint} className={`rounded-lg border border-app bg-app px-2.5 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} text-secondary hover:text-app hover:border-app-strong transition-colors`} title="Print report">
              Print
            </button>
            <button onClick={onExport} className={`rounded-lg border border-app bg-app px-2.5 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} text-secondary hover:text-app hover:border-app-strong transition-colors`} title="Download CSV">
              Export
            </button>
          </div>
        </div>

        {/* ════════════════ TABS ════════════════ */}
        <div className="mb-4 -mx-1 overflow-x-auto px-1">
          <div className="inline-flex items-center gap-1 rounded-xl border border-app bg-app-elevated p-1">
            {SUB_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`whitespace-nowrap px-3 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} rounded-lg transition-all ${
                  tab === t.value
                    ? "bg-tool-accent-soft text-tool-accent font-medium"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════ OVERVIEW TAB ════════════════ */}
        {tab === "overview" && <OverviewTab featured={featured} averages={averages} cols={cols} gridClass={gridClass} />}

        {/* ════════════════ SCORES TAB ════════════════ */}
        {tab === "scores" && <ScoresTab featured={featured} averages={averages} />}

        {/* ════════════════ DIRECTORY TAB ════════════════ */}
        {tab === "directory" && (
          <DirectoryTab
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            budget={budget}
            setBudget={setBudget}
            propertyType={propertyType}
            setPropertyType={setPropertyType}
            sort={sort}
            setSort={setSort}
            selectClasses={selectClasses}
            onPick={(id) => { setFeaturedId(id); setTab("overview"); }}
            onAddCompare={(id) => { toggleCompare(id); }}
            compareIds={compareIds}
            cols={cols}
          />
        )}

        {/* ════════════════ COMPARE TAB ════════════════ */}
        {tab === "compare" && (
          <CompareTab
            scored={scored}
            compareItems={compareItems}
            compareIds={compareIds}
            onToggle={toggleCompare}
            cols={cols}
          />
        )}

        {/* ════════════════ SPOTLIGHT TAB ════════════════ */}
        {tab === "spotlight" && <SpotlightTab featured={featured} cols={cols} gridClass={gridClass} openApp={openApp} />}

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted">
          Data as of {DATA_UPDATED}
        </p>
      </div>

      {/* Mobile-only sections bottom-sheet */}
      <MobileSheet
        open={isMobile && tocOpen}
        onClose={() => setTocOpen(false)}
        title="Sections"
      >
        <ul className="px-4 pb-6">
          {SECTIONS.map((s) => {
            const isActiveTab = tab === s.tab;
            const isAnchor = !!s.anchor;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleTocTap(s)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors active:bg-surface ${
                    isActiveTab && !isAnchor
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-app"
                  }`}
                >
                  <span className={`flex items-center gap-2 ${isAnchor ? "pl-3 text-secondary" : "font-medium"}`}>
                    {isAnchor && (
                      <span aria-hidden className="h-1 w-1 rounded-full bg-tool-accent/60" />
                    )}
                    {s.label}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-faint"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </MobileSheet>
    </div>
  );
}

/* ─────────────────────────────── tabs ──────────────────────────────────── */

function OverviewTab({
  featured,
  averages,
  cols,
  gridClass,
}: {
  featured: ScoredCommunity;
  averages: ReturnType<typeof computeAverages>;
  cols: number;
  gridClass: string;
}) {
  const history = useMemo(() => pricesHistory(featured), [featured]);
  const demo = useMemo(() => demographics(featured), [featured]);
  const pc = useMemo(() => prosCons(featured, featured.scores), [featured]);

  return (
    <div className="space-y-4">
      {/* HERO */}
      <div className="rounded-2xl border border-app bg-app-elevated overflow-hidden shadow-card">
        <div className={`tool-hero relative border-b border-app ${cols === 1 ? "px-4 py-5" : "px-5 py-6"}`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-medium mb-2">
                Featured · {featured.status}
              </div>
              <h1 className={`font-light tracking-tight leading-tight mb-2 ${cols === 1 ? "text-2xl" : "text-3xl"}`}>{featured.name}</h1>
              <div className="h-[2px] w-16 bg-tool-accent mb-3" />
              <p className="text-sm text-secondary leading-relaxed max-w-xl font-light">
                {featured.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted uppercase tracking-wider">
                <span>Developer · <span className="text-secondary normal-case tracking-normal">{featured.developer}</span></span>
                <span>Tenure · <span className="text-secondary normal-case tracking-normal">{featured.freeholdStatus}</span></span>
                <span>Types · <span className="text-secondary normal-case tracking-normal">{featured.propertyTypes.join(", ")}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-app bg-app-elevated px-4 py-3 shadow-card">
              <ScoreRing score={featured.scores.overall} size={cols === 1 ? 64 : 86} stroke={cols === 1 ? 6 : 7} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-1">Overall</div>
                <div className={`font-semibold tabular-nums leading-none ${cols === 1 ? "text-2xl" : "text-3xl"}`}>
                  {Math.round(featured.scores.overall * 10)}<span className="text-base text-muted">/100</span>
                </div>
                <div className="mt-0.5 text-[11px] text-secondary truncate">{getScoreLabel(featured.scores.overall)}</div>
                <div className="mt-1 text-[10px] text-muted truncate">vs Dubai avg {averages.overallScore.toFixed(1)}/10</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI ROW — radial dials for the headline metrics. Width-driven columns
       * so they never crowd each other and the row never overflows. */}
      <div data-section="metrics" className="rounded-2xl border border-app bg-app-elevated p-5 shadow-card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">Headline Metrics</h2>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted">vs Dubai-wide averages</span>
        </div>
        <div
          className="grid gap-3 place-items-center"
          style={{
            gridTemplateColumns:
              cols === 1
                ? "repeat(2, minmax(0, 1fr))"
                : cols === 2
                  ? "repeat(3, minmax(0, 1fr))"
                  : "repeat(6, minmax(0, 1fr))",
          }}
        >
          <RadialDial value={featured.scores.investment} label="Investment" />
          <RadialDial value={featured.scores.connectivity} label="Connectivity" />
          <RadialDial value={featured.scores.livability} label="Livability" />
          <RadialDial value={featured.scores.family} label="Family" />
          <RadialDial value={featured.scores.growth} label="Growth" />
          <RadialDial value={featured.scores.value} label="Value" />
        </div>
      </div>

      {/* PANELS — transit / school / walk */}
      <div className={`grid ${gridClass} gap-3`}>
        {/* Transit panel */}
        <div data-section="transit" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="3" width="16" height="16" rx="2" />
                <path d="M4 11h16M9 19l-2 2M15 19l2 2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold tracking-tight">Transit</h3>
            <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-muted">{featured.scores.connectivity.toFixed(1)}/10</span>
          </div>
          <div className="space-y-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Nearest Metro</div>
              <div className="text-sm text-app font-medium">{featured.connectivity.nearestMetro.name}</div>
              <div className="text-[11px] text-secondary">{featured.connectivity.nearestMetro.distanceKm} km away</div>
            </div>
            {featured.connectivity.upcomingMetro && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Upcoming Station</div>
                <div className="text-sm text-app">{featured.connectivity.upcomingMetro.name}</div>
                <div className="text-[11px] text-secondary">Est. {featured.connectivity.upcomingMetro.expectedYear}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-app">
              <CommuteRow label="DIFC" minutes={featured.connectivity.commuteMinutes.difc} />
              <CommuteRow label="Business Bay" minutes={featured.connectivity.commuteMinutes.businessBay} />
              <CommuteRow label="Marina" minutes={featured.connectivity.commuteMinutes.marina} />
              <CommuteRow label="Airport" minutes={featured.connectivity.commuteMinutes.airport} />
            </div>
          </div>
        </div>

        {/* Schools panel */}
        <div data-section="schools" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold tracking-tight">Schools &amp; Family</h3>
            <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-muted">{featured.scores.family.toFixed(1)}/10</span>
          </div>
          <div className="space-y-2">
            {featured.familyFriendliness.schools.length === 0 && (
              <div className="text-xs text-muted italic">No schools registered within commute range.</div>
            )}
            {featured.familyFriendliness.schools.slice(0, 4).map((s) => (
              <div key={s.name} className="flex items-start gap-2 rounded-lg border border-app bg-app p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-app truncate">{s.name}</div>
                  <div className="text-[10px] text-muted">{s.curriculum} · {s.distanceKm} km</div>
                </div>
                <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-tool-accent shrink-0">
                  {s.rating}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-app">
              <Stat label="Schools" value={String(featured.familyFriendliness.schools.length)} />
              <Stat label="Nurseries" value={String(featured.familyFriendliness.nearbyNurseries)} />
              <Stat label="Play Areas" value={String(featured.familyFriendliness.playAreas)} />
            </div>
          </div>
        </div>

        {/* Walk score panel */}
        <div data-section="walk" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="4" r="2" />
                <path d="M14 7l-3 3-3-2-3 5 3 4 1 4M14 7l4 3-2 4 2 5" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold tracking-tight">Walk Score</h3>
            <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-muted">{featured.connectivity.walkabilityScore}/10</span>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={featured.connectivity.walkabilityScore} size={84} stroke={7} />
            <div className="flex-1 text-xs text-secondary leading-relaxed">
              <div className="text-app font-medium mb-1">
                {featured.connectivity.walkabilityScore >= 8
                  ? "Walker's Paradise"
                  : featured.connectivity.walkabilityScore >= 6
                  ? "Very Walkable"
                  : featured.connectivity.walkabilityScore >= 4
                  ? "Somewhat Walkable"
                  : "Car-Dependent"}
              </div>
              {featured.connectivity.walkabilityScore >= 6
                ? "Most errands and amenities are reachable on foot. Daily life works without a car."
                : "Most errands need driving. Comfortable for car owners; harder without."}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Beach" value={`${featured.livability.beachDistanceKm} km`} />
            <Stat label="Noise" value={featured.livability.noiseLevel} />
            <Stat label="Pets" value={featured.livability.petFriendly ? "Welcome" : "Limited"} />
            <Stat label="Vibe" value={featured.livability.communityFeel} />
          </div>
        </div>
      </div>

      {/* PRICE TREND + AMENITIES + DEMOGRAPHICS */}
      <div className={`grid ${gridClass} gap-3`}>
        {/* 5-year trend */}
        <div data-section="trend" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold tracking-tight">5-Year Price Trend</h3>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">AED / sqft</span>
          </div>
          <Sparkline values={history} width={240} height={56} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Range" value={`${formatPrice(featured.pricing.priceRangeAed[0])}–${formatPrice(featured.pricing.priceRangeAed[1])}`} />
            <Stat label="YoY" value={`${featured.pricing.priceChangeYoY.min}–${featured.pricing.priceChangeYoY.max}%`} />
            <Stat label="3y Cap" value={`${featured.investment.capitalAppreciation3y.min}–${featured.investment.capitalAppreciation3y.max}%`} />
          </div>
        </div>

        {/* Amenities counts */}
        <div data-section="amenities" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Nearby Amenities</h3>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">within walking</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <AmenityCount icon="cafe" label="Supermarkets" count={featured.livability.nearbySupermarkets.length} />
            <AmenityCount icon="school" label="Schools" count={featured.familyFriendliness.schools.length} />
            <AmenityCount icon="clinic" label="Hospitals" count={featured.livability.nearbyHospitals.length} />
            <AmenityCount icon="park" label="Parks" count={featured.livability.nearbyParks.length} />
            <AmenityCount icon="mall" label="Malls" count={featured.livability.nearbyMalls.length} />
            <AmenityCount icon="play" label="Play Areas" count={featured.familyFriendliness.playAreas} />
          </div>
        </div>

        {/* Demographics */}
        <div data-section="demo" className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Demographic Mix</h3>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">est. resident profile</span>
          </div>
          <StackedDemo d={demo} />
          <div className="mt-3 text-[11px] text-secondary leading-relaxed">
            {featured.familyFriendliness.playAreas >= 3
              ? "Skews family-heavy with strong school anchoring."
              : featured.tags.includes("nightlife")
              ? "Younger, social mix — more singles and couples."
              : "Balanced across life stages."}
          </div>
        </div>
      </div>

      {/* PROS / CONS */}
      <div className={`grid ${cols === 1 ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
        <div className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">What&rsquo;s Great</h3>
          </div>
          <ul className="space-y-2">
            {pc.pros.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-tool-accent shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-app bg-app-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-muted font-semibold">Watch For</h3>
          </div>
          {pc.cons.length === 0 ? (
            <div className="text-xs text-muted italic">No major concerns flagged from the data.</div>
          ) : (
            <ul className="space-y-2">
              {pc.cons.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoresTab({
  featured,
  averages,
}: {
  featured: ScoredCommunity;
  averages: ReturnType<typeof computeAverages>;
}) {
  const avgScores: Record<keyof CommunityScores, number> = {
    overall: averages.overallScore,
    investment: averages.investmentScore,
    livability: averages.livabilityScore,
    connectivity: averages.connectivityScore,
    family: averages.familyScore,
    value: averages.valueScore,
    growth: averages.growthScore,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-app bg-app-elevated p-5 shadow-card">
        <div className="mb-4 flex items-baseline justify-between border-b border-app pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-1 font-semibold">Score Breakdown</div>
            <h2 className="text-xl tracking-tight font-semibold">{featured.name}</h2>
          </div>
          <ScoreRing score={featured.scores.overall} size={64} stroke={6} />
        </div>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          }}
        >
          {CATEGORY_LABELS.map((cat, i) => {
            const score = featured.scores[cat.key];
            const avg = avgScores[cat.key];
            const delta = score - avg;
            return (
              <div key={cat.key} className="rounded-xl border border-app bg-app p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-tool-accent-soft text-tool-accent text-xs font-semibold tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="text-sm font-medium">{cat.label}</h3>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-tool-accent">{score.toFixed(1)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-tool-accent-soft overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-tool-accent transition-all duration-700" style={{ width: `${score * 10}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">{getScoreLabel(score)}</span>
                  <span className={delta >= 0 ? "text-tool-accent" : "text-muted"}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(1)} vs avg
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted leading-relaxed">{cat.narrative}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DirectoryTab({
  filtered,
  search,
  setSearch,
  budget,
  setBudget,
  propertyType,
  setPropertyType,
  sort,
  setSort,
  selectClasses,
  onPick,
  onAddCompare,
  compareIds,
  cols,
}: {
  filtered: ScoredCommunity[];
  search: string;
  setSearch: (v: string) => void;
  budget: string;
  setBudget: (v: string) => void;
  propertyType: string;
  setPropertyType: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  selectClasses: string;
  onPick: (id: string) => void;
  onAddCompare: (id: string) => void;
  compareIds: string[];
  cols: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search neighborhood, developer, vibe…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-app bg-app-elevated pl-9 pr-3 py-3 text-base text-app placeholder:text-faint outline-none transition-colors focus:border-app-focus"
          />
        </div>
        <select value={budget} onChange={(e) => setBudget(e.target.value)} className={selectClasses}>
          {BUDGET_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>)}
        </select>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={selectClasses}>
          {PROPERTY_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClasses}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-app-elevated">{o.label}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filtered.map((c) => {
          const inCompare = compareIds.includes(c.id);
          return (
            <div key={c.id} className={`group rounded-xl border transition-colors p-3.5 ${inCompare ? "border-app-strong bg-tool-accent-soft" : "border-app bg-app-elevated hover:border-app-strong"}`}>
              <div className="flex items-start gap-3">
                <ScoreRing score={c.scores.overall} size={56} stroke={5} showLabel={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <button onClick={() => onPick(c.id)} className="text-left">
                      <h3 className="text-sm font-semibold group-hover:text-tool-accent transition-colors">{c.name}</h3>
                    </button>
                    <span className="rounded-full bg-app border border-app px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-secondary">
                      {c.status}
                    </span>
                    {inCompare && (
                      <span className="rounded-full bg-tool-accent-soft border border-app-strong px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-tool-accent">
                        Comparing
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted truncate font-light">{c.developer} · {c.description.slice(0, 90)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {CATEGORY_LABELS.map(({ key, initial }) => {
                      const score = c.scores[key];
                      return (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-tool-accent font-semibold w-2.5">{initial}</span>
                          <div className="w-[44px] h-1 rounded-full bg-tool-accent-soft overflow-hidden">
                            <div className="h-full rounded-full bg-tool-accent" style={{ width: `${score * 10}%` }} />
                          </div>
                          <span className="text-[10px] tabular-nums text-secondary">{score.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                    <span>AED {c.pricing.pricePerSqft.min.toLocaleString()}–{c.pricing.pricePerSqft.max.toLocaleString()}/sqft</span>
                    <span>Yield {c.investment.rentalYieldPct.min}–{c.investment.rentalYieldPct.max}%</span>
                    <span>{c.connectivity.nearestMetro.name}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button onClick={() => onPick(c.id)} className="rounded-full border border-app bg-tool-accent-soft px-2.5 py-1 text-[11px] font-medium text-tool-accent hover:border-app-strong transition-colors">
                    Open
                  </button>
                  <button
                    onClick={() => onAddCompare(c.id)}
                    className="rounded-full border border-app bg-app px-2.5 py-1 text-[11px] text-secondary hover:text-app hover:border-app-strong transition-colors"
                  >
                    {inCompare ? "Remove" : "+ Compare"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center rounded-2xl border border-app bg-app-elevated py-10 text-secondary text-sm">
            No neighborhoods match.
            <button onClick={() => { setSearch(""); setBudget("all"); setPropertyType("all"); }} className="block mx-auto mt-3 text-tool-accent text-xs hover:opacity-80 transition-opacity">
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompareTab({
  scored,
  compareItems,
  compareIds,
  onToggle,
  cols,
}: {
  scored: ScoredCommunity[];
  compareItems: ScoredCommunity[];
  compareIds: string[];
  onToggle: (id: string) => void;
  cols: number;
}) {
  const colored = compareItems.map((c, i) => ({ ...c, color: COMPARE_COLORS[i] ?? COMPARE_COLORS[0] }));

  return (
    <div className="space-y-4">
      {/* Selector chips + add menu */}
      <div className="rounded-2xl border border-app bg-app-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">Comparing {compareItems.length} of {MAX_COMPARE}</h3>
          <span className="ml-auto text-[10px] text-muted">Add up to 4 to overlay scores</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {colored.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-app border border-app-strong px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
              <button onClick={() => onToggle(c.id)} className="ml-0.5 text-muted hover:text-app">✕</button>
            </span>
          ))}
          {compareItems.length < MAX_COMPARE && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onToggle(e.target.value); }}
              className="rounded-full border border-app bg-app px-3 py-1 text-xs text-secondary cursor-pointer outline-none"
            >
              <option value="">+ Add neighborhood</option>
              {scored.filter((c) => !compareIds.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id} className="bg-app-elevated">{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {compareItems.length < 2 ? (
        <div className="rounded-2xl border border-app bg-app-elevated py-10 text-center text-sm text-secondary">
          Pick at least 2 neighborhoods to compare.
        </div>
      ) : (
        <>
          {/* Radar overlay + score bars */}
          <div className={`grid ${cols >= 2 ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
            <div className="rounded-2xl border border-app bg-app-elevated p-5 flex flex-col items-center">
              <h3 className="self-start text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-3 font-semibold">Score Overlay</h3>
              <CompareRadar items={colored.map((c) => ({ scores: c.scores, color: c.color, name: c.name }))} size={Math.min(280, cols >= 2 ? 280 : 220)} />
            </div>
            <div className="rounded-2xl border border-app bg-app-elevated p-5">
              <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-3 font-semibold">Category Bars</h3>
              <div className="space-y-3">
                {CATEGORY_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <div className="text-[11px] text-muted mb-1">{label}</div>
                    {colored.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 mb-1">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <div className="flex-1 h-1.5 rounded-full bg-app overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c.scores[key] * 10}%`, backgroundColor: c.color }} />
                        </div>
                        <span className="text-[10px] tabular-nums w-8 text-right text-secondary">{c.scores[key].toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side-by-side stats table */}
          <div className="rounded-2xl border border-app bg-app-elevated p-5 overflow-x-auto">
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent mb-4 font-semibold">Side-by-Side</h3>
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted border-b border-app">
                  <th className="pb-2 pr-3 font-medium">Metric</th>
                  {colored.map((c) => (
                    <th key={c.id} className="pb-2 pr-3 font-medium" style={{ color: c.color }}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-secondary">
                <CompareRow label="Overall Score" cells={colored.map((c) => `${c.scores.overall.toFixed(1)} / 10`)} accent />
                <CompareRow label="Status" cells={colored.map((c) => c.status)} />
                <CompareRow label="Developer" cells={colored.map((c) => c.developer)} />
                <CompareRow label="Price/sqft (AED)" cells={colored.map((c) => `${c.pricing.pricePerSqft.min.toLocaleString()}–${c.pricing.pricePerSqft.max.toLocaleString()}`)} />
                <CompareRow label="Range (AED)" cells={colored.map((c) => `${formatPrice(c.pricing.priceRangeAed[0])}–${formatPrice(c.pricing.priceRangeAed[1])}`)} />
                <CompareRow label="Yield" cells={colored.map((c) => `${c.investment.rentalYieldPct.min}–${c.investment.rentalYieldPct.max}%`)} />
                <CompareRow label="3y Cap App." cells={colored.map((c) => `${c.investment.capitalAppreciation3y.min}–${c.investment.capitalAppreciation3y.max}%`)} />
                <CompareRow label="YoY Change" cells={colored.map((c) => `${c.pricing.priceChangeYoY.min}–${c.pricing.priceChangeYoY.max}%`)} />
                <CompareRow label="Service Charge" cells={colored.map((c) => `AED ${c.pricing.serviceChargePerSqft.min}–${c.pricing.serviceChargePerSqft.max}/sqft`)} />
                <CompareRow label="Demand" cells={colored.map((c) => c.investment.demandLevel)} />
                <CompareRow label="Nearest Metro" cells={colored.map((c) => `${c.connectivity.nearestMetro.name} (${c.connectivity.nearestMetro.distanceKm}km)`)} />
                <CompareRow label="Walkability" cells={colored.map((c) => `${c.connectivity.walkabilityScore}/10`)} />
                <CompareRow label="DIFC Commute" cells={colored.map((c) => `${c.connectivity.commuteMinutes.difc}m`)} />
                <CompareRow label="Beach Distance" cells={colored.map((c) => `${c.livability.beachDistanceKm}km`)} />
                <CompareRow label="Schools" cells={colored.map((c) => String(c.familyFriendliness.schools.length))} />
                <CompareRow label="Play Areas" cells={colored.map((c) => String(c.familyFriendliness.playAreas))} />
                <CompareRow label="Noise" cells={colored.map((c) => c.livability.noiseLevel)} />
                <CompareRow label="Pet Friendly" cells={colored.map((c) => (c.livability.petFriendly ? "Yes" : "No"))} />
                <CompareRow label="2040 Impact" cells={colored.map((c) => c.futureGrowth.dubai2040Impact)} />
                <CompareRow label="Pipeline" cells={colored.map((c) => `${c.futureGrowth.upcomingProjects.length} projects`)} />
              </tbody>
            </table>
          </div>

          {/* Pros / cons grid — width-based collapse */}
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns:
                cols === 1
                  ? "minmax(0, 1fr)"
                  : cols === 2
                    ? "repeat(2, minmax(0, 1fr))"
                    : `repeat(${Math.min(colored.length, 3)}, minmax(0, 1fr))`,
            }}
          >
            {colored.map((c) => {
              const pc = prosCons(c, c.scores);
              return (
                <div key={c.id} className="rounded-2xl border border-app bg-app-elevated p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <h4 className="text-sm font-semibold truncate">{c.name}</h4>
                    <ScoreRing score={c.scores.overall} size={36} stroke={4} showLabel={false} />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.16em] text-tool-accent font-medium mb-1">Pros</div>
                      <ul className="space-y-1">
                        {pc.pros.slice(0, 3).map((p, i) => (
                          <li key={i} className="text-[11px] text-secondary leading-snug pl-2 border-l border-tool-accent">{p}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.16em] text-muted font-medium mb-1">Watch</div>
                      <ul className="space-y-1">
                        {pc.cons.slice(0, 3).map((p, i) => (
                          <li key={i} className="text-[11px] text-muted leading-snug pl-2 border-l border-app">{p}</li>
                        ))}
                        {pc.cons.length === 0 && <li className="text-[11px] text-muted italic">None flagged.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SpotlightTab({
  featured,
  cols,
  gridClass,
  openApp,
}: {
  featured: ScoredCommunity;
  cols: number;
  gridClass: string;
  openApp: (slug: string, params?: Record<string, unknown>) => void;
}) {
  const strengths = useMemo(
    () => CATEGORY_LABELS.map((c) => ({ ...c, score: featured.scores[c.key] })).sort((a, b) => b.score - a.score),
    [featured]
  );
  const great = strengths.slice(0, 2);
  const tricky = strengths.slice(-2).reverse();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-app bg-app-elevated overflow-hidden shadow-card">
        <div className={`tool-hero relative border-b border-app ${cols === 1 ? "px-4 py-6" : cols === 2 ? "px-6 py-8" : "px-8 py-9"}`}>
          <div className={`flex gap-4 ${cols >= 3 ? "flex-row items-end justify-between" : "flex-col"}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-tool-accent mb-2 font-medium">
                Spotlight · {featured.status}
              </div>
              <h1 className={`font-light tracking-tight leading-[0.95] mb-3 ${cols === 1 ? "text-2xl" : cols === 2 ? "text-3xl" : "text-4xl"}`}>{featured.name}</h1>
              <div className="h-[2px] w-20 bg-tool-accent mb-3" />
              <p className="text-sm text-secondary leading-relaxed max-w-xl font-light">{featured.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] uppercase tracking-wider text-muted">
                <span>Developer · <span className="text-secondary normal-case tracking-normal">{featured.developer}</span></span>
                <span>Type · <span className="text-secondary normal-case tracking-normal">{featured.freeholdStatus}</span></span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {featured.tags.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-secondary">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-app bg-app-elevated px-4 py-3 shadow-card self-start">
              <ScoreRing score={featured.scores.overall} size={cols === 1 ? 64 : 86} stroke={cols === 1 ? 6 : 7} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-tool-accent mb-1">Overall</div>
                <div className={`font-semibold tabular-nums leading-none ${cols === 1 ? "text-2xl" : "text-3xl"}`}>
                  {Math.round(featured.scores.overall * 10)}<span className="text-base text-muted">/100</span>
                </div>
                <div className="mt-0.5 text-[11px] text-secondary truncate">{getScoreLabel(featured.scores.overall)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Six dimension grid */}
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold">The Six Dimensions</h2>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Score / 10</span>
          </div>
          <div className={`grid ${gridClass} gap-3`}>
            {CATEGORY_LABELS.map((cat, i) => {
              const score = featured.scores[cat.key];
              return (
                <div key={cat.key} className="rounded-xl border border-app bg-app p-4 hover:border-app-strong transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-tool-accent-soft text-tool-accent text-[10px] font-semibold tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <h3 className="text-sm font-semibold">{cat.label}</h3>
                    </div>
                    <ScoreRing score={score} size={42} stroke={4} showLabel={false} />
                  </div>
                  <p className="text-[12px] text-secondary leading-relaxed font-light">{cat.narrative}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`grid ${cols === 1 ? "grid-cols-1" : "grid-cols-2"} gap-px bg-app border-t border-app`}>
          <div className="bg-app-elevated p-5">
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold mb-2">What&rsquo;s Great</h3>
            <ul className="space-y-2">
              {great.map((g) => (
                <li key={g.key} className="flex items-start gap-2 text-sm text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-tool-accent shrink-0" />
                  <span><span className="font-medium text-app">Strong {g.label.toLowerCase()}</span> — scoring {g.score.toFixed(1)}/10.</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-app-elevated p-5">
            <h3 className="text-[10px] uppercase tracking-[0.24em] text-muted font-semibold mb-2">What&rsquo;s Tricky</h3>
            <ul className="space-y-2">
              {tricky.map((t) => (
                <li key={t.key} className="flex items-start gap-2 text-sm text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted shrink-0" />
                  <span><span className="font-medium text-app">Watch {t.label.toLowerCase()}</span> — {t.score.toFixed(1)}/10, weigh carefully.</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Cross-tool jumps */}
      <div className="rounded-2xl border border-app bg-app-elevated p-5">
        <h3 className="text-[10px] uppercase tracking-[0.24em] text-tool-accent font-semibold mb-3">Run This Through Other Tools</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openApp("yield-heatmap", { area: featured.name })} className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors">
            View on Yield Heatmap
          </button>
          <button onClick={() => openApp("rent-vs-buy", { area: featured.name })} className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors">
            Rent vs Buy here
          </button>
          <button onClick={() => openApp("service-charge-comparison", { area: featured.name })} className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors">
            Service Charges
          </button>
          <button onClick={() => openApp("tenant-screening", { area: featured.name })} className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors">
            Tenant Demand
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── small bits ────────────────────────────── */

function CommuteRow({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="text-sm tabular-nums text-app">{minutes}<span className="text-[10px] text-muted ml-0.5">min</span></div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app p-2 text-center">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted mb-0.5">{label}</div>
      <div className="text-xs font-medium text-app capitalize truncate" title={value}>{value}</div>
    </div>
  );
}

function AmenityCount({ icon, label, count }: { icon: "cafe" | "school" | "clinic" | "park" | "mall" | "play"; label: string; count: number }) {
  const path: Record<typeof icon, string> = {
    cafe: "M3 8h13a4 4 0 0 1 0 8H3zM3 21h13M16 8V3",
    school: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
    clinic: "M12 2v20M2 12h20",
    park: "M12 22V8M5 14l7-12 7 12zM12 18l-3-3M12 18l3-3",
    mall: "M3 9h18l-2 12H5L3 9zM7 9V5a5 5 0 0 1 10 0v4",
    play: "M5 21V8a7 7 0 0 1 14 0v13M5 13h14",
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-app bg-app p-2.5">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent shrink-0">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={path[icon]} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
        <div className="text-sm font-medium text-app tabular-nums">{count}</div>
      </div>
    </div>
  );
}

function CompareRow({ label, cells, accent = false }: { label: string; cells: string[]; accent?: boolean }) {
  return (
    <tr className="border-b border-app last:border-b-0">
      <td className="py-2 pr-3 text-muted text-[11px]">{label}</td>
      {cells.map((v, i) => (
        <td key={i} className={`py-2 pr-3 capitalize ${accent ? "font-semibold tabular-nums text-tool-accent" : ""}`}>{v}</td>
      ))}
    </tr>
  );
}
