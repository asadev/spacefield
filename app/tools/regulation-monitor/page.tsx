"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import ToolRecommendations from "@/components/ToolRecommendations";
import {
  REGULATIONS,
  CATEGORIES,
  Regulation,
} from "@/lib/regulation-data";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

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

// ---------------------------------------------------------------------------
// Severity / status pill helpers — token-driven (no hardcoded dark:X duals).
// critical = rose, important = amber, info = tool-accent.
// ---------------------------------------------------------------------------

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

function RegulationMonitorInner() {
  const searchParams = useSearchParams();
  const isFrame = searchParams?.get("frame") === "1";

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
  }, [selectedCategories, impactFilter, statusFilter, yearFilter, search, partyFilter]);

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
    const text = `${reg.title}\n${formatDate(reg.date)} | ${getCategoryLabel(reg.category)} | Impact: ${reg.impact}\n\n${reg.summary}\n\nDetails:\n${reg.details.map((d) => `- ${d}`).join("\n")}\n\nSource: ${reg.source}`;
    navigator.clipboard.writeText(text);
    setCopiedId(reg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const shareWhatsApp = useCallback((reg: Regulation) => {
    const text = encodeURIComponent(
      `*${reg.title}*\n${formatDate(reg.date)} | ${getCategoryLabel(reg.category)}\n\n${reg.summary}\n\nSource: ${reg.source}`
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

  return (
    <div
      data-tool-theme="compliance"
      data-tool="regulation-monitor"
      className="min-h-screen bg-app text-app"
    >
      <main>
        <section
          className={`${
            isFrame ? "max-w-none px-0 pt-0" : "max-w-6xl mx-auto px-3 sm:px-6 pt-6"
          } pb-24`}
        >
          <div className="relative overflow-hidden">

            {/* Hero */}
            <div className="tool-hero px-5 sm:px-8 pt-8 pb-5 border-b border-app">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-tool-accent font-semibold mb-2">
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-tool-accent opacity-60 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-tool-accent" />
                    </span>
                    Regulatory Feed
                  </div>
                  <h1 className="font-tool-heading text-3xl sm:text-4xl font-bold tracking-tight text-app">
                    Regulation Monitor
                  </h1>
                  <p className="text-sm text-secondary mt-1.5 max-w-2xl">
                    RERA, DLD, visa, tax & mortgage rule changes — with severity chips, affected parties, and impact analysis.
                  </p>
                </div>

                {/* Live clock + counter */}
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                  <div className="px-3 py-2 rounded-lg border border-tool-accent/30 bg-tool-accent-soft text-tool-accent">
                    <div className="text-[9px] opacity-70">Tracked</div>
                    <div className="font-tool-heading text-base font-bold tabular-nums">
                      {REGULATIONS.length}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-app bg-app-elevated text-secondary">
                    <div className="text-[9px] opacity-70">Now</div>
                    <div className="font-tool-heading text-xs tabular-nums">
                      {now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                    </div>
                  </div>
                </div>
              </div>

              {/* News-ticker strip */}
              <div className="mt-5 relative overflow-hidden rounded-lg border border-tool-accent/25 bg-tool-accent-soft">
                <div className="flex items-center">
                  <div className="shrink-0 px-3 py-2 bg-tool-accent text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.82l7 3.5v7.36l-7-3.5V9.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z" />
                    </svg>
                    Live
                  </div>
                  <div className="flex-1 overflow-hidden relative">
                    <div className="flex gap-8 animate-[ticker_60s_linear_infinite] whitespace-nowrap py-2 px-4">
                      {[...tickerItems, ...tickerItems].map((reg, i) => (
                        <span
                          key={`${reg.id}-${i}`}
                          className="inline-flex items-center gap-2 text-[11px] text-app"
                        >
                          <span
                            className={`px-1.5 py-px rounded text-[9px] font-bold uppercase border ${severityPillClasses(reg.impact)}`}
                          >
                            {reg.impact}
                          </span>
                          <span className="opacity-60 tabular-nums text-secondary">
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
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                  }
                `}</style>
              </div>
            </div>

            {/* Filter strip */}
            <div className="px-5 sm:px-8 py-4 border-b border-app bg-app-elevated space-y-3">
              {/* Mobile toggle = state button */}
              <button
                onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                className={`md:hidden w-full py-2 px-3 rounded-lg text-xs flex items-center justify-between transition-colors border ${
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
                  className={`w-4 h-4 transition-transform ${
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

              <div
                className={`${
                  mobileFiltersOpen ? "block" : "hidden"
                } md:block space-y-3`}
              >
                {/* Search */}
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
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
                    className="w-full pl-10 pr-4 py-2.5 bg-app-elevated border border-app rounded-lg text-sm text-app placeholder:text-faint focus:outline-none focus:ring-2 ring-tool-accent focus:border-tool-accent transition-all"
                  />
                </div>

                {/* Source/Jurisdiction selector — pill row */}
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-muted font-semibold mb-1.5">
                    Source · Jurisdiction
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((cat) => {
                      const active = selectedCategories.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          onClick={() => toggleCategory(cat.value)}
                          className={`px-2.5 py-1 text-[11px] rounded-full border transition-all ${
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

                {/* Impact / Status / Year — internal nav state buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted font-semibold mb-1.5">
                      Severity
                    </div>
                    <div className="flex gap-1 bg-app p-1 rounded-lg border border-app">
                      {IMPACT_FILTERS.map((val) => (
                        <button
                          key={val}
                          onClick={() => setImpactFilter(val)}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-all ${
                            impactFilter === val
                              ? "bg-tool-accent text-white shadow-sm"
                              : "text-secondary hover:text-app"
                          }`}
                        >
                          {val === "All" ? "All" : val.charAt(0).toUpperCase() + val.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted font-semibold mb-1.5">
                      Status
                    </div>
                    <div className="flex gap-1 bg-app p-1 rounded-lg border border-app">
                      {STATUS_FILTERS.map((val) => (
                        <button
                          key={val}
                          onClick={() => setStatusFilter(val)}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-all ${
                            statusFilter === val
                              ? "bg-tool-accent text-white shadow-sm"
                              : "text-secondary hover:text-app"
                          }`}
                        >
                          {val === "All" ? "All" : val.charAt(0).toUpperCase() + val.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted font-semibold mb-1.5">
                      Year
                    </div>
                    <div className="flex gap-1 bg-app p-1 rounded-lg border border-app">
                      {YEARS.map((val) => (
                        <button
                          key={val}
                          onClick={() => setYearFilter(val)}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded transition-all ${
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
                  <div className="flex items-center gap-2 flex-wrap">
                    {partyFilter && (
                      <button
                        onClick={() => setPartyFilter(null)}
                        className="px-2 py-1 text-[10px] rounded-full border border-tool-accent/40 bg-tool-accent-soft text-tool-accent flex items-center gap-1 hover:bg-tool-accent hover:text-white transition-colors"
                      >
                        Party: {partyFilter}
                        <svg
                          className="w-3 h-3"
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
                        className="text-[10px] uppercase tracking-widest text-muted hover:text-tool-accent transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-muted tabular-nums">
                    {stats.total} match{stats.total !== 1 ? "es" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="px-5 sm:px-8 py-4 border-b border-app grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-app bg-app-elevated p-3">
                <div className="text-[9px] uppercase tracking-widest text-muted font-semibold">
                  Total
                </div>
                <div className="font-tool-heading text-2xl font-bold tabular-nums mt-0.5">
                  {stats.total}
                </div>
              </div>
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="text-[9px] uppercase tracking-widest text-rose-600 dark:text-rose-300 font-semibold">
                  Critical
                </div>
                <div className="font-tool-heading text-2xl font-bold tabular-nums mt-0.5 text-rose-600 dark:text-rose-300">
                  {stats.high}
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-[9px] uppercase tracking-widest text-amber-600 dark:text-amber-300 font-semibold">
                  Important
                </div>
                <div className="font-tool-heading text-2xl font-bold tabular-nums mt-0.5 text-amber-600 dark:text-amber-300">
                  {stats.medium}
                </div>
              </div>
              <div className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft p-3">
                <div className="text-[9px] uppercase tracking-widest text-tool-accent font-semibold">
                  Info
                </div>
                <div className="font-tool-heading text-2xl font-bold tabular-nums mt-0.5 text-tool-accent">
                  {stats.low}
                </div>
              </div>
            </div>

            {/* Feed body — vertical timeline rail */}
            <div className="px-5 sm:px-8 py-6">
              <div className="relative">
                {/* Vertical rail */}
                <div className="absolute left-[7px] sm:left-[119px] top-0 bottom-0 w-px bg-app" />

                <AnimatePresence mode="popLayout">
                  {groupedByYear.map(([year, regs]) => (
                    <div key={year}>
                      {/* Year divider with tool-accent dot */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative flex items-center gap-4 mb-5 mt-6 first:mt-0"
                      >
                        <div className="hidden sm:block w-[108px]" />
                        <div className="w-4 h-4 rounded-full border-2 border-tool-accent bg-app z-10 shrink-0" />
                        <span className="font-tool-heading text-base font-bold tabular-nums text-app">
                          {year}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-muted">
                          {regs.length} change{regs.length !== 1 ? "s" : ""}
                        </span>
                        <div className="flex-1 h-px bg-app" />
                      </motion.div>

                      {regs.map((reg) => (
                        <motion.div
                          key={reg.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.25, ease }}
                          layout
                          className="relative flex gap-4 mb-3 group"
                        >
                          {/* Date column — font-tool-heading */}
                          <div className="hidden sm:flex w-[108px] shrink-0 items-start pt-3 justify-end">
                            <div className="text-right">
                              <div className="font-tool-heading text-xs tabular-nums text-app">
                                {formatDate(reg.date)}
                              </div>
                              <div className="text-[10px] text-muted mt-0.5">
                                {relativeTime(reg.date)}
                              </div>
                            </div>
                          </div>

                          {/* Severity dot on rail */}
                          <div className="relative shrink-0 flex items-start pt-4">
                            <div
                              className={`w-3 h-3 rounded-full border-2 z-10 ${severityDotClasses(reg.impact)}`}
                            />
                          </div>

                          {/* Card */}
                          <div className="relative flex-1 border border-app bg-app-elevated rounded-xl p-4 transition-all hover:border-tool-accent/40">
                            {/* Top row: chips */}
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <button
                                onClick={() => setSelectedCategories([reg.category])}
                                className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent cursor-pointer transition-colors"
                              >
                                {getCategoryLabel(reg.category)}
                              </button>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${severityPillClasses(reg.impact)}`}
                              >
                                {reg.impact === "high"
                                  ? "critical"
                                  : reg.impact === "medium"
                                  ? "important"
                                  : "info"}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border ${statusPillClasses(reg.status)}`}
                              >
                                {reg.status}
                              </span>
                              <span className="sm:hidden text-[10px] text-muted ml-auto tabular-nums">
                                {relativeTime(reg.date)}
                              </span>
                            </div>

                            {/* Title */}
                            <h3 className="text-sm sm:text-base font-semibold leading-snug mb-1.5 text-app">
                              {reg.title}
                            </h3>

                            {/* Summary */}
                            <p className="text-xs sm:text-sm text-secondary leading-relaxed mb-3">
                              {reg.summary}
                            </p>

                            {/* Affected parties */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {reg.affectedParties.map((party) => (
                                <button
                                  key={party}
                                  onClick={() => setPartyFilter(party)}
                                  className="px-2 py-0.5 text-[10px] rounded bg-app border border-app text-secondary hover:border-tool-accent/40 hover:text-tool-accent transition-colors cursor-pointer"
                                >
                                  {party}
                                </button>
                              ))}
                            </div>

                            {/* Source line */}
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
                              <svg
                                className="w-3 h-3 shrink-0"
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
                            <div className="flex items-center gap-3 pt-2 border-t border-app">
                              <button
                                onClick={() =>
                                  setExpandedId(expandedId === reg.id ? null : reg.id)
                                }
                                className="text-[11px] font-medium text-tool-accent hover:opacity-70 transition-opacity flex items-center gap-1"
                              >
                                <svg
                                  className={`w-3.5 h-3.5 transition-transform ${
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
                                {expandedId === reg.id ? "Collapse" : "Impact analysis"}
                              </button>
                              <button
                                onClick={() => copyToClipboard(reg)}
                                className="text-[11px] text-muted hover:text-app transition-colors flex items-center gap-1"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
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
                                className="text-[11px] text-muted hover:text-app transition-colors flex items-center gap-1"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
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
                                  <div className="mt-3 pt-3 border-t border-tool-accent/20">
                                    <div className="text-[10px] uppercase tracking-widest text-tool-accent font-bold mb-2">
                                      Impact Analysis
                                    </div>
                                    <ul className="space-y-1.5">
                                      {reg.details.map((detail, i) => (
                                        <li
                                          key={i}
                                          className="text-xs text-secondary flex items-start gap-2 leading-relaxed"
                                        >
                                          <span className="w-1 h-1 rounded-full bg-tool-accent mt-1.5 shrink-0" />
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
                    className="text-center py-16 border border-dashed border-app rounded-xl"
                  >
                    <div className="text-sm text-muted">
                      No regulations match your filters.
                    </div>
                    <button
                      onClick={resetFilters}
                      className="mt-3 text-xs text-tool-accent hover:opacity-70 underline transition-opacity"
                    >
                      Clear all filters
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Category Distribution */}
              {categoryDistribution.length > 0 && (
                <div className="mt-10 rounded-xl border border-app bg-app-elevated p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1 h-4 bg-tool-accent rounded-full" />
                    <h2 className="font-tool-heading text-xs uppercase tracking-widest font-bold text-app">
                      Distribution by Source
                    </h2>
                  </div>
                  <div className="space-y-2.5">
                    {categoryDistribution.map((cat) => {
                      const maxCount = categoryDistribution[0]?.count || 1;
                      const pct = (cat.count / maxCount) * 100;
                      return (
                        <div key={cat.value} className="flex items-center gap-3">
                          <span className="w-28 text-[11px] truncate text-app">
                            {cat.label}
                          </span>
                          <div className="flex-1 h-2 bg-app rounded-full overflow-hidden border border-app">
                            <motion.div
                              className="h-full rounded-full bg-tool-accent"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease }}
                            />
                          </div>
                          <span className="text-[11px] text-muted w-6 text-right tabular-nums">
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

          {/* Tool Recommendations */}
          {!isFrame && (
            <div className="mt-12">
              <ToolRecommendations slug="regulation-monitor" />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function RegulationMonitorPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <RegulationMonitorInner />
      </Suspense>
    </AuthGate>
  );
}
