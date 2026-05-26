"use client";

/* AppIcon — renders a tool's launcher icon.
 *
 * The 282 SVGs under /public/app-icons/ are flat Google-style icons
 * from the latest design handoff: per-tool unique glyph + palette,
 * 24%-radius squircle, premium minimal, no 3D / gloss / sheen / rim /
 * vignette. They're already in the desired "flat premium" form, so
 * NO post-filter is applied — colors render as designed.
 *
 * For system buttons that aren't tools (e.g. dock "All apps"), we
 * fall back to the legacy outline-path TOOL_ICONS map so nothing
 * goes blank.
 *
 * Theme: each tool ships __dark.svg + __light.svg variants picked
 * via `useTheme().resolved`. The light variant uses a near-white
 * background with deep ink; the dark variant flips to a midnight
 * background with light ink.
 */

import { useTheme } from "@/components/ThemeProvider";
import { TOOL_ICONS } from "../_data/tools-list";
import { useEffect, useState } from "react";

/* Slugs that ship under /public/app-icons/. Built from a `find` at
 * dev time — included inline so we can short-circuit the existence
 * check without a fetch round-trip for every render. */
const ICON_SLUGS = new Set<string>([
  "360-review-template",
  "ab-test-sample-size",
  "ad-budget-allocator",
  "affordability",
  "area-comparison",
  "bant-qualifier",
  "break-even",
  "cac-ltv",
  "capacity-planner",
  "cash-burn-runway",
  "cash-flow-modeler",
  "churn-risk-calculator",
  "color-palette-extractor",
  "commission-calc",
  "commission-calculator",
  "commission-statement",
  "compa-ratio",
  "consent-form-generator",
  "content-brief-builder",
  "contract-risk-checker",
  "contrast-checker",
  "cost-per-hire",
  "cron-expression-parser",
  "crypto-pnl-tracker",
  "csv-json-converter",
  "deal-pipeline-board",
  "deal-scoring",
  "debt-payoff",
  "developer-pipeline",
  "developer-track-record",
  "discounted-cash-flow",
  "dld-fee-calculator",
  "documents",
  "due-diligence",
  "eisenhower-matrix",
  "email-roi",
  "engagement-rate",
  "escalation-matrix",
  "font-pairing",
  "global-market-comparison",
  "golden-visa-checker",
  "gross-to-net-salary",
  "growth-experiment-tracker",
  "headline-analyzer",
  "id-generator",
  "incident-postmortem-template",
  "influencer-roi",
  "investment-advisor",
  "investment-simulator",
  "invoice-generator",
  "json-formatter",
  "keyword-difficulty",
  "kpi-dashboard",
  "lead-scoring-rubric",
  "markdown-preview",
  "market-pulse",
  "mean-time-to-resolution",
  "meddpicc-scorecard",
  "metrics-dashboard",
  "mortgage-calculator",
  "mortgage-refi",
  "nda-generator",
  "neighborhood-report",
  "north-star-metric-builder",
  "npv-irr",
  "offplan-analyzer",
  "okr-dashboard",
  "okr-tracker",
  "onboarding-checklist",
  "pipeline-dashboard",
  "pipeline-forecast",
  "planning-poker",
  "portfolio-tracker",
  "positioning-canvas",
  "pricing-calculator",
  "project-estimator",
  "poster-creator",
  "property-comparison",
  "property-valuation",
  "proposal-generator",
  "pto-accrual",
  "quote-builder",
  "readability-score",
  "regex-tester",
  "regulation-monitor",
  "rent-vs-buy",
  "roi-calculator",
  "runbook-builder",
  "runway-scenarios",
  "salary-benchmark",
  "salary-hourly",
  "sales-call-script-builder",
  "sales-offer-generator",
  "savings-goal-planner",
  "scrum-velocity",
  "sdr-cadence-builder",
  "seo-meta-tags",
  "service-charge-comparison",
  "sheets",
  "sla-calculator",
  "sop-builder",
  "status-page-generator",
  "subscription-ltv-advanced",
  "support-volume-forecaster",
  "tax-bracket-calculator",
  "tenant-screening",
  "termination-letter-generator",
  "ticket-backlog-tracker",
  "timesheet-summarizer",
  "turnover-rate",
  "uptime-cost-calculator",
  "venture-dilution-modeler",
  "win-loss-analyzer",
  "word-count",
  "yield-heatmap",
]);

export function hasAppIcon(slug: string): boolean {
  return ICON_SLUGS.has(slug);
}

interface AppIconProps {
  /** Tool slug — must match a file under /public/app-icons/. */
  slug?: string;
  /** Fallback path for tools without a matching SVG (legacy TOOL_ICONS key). */
  iconKey?: keyof typeof TOOL_ICONS;
  /** Pixel size of the rendered square. Defaults to 64. */
  size?: number;
  /** Corner-radius percentage of size. Google-flat is ~24%. */
  cornerPct?: number;
  /** Optional className for the wrapper. */
  className?: string;
  /** Deprecated — kept for prop compatibility with existing call sites.
   * The Google-flat icon set is already minimal, so we no longer apply
   * a saturate(0) post-filter. Setting this true is now a no-op. */
  mono?: boolean;
  /** A11y label. */
  label?: string;
  /** Drop the heavy elevated drop-shadow in favor of a near-flat one.
   * Used inside the dock where compounded chrome would otherwise feel
   * heavy. The Google-flat aesthetic prefers this even outside the
   * dock; we leave the elevated default for parity with prior surfaces. */
  flatShadow?: boolean;
}

/* Cheap server-render: pick `dark` until the client reads the actual
 * theme. Avoids a hydration mismatch — the `<img>` swap on mount is
 * imperceptible because the dark variant is already a reasonable
 * default for the most common surface (desktop wallpaper). */
function useResolvedTheme(): "light" | "dark" {
  const t = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return "dark";
  return (t.resolved as "light" | "dark") ?? "dark";
}

export default function AppIcon({
  slug,
  iconKey,
  size = 64,
  cornerPct = 24,
  className = "",
  // mono kept for prop-compat but no longer drives a filter; see prop docs.
  label,
  flatShadow = false,
}: AppIconProps) {
  const theme = useResolvedTheme();
  const radius = Math.round(size * (cornerPct / 100));

  // Real launcher SVG?
  if (slug && ICON_SLUGS.has(slug)) {
    return (
      <span
        className={className}
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          // Lighter, more diffuse shadow — matches the Google-flat
          // aesthetic. Heavy 3-stack drop shadow felt off against the
          // minimal icon style.
          boxShadow: flatShadow
            ? "0 1px 1px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.10)"
            : "0 1px 2px rgba(0,0,0,0.10), 0 6px 14px rgba(0,0,0,0.14)",
          flexShrink: 0,
        }}
        aria-label={label ?? slug}
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/app-icons/${slug}__${theme}.svg`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            userSelect: "none",
          }}
        />
      </span>
    );
  }

  // Fallback: legacy outline TOOL_ICONS path inside a flat squircle.
  const path = (iconKey && TOOL_ICONS[iconKey]) || TOOL_ICONS.home;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        background: theme === "dark" ? "#1f2937" : "#f3f4f6",
        boxShadow: flatShadow
          ? "0 1px 1px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.10)"
          : "0 1px 2px rgba(0,0,0,0.10), 0 6px 14px rgba(0,0,0,0.14)",
        color: theme === "dark" ? "#f3f4f6" : "#1f2937",
        flexShrink: 0,
      }}
      aria-label={label ?? slug ?? "tool"}
      role="img"
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  );
}
