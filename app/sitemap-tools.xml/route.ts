import {
  BASE_URL,
  TOOL_SLUGS_BY_REGION,
  regionPrefix,
  renderUrlset,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/seo/sitemap-sources";
import { ALL_REGIONS } from "@/lib/region";
import { SOLUTION_TOOLS } from "@/app/solutions/_data/tools";
import { developers } from "@/lib/developer-data";
import { communities } from "@/lib/neighborhood-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date().toISOString();
  const entries: SitemapEntry[] = [];

  // RE tools across all 10 regions
  for (const region of ALL_REGIONS) {
    const prefix = regionPrefix(region);
    for (const slug of TOOL_SLUGS_BY_REGION[region]) {
      entries.push({
        loc: `${BASE_URL}${prefix}/tools/${slug}`,
        lastmod: now,
        changefreq: "weekly",
        priority: region === "uae" ? 0.8 : 0.7,
      });
    }
  }

  // Games (UAE only)
  const GAMES = [
    "area-detective",
    "blind-valuation",
    "brokers-gauntlet",
    "flip-or-hold",
    "market-prediction",
    "portfolio-wars",
    "property-tycoon",
    "regulation-gauntlet",
  ];
  for (const slug of GAMES) {
    entries.push({
      loc: `${BASE_URL}/games/${slug}`,
      lastmod: now,
      changefreq: "monthly",
      priority: 0.6,
    });
  }

  // Courses (UAE /learn)
  const COURSES = [
    "dubai-re-101",
    "due-diligence-masterclass",
    "investment-analysis",
    "offplan-strategy",
    "rera-certification",
    "client-advisory",
    "digital-marketing-agents",
    "luxury-specialist",
    "brokerage-operations",
    "ai-automation-re",
    "market-intelligence",
    "legal-framework",
  ];
  for (const slug of COURSES) {
    entries.push({
      loc: `${BASE_URL}/learn/${slug}`,
      lastmod: now,
      changefreq: "monthly",
      priority: 0.7,
    });
  }

  // UAE tool sub-resources: developer detail, neighborhood detail
  for (const d of developers) {
    entries.push({
      loc: `${BASE_URL}/tools/developer-track-record/${d.id}`,
      lastmod: now,
      changefreq: "monthly",
      priority: 0.5,
    });
  }
  for (const c of communities) {
    entries.push({
      loc: `${BASE_URL}/tools/neighborhood-report/${c.id}`,
      lastmod: now,
      changefreq: "monthly",
      priority: 0.5,
    });
  }

  // Solutions tools (cross-industry business utilities)
  for (const t of SOLUTION_TOOLS) {
    entries.push({
      loc: `${BASE_URL}/solutions/tools/${t.slug}`,
      lastmod: now,
      changefreq: "weekly",
      priority: 0.7,
    });
  }

  return xmlResponse(renderUrlset(entries));
}
