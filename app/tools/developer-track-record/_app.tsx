"use client";

/**
 * Developer Track Record — native workspace app.
 *
 * Mirrors page.tsx behavior but stripped of:
 *   - <AuthGate> (workspace shell handles auth)
 *   - frame=1 logic (we always render in-window)
 *   - PageHeader / "All Tools" back-link / macOS chrome (Window provides it)
 *   - <ToolRecommendations> (dock provides discovery)
 *
 * Cross-tool navigation goes through props.openApp(slug, params). Layout
 * reacts to live window width: filter bar wraps, sub-views collapse to a
 * single column, and the leaderboard row drops the optional columns when
 * the window is narrow.
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { developers, type Developer, DATA_UPDATED } from "@/lib/developer-data";
import type { NativeAppProps } from "../_data/tools-list";
import MobileSheet from "../_components/MobileSheet";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const TAG_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Luxury", value: "luxury" },
  { label: "Affordable", value: "affordable" },
  { label: "Master-Planned", value: "master-planned" },
  { label: "Off-Plan", value: "off-plan" },
  { label: "Premium", value: "premium" },
  { label: "Government", value: "government" },
  { label: "Branded", value: "branded" },
];

type SortKey = "overall" | "delivery" | "quality" | "appreciation" | "name";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Overall", value: "overall" },
  { label: "Delivery", value: "delivery" },
  { label: "Quality", value: "quality" },
  { label: "Appreciation", value: "appreciation" },
  { label: "Name", value: "name" },
];

type SubView = "leaderboard" | "podium" | "compare";

const SUB_VIEWS: { label: string; value: SubView }[] = [
  { label: "Leaderboard", value: "leaderboard" },
  { label: "Podium", value: "podium" },
  { label: "Spread", value: "compare" },
];

// Width breakpoints — all in window-content px so we don't lean on viewport CSS
// queries that lie inside the workspace Window component.
const SM_BREAKPOINT = 640; // collapse score-bar column
const MD_BREAKPOINT = 880; // collapse history column
const HEADER_STACK_BREAKPOINT = 760; // stack title block above stat tiles

/* ------------------------------------------------------------------ */
/*  Score helpers                                                     */
/* ------------------------------------------------------------------ */

function scoreTone(score: number): string {
  if (score >= 8.5) return "text-tool-accent";
  if (score >= 7) return "text-app";
  if (score >= 5.5) return "text-secondary";
  return "text-muted";
}

function scoreBarFill(score: number): string {
  if (score >= 7) return "bg-tool-accent";
  if (score >= 5.5) return "bg-tool-accent/60";
  return "bg-tool-accent/25";
}

function StarRating({ score }: { score: number }) {
  // Convert 0-10 to 0-5 stars (with halves)
  const stars = score / 2;
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const halved = i === full && half;
        return (
          <svg
            key={i}
            viewBox="0 0 20 20"
            className={`w-3 h-3 ${
              filled || halved ? "text-tool-accent" : "text-muted/40"
            }`}
            fill="currentColor"
            aria-hidden
          >
            {halved ? (
              <>
                <defs>
                  <linearGradient id={`half-${i}`}>
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.71l-5.18 2.73.99-5.77L1.62 7.59l5.79-.84L10 1.5z"
                  fill={`url(#half-${i})`}
                />
              </>
            ) : (
              <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.71l-5.18 2.73.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
            )}
          </svg>
        );
      })}
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 text-muted shrink-0 uppercase tracking-wider text-[9px]">
        {label}
      </span>
      <div className="flex-1 h-1 bg-app rounded-full overflow-hidden ring-1 ring-inset ring-app">
        <motion.div
          className={`h-full rounded-full ${scoreBarFill(score)}`}
          initial={{ width: 0 }}
          animate={{ width: `${score * 10}%` }}
          transition={{ duration: 0.6, ease }}
        />
      </div>
      <span className={`w-7 text-right tabular-nums font-medium ${scoreTone(score)}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function CompletionRate({ delivered, ongoing }: { delivered: number; ongoing: number }) {
  const total = delivered + ongoing;
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted uppercase tracking-wider">Completion</span>
        <span className="text-tool-accent tabular-nums font-semibold">{pct}%</span>
      </div>
      <div className="h-1 bg-app rounded-full overflow-hidden ring-1 ring-inset ring-app">
        <motion.div
          className="h-full bg-tool-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable column header                                            */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  value,
  active,
  className = "",
  onClick,
}: {
  label: string;
  value: SortKey;
  active: SortKey;
  className?: string;
  onClick: (v: SortKey) => void;
}) {
  const isActive = active === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`group inline-flex items-center gap-1 text-left transition-colors ${
        isActive ? "text-tool-accent" : "text-muted hover:text-app"
      } ${className}`}
    >
      <span className="uppercase tracking-widest">{label}</span>
      <svg
        viewBox="0 0 12 12"
        className={`h-2.5 w-2.5 transition-opacity ${
          isActive ? "opacity-100 text-tool-accent" : "opacity-30 group-hover:opacity-60"
        }`}
        fill="currentColor"
        aria-hidden
      >
        <path d="M6 3l3 4H3l3-4z" opacity="0.4" />
        <path d="M6 9l-3-4h6l-3 4z" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard row                                                   */
/* ------------------------------------------------------------------ */

function LeaderRow({
  dev,
  rank,
  width,
  onOpenDeveloper,
}: {
  dev: Developer;
  rank: number;
  width: number;
  onOpenDeveloper: (id: string) => void;
}) {
  const isPodium = rank <= 3;
  const showScoreBars = width >= SM_BREAKPOINT;
  const showHistory = width >= MD_BREAKPOINT;

  const rankBg =
    rank === 1
      ? "bg-tool-accent"
      : rank === 2
      ? "bg-tool-accent/60"
      : rank === 3
      ? "bg-tool-accent/30 text-tool-accent"
      : "bg-app-elevated text-secondary border border-app";

  // Build a width-aware grid template — drop optional columns when narrow.
  const gridCols = (() => {
    if (showHistory)
      return "44px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) 88px";
    if (showScoreBars) return "44px minmax(0, 1.4fr) minmax(0, 1fr) 88px";
    return "44px minmax(0, 1fr) 88px";
  })();

  return (
    <motion.button
      type="button"
      onClick={() => onOpenDeveloper(dev.id)}
      className={`group relative grid gap-3 items-center px-3 sm:px-4 py-3 rounded-xl border transition-colors cursor-pointer text-left w-full ${
        isPodium
          ? "border-tool-accent/30 bg-tool-accent-soft hover:border-tool-accent/50"
          : "border-app bg-app-elevated hover:border-app-hover"
      }`}
      style={{ gridTemplateColumns: gridCols }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease }}
      layout
    >
      {/* Rank chip */}
      <div className="flex items-center justify-center">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold tabular-nums ${rankBg}`}
          style={
            rank === 1 || rank === 2 ? { color: "var(--bg)" } : undefined
          }
        >
          {rank}
        </div>
      </div>

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-app truncate group-hover:text-tool-accent transition-colors">
            {dev.name}
          </h3>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <StarRating score={dev.overallScore} />
          <span className="text-[10px] text-muted tabular-nums">
            · est. {dev.established}
          </span>
        </div>
        <p className="text-[10px] text-muted mt-1 truncate">
          {dev.completedProjects} delivered · {dev.ongoingProjects} ongoing ·{" "}
          {dev.priceRange}
        </p>
      </div>

      {/* Score bars */}
      {showScoreBars && (
        <div className="flex flex-col gap-1 min-w-0">
          <ScoreBar label="Delivery" score={dev.deliveryScore} />
          <ScoreBar label="Quality" score={dev.qualityScore} />
          <ScoreBar label="Apprec." score={dev.valueAppreciation} />
        </div>
      )}

      {/* Project history strip + completion */}
      {showHistory && (
        <div className="flex flex-col gap-2 min-w-0">
          <CompletionRate
            delivered={dev.completedProjects}
            ongoing={dev.ongoingProjects}
          />
          <div className="flex flex-wrap gap-1">
            {dev.notableProjects.slice(0, 3).map((p) => (
              <span
                key={p}
                className="text-[10px] px-1.5 py-0.5 rounded bg-app-elevated border border-app text-secondary truncate max-w-[120px]"
                title={p}
              >
                {p}
              </span>
            ))}
            {dev.notableProjects.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 text-muted">
                +{dev.notableProjects.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trust score block */}
      <div className="flex flex-col items-end justify-center pl-2 border-l border-app">
        <div
          className={`text-2xl font-bold tabular-nums leading-none ${scoreTone(
            dev.overallScore
          )}`}
        >
          {dev.overallScore.toFixed(1)}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-muted mt-0.5">
          Trust
        </div>
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Podium view                                                       */
/* ------------------------------------------------------------------ */

function PodiumView({
  ranked,
  onOpenDeveloper,
}: {
  ranked: { dev: Developer; rank: number }[];
  onOpenDeveloper: (id: string) => void;
}) {
  const top3 = ranked.slice(0, 3);
  if (top3.length === 0) return null;

  // order: 2nd, 1st, 3rd visually
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = ["h-32", "h-44", "h-24"];

  return (
    <div className="rounded-2xl border border-app bg-app-elevated p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-tool-accent mb-6 text-center">
        Top 3 Trust Scores
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 items-end max-w-2xl mx-auto">
        {order.map((entry, idx) => {
          if (!entry) return <div key={idx} />;
          const { dev, rank } = entry;
          return (
            <button
              key={dev.id}
              type="button"
              onClick={() => onOpenDeveloper(dev.id)}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="text-center">
                <div className="text-xs font-semibold text-app truncate group-hover:text-tool-accent transition-colors px-1">
                  {dev.name}
                </div>
                <div className="text-2xl font-bold text-tool-accent tabular-nums mt-1">
                  {dev.overallScore.toFixed(1)}
                </div>
                <div className="mt-1 flex justify-center">
                  <StarRating score={dev.overallScore} />
                </div>
              </div>
              <div
                className={`w-full ${heights[idx]} rounded-t-xl border border-tool-accent/30 bg-tool-accent-soft flex items-start justify-center pt-3`}
              >
                <span className="text-2xl font-bold text-tool-accent tabular-nums">
                  #{rank}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Spread / compare view                                             */
/* ------------------------------------------------------------------ */

function SpreadView({
  ranked,
  onOpenDeveloper,
}: {
  ranked: { dev: Developer; rank: number }[];
  onOpenDeveloper: (id: string) => void;
}) {
  const max = 10;
  return (
    <div className="rounded-2xl border border-app bg-app-elevated p-4 sm:p-6">
      <div className="grid grid-cols-[1fr_2fr_2fr_2fr] gap-3 text-[10px] uppercase tracking-widest text-muted pb-3 border-b border-app">
        <span>Developer</span>
        <span>Delivery</span>
        <span>Quality</span>
        <span>Appreciation</span>
      </div>
      <div>
        {ranked.map(({ dev }) => (
          <div
            key={dev.id}
            className="grid grid-cols-[1fr_2fr_2fr_2fr] gap-3 items-center py-2.5 text-xs border-b border-app last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onOpenDeveloper(dev.id)}
              className="text-left text-app hover:text-tool-accent transition-colors truncate font-medium cursor-pointer"
            >
              {dev.name}
            </button>
            {[dev.deliveryScore, dev.qualityScore, dev.valueAppreciation].map(
              (s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-app overflow-hidden ring-1 ring-inset ring-app">
                    <div
                      className={`h-full rounded-full ${scoreBarFill(s)}`}
                      style={{ width: `${(s / max) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`w-8 text-right tabular-nums ${scoreTone(s)}`}
                  >
                    {s.toFixed(1)}
                  </span>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slim in-app header (replaces PageHeader/marketing hero)           */
/* ------------------------------------------------------------------ */

function ToolAppHeader({
  total,
  avgDelivery,
  topName,
  topScore,
  stack,
}: {
  total: number;
  avgDelivery: string;
  topName: string;
  topScore: string;
  stack: boolean;
}) {
  return (
    <div className="tool-hero relative overflow-hidden border-b border-app">
      <div
        className={`relative px-4 sm:px-6 pt-6 pb-6 flex gap-4 ${
          stack ? "flex-col" : "flex-row items-end justify-between"
        }`}
      >
        <div className="min-w-0 max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tool-accent animate-pulse" />
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-tool-accent font-semibold">
              Developer Leaderboard
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            Developer Track Record
          </h1>
          <p className="text-xs sm:text-sm text-secondary mt-2 leading-relaxed">
            Ranked scoring on delivery timelines, build quality, and price
            appreciation across {total} Dubai developers. Star ratings reflect
            editorial estimates from public track records.
          </p>
          <p className="text-[10px] text-muted mt-2 uppercase tracking-wider">
            Data updated {DATA_UPDATED}
          </p>
        </div>

        {/* Headline stat tiles */}
        <div
          className={`grid grid-cols-3 gap-2 ${
            stack ? "" : "min-w-[300px]"
          }`}
        >
          <div className="rounded-xl border border-app bg-app-elevated p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-muted">
              Tracked
            </div>
            <div className="text-xl font-bold tabular-nums text-app mt-0.5">
              {total}
            </div>
            <div className="text-[10px] text-muted mt-0.5">developers</div>
          </div>
          <div className="rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-tool-accent">
              Avg Delivery
            </div>
            <div className="text-xl font-bold tabular-nums text-tool-accent mt-0.5">
              {avgDelivery}
            </div>
            <div className="text-[10px] text-secondary mt-0.5">out of 10</div>
          </div>
          <div className="rounded-xl border border-app bg-app-elevated p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-muted">
              #1 Trust
            </div>
            <div className="text-xl font-bold tabular-nums text-app mt-0.5">
              {topScore}
            </div>
            <div className="text-[10px] text-muted mt-0.5 truncate">
              {topName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile searchable card list                                       */
/* ------------------------------------------------------------------ */

function MobileSearchableList({
  search,
  onSearch,
  tagFilter,
  onTagFilter,
  sortBy,
  onSortBy,
  ranked,
  onTap,
}: {
  search: string;
  onSearch: (v: string) => void;
  tagFilter: string;
  onTagFilter: (v: string) => void;
  sortBy: SortKey;
  onSortBy: (v: SortKey) => void;
  ranked: { dev: Developer; rank: number }[];
  onTap: (id: string) => void;
}) {
  return (
    <main className="px-4 pb-12">
      {/* Sticky search row */}
      <div
        className="sticky z-10 -mx-4 mb-3 border-b border-app bg-app/95 px-4 py-2 backdrop-blur"
        style={{ top: 0 }}
      >
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search developers, areas, projects"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-app-elevated border border-app text-sm text-app placeholder:text-muted outline-none focus:border-tool-accent"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={tagFilter}
            onChange={(e) => onTagFilter(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg bg-app-elevated border border-app text-xs text-app outline-none focus:border-tool-accent"
          >
            {TAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => onSortBy(e.target.value as SortKey)}
            className="flex-1 h-9 px-3 rounded-lg bg-app-elevated border border-app text-xs text-app outline-none focus:border-tool-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Card list */}
      <div className="flex flex-col gap-2">
        {ranked.map(({ dev, rank }) => (
          <MobileDevCard
            key={dev.id}
            dev={dev}
            rank={rank}
            onTap={() => onTap(dev.id)}
          />
        ))}
        {ranked.length === 0 && (
          <div className="rounded-2xl border border-dashed border-app bg-app-elevated py-12 text-center text-sm text-secondary">
            No developers match your search.
          </div>
        )}
      </div>
    </main>
  );
}

function MobileDevCard({
  dev,
  rank,
  onTap,
}: {
  dev: Developer;
  rank: number;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-center gap-3 rounded-xl border border-app bg-app-elevated p-3 text-left transition-colors active:bg-tool-accent-soft"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
          rank === 1
            ? "bg-tool-accent text-white"
            : rank <= 3
            ? "bg-tool-accent-soft text-tool-accent"
            : "bg-app text-secondary ring-1 ring-app"
        }`}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-app">{dev.name}</h3>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <StarRating score={dev.overallScore} />
          <span className="text-[10px] text-muted tabular-nums">
            est. {dev.established}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-secondary">
          {dev.completedProjects} delivered · {dev.ongoingProjects} ongoing · {dev.priceRange}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end pl-2">
        <span className={`text-xl font-bold leading-none tabular-nums ${scoreTone(dev.overallScore)}`}>
          {dev.overallScore.toFixed(1)}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-widest text-muted">Trust</span>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-faint"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Developer detail content (used inside mobile sheet)               */
/* ------------------------------------------------------------------ */

function DeveloperDetailContent({
  dev,
  onOpenPipeline,
}: {
  dev: Developer;
  onOpenPipeline: () => void;
}) {
  return (
    <div className="px-5 pb-8">
      <div className="flex items-center gap-2">
        <StarRating score={dev.overallScore} />
        <span className={`text-2xl font-bold tabular-nums ${scoreTone(dev.overallScore)}`}>
          {dev.overallScore.toFixed(1)}
        </span>
        <span className="ml-1 text-[10px] uppercase tracking-widest text-muted">
          Trust score
        </span>
      </div>
      <p className="mt-1 text-xs text-secondary">
        Established {dev.established} · {dev.completedProjects} delivered · {dev.ongoingProjects} ongoing
      </p>

      <div className="mt-4 space-y-2 rounded-2xl border border-app bg-app p-3">
        <ScoreBar label="Delivery" score={dev.deliveryScore} />
        <ScoreBar label="Quality" score={dev.qualityScore} />
        <ScoreBar label="Apprec." score={dev.valueAppreciation} />
      </div>

      <div className="mt-4">
        <CompletionRate
          delivered={dev.completedProjects}
          ongoing={dev.ongoingProjects}
        />
      </div>

      {dev.notableProjects.length > 0 && (
        <section className="mt-5">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Notable projects
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {dev.notableProjects.map((p) => (
              <span
                key={p}
                className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary"
              >
                {p}
              </span>
            ))}
          </div>
        </section>
      )}

      {dev.areasPresent.length > 0 && (
        <section className="mt-5">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Areas
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {dev.areasPresent.map((a) => (
              <span
                key={a}
                className="rounded-md bg-tool-accent-soft px-2 py-1 text-[11px] text-tool-accent"
              >
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-app bg-app-elevated p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Price range
        </h4>
        <p className="mt-1 text-sm font-semibold text-app">{dev.priceRange}</p>
      </section>

      <button
        type="button"
        onClick={onOpenPipeline}
        className="mt-6 w-full rounded-xl bg-tool-accent py-3 text-sm font-semibold text-white transition-opacity active:opacity-80"
      >
        Open in Developer Pipeline
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Native app entry                                                  */
/* ------------------------------------------------------------------ */

export default function DeveloperTrackRecordApp({
  width,
  openApp,
}: NativeAppProps) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("overall");
  const [view, setView] = useState<SubView>("leaderboard");
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);

  const isMobile = width < 700;
  const stackHeader = width < HEADER_STACK_BREAKPOINT || isMobile;
  const showColumnHeader = view === "leaderboard" && width >= SM_BREAKPOINT && !isMobile;

  const filtered = useMemo(() => {
    let result = [...developers];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.areasPresent.some((a) => a.toLowerCase().includes(q)) ||
          d.notableProjects.some((p) => p.toLowerCase().includes(q))
      );
    }

    if (tagFilter !== "all") {
      result = result.filter((d) => d.tags.includes(tagFilter));
    }

    switch (sortBy) {
      case "overall":
        result.sort((a, b) => b.overallScore - a.overallScore);
        break;
      case "delivery":
        result.sort((a, b) => b.deliveryScore - a.deliveryScore);
        break;
      case "quality":
        result.sort((a, b) => b.qualityScore - a.qualityScore);
        break;
      case "appreciation":
        result.sort((a, b) => b.valueAppreciation - a.valueAppreciation);
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [search, tagFilter, sortBy]);

  // For numbering, derive rank from current sort order
  const ranked = useMemo(
    () => filtered.map((d, i) => ({ dev: d, rank: i + 1 })),
    [filtered]
  );

  // Headline statistics
  const headlineStats = useMemo(() => {
    const all = developers;
    const avgDelivery =
      all.reduce((s, d) => s + d.deliveryScore, 0) / all.length;
    const top = [...all].sort((a, b) => b.overallScore - a.overallScore)[0];
    return {
      total: all.length,
      avgDelivery: avgDelivery.toFixed(1),
      topName: top?.name ?? "—",
      topScore: top?.overallScore.toFixed(1) ?? "—",
    };
  }, []);

  // Cross-tool nav: jump to neighborhood-report (or future developer detail
  // tools) via the workspace router. We don't have a `developer-detail`
  // app slug yet, so for now we keep the developer's id in the URL by
  // forwarding it as initialParams to a sibling tool when one exists.
  // For unknown developer ids, fall back to a no-op so we never break the
  // workspace shell.
  const handleOpenDeveloper = useCallback(
    (id: string) => {
      // On mobile, surface the developer detail in a slide-up sheet so
      // the user doesn't have to leave the leaderboard. On desktop the
      // legacy behaviour stands — push them into the developer-pipeline
      // workspace where there's room to compare side-by-side.
      if (isMobile) {
        setMobileDetailId(id);
        return;
      }
      openApp("developer-pipeline", { developer: id });
    },
    [openApp, isMobile]
  );

  const mobileDetailDev = mobileDetailId
    ? developers.find((d) => d.id === mobileDetailId) ?? null
    : null;

  if (isMobile) {
    return (
      <div
        data-tool-theme="research"
        data-tool="developer-track-record"
        className="tool-shell relative h-full w-full overflow-y-auto bg-app text-app"
      >
        <ToolAppHeader
          total={headlineStats.total}
          avgDelivery={headlineStats.avgDelivery}
          topName={headlineStats.topName}
          topScore={headlineStats.topScore}
          stack={stackHeader}
        />

        <MobileSearchableList
          search={search}
          onSearch={setSearch}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          sortBy={sortBy}
          onSortBy={setSortBy}
          ranked={ranked}
          onTap={(id) => setMobileDetailId(id)}
        />

        <MobileSheet
          open={mobileDetailDev !== null}
          onClose={() => setMobileDetailId(null)}
          title={mobileDetailDev?.name ?? "Developer"}
        >
          {mobileDetailDev && (
            <DeveloperDetailContent
              dev={mobileDetailDev}
              onOpenPipeline={() => {
                setMobileDetailId(null);
                openApp("developer-pipeline", { developer: mobileDetailDev.id });
              }}
            />
          )}
        </MobileSheet>
      </div>
    );
  }

  return (
    <div
      data-tool-theme="research"
      data-tool="developer-track-record"
      className="tool-shell relative h-full w-full overflow-y-auto bg-app text-app"
    >
      <ToolAppHeader
        total={headlineStats.total}
        avgDelivery={headlineStats.avgDelivery}
        topName={headlineStats.topName}
        topScore={headlineStats.topScore}
        stack={stackHeader}
      />

      <main className="px-4 sm:px-6 pt-5 pb-10 max-w-6xl mx-auto">
        {/* Sub-view tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-xl border border-app bg-app-elevated p-1">
            {SUB_VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  view === v.value
                    ? "bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/40"
                    : "text-secondary hover:text-app"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-tool-accent tabular-nums font-semibold">
            {filtered.length} / {developers.length}
          </span>
        </div>

        {/* Filters bar */}
        <div className="rounded-2xl border border-app bg-app-elevated p-3 sm:p-4 mb-5">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search developers, areas, projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-app border border-app text-sm text-app placeholder:text-muted outline-none focus:border-app-focus focus:ring-2 focus:ring-tool-accent/30 transition-all"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx={11} cy={11} r={8} />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-app border border-app text-sm text-app outline-none focus:border-app-focus transition-colors appearance-none cursor-pointer"
            >
              {TAG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-9 px-3 rounded-lg bg-app border border-app text-sm text-app outline-none focus:border-app-focus transition-colors appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {view === "leaderboard" && (
          <>
            {/* Leaderboard column header — sortable. Hidden on narrow widths
                because the row variant collapses too. */}
            {showColumnHeader && (
              <div
                className="grid gap-3 px-4 mb-2 text-[9px]"
                style={{
                  gridTemplateColumns:
                    width >= MD_BREAKPOINT
                      ? "44px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) 88px"
                      : "44px minmax(0, 1.4fr) minmax(0, 1fr) 88px",
                }}
              >
                <span className="text-center text-muted uppercase tracking-widest">
                  Rank
                </span>
                <SortHeader
                  label="Developer"
                  value="name"
                  active={sortBy}
                  onClick={setSortBy}
                />
                <SortHeader
                  label="Score Bars"
                  value="delivery"
                  active={sortBy}
                  onClick={setSortBy}
                />
                {width >= MD_BREAKPOINT && (
                  <span className="text-muted uppercase tracking-widest">
                    History
                  </span>
                )}
                <div className="flex justify-end">
                  <SortHeader
                    label="Trust"
                    value="overall"
                    active={sortBy}
                    onClick={setSortBy}
                    className="justify-end"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {ranked.map(({ dev, rank }) => (
                  <LeaderRow
                    key={dev.id}
                    dev={dev}
                    rank={rank}
                    width={width}
                    onOpenDeveloper={handleOpenDeveloper}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}

        {view === "podium" && (
          <PodiumView ranked={ranked} onOpenDeveloper={handleOpenDeveloper} />
        )}
        {view === "compare" && (
          <SpreadView ranked={ranked} onOpenDeveloper={handleOpenDeveloper} />
        )}

        {filtered.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-dashed border-app bg-app-elevated">
            <p className="text-secondary text-sm">
              No developers match your search.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
