"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ToolRecommendations from "@/components/ToolRecommendations";
import dynamic from "next/dynamic";
import PageHeader from "@/components/layout/PageHeader";
import AuthGate from "@/components/AuthGate";
import { areas, ZONES, DATA_UPDATED, type AreaYield, type ZoneKey } from "@/lib/yield-heatmap-data";

const YieldMap = dynamic(() => import("@/components/YieldMap"), { ssr: false });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type SortKey = "yield" | "rent1br" | "pricesqft" | "yoy";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "yield", label: "Yield %" },
  { key: "rent1br", label: "Avg Rent 1BR" },
  { key: "pricesqft", label: "Price/sqft" },
  { key: "yoy", label: "YoY Change" },
];

const ZONE_FILTERS: { key: ZoneKey | "all"; label: string }[] = [
  { key: "all", label: "All Zones" },
  ...ZONES.map((z) => ({ key: z.key, label: z.label })),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yieldColor(y: number): string {
  if (y >= 8) return "var(--tool-accent)";
  if (y >= 7) return "var(--tool-accent)";
  if (y >= 6) return "var(--tool-accent)";
  if (y >= 5) return "var(--text-secondary, #a8a29e)";
  if (y >= 4) return "var(--text-secondary, #78716c)";
  return "var(--text-secondary, #57534e)";
}

function yieldTextClass(y: number): string {
  if (y >= 7) return "text-tool-accent";
  if (y >= 5) return "text-app";
  return "text-secondary";
}

function fmtAED(v: number | null): string {
  if (v === null) return "—";
  return `AED ${v.toLocaleString("en-AE")}`;
}

function fmtYoY(v: number): string {
  if (v > 0) return `+${v.toFixed(1)}pp`;
  if (v < 0) return `${v.toFixed(1)}pp`;
  return "0.0pp";
}

function zoneLabel(key: ZoneKey): string {
  return ZONES.find((z) => z.key === key)?.label ?? key;
}

function zoneColor(key: ZoneKey): string {
  return ZONES.find((z) => z.key === key)?.color ?? "#d1d5db";
}

// ---------------------------------------------------------------------------
// In-tool app header (replaces the global PageHeader inside this tool)
// ---------------------------------------------------------------------------

function ToolAppHeader({
  zoneCount,
  areaCount,
  frame,
}: {
  zoneCount: number;
  areaCount: number;
  frame: boolean;
}) {
  return (
    <div
      className={`tool-hero relative overflow-hidden border-b border-app ${
        frame ? "" : "rounded-t-xl"
      }`}
    >
      {/* Faint topo/cartography grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 24px)",
          color: "var(--tool-accent)",
          maskImage: "radial-gradient(ellipse at 85% 0%, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 85% 0%, black 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-4 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6 md:py-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent ring-1 ring-inset ring-tool-accent/30">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent animate-pulse" />
              Field Research
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-secondary md:inline">
              / Yield Cartography
            </span>
          </div>
          <h1 className="mt-2 text-[1.55rem] font-bold leading-tight tracking-tight text-app md:text-[1.85rem]">
            Rental Yield Heatmap
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-secondary">
            A cartographer&apos;s view of where Dubai&apos;s rental cash actually flows. Tap a
            zone to open the field report.
          </p>
        </div>

        {/* Stat chips */}
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="City" value="Dubai" />
          <StatChip label="Zones" value={String(zoneCount)} />
          <StatChip label="Areas" value={String(areaCount)} />
          <StatChip label="Updated" value={DATA_UPDATED} accent />
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-lg border px-3 py-1.5 ${
        accent
          ? "border-tool-accent/40 bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-secondary">
        {label}
      </span>
      <span
        className={`text-[13px] font-semibold leading-tight ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yield gradient legend strip
// ---------------------------------------------------------------------------

function YieldLegend() {
  const ticks = [3, 5, 7, 9];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
          Yield Scale
        </span>
        <span className="text-[10px] text-secondary">
          cool → hot
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full ring-1 ring-inset ring-app">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--text-secondary, #57534e) 0%, var(--text-secondary, #78716c) 18%, var(--text-secondary, #a8a29e) 36%, var(--tool-accent) 58%, var(--tool-accent) 78%, var(--tool-accent) 100%)",
          }}
        />
      </div>
      <div className="flex justify-between px-0.5">
        {ticks.map((t) => (
          <span key={t} className="text-[10px] font-medium text-secondary">
            {t}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel (slide-out — themed via tool-accent, no hardcoded amber/cream)
// ---------------------------------------------------------------------------

function DetailPanel({
  area,
  onClose,
}: {
  area: AreaYield;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const rentRows: { label: string; value: number | null }[] = [
    { label: "Studio", value: area.avgRentStudio },
    { label: "1 BR", value: area.avgRent1BR },
    { label: "2 BR", value: area.avgRent2BR },
    { label: "3 BR", value: area.avgRent3BR },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={panelRef}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.35, ease }}
        className="relative flex w-full max-w-md flex-col overflow-hidden border-l border-tool-accent/20 bg-app-elevated"
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-tool-accent via-tool-accent/60 to-transparent" />

        {/* Header strip */}
        <div className="flex items-start justify-between gap-3 border-b border-app px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: zoneColor(area.zone) + "22",
                  color: zoneColor(area.zone),
                }}
              >
                {zoneLabel(area.zone)}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-secondary">
                Field Report
              </span>
            </div>
            <h2 className="mt-1.5 truncate text-xl font-bold text-app">
              {area.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-app text-secondary transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Big yield hero */}
          <div className="relative overflow-hidden rounded-xl border border-tool-accent/25 bg-tool-accent-soft p-5">
            <div
              aria-hidden
              className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
              style={{ background: "radial-gradient(circle, var(--tool-accent) 0%, transparent 70%)" }}
            />
            <div className="relative">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                Gross Yield
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-5xl font-extrabold tracking-tight ${yieldTextClass(area.avgYield)}`}>
                  {area.avgYield}%
                </span>
                <span className="text-xs text-secondary">
                  range {area.yieldRange.min}–{area.yieldRange.max}%
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-secondary">YoY</span>
                <span
                  className={`font-semibold ${
                    area.yoyChange >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {area.yoyChange >= 0 ? "▲" : "▼"} {fmtYoY(area.yoyChange)}
                </span>
                <span className="mx-1 h-3 w-px bg-app" />
                <span className="text-secondary">{area.totalListings} listings</span>
              </div>
            </div>
          </div>

          {/* Sub-metrics grid */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <SubMetric
              label="Price / sqft"
              value={`AED ${area.avgPricePerSqft.toLocaleString()}`}
            />
            <SubMetric
              label="Price Range"
              value={`${(area.priceRange[0] / 1_000_000).toFixed(1)}–${(area.priceRange[1] / 1_000_000).toFixed(1)}M`}
            />
          </div>

          {/* Rent breakdown */}
          <section className="mt-6">
            <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
              <span className="h-px w-4 bg-tool-accent" />
              Annual Rents
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {rentRows.map((r) => (
                <div
                  key={r.label}
                  className="rounded-lg border border-app bg-app-elevated px-3 py-2"
                >
                  <div className="text-[10px] font-medium uppercase tracking-wider text-secondary">
                    {r.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-app">
                    {fmtAED(r.value)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Property types */}
          <section className="mt-6">
            <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
              <span className="h-px w-4 bg-tool-accent" />
              Stock Types
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {area.propertyTypes.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-app"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Description */}
          <p className="mt-6 border-l-2 border-tool-accent/40 pl-3 text-sm italic leading-relaxed text-secondary">
            {area.description}
          </p>

          {/* Cross-tool CTAs */}
          <div className="mt-7 space-y-2 border-t border-app pt-5">
            <Link
              href={`/tools/neighborhood-report?area=${area.id}`}
              className="group flex items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2.5 text-xs font-medium text-app transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
            >
              <span>Full neighborhood report</span>
              <span className="text-tool-accent transition group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/tools/area-comparison"
              className="group flex items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2.5 text-xs font-medium text-app transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
            >
              <span>Compare with other areas</span>
              <span className="text-tool-accent transition group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-app">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function YieldHeatmapPage() {
  return (
    <Suspense fallback={null}>
      <YieldHeatmapInner />
    </Suspense>
  );
}

function YieldHeatmapInner() {
  const searchParams = useSearchParams();
  const frame = searchParams?.get("frame") === "1";

  const [zone, setZone] = useState<ZoneKey | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("yield");
  const [sortAsc, setSortAsc] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaYield | null>(null);
  const [yieldMin, setYieldMin] = useState(3);
  const [yieldMax, setYieldMax] = useState(10);

  // All areas after zone filter (for map — dimmed if outside yield range)
  const zoneFiltered = useMemo(() => {
    return zone === "all" ? areas : areas.filter((a) => a.zone === zone);
  }, [zone]);

  const filtered = useMemo(() => {
    let list = zone === "all" ? areas : areas.filter((a) => a.zone === zone);
    list = list.filter((a) => a.avgYield >= yieldMin && a.avgYield <= yieldMax);
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "yield":
          va = a.avgYield;
          vb = b.avgYield;
          break;
        case "rent1br":
          va = a.avgRent1BR ?? 0;
          vb = b.avgRent1BR ?? 0;
          break;
        case "pricesqft":
          va = a.avgPricePerSqft;
          vb = b.avgPricePerSqft;
          break;
        case "yoy":
          va = a.yoyChange;
          vb = b.yoyChange;
          break;
        default:
          va = 0;
          vb = 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [zone, sortKey, sortAsc, yieldMin, yieldMax]);

  const handleSelect = useCallback((area: AreaYield) => setSelectedArea(area), []);

  return (
    <AuthGate>
      <div data-tool-theme="research" data-tool="yield-heatmap" className="tool-shell bg-app">
        {!frame && (
          <PageHeader
            label="Tool"
            title="Rental Yield Heatmap"
            description="Interactive map of Dubai showing rental yields by area. Click any zone to see detailed breakdown."
            color="amber"
          />
        )}

        <section
          className={`relative mx-auto ${
            frame ? "max-w-none px-3 pb-6 sm:px-4" : "max-w-[1280px] px-4 pb-24 sm:px-6 lg:px-10"
          }`}
        >
          {/* App shell wrapper */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="overflow-hidden rounded-xl border border-app bg-app-elevated ring-1 ring-tool-accent/10"
          >
            {/* In-tool app header */}
            <ToolAppHeader zoneCount={ZONES.length} areaCount={areas.length} frame={frame} />

            {/* Filter bar — pill strip */}
            <div className="flex flex-wrap items-center gap-2 border-b border-app bg-tool-accent-soft/40 px-4 py-3 sm:px-5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Zone
              </span>
              <div className="flex flex-wrap gap-1">
                {ZONE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setZone(f.key)}
                    className={`rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                      zone === f.key
                        ? "bg-tool-accent text-black shadow-sm"
                        : "bg-app-elevated text-app hover:bg-tool-accent-soft hover:text-tool-accent"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* separator */}
              <span className="mx-1 hidden h-4 w-px bg-app md:inline-block" />

              {/* Yield range */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                  Range
                </span>
                <div className="flex items-center gap-1 rounded-lg bg-app-elevated px-2 py-1 ring-1 ring-inset ring-app">
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={yieldMin}
                    onChange={(e) => setYieldMin(Number(e.target.value))}
                    className="w-10 bg-transparent text-[11px] font-semibold text-app outline-none"
                  />
                  <span className="text-[11px] text-secondary">–</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={yieldMax}
                    onChange={(e) => setYieldMax(Number(e.target.value))}
                    className="w-10 bg-transparent text-[11px] font-semibold text-app outline-none"
                  />
                  <span className="text-[10px] text-secondary">%</span>
                </div>
              </div>

              <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live · {filtered.length} area{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Map + side panel layout — collapses to single column below md */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_300px]">
              {/* Map canvas */}
              <div className="relative">
                <div
                  className={`relative overflow-hidden border-b border-app ring-1 ring-inset ring-tool-accent/15 md:border-b-0 md:border-r ${
                    frame ? "h-[calc(100vh-260px)] min-h-[440px]" : "h-[480px] sm:h-[560px]"
                  }`}
                >
                  {/* Corner crosshair marks — cartography vibe */}
                  <CornerMarks />

                  <YieldMap
                    filteredAreas={filtered}
                    allAreas={zoneFiltered}
                    onHover={setHoveredId}
                    onSelect={handleSelect}
                  />

                  {/* Legend overlay — bottom-left */}
                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[400] flex flex-wrap items-end justify-between gap-3 sm:right-auto sm:max-w-[280px]">
                    <div className="pointer-events-auto w-full rounded-lg bg-tool-accent-soft text-tool-accent p-2.5 shadow-lg backdrop-blur-md ring-1 ring-tool-accent/30">
                      <YieldLegend />
                    </div>
                  </div>

                  {/* Scale indicator — top-right */}
                  <div className="pointer-events-none absolute right-3 top-3 z-[400] flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent backdrop-blur-md ring-1 ring-tool-accent/30">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <circle cx="5" cy="5" r="2" />
                      <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="0.8" />
                    </svg>
                    Dubai · UAE
                  </div>
                </div>
              </div>

              {/* Side rail — selected zone / default state */}
              <aside className="flex flex-col bg-app-elevated">
                {selectedArea ? (
                  <SideRailSelected area={selectedArea} onOpen={() => handleSelect(selectedArea)} />
                ) : (
                  <SideRailDefault
                    topAreas={filtered.slice(0, 5)}
                    hoveredId={hoveredId}
                    onPick={handleSelect}
                    onHover={setHoveredId}
                  />
                )}
              </aside>
            </div>

            {/* Sort + list section — hidden in frame mode to keep map at max height */}
            {!frame && (
              <div className="border-t border-app">
                {/* Sort toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-app px-4 py-3 sm:px-5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Sort
                  </span>
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (sortKey === opt.key) setSortAsc(!sortAsc);
                        else {
                          setSortKey(opt.key);
                          setSortAsc(false);
                        }
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        sortKey === opt.key
                          ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:bg-tool-accent-soft/50 hover:text-tool-accent"
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.key && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
                    </button>
                  ))}
                </div>

                {/* List */}
                <div className="divide-y divide-app">
                  {/* Header row — desktop */}
                  <div className="hidden grid-cols-[1fr_90px_120px_120px_90px] gap-4 bg-tool-accent-soft/30 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary md:grid">
                    <span>Area</span>
                    <span className="text-right">Yield</span>
                    <span className="text-right">Avg Rent 1BR</span>
                    <span className="text-right">Price/sqft</span>
                    <span className="text-right">YoY</span>
                  </div>

                  {filtered.map((area, i) => (
                    <motion.button
                      key={area.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.015 * Math.min(i, 20), ease }}
                      onClick={() => handleSelect(area)}
                      onMouseEnter={() => setHoveredId(area.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`w-full cursor-pointer text-left transition md:grid md:grid-cols-[1fr_90px_120px_120px_90px] md:gap-4 md:px-5 md:py-3 ${
                        hoveredId === area.id
                          ? "bg-tool-accent-soft"
                          : "hover:bg-tool-accent-soft/40"
                      } px-4 py-3`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-app-elevated"
                          style={{ backgroundColor: yieldColor(area.avgYield) }}
                        />
                        <span className="truncate text-sm font-semibold text-app">
                          {area.name}
                        </span>
                        <span
                          className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold lg:inline-block"
                          style={{
                            backgroundColor: zoneColor(area.zone) + "1a",
                            color: zoneColor(area.zone),
                          }}
                        >
                          {zoneLabel(area.zone)}
                        </span>
                      </div>

                      <div className={`hidden text-right text-sm font-bold md:block ${yieldTextClass(area.avgYield)}`}>
                        {area.avgYield}%
                      </div>
                      <div className="hidden text-right text-sm text-secondary md:block">
                        {area.avgRent1BR ? `AED ${area.avgRent1BR.toLocaleString()}` : "—"}
                      </div>
                      <div className="hidden text-right text-sm text-secondary md:block">
                        AED {area.avgPricePerSqft.toLocaleString()}
                      </div>
                      <div
                        className={`hidden text-right text-sm font-semibold md:block ${
                          area.yoyChange >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {area.yoyChange >= 0 ? "▲" : "▼"} {fmtYoY(area.yoyChange)}
                      </div>

                      {/* Mobile summary */}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-secondary md:hidden">
                        <span className={`font-bold ${yieldTextClass(area.avgYield)}`}>
                          {area.avgYield}%
                        </span>
                        <span>
                          {area.avgRent1BR ? `1BR ${(area.avgRent1BR / 1000).toFixed(0)}k` : ""}
                        </span>
                        <span
                          className={area.yoyChange >= 0 ? "text-emerald-500" : "text-red-500"}
                        >
                          {fmtYoY(area.yoyChange)}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </section>

        {!frame && (
          <div className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6 lg:px-10">
            <ToolRecommendations slug="yield-heatmap" />
          </div>
        )}

        {/* Detail panel */}
        <AnimatePresence>
          {selectedArea && (
            <DetailPanel area={selectedArea} onClose={() => setSelectedArea(null)} />
          )}
        </AnimatePresence>
      </div>
    </AuthGate>
  );
}

// ---------------------------------------------------------------------------
// Cartography corner marks overlaid on map
// ---------------------------------------------------------------------------

function CornerMarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[400]">
      {[
        "top-2 left-2 border-l-2 border-t-2",
        "top-2 right-2 border-r-2 border-t-2",
        "bottom-2 left-2 border-l-2 border-b-2",
        "bottom-2 right-2 border-r-2 border-b-2",
      ].map((cls) => (
        <span
          key={cls}
          className={`absolute h-3 w-3 border-tool-accent/50 ${cls}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side rail — default (no selection)
// ---------------------------------------------------------------------------

function SideRailDefault({
  topAreas,
  hoveredId,
  onPick,
  onHover,
}: {
  topAreas: AreaYield[];
  hoveredId: string | null;
  onPick: (a: AreaYield) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
          Leaderboard
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-secondary">
          Top yields
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-secondary">
        Tap a marker or a row to open the field report for that zone.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        {topAreas.length === 0 && (
          <div className="rounded-xl border border-dashed border-app p-4 text-center text-[11px] text-secondary">
            No zones match the current filter.
          </div>
        )}
        {topAreas.map((area, i) => (
          <button
            key={area.id}
            onClick={() => onPick(area)}
            onMouseEnter={() => onHover(area.id)}
            onMouseLeave={() => onHover(null)}
            className={`group flex items-center gap-3 rounded-xl border bg-app-elevated px-2.5 py-2 text-left transition ${
              hoveredId === area.id
                ? "border-tool-accent/50 bg-tool-accent-soft ring-1 ring-tool-accent/40"
                : "border-app hover:ring-1 hover:ring-tool-accent/30"
            }`}
          >
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-[10px] font-bold text-tool-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-app">
                {area.name}
              </div>
              <div className="text-[10px] text-secondary">
                {zoneLabel(area.zone)}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className={`text-sm font-extrabold ${yieldTextClass(area.avgYield)}`}>
                {area.avgYield}%
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  area.yoyChange >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {area.yoyChange >= 0 ? "▲" : "▼"} {Math.abs(area.yoyChange).toFixed(1)}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-auto border-t border-app pt-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-secondary">
          <span className="h-1 w-1 rounded-full bg-tool-accent" />
          Source: aggregated DLD / Bayut · {DATA_UPDATED}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side rail — selected area (compact snapshot)
// ---------------------------------------------------------------------------

function SideRailSelected({
  area,
  onOpen,
}: {
  area: AreaYield;
  onOpen: () => void;
}) {
  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
          Selected
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: zoneColor(area.zone) + "22",
            color: zoneColor(area.zone),
          }}
        >
          {zoneLabel(area.zone)}
        </span>
      </div>

      <h3 className="mt-2 text-lg font-bold leading-tight text-app">
        {area.name}
      </h3>

      <div className="mt-4 rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
          Gross Yield
        </div>
        <div className={`mt-1 text-4xl font-extrabold tracking-tight ${yieldTextClass(area.avgYield)}`}>
          {area.avgYield}%
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span
            className={`font-semibold ${
              area.yoyChange >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            }`}
          >
            {area.yoyChange >= 0 ? "▲" : "▼"} {fmtYoY(area.yoyChange)}
          </span>
          <span className="text-secondary">YoY</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="1BR Rent" value={area.avgRent1BR ? `${(area.avgRent1BR / 1000).toFixed(0)}k` : "—"} />
        <MiniStat label="Price/sqft" value={area.avgPricePerSqft.toLocaleString()} />
        <MiniStat label="Listings" value={String(area.totalListings)} />
        <MiniStat label="Range" value={`${area.yieldRange.min}–${area.yieldRange.max}%`} />
      </div>

      <button
        onClick={onOpen}
        className="mt-4 w-full rounded-lg bg-tool-accent px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black transition hover:opacity-90"
      >
        Open full report →
      </button>

      <div className="mt-auto pt-4 text-[10px] uppercase tracking-[0.18em] text-secondary">
        <span className="mr-1 inline-block h-1 w-1 rounded-full bg-tool-accent" />
        {DATA_UPDATED}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-secondary">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold text-app">{value}</div>
    </div>
  );
}
