"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Regulation Monitor — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome. Width-driven layout (collapses ticker / hero stats / filter grid
   below the 760 / 600 / 480 thresholds). All regulation data, severity
   scoring, party filtering, year grouping, and category-distribution logic
   preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  REGULATIONS,
  CATEGORIES,
  type Regulation,
} from "@/lib/regulation-data";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ─────────────────────────────── helpers ─────────────────────────────── */

function getCategoryLabel(category: Regulation["category"]) {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.round(diffMs / 86400000);
  if (days < -30) return formatDate(dateStr);
  if (days < 0) return `in ${Math.abs(days)}d`;
  if (days === 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

// Severity / status pill helpers — token-driven (same as page.tsx).
function severityPillClasses(impact: Regulation["impact"]) {
  if (impact === "high") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  }
  if (impact === "medium") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300";
  }
  return "border-tool-accent/40 bg-tool-accent-soft text-tool-accent";
}

function severityDotClasses(impact: Regulation["impact"]) {
  if (impact === "high") return "border-rose-500 bg-rose-500/40";
  if (impact === "medium") return "border-amber-500 bg-amber-500/40";
  return "border-tool-accent bg-tool-accent-soft";
}

function statusPillClasses(status: Regulation["status"]) {
  if (status === "active") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }
  if (status === "upcoming") {
    return "border-tool-accent/40 bg-tool-accent-soft text-tool-accent";
  }
  if (status === "proposed") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300";
  }
  return "border-app bg-app-elevated text-muted";
}

const YEARS = ["2026", "2025", "2024", "All"] as const;
const IMPACT_FILTERS = ["All", "high", "medium", "low"] as const;
const STATUS_FILTERS = ["All", "active", "upcoming", "proposed"] as const;

/* ─────────────────────────────── component ─────────────────────────────── */

export default function RegulationMonitorApp(props: NativeAppProps) {
  const { width } = props;
  // Width-driven breakpoints — same idea as due-diligence/_app.tsx.
  const isMobile = width < 700;
  const isNarrow = width < 760 || isMobile;
  const isCompact = width < 600 || isMobile;
  const isUltra = width < 480;

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [impactFilter, setImpactFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  const filtered = useMemo(() => {
    let result = [...REGULATIONS];

    if (selectedCategories.length > 0) {
      result = result.filter((r) => selectedCategories.includes(r.category));
    }
    if (impactFilter !== "All") {
      result = result.filter((r) => r.impact === impactFilter);
    }
    if (statusFilter !== "All") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (yearFilter !== "All") {
      result = result.filter((r) => r.date.startsWith(yearFilter));
    }
    if (partyFilter) {
      result = result.filter((r) =>
        r.affectedParties.some((p) =>
          p.toLowerCase().includes(partyFilter.toLowerCase())
        )
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.details.some((d) => d.toLowerCase().includes(q))
      );
    }

    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [
    selectedCategories,
    impactFilter,
    statusFilter,
    yearFilter,
    search,
    partyFilter,
  ]);

  const stats = useMemo(() => {
    const high = filtered.filter((r) => r.impact === "high").length;
    const medium = filtered.filter((r) => r.impact === "medium").length;
    const low = filtered.filter((r) => r.impact === "low").length;
    const mostRecent = filtered.length > 0 ? filtered[0].date : null;
    return { total: filtered.length, high, medium, low, mostRecent };
  }, [filtered]);

  const groupedByYear = useMemo(() => {
    const groups: Record<string, Regulation[]> = {};
    filtered.forEach((r) => {
      const year = r.date.slice(0, 4);
      if (!groups[year]) groups[year] = [];
      groups[year].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => Number(b) - Number(a));
  }, [filtered]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return CATEGORIES.filter((c) => counts[c.value])
      .map((c) => ({ ...c, count: counts[c.value] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Ticker headlines: 6 most recent
  const tickerItems = useMemo(
    () =>
      REGULATIONS.slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    []
  );

  const copyToClipboard = useCallback((reg: Regulation) => {
    const text = `${reg.title}\n${formatDate(reg.date)} | ${getCategoryLabel(
      reg.category
    )} | Impact: ${reg.impact}\n\n${reg.summary}\n\nDetails:\n${reg.details
      .map((d) => `- ${d}`)
      .join("\n")}\n\nSource: ${reg.source}`;
    navigator.clipboard.writeText(text);
    setCopiedId(reg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const shareWhatsApp = useCallback((reg: Regulation) => {
    const text = encodeURIComponent(
      `*${reg.title}*\n${formatDate(reg.date)} | ${getCategoryLabel(
        reg.category
      )}\n\n${reg.summary}\n\nSource: ${reg.source}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, []);

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    impactFilter !== "All" ||
    statusFilter !== "All" ||
    yearFilter !== "All" ||
    partyFilter !== null ||
    search.trim().length > 0;

  const resetFilters = () => {
    setSelectedCategories([]);
    setImpactFilter("All");
    setStatusFilter("All");
    setYearFilter("All");
    setSearch("");
    setPartyFilter(null);
  };

  // Stats grid cols: 4 wide → 2 wide on compact → 2 still on ultra (it's
  // already only 4 cards, so keep them grouped).
  const statsCols = isCompact ? 2 : 4;

  return (
    <div
      data-tool-theme="compliance"
      data-tool="regulation-monitor"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className="relative overflow-hidden">
        {/* ───── HERO ───── */}
        <div className="tool-hero border-b border-app px-5 pb-5 pt-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tool-accent opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-tool-accent" />
                </span>
                Regulatory Feed
              </div>
              <h1 className="font-tool-heading text-2xl font-bold tracking-tight text-app sm:text-3xl">
                Regulation Monitor
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-secondary">
                RERA, DLD, visa, tax & mortgage rule changes — with severity
                chips, affected parties, and impact analysis.
              </p>
            </div>

            {/* Live clock + counter */}
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
              <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-2 text-tool-accent">
                <div className="text-[9px] opacity-70">Tracked</div>
                <div className="font-tool-heading text-base font-bold tabular-nums">
                  {REGULATIONS.length}
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-secondary">
                <div className="text-[9px] opacity-70">Now</div>
                <div className="font-tool-heading text-xs tabular-nums">
                  {now
                    ? now.toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "--:--"}
                </div>
              </div>
            </div>
          </div>

          {/* News-ticker strip — hidden on ultra-narrow to save vertical
              real estate; otherwise it's the headline bar. */}
          {!isUltra && (
            <div className="relative mt-5 overflow-hidden rounded-lg border border-tool-accent/25 bg-tool-accent-soft">
              <div className="flex items-center">
                <div className="flex shrink-0 items-center gap-1.5 bg-tool-accent px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.82l7 3.5v7.36l-7-3.5V9.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z" />
                  </svg>
                  Live
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <div className="flex animate-[ticker_60s_linear_infinite] gap-8 whitespace-nowrap px-4 py-2">
                    {[...tickerItems, ...tickerItems].map((reg, i) => (
                      <span
                        key={`${reg.id}-${i}`}
                        className="inline-flex items-center gap-2 text-[11px] text-app"
                      >
                        <span
                          className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase ${severityPillClasses(
                            reg.impact
                          )}`}
                        >
                          {reg.impact}
                        </span>
                        <span className="tabular-nums text-secondary opacity-60">
                          {relativeTime(reg.date)}
                        </span>
                        <span className="font-medium">{reg.title}</span>
                        <span className="opacity-30">·</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <style jsx>{`
                @keyframes ticker {
                  0% {
                    transform: translateX(0);
                  }
                  100% {
                    transform: translateX(-50%);
                  }
                }
              `}</style>
            </div>
          )}
        </div>

        {/* ───── FILTER STRIP ───── */}
        <div className="space-y-3 border-b border-app bg-app-elevated px-5 py-4 sm:px-6">
          {/* Compact toggle (replaces md: hidden) — driven by width */}
          {isNarrow && (
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                mobileFiltersOpen
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app bg-app text-app hover:border-tool-accent/40"
              }`}
            >
              <span>
                Filters{" "}
                {hasActiveFilters && (
                  <span className="text-tool-accent">· active</span>
                )}
              </span>
              <svg
                className={`h-4 w-4 transition-transform ${
                  mobileFiltersOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}

          <div
            className={`${
              !isNarrow || mobileFiltersOpen ? "block" : "hidden"
            } space-y-3`}
          >
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search regulations, agencies, parties…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-app bg-app-elevated py-2.5 pl-10 pr-4 text-sm text-app ring-tool-accent transition-all placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2"
              />
            </div>

            {/* Source/Jurisdiction selector — pill row */}
            <div>
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                Source · Jurisdiction
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      onClick={() => toggleCategory(cat.value)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                        active
                          ? "border-tool-accent bg-tool-accent text-white"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Impact / Status / Year — 1 col on compact, 3 col otherwise */}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: isCompact
                  ? "1fr"
                  : "repeat(3, minmax(0, 1fr))",
              }}
            >
              <div>
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                  Severity
                </div>
                <div className="flex gap-1 rounded-lg border border-app bg-app p-1">
                  {IMPACT_FILTERS.map((val) => (
                    <button
                      key={val}
                      onClick={() => setImpactFilter(val)}
                      className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-all ${
                        impactFilter === val
                          ? "bg-tool-accent text-white shadow-sm"
                          : "text-secondary hover:text-app"
                      }`}
                    >
                      {val === "All"
                        ? "All"
                        : val.charAt(0).toUpperCase() + val.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                  Status
                </div>
                <div className="flex gap-1 rounded-lg border border-app bg-app p-1">
                  {STATUS_FILTERS.map((val) => (
                    <button
                      key={val}
                      onClick={() => setStatusFilter(val)}
                      className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-all ${
                        statusFilter === val
                          ? "bg-tool-accent text-white shadow-sm"
                          : "text-secondary hover:text-app"
                      }`}
                    >
                      {val === "All"
                        ? "All"
                        : val.charAt(0).toUpperCase() + val.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                  Year
                </div>
                <div className="flex gap-1 rounded-lg border border-app bg-app p-1">
                  {YEARS.map((val) => (
                    <button
                      key={val}
                      onClick={() => setYearFilter(val)}
                      className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-all ${
                        yearFilter === val
                          ? "bg-tool-accent text-white shadow-sm"
                          : "text-secondary hover:text-app"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active filter row */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {partyFilter && (
                  <button
                    onClick={() => setPartyFilter(null)}
                    className="flex items-center gap-1 rounded-full border border-tool-accent/40 bg-tool-accent-soft px-2 py-1 text-[10px] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
                  >
                    Party: {partyFilter}
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-tool-accent"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-widest tabular-nums text-muted">
                {stats.total} match{stats.total !== 1 ? "es" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* ───── STATS BAR ───── */}
        <div
          className="grid gap-3 border-b border-app px-5 py-4 sm:px-6"
          style={{
            gridTemplateColumns: `repeat(${statsCols}, minmax(0, 1fr))`,
          }}
        >
          <div className="rounded-lg border border-app bg-app-elevated p-3">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted">
              Total
            </div>
            <div className="font-tool-heading mt-0.5 text-2xl font-bold tabular-nums">
              {stats.total}
            </div>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-300">
              Critical
            </div>
            <div className="font-tool-heading mt-0.5 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-300">
              {stats.high}
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-300">
              Important
            </div>
            <div className="font-tool-heading mt-0.5 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300">
              {stats.medium}
            </div>
          </div>
          <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft p-3">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-tool-accent">
              Info
            </div>
            <div className="font-tool-heading mt-0.5 text-2xl font-bold tabular-nums text-tool-accent">
              {stats.low}
            </div>
          </div>
        </div>

        {/* ───── FEED BODY — vertical timeline rail ───── */}
        <div className="px-5 py-6 sm:px-6">
          <div className="relative">
            {/* Vertical rail — date column hidden on compact, so rail
                hugs the dot column. */}
            <div
              className={`absolute top-0 bottom-0 w-px bg-app ${
                isCompact ? "left-[7px]" : "left-[119px]"
              }`}
            />

            <AnimatePresence mode="popLayout">
              {groupedByYear.map(([year, regs]) => (
                <div key={year}>
                  {/* Year divider with tool-accent dot */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative mt-6 mb-5 flex items-center gap-4 first:mt-0"
                  >
                    {!isCompact && <div className="w-[108px]" />}
                    <div className="z-10 h-4 w-4 shrink-0 rounded-full border-2 border-tool-accent bg-app" />
                    <span className="font-tool-heading text-base font-bold tabular-nums text-app">
                      {year}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted">
                      {regs.length} change{regs.length !== 1 ? "s" : ""}
                    </span>
                    <div className="h-px flex-1 bg-app" />
                  </motion.div>

                  {regs.map((reg) => (
                    <motion.div
                      key={reg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease }}
                      layout
                      className="group relative mb-3 flex gap-4"
                    >
                      {/* Date column — hidden when compact */}
                      {!isCompact && (
                        <div className="flex w-[108px] shrink-0 items-start justify-end pt-3">
                          <div className="text-right">
                            <div className="font-tool-heading text-xs tabular-nums text-app">
                              {formatDate(reg.date)}
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted">
                              {relativeTime(reg.date)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Severity dot on rail */}
                      <div className="relative flex shrink-0 items-start pt-4">
                        <div
                          className={`z-10 h-3 w-3 rounded-full border-2 ${severityDotClasses(
                            reg.impact
                          )}`}
                        />
                      </div>

                      {/* Card */}
                      <div className="relative flex-1 rounded-xl border border-app bg-app-elevated p-4 transition-all hover:border-tool-accent/40">
                        {/* Top row: chips */}
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSelectedCategories([reg.category])
                            }
                            className="cursor-pointer rounded border border-app bg-app px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary transition-colors hover:border-tool-accent/40 hover:text-tool-accent"
                          >
                            {getCategoryLabel(reg.category)}
                          </button>
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityPillClasses(
                              reg.impact
                            )}`}
                          >
                            {reg.impact === "high"
                              ? "critical"
                              : reg.impact === "medium"
                                ? "important"
                                : "info"}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusPillClasses(
                              reg.status
                            )}`}
                          >
                            {reg.status}
                          </span>
                          {isCompact && (
                            <span className="ml-auto text-[10px] tabular-nums text-muted">
                              {relativeTime(reg.date)}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="mb-1.5 text-sm font-semibold leading-snug text-app sm:text-base">
                          {reg.title}
                        </h3>

                        {/* Summary */}
                        <p className="mb-3 text-xs leading-relaxed text-secondary sm:text-sm">
                          {reg.summary}
                        </p>

                        {/* Affected parties */}
                        <div className="mb-3 flex flex-wrap gap-1">
                          {reg.affectedParties.map((party) => (
                            <button
                              key={party}
                              onClick={() => setPartyFilter(party)}
                              className="cursor-pointer rounded border border-app bg-app px-2 py-0.5 text-[10px] text-secondary transition-colors hover:border-tool-accent/40 hover:text-tool-accent"
                            >
                              {party}
                            </button>
                          ))}
                        </div>

                        {/* Source line */}
                        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                          <svg
                            className="h-3 w-3 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                          <span className="truncate">{reg.source}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 border-t border-app pt-2">
                          <button
                            onClick={() =>
                              setExpandedId(
                                expandedId === reg.id ? null : reg.id
                              )
                            }
                            className="flex items-center gap-1 text-[11px] font-medium text-tool-accent transition-opacity hover:opacity-70"
                          >
                            <svg
                              className={`h-3.5 w-3.5 transition-transform ${
                                expandedId === reg.id ? "rotate-180" : ""
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                            {expandedId === reg.id
                              ? "Collapse"
                              : "Impact analysis"}
                          </button>
                          <button
                            onClick={() => copyToClipboard(reg)}
                            className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-app"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            {copiedId === reg.id ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={() => shareWhatsApp(reg)}
                            className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-app"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                              />
                            </svg>
                            Share
                          </button>
                        </div>

                        {/* Expandable */}
                        <AnimatePresence>
                          {expandedId === reg.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 border-t border-tool-accent/20 pt-3">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-tool-accent">
                                  Impact Analysis
                                </div>
                                <ul className="space-y-1.5">
                                  {reg.details.map((detail, i) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-2 text-xs leading-relaxed text-secondary"
                                    >
                                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tool-accent" />
                                      <span>{detail}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))}
            </AnimatePresence>

            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-dashed border-app py-16 text-center"
              >
                <div className="text-sm text-muted">
                  No regulations match your filters.
                </div>
                <button
                  onClick={resetFilters}
                  className="mt-3 text-xs text-tool-accent underline transition-opacity hover:opacity-70"
                >
                  Clear all filters
                </button>
              </motion.div>
            )}
          </div>

          {/* Category Distribution */}
          {categoryDistribution.length > 0 && (
            <div className="mt-10 rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-tool-accent" />
                <h2 className="font-tool-heading text-xs font-bold uppercase tracking-widest text-app">
                  Distribution by Source
                </h2>
              </div>
              <div className="space-y-2.5">
                {categoryDistribution.map((cat) => {
                  const maxCount = categoryDistribution[0]?.count || 1;
                  const pct = (cat.count / maxCount) * 100;
                  return (
                    <div key={cat.value} className="flex items-center gap-3">
                      <span className="w-28 truncate text-[11px] text-app">
                        {cat.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full border border-app bg-app">
                        <motion.div
                          className="h-full rounded-full bg-tool-accent"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease }}
                        />
                      </div>
                      <span className="w-6 text-right text-[11px] tabular-nums text-muted">
                        {cat.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
