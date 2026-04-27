"use client";

/* AppIcon — renders a tool's launcher-style squircle icon.
 *
 * The 278 SVGs under /public/app-icons/ are 1024×1024 rich icons from
 * the Spacefield Suite design (Claude Design handoff). The design's
 * locked aesthetic is "monochrome" — a desaturated take with no sheen,
 * no vignette, no rim, no saturation, ~24% corner radius.
 *
 * For tools that DON'T have a matching SVG (sheet/documents added
 * after the design, plus system icons like the launchpad-grid glyph),
 * we fall back to the legacy outline-path TOOL_ICONS map so nothing
 * goes blank.
 *
 * Theme: each tool ships __dark.svg + __light.svg variants. We pick
 * via `useTheme().resolved`. Mono filter removes the visible color
 * difference but keeps the lightness right for the surface.
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
  "activity-timeline",
  "ad-budget-allocator",
  "affordability",
  "area-comparison",
  "bant-qualifier",
  "base64-encoder",
  "break-even",
  "cac-ltv",
  "capacity-planner",
  "cash-burn-runway",
  "cash-flow-modeler",
  "churn-risk-calculator",
  "cohort-arr-projection",
  "cohort-retention",
  "color-palette-extractor",
  "commission-calc",
  "commission-calculator",
  "commission-statement",
  "compa-ratio",
  "compound-interest",
  "consent-form-generator",
  "contact-manager",
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
  "due-diligence",
  "eisenhower-matrix",
  "email-roi",
  "email-template-library",
  "engagement-rate",
  "escalation-matrix",
  "files-manager",
  "follow-up-reminder",
  "font-pairing",
  "global-market-comparison",
  "golden-visa-checker",
  "gross-to-net-salary",
  "growth-experiment-tracker",
  "hash-generator",
  "headline-analyzer",
  "http-status-reference",
  "id-generator",
  "incident-postmortem-template",
  "influencer-roi",
  "investment-advisor",
  "investment-simulator",
  "invoice-generator",
  "json-formatter",
  "jwt-decoder",
  "keyword-difficulty",
  "kpi-dashboard",
  "lead-capture-form-builder",
  "lead-scoring-rubric",
  "loan-calculator",
  "lorem-ipsum-generator",
  "markdown-preview",
  "market-pulse",
  "mean-time-to-resolution",
  "meddpicc-scorecard",
  "meeting-cost-calculator",
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
  "oncall-schedule-builder",
  "onboarding-checklist",
  "password-strength",
  "pipeline-dashboard",
  "pipeline-forecast",
  "pirate-metrics-tracker",
  "planning-poker",
  "portfolio-tracker",
  "positioning-canvas",
  "pricing-calculator",
  "project-estimator",
  "property-comparison",
  "property-poster-creator",
  "property-valuation",
  "proposal-generator",
  "pto-accrual",
  "qr-code-generator",
  "quote-builder",
  "readability-score",
  "regex-tester",
  "regulation-monitor",
  "rent-vs-buy",
  "roi-calculator",
  "rule-of-40",
  "runbook-builder",
  "runway-scenarios",
  "saas-quick-ratio",
  "salary-benchmark",
  "salary-hourly",
  "sales-call-script-builder",
  "sales-offer-generator",
  "savings-goal-planner",
  "scrum-velocity",
  "sdr-cadence-builder",
  "seo-meta-tags",
  "service-charge-comparison",
  "sla-calculator",
  "sop-builder",
  "status-page-generator",
  "subscription-ltv-advanced",
  "support-volume-forecaster",
  "tax-bracket-calculator",
  "tenant-screening",
  "termination-letter-generator",
  "territory-mapper",
  "ticket-backlog-tracker",
  "time-zone-planner",
  "timesheet-summarizer",
  "turnover-rate",
  "uptime-cost-calculator",
  "url-encoder-parser",
  "venture-dilution-modeler",
  "win-loss-analyzer",
  "word-count",
  "world-clock",
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
  /** Corner-radius percentage of size. Apple/squircle is ~24%. */
  cornerPct?: number;
  /** Optional className for the wrapper. */
  className?: string;
  /** Render as monochrome (saturate 0). True by default — matches the
   * locked design preset. Set false if a specific surface wants color. */
  mono?: boolean;
  /** A11y label. */
  label?: string;
  /** Tone-down the drop shadow (e.g. inside the dock where shadows
   * compound the surrounding chrome). */
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
  mono = true,
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
          boxShadow: flatShadow
            ? "0 1px 2px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.22)"
            : "0 1px 2px rgba(0,0,0,0.22), 0 8px 22px rgba(0,0,0,0.32), 0 14px 38px rgba(0,0,0,0.18)",
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
            filter: mono ? "saturate(0) brightness(1.04)" : undefined,
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
        background:
          theme === "dark"
            ? "linear-gradient(135deg, #1f2937, #0f172a)"
            : "linear-gradient(135deg, #f1f5f9, #cbd5e1)",
        boxShadow: flatShadow
          ? "0 1px 2px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.22)"
          : "0 1px 2px rgba(0,0,0,0.22), 0 8px 22px rgba(0,0,0,0.32), 0 14px 38px rgba(0,0,0,0.18)",
        color: theme === "dark" ? "#e5e7eb" : "#0f172a",
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
        style={{
          filter: mono ? "saturate(0)" : undefined,
        }}
      >
        <path d={path} />
      </svg>
    </span>
  );
}
