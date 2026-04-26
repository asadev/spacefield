// Shared region utility — 10-region market preference and path mapping.
// Nav dropdown and Dashboard use this to stay in sync.

export type Region =
  | "uae"
  | "uk"
  | "monaco"
  | "tokyo"
  | "singapore"
  | "usa"
  | "spain"
  | "portugal"
  | "turkey"
  | "saudi";

export const ALL_REGIONS: Region[] = [
  "uae",
  "uk",
  "monaco",
  "tokyo",
  "singapore",
  "usa",
  "spain",
  "portugal",
  "turkey",
  "saudi",
];

const STORAGE_KEY = "preferred-region";
const EVENT_NAME = "region-preference-change";

const VALID_REGIONS = new Set<Region>(ALL_REGIONS);

function asRegion(v: string | null | undefined): Region | null {
  return v && VALID_REGIONS.has(v as Region) ? (v as Region) : null;
}

/** Read current region preference from localStorage (SSR-safe). */
export function getRegion(): Region {
  if (typeof window === "undefined") return "uae";
  try {
    const v = asRegion(window.localStorage.getItem(STORAGE_KEY));
    if (v) return v;
  } catch {}
  return "uae";
}

/** Persist region preference and notify all subscribers in the same tab. */
export function setRegion(region: Region) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, region);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: region }));
  } catch {}
}

/**
 * Subscribe to region changes in this tab AND other tabs.
 * Returns an unsubscribe function.
 */
export function subscribeRegion(callback: (region: Region) => void) {
  if (typeof window === "undefined") return () => {};

  const customHandler = (e: Event) => {
    const detail = asRegion((e as CustomEvent).detail);
    if (detail) callback(detail);
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = asRegion(e.newValue);
    if (next) callback(next);
  };

  window.addEventListener(EVENT_NAME, customHandler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, customHandler);
    window.removeEventListener("storage", storageHandler);
  };
}

/** Each region has a path prefix under /. UAE is the root. */
const REGION_PREFIX: Record<Region, string> = {
  uae: "",
  uk: "/uk",
  monaco: "/monaco",
  tokyo: "/tokyo",
  singapore: "/singapore",
  usa: "/usa",
  spain: "/spain",
  portugal: "/portugal",
  turkey: "/turkey",
  saudi: "/saudi",
};

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export const isUKPath = (p: string) => matchesPrefix(p, "/uk");
export const isMonacoPath = (p: string) => matchesPrefix(p, "/monaco");
export const isTokyoPath = (p: string) => matchesPrefix(p, "/tokyo");
export const isSingaporePath = (p: string) => matchesPrefix(p, "/singapore");
export const isUSAPath = (p: string) => matchesPrefix(p, "/usa");
export const isSpainPath = (p: string) => matchesPrefix(p, "/spain");
export const isPortugalPath = (p: string) => matchesPrefix(p, "/portugal");
export const isTurkeyPath = (p: string) => matchesPrefix(p, "/turkey");
export const isSaudiPath = (p: string) => matchesPrefix(p, "/saudi");

/** Detect region from a path; returns "uae" for UAE-regional, null for neutral */
export function regionFromPath(pathname: string): Region | null {
  if (isUKPath(pathname)) return "uk";
  if (isMonacoPath(pathname)) return "monaco";
  if (isTokyoPath(pathname)) return "tokyo";
  if (isSingaporePath(pathname)) return "singapore";
  if (isUSAPath(pathname)) return "usa";
  if (isSpainPath(pathname)) return "spain";
  if (isPortugalPath(pathname)) return "portugal";
  if (isTurkeyPath(pathname)) return "turkey";
  if (isSaudiPath(pathname)) return "saudi";
  if (isNeutralPath(pathname)) return null;
  return "uae";
}

/**
 * Neutral paths are shared across regions (auth, dashboard, leaderboard, legal).
 * Visiting these doesn't change the preferred region.
 */
export function isNeutralPath(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname.startsWith("/auth/") || pathname === "/auth") return true;
  if (pathname === "/leaderboard") return true;
  if (pathname === "/privacy" || pathname === "/terms") return true;
  if (pathname === "/delete-account") return true;
  if (pathname === "/audit" || pathname.startsWith("/audit/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/solutions" || pathname.startsWith("/solutions/")) return true;
  return false;
}

/** Tool slugs per region — used for safe path mapping */
export const UK_TOOL_SLUGS = new Set([
  "mortgage-calculator",
  "stamp-duty-calculator",
  "roi-calculator",
  "rent-vs-buy",
  "yield-heatmap",
  "deal-scoring",
  "property-valuation",
  "market-pulse",
  "investment-advisor",
  "area-comparison",
  "neighborhood-report",
  "cash-flow-modeler",
  "portfolio-tracker",
  "property-comparison",
  "commission-calculator",
  "tenant-screening",
  "due-diligence",
]);

export const MONACO_TOOL_SLUGS = new Set([
  "mortgage-calculator",
  "registration-tax-calculator",
  "roi-calculator",
  "rent-vs-buy",
  "commission-calculator",
  "yield-heatmap",
  "deal-scoring",
  "property-valuation",
  "market-pulse",
  "investment-advisor",
  "area-comparison",
  "neighborhood-report",
  "cash-flow-modeler",
  "portfolio-tracker",
  "property-comparison",
  "residency-checker",
  "tenant-screening",
  "due-diligence",
]);

export const TOKYO_TOOL_SLUGS = new Set([
  "mortgage-calculator",
  "acquisition-tax-calculator",
  "roi-calculator",
  "rent-vs-buy",
  "commission-calculator",
  "yield-heatmap",
  "deal-scoring",
  "property-valuation",
  "market-pulse",
  "investment-advisor",
  "area-comparison",
  "neighborhood-report",
  "cash-flow-modeler",
  "portfolio-tracker",
  "property-comparison",
  "foreign-ownership-checker",
  "tenant-screening",
  "due-diligence",
]);

export const SINGAPORE_TOOL_SLUGS = new Set([
  "mortgage-calculator",
  "absd-calculator",
  "roi-calculator",
  "rent-vs-buy",
  "commission-calculator",
  "yield-heatmap",
  "deal-scoring",
  "property-valuation",
  "market-pulse",
  "investment-advisor",
  "area-comparison",
  "neighborhood-report",
  "cash-flow-modeler",
  "portfolio-tracker",
  "property-comparison",
  "foreign-buyer-checker",
  "tenant-screening",
  "due-diligence",
]);

// Common 16 tools shared across the new regions + 1 region-specific tool = 17 each.
const COMMON_TOOLS = [
  "mortgage-calculator",
  "roi-calculator",
  "rent-vs-buy",
  "commission-calculator",
  "yield-heatmap",
  "deal-scoring",
  "property-valuation",
  "market-pulse",
  "investment-advisor",
  "area-comparison",
  "neighborhood-report",
  "cash-flow-modeler",
  "portfolio-tracker",
  "property-comparison",
  "tenant-screening",
  "due-diligence",
];

export const USA_TOOL_SLUGS = new Set([...COMMON_TOOLS, "closing-cost-calculator"]);
export const SPAIN_TOOL_SLUGS = new Set([...COMMON_TOOLS, "itp-calculator"]);
export const PORTUGAL_TOOL_SLUGS = new Set([...COMMON_TOOLS, "imt-calculator"]);
export const TURKEY_TOOL_SLUGS = new Set([...COMMON_TOOLS, "citizenship-eligibility"]);
export const SAUDI_TOOL_SLUGS = new Set([...COMMON_TOOLS, "premium-residency-checker"]);

const TOOL_SLUGS_BY_REGION: Record<Region, Set<string>> = {
  uae: new Set(), // UAE has its own 28 tools, checked against directory instead
  uk: UK_TOOL_SLUGS,
  monaco: MONACO_TOOL_SLUGS,
  tokyo: TOKYO_TOOL_SLUGS,
  singapore: SINGAPORE_TOOL_SLUGS,
  usa: USA_TOOL_SLUGS,
  spain: SPAIN_TOOL_SLUGS,
  portugal: PORTUGAL_TOOL_SLUGS,
  turkey: TURKEY_TOOL_SLUGS,
  saudi: SAUDI_TOOL_SLUGS,
};

/** Strip region prefix to get the "base" path. */
function stripRegionPrefix(pathname: string): string {
  for (const region of ALL_REGIONS) {
    const prefix = REGION_PREFIX[region];
    if (!prefix) continue;
    if (pathname.startsWith(prefix + "/")) return pathname.slice(prefix.length);
    if (pathname === prefix) return "/";
  }
  return pathname;
}

/**
 * Non-UAE regions have a flat section structure: /section (index only) plus
 * /tools/[slug] and /blog/[slug] as the only supported deeper routes. Any
 * other sub-path would 404 in the target region, so we strip back to the
 * section root instead.
 */
const NON_UAE_DEEP_SECTIONS = new Set(["tools", "blog"]);

/**
 * Smart path mapping with fallbacks for region-specific content.
 * - /tools/X → /<target>/tools/X if X exists in target, else /<target>/tools
 * - /games/* → only in UAE → target region home
 * - /community/events, /community/profile, /learn/<course>, etc.
 *     → /<target>/<section> (non-UAE regions don't have deeper routes yet)
 * - Neutral paths stay put
 */
export function safePathMap(pathname: string, target: Region): string {
  const base = stripRegionPrefix(pathname);

  // Neutral paths stay put
  if (isNeutralPath(base)) return base;

  const prefix = REGION_PREFIX[target];

  // UAE = root; return base path
  if (target === "uae") {
    return base === "" ? "/" : base;
  }

  // Games only exist in UAE
  if (base.startsWith("/games")) {
    return prefix || "/";
  }

  // Check tool existence in target region
  const allowedTools = TOOL_SLUGS_BY_REGION[target];
  if (allowedTools.size > 0 && base.startsWith("/tools/")) {
    const slug = base.split("/")[2];
    if (slug && !allowedTools.has(slug)) {
      return `${prefix}/tools`;
    }
    // Known slug → map 1:1
    return prefix + base;
  }

  // Non-UAE regions: collapse any deeper sub-path of a section to the section root,
  // except for /blog/[slug] which exists everywhere.
  const segments = base.split("/").filter(Boolean);
  if (segments.length > 1) {
    const section = segments[0];
    if (!NON_UAE_DEEP_SECTIONS.has(section)) {
      return `${prefix}/${section}`;
    }
  }

  return base === "/" ? prefix : prefix + base;
}

/** Human label for a region */
export const REGION_LABELS: Record<Region, string> = {
  uae: "UAE RE Intelligence",
  uk: "UK RE Intelligence",
  monaco: "Monaco RE Intelligence",
  tokyo: "Tokyo RE Intelligence",
  singapore: "Singapore RE Intelligence",
  usa: "USA RE Intelligence",
  spain: "Spain RE Intelligence",
  portugal: "Portugal RE Intelligence",
  turkey: "Turkey RE Intelligence",
  saudi: "Saudi RE Intelligence",
};

/** Short label for toggle buttons */
export const REGION_SHORT: Record<Region, string> = {
  uae: "UAE",
  uk: "UK",
  monaco: "Monaco",
  tokyo: "Tokyo",
  singapore: "Singapore",
  usa: "USA",
  spain: "Spain",
  portugal: "Portugal",
  turkey: "Turkey",
  saudi: "Saudi",
};

/** Market label for dashboard */
export const REGION_MARKET_LABEL: Record<Region, string> = {
  uae: "United Arab Emirates",
  uk: "United Kingdom",
  monaco: "Monaco",
  tokyo: "Tokyo / Japan",
  singapore: "Singapore",
  usa: "United States",
  spain: "Spain",
  portugal: "Portugal",
  turkey: "Turkey",
  saudi: "Saudi Arabia",
};
