/**
 * Pick 3 related tools for the "you might also like" section on tool pages.
 *
 * Two sources:
 *  - Solutions tools (SOLUTION_TOOLS catalog) — same-category picks
 *  - RE tools — hand-curated cross-links per slug (see RE_RELATED) with
 *    fallback to a sensible default trio
 *
 * Kept data-only so it can be imported from server components without
 * dragging any client-side code.
 */
import { SOLUTION_TOOLS, type SolutionTool } from "@/app/solutions/_data/tools";

export type RelatedTool = {
  slug: string;
  title: string;
  description: string;
  href: string;
};

/** Pick up to `limit` same-category solutions tools (excluding `slug`). */
export function relatedSolutionsTools(slug: string, limit = 3): RelatedTool[] {
  const current = SOLUTION_TOOLS.find((t) => t.slug === slug);
  if (!current) return [];
  const peers = SOLUTION_TOOLS.filter(
    (t) => t.category === current.category && t.slug !== slug
  );
  return peers.slice(0, limit).map(toRelated);
}

function toRelated(t: SolutionTool): RelatedTool {
  return {
    slug: t.slug,
    title: t.title,
    description: t.description,
    href: `/solutions/tools/${t.slug}`,
  };
}

/**
 * Hand-curated RE tool cross-links. Each key maps to 3 slugs that make
 * sense as next-steps from the keyed tool. Missing slugs fall back to
 * DEFAULT_RE_TRIO.
 */
const DEFAULT_RE_TRIO = ["mortgage-calculator", "roi-calculator", "rent-vs-buy"];

const RE_RELATED: Record<string, string[]> = {
  "mortgage-calculator": ["affordability", "rent-vs-buy", "roi-calculator"],
  "affordability": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "roi-calculator": ["cash-flow-modeler", "yield-heatmap", "deal-scoring"],
  "rent-vs-buy": ["mortgage-calculator", "affordability", "roi-calculator"],
  "yield-heatmap": ["neighborhood-report", "area-comparison", "roi-calculator"],
  "deal-scoring": ["due-diligence", "investment-advisor", "property-valuation"],
  "property-valuation": ["area-comparison", "deal-scoring", "neighborhood-report"],
  "neighborhood-report": ["area-comparison", "yield-heatmap", "property-comparison"],
  "area-comparison": ["neighborhood-report", "yield-heatmap", "property-comparison"],
  "property-comparison": ["area-comparison", "deal-scoring", "property-valuation"],
  "investment-advisor": ["deal-scoring", "investment-simulator", "portfolio-tracker"],
  "investment-simulator": ["cash-flow-modeler", "investment-advisor", "portfolio-tracker"],
  "cash-flow-modeler": ["roi-calculator", "investment-simulator", "portfolio-tracker"],
  "portfolio-tracker": ["cash-flow-modeler", "investment-simulator", "roi-calculator"],
  "due-diligence": ["deal-scoring", "regulation-monitor", "developer-track-record"],
  "developer-track-record": ["developer-pipeline", "due-diligence", "offplan-analyzer"],
  "developer-pipeline": ["developer-track-record", "offplan-analyzer", "market-pulse"],
  "offplan-analyzer": ["developer-track-record", "developer-pipeline", "due-diligence"],
  "market-pulse": ["yield-heatmap", "global-market-comparison", "neighborhood-report"],
  "global-market-comparison": ["market-pulse", "yield-heatmap", "neighborhood-report"],
  "golden-visa-checker": ["affordability", "investment-advisor", "dld-fee-calculator"],
  "dld-fee-calculator": ["mortgage-calculator", "affordability", "commission-calculator"],
  "service-charge-comparison": ["area-comparison", "property-comparison", "yield-heatmap"],
  "tenant-screening": ["rent-vs-buy", "portfolio-tracker", "cash-flow-modeler"],
  "commission-calculator": ["mortgage-calculator", "dld-fee-calculator", "sales-offer-generator"],
  "sales-offer-generator": ["commission-calculator", "deal-scoring", "property-comparison"],
  "property-poster-creator": ["sales-offer-generator", "commission-calculator", "property-comparison"],
  "regulation-monitor": ["due-diligence", "golden-visa-checker", "market-pulse"],
  "stamp-duty-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "acquisition-tax-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "registration-tax-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "absd-calculator": ["mortgage-calculator", "roi-calculator", "foreign-buyer-checker"],
  "closing-cost-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "itp-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "imt-calculator": ["mortgage-calculator", "roi-calculator", "rent-vs-buy"],
  "citizenship-eligibility": ["mortgage-calculator", "roi-calculator", "deal-scoring"],
  "premium-residency-checker": ["mortgage-calculator", "roi-calculator", "deal-scoring"],
  "foreign-ownership-checker": ["mortgage-calculator", "roi-calculator", "deal-scoring"],
  "foreign-buyer-checker": ["mortgage-calculator", "roi-calculator", "absd-calculator"],
  "residency-checker": ["mortgage-calculator", "roi-calculator", "deal-scoring"],
};

const RE_TOOL_TITLES: Record<string, string> = {
  "mortgage-calculator": "Mortgage Calculator",
  "affordability": "Affordability Calculator",
  "roi-calculator": "ROI Calculator",
  "rent-vs-buy": "Rent vs Buy",
  "yield-heatmap": "Yield Heatmap",
  "deal-scoring": "Deal Scoring",
  "property-valuation": "Property Valuation",
  "neighborhood-report": "Neighborhood Report",
  "area-comparison": "Area Comparison",
  "property-comparison": "Property Comparison",
  "investment-advisor": "Investment Advisor",
  "investment-simulator": "Investment Simulator",
  "cash-flow-modeler": "Cash Flow Modeler",
  "portfolio-tracker": "Portfolio Tracker",
  "due-diligence": "Due Diligence",
  "developer-track-record": "Developer Track Record",
  "developer-pipeline": "Developer Pipeline",
  "offplan-analyzer": "Off-Plan Analyzer",
  "market-pulse": "Market Pulse",
  "global-market-comparison": "Global Market Comparison",
  "golden-visa-checker": "Golden Visa Checker",
  "dld-fee-calculator": "DLD Fee Calculator",
  "service-charge-comparison": "Service Charge Comparison",
  "tenant-screening": "Tenant Screening",
  "commission-calculator": "Commission Calculator",
  "sales-offer-generator": "Sales Offer Generator",
  "property-poster-creator": "Property Poster Creator",
  "regulation-monitor": "Regulation Monitor",
  "stamp-duty-calculator": "Stamp Duty Calculator",
  "acquisition-tax-calculator": "Acquisition Tax Calculator",
  "registration-tax-calculator": "Registration Tax Calculator",
  "absd-calculator": "ABSD Calculator",
  "closing-cost-calculator": "Closing Cost Calculator",
  "itp-calculator": "ITP Calculator",
  "imt-calculator": "IMT Calculator",
  "citizenship-eligibility": "Citizenship Eligibility",
  "premium-residency-checker": "Premium Residency Checker",
  "foreign-ownership-checker": "Foreign Ownership Checker",
  "foreign-buyer-checker": "Foreign Buyer Checker",
  "residency-checker": "Residency Checker",
};

/**
 * Pick 3 related RE tools for a given tool + region. Links are built
 * relative to the region (regionPrefix="" for UAE, "/uk" etc. otherwise).
 */
export function relatedReTools(
  slug: string,
  regionPrefix: string = "",
  limit = 3
): RelatedTool[] {
  const peers = RE_RELATED[slug] || DEFAULT_RE_TRIO;
  const uniquePeers = peers.filter((p) => p !== slug).slice(0, limit);
  return uniquePeers.map((p) => ({
    slug: p,
    title: RE_TOOL_TITLES[p] || p,
    description: "",
    href: `${regionPrefix}/tools/${p}`,
  }));
}
