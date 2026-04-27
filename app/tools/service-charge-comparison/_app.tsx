"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Service Charge Comparison — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Mirror of app/tools/service-charge-comparison/page.tsx with the chrome
   stripped:
     - no <AuthGate> (workspace shell handles auth)
     - no frame=1 logic (we always render in-window)
     - no PageHeader / "All Tools" back-link / macOS chrome
     - no <ToolRecommendations> (dock provides discovery)

   Service-charge data + comparison math (avgCharge, areaAvg map, global max,
   stats reducer, sort/filter pipeline, per-card breakdown weights) preserved
   verbatim from page.tsx.

   Width-driven layout — no sm:/md:/lg: prefixes. Building grid swaps between
   1/2/3 columns based on the live `width` prop. Stat tiles, picker rows and
   filters all key off width breakpoints. Canvas tones for the donut still
   read directly from the live DOM theme tokens, so dark/light/theme swap
   "just work" without a `resolved` branch.

   data-tool-theme="research" + data-tool="service-charge-comparison" scope
   the amber accent and tool-level styling.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  serviceChargeData,
  DATA_UPDATED,
  type ServiceChargeEntry,
} from "@/lib/service-charge-data";
import type { NativeAppProps } from "../_data/tools-list";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type SortOption = "lowest" | "highest" | "az" | "area";
type PropertyFilter = "all" | "apartment" | "villa" | "townhouse";
type SubTab = "all" | "best" | "worst";

const PROPERTY_OPTIONS: { label: string; value: PropertyFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Apartment", value: "apartment" },
  { label: "Villa", value: "villa" },
  { label: "Townhouse", value: "townhouse" },
];

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Low → High", value: "lowest" },
  { label: "High → Low", value: "highest" },
  { label: "By Area", value: "area" },
  { label: "By Building", value: "az" },
];

const SUB_TABS: { value: SubTab; label: string }[] = [
  { value: "all", label: "All Buildings" },
  { value: "best", label: "Best Value" },
  { value: "worst", label: "Highest Charges" },
];

// Breakdown categories used to compose the donut. Real Dubai service charge
// stacks roughly split this way — chiller carve-out shifts dynamically.
const BREAKDOWN_CATEGORIES = [
  { key: "common", label: "Common Area", weight: 0.32 },
  { key: "security", label: "Security", weight: 0.18 },
  { key: "cleaning", label: "Cleaning", weight: 0.14 },
  { key: "amenities", label: "Pool / Gym", weight: 0.12 },
  { key: "admin", label: "Master Comm.", weight: 0.1 },
  { key: "chiller", label: "Chiller", weight: 0.14 },
] as const;

// ---------------------------------------------------------------------------
// Helpers (unchanged from page.tsx)
// ---------------------------------------------------------------------------

function avgCharge(e: ServiceChargeEntry) {
  return (e.serviceChargePerSqft.min + e.serviceChargePerSqft.max) / 2;
}

function formatAED(n: number | null) {
  if (n === null) return "—";
  return `AED ${n.toLocaleString()}`;
}

function trendIcon(t: ServiceChargeEntry["trend"]) {
  if (t === "increasing") return "↑";
  if (t === "decreasing") return "↓";
  return "→";
}

function trendTone(t: ServiceChargeEntry["trend"]) {
  if (t === "increasing") return "text-rose-400";
  if (t === "decreasing") return "text-emerald-400";
  return "text-muted";
}

function ratingDots(r: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`inline-block h-2 w-2 rounded-full ${
        i < r ? "bg-tool-accent" : "bg-app-elevated border border-app"
      }`}
    />
  ));
}

function displayName(e: ServiceChargeEntry) {
  return e.building ? `${e.community} — ${e.building}` : e.community;
}

function initials(e: ServiceChargeEntry) {
  const src = e.building || e.community;
  return src
    .split(/[\s\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function categoryBreakdown(entry: ServiceChargeEntry) {
  // Skip chiller slice when chiller is included, redistribute its weight.
  const slices = BREAKDOWN_CATEGORIES.filter(
    (c) => c.key !== "chiller" || !entry.includesChiller
  );
  const total = slices.reduce((s, c) => s + c.weight, 0);
  return slices.map((c) => ({
    key: c.key,
    label: c.label,
    pct: c.weight / total,
  }));
}

// ---------------------------------------------------------------------------
// Tower Icon
// ---------------------------------------------------------------------------

function TowerIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" />
      <path d="M3 21h18" />
      <path d="M9 8h.01M9 12h.01M9 16h.01M15 8h.01M15 12h.01M15 16h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Charge bar — building vs area average
// ---------------------------------------------------------------------------

function ChargeBar({
  value,
  areaAvg,
  max,
}: {
  value: number;
  areaAvg: number;
  max: number;
}) {
  const valuePct = Math.min(100, (value / max) * 100);
  const avgPct = Math.min(100, (areaAvg / max) * 100);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-app bg-app">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${valuePct}%` }}
        transition={{ duration: 0.6, ease }}
        className="absolute inset-y-0 left-0 rounded-full bg-tool-accent"
      />
      <span
        className="pointer-events-none absolute inset-y-0 w-px bg-app-elevated"
        style={{ left: `${avgPct}%`, boxShadow: "0 0 0 1px var(--border)" }}
        aria-hidden
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Breakdown Donut (canvas)
// ---------------------------------------------------------------------------

function BreakdownDonut({
  entry,
  size = 140,
}: {
  entry: ServiceChargeEntry;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slices = useMemo(() => categoryBreakdown(entry), [entry]);

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
    const radius = size / 2 - 6;
    const innerRadius = radius * 0.62;

    // Read theme tokens from the live DOM so light/dark + theme swap "just work".
    const root = canvas.closest("[data-tool-theme]") as HTMLElement | null;
    const styles = root ? getComputedStyle(root) : null;
    const accent =
      styles?.getPropertyValue("--tool-accent").trim() || "#f59e0b";
    const accentSoft =
      styles?.getPropertyValue("--tool-accent-soft").trim() ||
      "rgba(245,158,11,0.12)";
    const border = styles?.getPropertyValue("--border").trim() || "#222";

    let startAngle = -Math.PI / 2;
    slices.forEach((slice, idx) => {
      const sliceAngle = slice.pct * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(
        cx,
        cy,
        innerRadius,
        startAngle + sliceAngle,
        startAngle,
        true
      );
      ctx.closePath();
      ctx.fillStyle = idx % 2 === 0 ? accent : accentSoft;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
      startAngle += sliceAngle;
    });
  }, [slices, size]);

  return (
    <div className="flex items-center gap-4">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="shrink-0"
      />
      <ul className="grid grid-cols-1 gap-1 text-xs">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-secondary">
            <span
              className={`inline-block h-2 w-2 rounded-sm ${
                i % 2 === 0
                  ? "bg-tool-accent"
                  : "bg-tool-accent-soft border border-tool-accent/40"
              }`}
            />
            <span className="text-app">{s.label}</span>
            <span className="text-muted tabular-nums">
              {Math.round(s.pct * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded Detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ entry }: { entry: ServiceChargeEntry }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease }}
      className="overflow-hidden"
    >
      <div className="border-t border-app bg-app px-4 py-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,1.1fr)]">
          {/* Donut */}
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <p className="mb-3 text-[0.6rem] uppercase tracking-[0.25em] text-muted">
              Cost Breakdown
            </p>
            <BreakdownDonut entry={entry} />
          </div>

          {/* Facts */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-app bg-app-elevated p-4">
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                Annual Estimates
              </p>
              <div className="space-y-1 text-sm text-secondary">
                <p>
                  1 BR:{" "}
                  <span className="text-app">
                    {formatAED(entry.annualEstimate1BR)}
                  </span>
                </p>
                <p>
                  2 BR:{" "}
                  <span className="text-app">
                    {formatAED(entry.annualEstimate2BR)}
                  </span>
                </p>
                <p>
                  3 BR:{" "}
                  <span className="text-app">
                    {formatAED(entry.annualEstimate3BR)}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-app bg-app-elevated p-4">
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                Building
              </p>
              <div className="space-y-1 text-sm text-secondary">
                <p>
                  Developer:{" "}
                  <span className="text-app">{entry.developer}</span>
                </p>
                <p>
                  Managed by:{" "}
                  <span className="text-app">{entry.managedBy}</span>
                </p>
                <p>
                  Established:{" "}
                  <span className="text-app">{entry.yearEstablished}</span>
                </p>
                <p>
                  Type:{" "}
                  <span className="capitalize text-app">
                    {entry.propertyType}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-app bg-app-elevated p-4 sm:col-span-2">
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                Inclusions & Notes
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    entry.includesChiller
                      ? "border-tool-accent/40 bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app text-muted"
                  }`}
                >
                  Chiller {entry.includesChiller ? "Included" : "Excluded"}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    entry.includesGas
                      ? "border-tool-accent/40 bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app text-muted"
                  }`}
                >
                  Gas {entry.includesGas ? "Included" : "Excluded"}
                </span>
                {entry.masterCommunityCharge !== null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-2.5 py-1 text-secondary">
                    +AED {entry.masterCommunityCharge}/sqft Master
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-2.5 py-1 ${trendTone(entry.trend)}`}
                >
                  {trendIcon(entry.trend)} {entry.trendNote}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {ratingDots(entry.rating)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                {entry.notes}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Building Card
// ---------------------------------------------------------------------------

function BuildingCard({
  entry,
  expanded,
  onToggle,
  unitSize,
  areaAvg,
  globalMax,
}: {
  entry: ServiceChargeEntry;
  expanded: boolean;
  onToggle: () => void;
  unitSize: number;
  areaAvg: number;
  globalMax: number;
}) {
  const value = avgCharge(entry);
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-app-elevated transition-colors ${
        expanded
          ? "border-tool-accent/50 ring-1 ring-tool-accent/20"
          : "border-app hover:border-tool-accent/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-4 text-left"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-tool-accent/30 bg-tool-accent-soft text-tool-accent">
            <TowerIcon />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app">
                  {entry.building || entry.community}
                </p>
                <p className="truncate text-xs text-muted">
                  {entry.building ? entry.community : entry.developer}{" "}
                  <span className="text-faint">·</span>{" "}
                  <span className="capitalize">{entry.propertyType}</span>
                </p>
              </div>
              <span
                className={`shrink-0 text-xs ${trendTone(entry.trend)}`}
                aria-label={`Trend ${entry.trend}`}
              >
                {trendIcon(entry.trend)}
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-xs text-muted">
                <span className="font-semibold text-app tabular-nums">
                  {entry.serviceChargePerSqft.min}–
                  {entry.serviceChargePerSqft.max}
                </span>{" "}
                AED/sqft
              </span>
              {unitSize > 0 && (
                <span className="text-xs text-secondary tabular-nums">
                  ≈ AED{" "}
                  {Math.round(value * unitSize).toLocaleString()}/yr
                </span>
              )}
            </div>

            <div className="mt-2">
              <ChargeBar value={value} areaAvg={areaAvg} max={globalMax} />
              <div className="mt-1.5 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                <span className="text-tool-accent">{initials(entry)}</span>
                <span>area avg {areaAvg.toFixed(1)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {ratingDots(entry.rating)}
              {entry.includesChiller && (
                <span className="ml-auto rounded-full border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent">
                  Chiller
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && <ExpandedDetail entry={entry} />}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function ServiceChargeComparisonApp({
  width,
  initialParams,
  initialParamsKey,
  openApp,
}: NativeAppProps) {
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<PropertyFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("lowest");
  const [chillerOnly, setChillerOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unitSize, setUnitSize] = useState(900);
  const [activeTab, setActiveTab] = useState<SubTab>("all");

  // Honor `area` intent param from openApp(): preset the search box.
  useEffect(() => {
    const area = initialParams?.area;
    if (typeof area === "string" && area.length > 0) {
      setSearch(area);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const toggle = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    []
  );

  // Per-area average — used for the per-card baseline marker.
  const areaAvgMap = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    serviceChargeData.forEach((e) => {
      const cur = acc.get(e.community) || { sum: 0, n: 0 };
      cur.sum += avgCharge(e);
      cur.n += 1;
      acc.set(e.community, cur);
    });
    const out = new Map<string, number>();
    acc.forEach((v, k) => out.set(k, v.sum / v.n));
    return out;
  }, []);

  const globalMax = useMemo(
    () => Math.max(...serviceChargeData.map((e) => avgCharge(e))),
    []
  );

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...serviceChargeData];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.community.toLowerCase().includes(q) ||
          (e.building && e.building.toLowerCase().includes(q)) ||
          e.developer.toLowerCase().includes(q)
      );
    }

    if (propertyFilter !== "all") {
      list = list.filter((e) => e.propertyType === propertyFilter);
    }

    if (chillerOnly) {
      list = list.filter((e) => e.includesChiller);
    }

    if (activeTab === "best") {
      list = list
        .slice()
        .sort((a, b) => avgCharge(a) - avgCharge(b))
        .slice(0, 12);
    } else if (activeTab === "worst") {
      list = list
        .slice()
        .sort((a, b) => avgCharge(b) - avgCharge(a))
        .slice(0, 12);
    }

    if (sortBy === "lowest") {
      list.sort((a, b) => avgCharge(a) - avgCharge(b));
    } else if (sortBy === "highest") {
      list.sort((a, b) => avgCharge(b) - avgCharge(a));
    } else if (sortBy === "area") {
      list.sort(
        (a, b) =>
          a.community.localeCompare(b.community) ||
          (a.building || "").localeCompare(b.building || "")
      );
    } else {
      list.sort((a, b) =>
        (a.building || a.community).localeCompare(
          b.building || b.community
        )
      );
    }

    return list;
  }, [search, propertyFilter, sortBy, chillerOnly, activeTab]);

  // Summary stats
  const stats = useMemo(() => {
    if (filtered.length === 0)
      return {
        cheapest: null as ServiceChargeEntry | null,
        expensive: null as ServiceChargeEntry | null,
        avg: 0,
        median: 0,
      };

    const sorted = [...filtered].sort(
      (a, b) => avgCharge(a) - avgCharge(b)
    );
    const cheapest = sorted[0];
    const expensive = sorted[sorted.length - 1];
    const avg =
      sorted.reduce((sum, e) => sum + avgCharge(e), 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (avgCharge(sorted[mid - 1]) + avgCharge(sorted[mid])) / 2
        : avgCharge(sorted[mid]);

    return { cheapest, expensive, avg, median };
  }, [filtered]);

  /* ------------------------------------------------------------------ */
  /*  Width-driven layout switches (no sm:/md:/lg: prefixes)            */
  /* ------------------------------------------------------------------ */

  const isMobile = width < 700;
  const compact = width < 640 || isMobile;
  const veryCompact = width < 480;
  const padX = compact ? 16 : 24;

  // Building grid: 1/2/3 cols.
  const cardCols = width >= 980 ? 3 : width >= 640 ? 2 : 1;
  const cardGridStyle = {
    gridTemplateColumns: `repeat(${cardCols}, minmax(0, 1fr))`,
  };

  // Stat-tile grid: 1/2/4 cols.
  const statCols = width >= 900 ? 4 : width >= 560 ? 2 : 1;
  const statGridStyle = {
    gridTemplateColumns: `repeat(${statCols}, minmax(0, 1fr))`,
  };

  // Hero stat tiles: 3 across always, but stack hero block when narrow.
  const heroStackThreshold = 760;

  return (
    <div
      data-tool-theme="research"
      data-tool="service-charge-comparison"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      {/* Hero */}
      <div className="border-b border-app">
        <div
          className="mx-auto pt-8 pb-7"
          style={{
            maxWidth: 1280,
            paddingLeft: padX,
            paddingRight: padX,
          }}
        >
          <div
            className="flex gap-6"
            style={{
              flexDirection: width >= heroStackThreshold ? "row" : "column",
              alignItems:
                width >= heroStackThreshold ? "flex-end" : "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-tool-accent">
                  Service Charge Index
                </span>
              </div>
              <h1
                className="font-semibold tracking-tight text-app"
                style={{
                  fontSize: width >= 640 ? "2.25rem" : "1.75rem",
                }}
              >
                Service Charge Comparison
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                Stack any Dubai building against the area average. The
                difference between a 12 AED/sqft tower and an 18 AED/sqft one
                is your second mortgage.
              </p>
            </div>

            {/* Headline stat tiles */}
            <div
              className="grid w-full gap-2"
              style={{
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                maxWidth: width >= heroStackThreshold ? 380 : "none",
              }}
            >
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="text-[0.6rem] uppercase tracking-wider text-muted">
                  Tracked
                </div>
                <div className="mt-0.5 text-2xl font-bold tabular-nums text-app">
                  {serviceChargeData.length}
                </div>
                <div className="mt-0.5 text-[0.65rem] text-muted">
                  buildings
                </div>
              </div>
              <div className="rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-3">
                <div className="text-[0.6rem] uppercase tracking-wider text-tool-accent">
                  Average
                </div>
                <div className="mt-0.5 text-2xl font-bold tabular-nums text-tool-accent">
                  {stats.avg.toFixed(1)}
                </div>
                <div className="mt-0.5 text-[0.65rem] text-secondary">
                  AED / sqft
                </div>
              </div>
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="text-[0.6rem] uppercase tracking-wider text-muted">
                  Range
                </div>
                <div className="mt-0.5 text-2xl font-bold tabular-nums text-app">
                  {Math.min(
                    ...serviceChargeData.map(
                      (e) => e.serviceChargePerSqft.min
                    )
                  )}
                  –
                  {Math.max(
                    ...serviceChargeData.map(
                      (e) => e.serviceChargePerSqft.max
                    )
                  )}
                </div>
                <div className="mt-0.5 text-[0.65rem] text-muted">
                  lo / hi
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <main
        className="mx-auto pt-7 pb-12"
        style={{
          maxWidth: 1280,
          paddingLeft: padX,
          paddingRight: padX,
        }}
      >
        {/* Sub-view tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-xl border border-app bg-app-elevated p-1">
            {SUB_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setActiveTab(t.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === t.value
                    ? "bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/40"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[0.65rem] font-semibold uppercase tracking-[0.2em] tabular-nums text-tool-accent">
            {filtered.length} matches
          </span>
        </div>

        {/* Filters bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-5 rounded-2xl border border-app bg-app-elevated"
          style={{ padding: compact ? 16 : 20 }}
        >
          <div
            className="flex gap-4"
            style={{
              flexDirection: veryCompact ? "column" : "row",
              flexWrap: "wrap",
              alignItems: veryCompact ? "stretch" : "flex-end",
            }}
          >
            <div className="flex-1" style={{ minWidth: 220 }}>
              <label className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Search
              </label>
              <input
                type="text"
                placeholder="Community, building, or developer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 focus:ring-tool-accent"
              />
            </div>

            <div style={{ width: veryCompact ? "100%" : 176 }}>
              <label className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Property Type
              </label>
              <select
                value={propertyFilter}
                onChange={(e) =>
                  setPropertyFilter(e.target.value as PropertyFilter)
                }
                className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-all focus:ring-2 focus:ring-tool-accent"
              >
                {PROPERTY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: veryCompact ? "100%" : 160 }}>
              <label className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
                Your Unit (sqft)
              </label>
              <input
                type="number"
                placeholder="e.g. 900"
                value={unitSize || ""}
                onChange={(e) => setUnitSize(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 focus:ring-tool-accent"
              />
            </div>

            <div className="flex items-center gap-2 self-end pb-1">
              <button
                type="button"
                onClick={() => setChillerOnly(!chillerOnly)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  chillerOnly
                    ? "bg-tool-accent"
                    : "bg-app border border-app"
                }`}
                aria-pressed={chillerOnly}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-app-elevated shadow transition-transform ${
                    chillerOnly ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-secondary">
                Chiller Included
              </span>
            </div>
          </div>

          {/* Sort selector — pill row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-app pt-4">
            <span className="mr-2 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
              Sort
            </span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSortBy(o.value)}
                className={`rounded-full border px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] transition-all ${
                  sortBy === o.value
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-app"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Summary stat tiles */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease }}
          className="mb-5 grid gap-3"
          style={statGridStyle}
        >
          {stats.cheapest && (
            <div className="rounded-xl border border-app bg-app-elevated p-4">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-emerald-400">
                Cheapest
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-app">
                {displayName(stats.cheapest)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                AED {avgCharge(stats.cheapest).toFixed(1)}/sqft
              </p>
            </div>
          )}
          {stats.expensive && (
            <div className="rounded-xl border border-app bg-app-elevated p-4">
              <p className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-rose-400">
                Most Expensive
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-app">
                {displayName(stats.expensive)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                AED {avgCharge(stats.expensive).toFixed(1)}/sqft
              </p>
            </div>
          )}
          <div className="rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-tool-accent">
              Average
            </p>
            <p className="mt-1 text-sm font-semibold text-app tabular-nums">
              AED {stats.avg.toFixed(1)}/sqft
            </p>
            <p className="text-xs text-secondary">
              Across {filtered.length} entries
            </p>
          </div>
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
              Median
            </p>
            <p className="mt-1 text-sm font-semibold text-app tabular-nums">
              AED {stats.median.toFixed(1)}/sqft
            </p>
            <p className="text-xs text-muted">
              Middle of {filtered.length} entries
            </p>
          </div>
        </motion.div>

        {/* Estimated annual cost callout */}
        {unitSize > 0 && stats.cheapest && stats.expensive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease }}
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tool-accent/30 bg-tool-accent-soft px-4 py-4"
          >
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                Your annual range ({unitSize.toLocaleString()} sqft)
              </p>
              <p className="mt-1 text-lg font-semibold text-app tabular-nums">
                AED{" "}
                {Math.round(
                  avgCharge(stats.cheapest) * unitSize
                ).toLocaleString()}{" "}
                – AED{" "}
                {Math.round(
                  avgCharge(stats.expensive) * unitSize
                ).toLocaleString()}
              </p>
            </div>
            <p className="max-w-xs text-xs text-secondary">
              Cheapest to most expensive in your filter set. Multiply by your
              ownership horizon — that&apos;s your real recurring cost.
            </p>
          </motion.div>
        )}

        {/* Building cards grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="mb-8"
        >
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-app bg-app-elevated p-12 text-center text-muted">
              No buildings match your filters.
            </div>
          ) : (
            <div className="grid gap-3" style={cardGridStyle}>
              {filtered.map((entry) => (
                <BuildingCard
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => toggle(entry.id)}
                  unitSize={unitSize}
                  areaAvg={areaAvgMap.get(entry.community) ?? stats.avg}
                  globalMax={globalMax}
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Cross-tool jumps — replaces ToolRecommendations + Link CTAs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openApp("neighborhood-report")}
            className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors"
          >
            Full community report → Neighborhood Report
          </button>
          <button
            type="button"
            onClick={() => openApp("affordability")}
            className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors"
          >
            Full acquisition cost → What Can I Afford?
          </button>
        </div>

        <p className="text-center text-[0.65rem] uppercase tracking-[0.2em] text-faint">
          Data updated {DATA_UPDATED} · Verify with RERA & your management
          company.
        </p>
      </main>
    </div>
  );
}
