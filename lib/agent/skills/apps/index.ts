/* Apps skill — Spacefield desktop apps, Tool Store, and product tool data.
 *
 * Installed apps live in the browser's workspace-local storage, so the
 * in-app chat sends a small ephemeral client context with the installed
 * slugs. This keeps those questions answerable without persisting desktop
 * UI state server-side.
 */

import {
  AREA_DATA,
  MARKET_SUMMARY,
  MONTHLY_VOLUMES,
  SUPPLY_PIPELINE,
} from "@/lib/market-pulse-data";
import { TOOL_CATEGORIES, TOOLS } from "@/app/tools/_data/tools-list";
import { toolOk } from "../_helpers";
import type {
  SkillDefinition,
  ToolDefinition,
  UserContext,
} from "@/lib/agent/runtime/types";

function compactApp(slug: string) {
  const app = TOOLS.find((t) => t.slug === slug);
  if (!app) return null;
  const category =
    TOOL_CATEGORIES.find((c) => c.key === app.category)?.label ?? app.category;
  return {
    slug: app.slug,
    title: app.title,
    description: app.description,
    category,
    route: app.route ?? `/tools/${app.slug}`,
    top_rated: Boolean(app.topRated),
  };
}

function findApp(slugOrTitle: string) {
  const needle = slugOrTitle.trim().toLowerCase();
  if (!needle) return null;
  return (
    TOOLS.find((t) => t.slug.toLowerCase() === needle) ??
    TOOLS.find((t) => t.title.toLowerCase() === needle) ??
    TOOLS.find(
      (t) =>
        t.slug.toLowerCase().includes(needle) ||
        t.title.toLowerCase().includes(needle)
    ) ??
    null
  );
}

function installedApps(ctx: UserContext) {
  const slugs = ctx.clientContext?.installedApps ?? [];
  return slugs
    .map(compactApp)
    .filter((app): app is NonNullable<typeof app> => Boolean(app));
}

const list_installed_apps: ToolDefinition = {
  name: "list_installed_apps",
  description:
    "List apps installed in the current Spacefield desktop. Use this for questions like 'what apps are installed?' or 'any new app installed?'.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const apps = installedApps(ctx);
    return toolOk({
      count: apps.length,
      apps,
      most_recent_known: apps.at(-1) ?? null,
      note:
        "Spacefield does not currently store install timestamps. The most recent known app is inferred from the browser install-list order.",
      client_context_available: Boolean(ctx.clientContext?.installedApps),
    });
  },
};

const search_spacefield_apps: ToolDefinition = {
  name: "search_spacefield_apps",
  description:
    "Search the Spacefield Tool Store/app catalog by title, slug, description, or category.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query. Empty returns top-rated apps.",
      },
      installed_only: {
        type: "boolean",
        description: "When true, search only the user's installed apps.",
      },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const obj =
      input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const query =
      typeof obj.query === "string" ? obj.query.trim().toLowerCase() : "";
    const installedOnly = obj.installed_only === true;
    const installedSet = new Set(ctx.clientContext?.installedApps ?? []);
    const source = installedOnly
      ? TOOLS.filter((t) => installedSet.has(t.slug))
      : TOOLS;
    const matches = source
      .filter((t) => {
        if (!query) return Boolean(t.topRated);
        const category =
          TOOL_CATEGORIES.find((c) => c.key === t.category)?.label.toLowerCase() ??
          t.category;
        return (
          t.slug.toLowerCase().includes(query) ||
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          category.includes(query)
        );
      })
      .slice(0, 12)
      .map((t) => compactApp(t.slug));
    return toolOk({
      query,
      installed_only: installedOnly,
      count: matches.length,
      apps: matches,
    });
  },
};

const get_spacefield_app_info: ToolDefinition = {
  name: "get_spacefield_app_info",
  description:
    "Get a Spacefield app/tool description, route, category, and installed status by slug or title.",
  input_schema: {
    type: "object",
    properties: {
      slug_or_title: {
        type: "string",
        description: "App slug or visible title.",
      },
    },
    required: ["slug_or_title"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const obj =
      input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    const slugOrTitle =
      typeof obj.slug_or_title === "string" ? obj.slug_or_title : "";
    const app = findApp(slugOrTitle);
    if (!app) {
      return toolOk({ found: false, query: slugOrTitle });
    }
    const installedSet = new Set(ctx.clientContext?.installedApps ?? []);
    return toolOk({
      found: true,
      app: compactApp(app.slug),
      installed: installedSet.has(app.slug),
    });
  },
};

const get_market_pulse_snapshot: ToolDefinition = {
  name: "get_market_pulse_snapshot",
  description:
    "Return the Dubai real-estate Market Pulse snapshot shown by the Market Pulse Dashboard.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async () => {
    const latestMonth = MONTHLY_VOLUMES.at(-1) ?? null;
    const topByTransactions = [...AREA_DATA]
      .sort((a, b) => b.transactions - a.transactions)
      .slice(0, 5);
    const fastestPriceGrowth = [...AREA_DATA]
      .sort((a, b) => b.avgPriceChange - a.avgPriceChange)
      .slice(0, 5);
    const highestYield = [...AREA_DATA]
      .sort((a, b) => b.rentalYield - a.rentalYield)
      .slice(0, 5);

    return toolOk({
      market: "Dubai real estate",
      period: "Q1 2026",
      summary: MARKET_SUMMARY,
      latest_month: latestMonth,
      top_areas_by_transactions: topByTransactions,
      fastest_price_growth: fastestPriceGrowth,
      highest_rental_yields: highestYield,
      supply_pipeline: SUPPLY_PIPELINE,
      source_note:
        "Static dashboard dataset: DLD Mo'asher reports, Property Monitor, ValuStrat.",
    });
  },
};

export const appsSkill: SkillDefinition = {
  id: "apps",
  label: "Apps",
  description:
    "Spacefield desktop apps, Tool Store catalog, installed apps, and app-specific data such as Market Pulse.",
  systemFragment:
    "Use Apps tools for questions about installed apps, the Tool Store, Spacefield tools, app descriptions, and Market Pulse. For 'any new app installed?', call list_installed_apps and explain that exact install timestamps are not stored; the last item is the most recent known from the browser list.",
  tools: [
    list_installed_apps,
    search_spacefield_apps,
    get_spacefield_app_info,
    get_market_pulse_snapshot,
  ],
};
