/**
 * Single source of truth for sitemap entry construction.
 *
 * Each function returns canonical absolute URLs for a section. We keep this
 * as plain data (no XML rendering here) so it can also feed future needs —
 * the /audit dashboard, internal linking reports, etc.
 */
import { ALL_REGIONS, type Region } from "@/lib/region";
import {
  UK_TOOL_SLUGS,
  MONACO_TOOL_SLUGS,
  TOKYO_TOOL_SLUGS,
  SINGAPORE_TOOL_SLUGS,
  USA_TOOL_SLUGS,
  SPAIN_TOOL_SLUGS,
  PORTUGAL_TOOL_SLUGS,
  TURKEY_TOOL_SLUGS,
  SAUDI_TOOL_SLUGS,
} from "@/lib/region";

export const BASE_URL = "https://example.com";

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

/** UAE (root) RE tool slugs — drawn from app/tools/ directory. */
export const UAE_TOOL_SLUGS = [
  "affordability",
  "area-comparison",
  "cash-flow-modeler",
  "commission-calculator",
  "deal-scoring",
  "developer-pipeline",
  "developer-track-record",
  "dld-fee-calculator",
  "due-diligence",
  "global-market-comparison",
  "golden-visa-checker",
  "investment-advisor",
  "investment-simulator",
  "market-pulse",
  "mortgage-calculator",
  "neighborhood-report",
  "offplan-analyzer",
  "portfolio-tracker",
  "property-comparison",
  "property-poster-creator",
  "property-valuation",
  "regulation-monitor",
  "rent-vs-buy",
  "roi-calculator",
  "sales-offer-generator",
  "service-charge-comparison",
  "tenant-screening",
  "yield-heatmap",
];

/** Per-region RE tool slugs (UAE handled separately). */
export const TOOL_SLUGS_BY_REGION: Record<Region, readonly string[]> = {
  uae: UAE_TOOL_SLUGS,
  uk: Array.from(UK_TOOL_SLUGS),
  monaco: Array.from(MONACO_TOOL_SLUGS),
  tokyo: Array.from(TOKYO_TOOL_SLUGS),
  singapore: Array.from(SINGAPORE_TOOL_SLUGS),
  usa: Array.from(USA_TOOL_SLUGS),
  spain: Array.from(SPAIN_TOOL_SLUGS),
  portugal: Array.from(PORTUGAL_TOOL_SLUGS),
  turkey: Array.from(TURKEY_TOOL_SLUGS),
  saudi: Array.from(SAUDI_TOOL_SLUGS),
};

/** Path prefix for each region (UAE = root). */
export function regionPrefix(region: Region): string {
  return region === "uae" ? "" : `/${region}`;
}

/** Sections present on every region home. */
export const REGION_SECTIONS = [
  "",
  "/about",
  "/tools",
  "/blog",
  "/community",
  "/learn",
  "/market",
] as const;

/** All region home URLs + their section indexes. */
export function coreRegionEntries(now: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const region of ALL_REGIONS) {
    const prefix = regionPrefix(region);
    for (const section of REGION_SECTIONS) {
      const loc = `${BASE_URL}${prefix}${section}` || BASE_URL;
      out.push({
        loc,
        lastmod: now,
        changefreq: section === "" || section === "/market" ? "daily" : "weekly",
        priority:
          section === ""
            ? region === "uae"
              ? 1.0
              : 0.9
            : section === "/tools"
              ? 0.9
              : 0.8,
      });
    }
  }
  return out;
}

/** UAE-only marketing / neutral pages. */
export function coreNeutralEntries(now: string): SitemapEntry[] {
  return [
    { loc: `${BASE_URL}/solutions`, lastmod: now, changefreq: "daily", priority: 0.9 },
    { loc: `${BASE_URL}/solutions/tools`, lastmod: now, changefreq: "weekly", priority: 0.9 },
    { loc: `${BASE_URL}/systems`, lastmod: now, changefreq: "monthly", priority: 0.7 },
    { loc: `${BASE_URL}/games`, lastmod: now, changefreq: "weekly", priority: 0.8 },
    { loc: `${BASE_URL}/leaderboard`, lastmod: now, changefreq: "daily", priority: 0.6 },
    { loc: `${BASE_URL}/network`, lastmod: now, changefreq: "weekly", priority: 0.9 },
    { loc: `${BASE_URL}/network/apply`, lastmod: now, changefreq: "monthly", priority: 0.6 },
    { loc: `${BASE_URL}/privacy`, lastmod: now, changefreq: "yearly", priority: 0.3 },
    { loc: `${BASE_URL}/terms`, lastmod: now, changefreq: "yearly", priority: 0.3 },
    { loc: `${BASE_URL}/delete-account`, lastmod: now, changefreq: "yearly", priority: 0.2 },
  ];
}

/** XML-escape a URL (only the characters that matter for <loc>). */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Render a list of entries as a urlset XML document. */
export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`  <url>`, `    <loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (typeof e.priority === "number")
        parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      parts.push(`  </url>`);
      return parts.join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">\n${urls}\n</urlset>\n`;
}

export function xmlResponse(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Revalidate sitemaps hourly — DB-backed sources (blog posts, brokers)
      // change, but not minute-by-minute. Tunable.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
