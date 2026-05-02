import { TOOL_ICONS } from "./tools-list";
import type { IndustryKey } from "./industries";

/**
 * A "profession" in this context is really an industry + role combo. Onboarding
 * now asks for an industry first, then shows roles filtered by that industry.
 *
 * We keep this as a flat list (rather than nesting) because:
 *  - persistence code already stores a single string profession key
 *  - existing RE roles (investor/agent/...) stay stable and backwards-compatible
 */
export type ProfessionKey =
  // Real estate (original)
  | "investor"
  | "agent"
  | "broker"
  | "developer"
  | "property-manager"
  | "buyer"
  | "everything"
  // Cross-industry
  | "marketing-lead"
  | "salesperson"
  | "hr-lead"
  | "finance"
  | "ops"
  | "designer"
  | "product"
  | "engineer"
  | "customer-support"
  | "content-creator"
  | "consultant"
  | "founder"
  | "generalist";

export interface Profession {
  key: ProfessionKey;
  label: string;
  tagline: string;
  icon: keyof typeof TOOL_ICONS;
  industry: IndustryKey;
  /** tool slugs to preinstall for this role */
  preinstalled: string[];
}

/* A starter set per profession. Users can toggle any tool during setup. */
export const PROFESSIONS: Profession[] = [
  /* ────────── Real Estate (default industry) ────────── */
  {
    key: "investor",
    label: "Investor",
    tagline: "Buying property for yield or appreciation.",
    icon: "trending",
    industry: "real-estate",
    preinstalled: [
      "investment-advisor",
      "property-valuation",
      "deal-scoring",
      "roi-calculator",
      "rent-vs-buy",
      "cash-flow-modeler",
      "portfolio-tracker",
      "market-pulse",
      "yield-heatmap",
      "neighborhood-report",
    ],
  },
  {
    key: "agent",
    label: "Agent",
    tagline: "Selling properties and closing deals.",
    icon: "users",
    industry: "real-estate",
    preinstalled: [
      "sales-offer-generator",
      "property-poster-creator",
      "commission-calculator",
      "property-valuation",
      "deal-scoring",
      "neighborhood-report",
      "property-comparison",
      "market-pulse",
    ],
  },
  {
    key: "broker",
    label: "Broker / Brokerage",
    tagline: "Running deals + a team across regions.",
    icon: "trophy",
    industry: "real-estate",
    preinstalled: [
      "sales-offer-generator",
      "property-poster-creator",
      "commission-calculator",
      "deal-scoring",
      "market-pulse",
      "regulation-monitor",
      "due-diligence",
      "dld-fee-calculator",
      "developer-track-record",
      "yield-heatmap",
    ],
  },
  {
    key: "developer",
    label: "Developer",
    tagline: "Building and launching projects.",
    icon: "building",
    industry: "real-estate",
    preinstalled: [
      "developer-pipeline",
      "developer-track-record",
      "area-comparison",
      "regulation-monitor",
      "market-pulse",
      "global-market-comparison",
    ],
  },
  {
    key: "property-manager",
    label: "Property Manager",
    tagline: "Managing rentals and service charges.",
    icon: "portfolio",
    industry: "real-estate",
    preinstalled: [
      "tenant-screening",
      "service-charge-comparison",
      "regulation-monitor",
      "cash-flow-modeler",
      "portfolio-tracker",
      "neighborhood-report",
    ],
  },
  {
    key: "buyer",
    label: "Home Buyer",
    tagline: "Buying a home to live in.",
    icon: "home",
    industry: "real-estate",
    preinstalled: [
      "property-valuation",
      "mortgage-calculator",
      "affordability",
      "dld-fee-calculator",
      "rent-vs-buy",
      "neighborhood-report",
      "golden-visa-checker",
      "area-comparison",
    ],
  },
  {
    key: "everything",
    label: "Just exploring",
    tagline: "Install a broad starter set and try anything.",
    icon: "compass",
    industry: "real-estate",
    preinstalled: [], // special-cased to mean "top rated across the board"
  },

  /* ────────── Marketing ────────── */
  {
    key: "marketing-lead",
    label: "Marketing Lead",
    tagline: "Acquisition, funnels, content, paid.",
    icon: "megaphone",
    industry: "marketing",
    preinstalled: [
      "cac-ltv",
      "ab-test-sample-size",
      "email-roi",
      "keyword-difficulty",
      "engagement-rate",
      "ad-budget-allocator",
      "seo-meta-tags",
      "headline-analyzer",
    ],
  },
  {
    key: "content-creator",
    label: "Content & SEO",
    tagline: "Writing, optimizing, publishing.",
    icon: "pen",
    industry: "marketing",
    preinstalled: [
      "readability-score",
      "word-count",
      "seo-meta-tags",
      "headline-analyzer",
      "content-brief-builder",
      "keyword-difficulty",
      "engagement-rate",
      "influencer-roi",
    ],
  },

  /* ────────── Sales ────────── */
  {
    key: "salesperson",
    label: "Sales / AE",
    tagline: "Pipeline, deals, quota.",
    icon: "funnel",
    industry: "sales",
    preinstalled: [
      "pipeline-forecast",
      "commission-calc",
      "lead-scoring-rubric",
      "quote-builder",
      "pipeline-dashboard",
      "deal-pipeline-board",
      "meddpicc-scorecard",
      "bant-qualifier",
      "sdr-cadence-builder",
      "sales-call-script-builder",
      "proposal-generator",
    ],
  },

  /* ────────── HR & People ────────── */
  {
    key: "hr-lead",
    label: "HR / People",
    tagline: "Hiring, headcount, retention.",
    icon: "users",
    industry: "hr",
    preinstalled: [
      "cost-per-hire",
      "turnover-rate",
      "compa-ratio",
      "pto-accrual",
      "360-review-template",
      "onboarding-checklist",
      "salary-benchmark",
      "termination-letter-generator",
      "gross-to-net-salary",
    ],
  },

  /* ────────── Finance ────────── */
  {
    key: "finance",
    label: "Finance / CFO",
    tagline: "Models, cash, runway, forecasts.",
    icon: "wallet",
    industry: "finance",
    preinstalled: [
      "npv-irr",
      "cash-burn-runway",
      "runway-scenarios",
      "discounted-cash-flow",
      "venture-dilution-modeler",
      "subscription-ltv-advanced",
      "break-even",
    ],
  },

  /* ────────── Operations & Support ────────── */
  {
    key: "ops",
    label: "Operations",
    tagline: "SOPs, projects, productivity.",
    icon: "refresh",
    industry: "ops",
    preinstalled: [
      "sop-builder",
      "okr-tracker",
      "okr-dashboard",
      "project-estimator",
      "eisenhower-matrix",
      "timesheet-summarizer",
      "metrics-dashboard",
    ],
  },
  {
    key: "customer-support",
    label: "Customer Support / SRE",
    tagline: "SLAs, incidents, on-call, runbooks.",
    icon: "shield",
    industry: "ops",
    preinstalled: [
      "sla-calculator",
      "incident-postmortem-template",
      "ticket-backlog-tracker",
      "mean-time-to-resolution",
      "runbook-builder",
      "status-page-generator",
      "escalation-matrix",
      "capacity-planner",
      "uptime-cost-calculator",
      "kpi-dashboard",
      "support-volume-forecaster",
    ],
  },

  /* ────────── Product & Engineering ────────── */
  {
    key: "product",
    label: "Product Manager",
    tagline: "Roadmap, metrics, experiments.",
    icon: "flow",
    industry: "product",
    preinstalled: [
      "okr-dashboard",
      "north-star-metric-builder",
      "growth-experiment-tracker",
      "ab-test-sample-size",
      "positioning-canvas",
      "planning-poker",
      "scrum-velocity",
      "metrics-dashboard",
    ],
  },
  {
    key: "engineer",
    label: "Engineer / Developer",
    tagline: "Everyday dev utilities.",
    icon: "code",
    industry: "product",
    preinstalled: [
      "json-formatter",
      "regex-tester",
      "id-generator",
      "cron-expression-parser",
      "csv-json-converter",
      "markdown-preview",
    ],
  },

  /* ────────── Design ────────── */
  {
    key: "designer",
    label: "Designer",
    tagline: "Palettes, type, contrast, brand.",
    icon: "palette",
    industry: "design",
    preinstalled: [
      "color-palette-extractor",
      "contrast-checker",
      "font-pairing",
      "headline-analyzer",
      "readability-score",
      "content-brief-builder",
    ],
  },

  /* ────────── Consulting & Services ────────── */
  {
    key: "consultant",
    label: "Consultant",
    tagline: "Proposals, retainers, client delivery.",
    icon: "briefcase",
    industry: "consulting",
    preinstalled: [
      "project-estimator",
      "proposal-generator",
      "invoice-generator",
      "quote-builder",
      "nda-generator",
      "contract-risk-checker",
      "sop-builder",
      "positioning-canvas",
    ],
  },

  /* ────────── Founder / Generalist ────────── */
  {
    key: "founder",
    label: "Founder / CEO",
    tagline: "Strategy, fundraising, team, numbers.",
    icon: "star",
    industry: "other",
    preinstalled: [
      "cash-burn-runway",
      "runway-scenarios",
      "venture-dilution-modeler",
      "pricing-calculator",
      "positioning-canvas",
      "north-star-metric-builder",
      "cac-ltv",
      "okr-dashboard",
      "pipeline-dashboard",
    ],
  },
  {
    key: "generalist",
    label: "Just exploring",
    tagline: "Install a broad starter set and try anything.",
    icon: "compass",
    industry: "other",
    preinstalled: [], // special-cased → top-rated across all categories
  },
];

export function professionBySlug(key: string) {
  return PROFESSIONS.find((p) => p.key === key);
}

export function professionsByIndustry(industry: IndustryKey): Profession[] {
  return PROFESSIONS.filter((p) => p.industry === industry);
}
