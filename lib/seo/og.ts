/**
 * OG image URL builder.
 *
 * Produces a URL to the dynamic OG endpoint (/api/og) that renders a branded
 * 1200x630 preview image for a given page. Every route that sets Metadata can
 * pass the result of `buildOgUrl()` into `openGraph.images` and `twitter.images`.
 *
 * Keep this dependency-free — it's imported from both edge OG handler and
 * page-level `generateMetadata` functions.
 */

import type { Region } from "@/lib/region";

const BASE_URL = "https://example.com";

export type OgType = "default" | "tool" | "region" | "blog" | "broker" | "network";
export type OgAccent = "violet" | "emerald" | "purple" | "blue" | "rose" | "amber";

export interface OgParams {
  type?: OgType;
  title: string;
  subtitle?: string;
  /** Region slug — renders the flag in the footer. */
  region?: Region | null;
  /** Accent color for section label + corner glow. */
  accent?: OgAccent;
  /** Optional byline for blog posts. */
  author?: string;
  /** Optional ISO date for blog posts. */
  date?: string;
}

/** Truncate a string to `max` characters with an ellipsis. */
function clip(str: string, max: number): string {
  if (!str) return "";
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build a fully-qualified URL to the OG image endpoint.
 * Use this in `openGraph.images` / `twitter.images`.
 */
export function buildOgUrl(params: OgParams): string {
  const qs = new URLSearchParams();

  if (params.type) qs.set("type", params.type);
  qs.set("title", clip(params.title, 90));
  if (params.subtitle) qs.set("subtitle", clip(params.subtitle, 140));
  if (params.region) qs.set("region", params.region);
  if (params.accent) qs.set("accent", params.accent);
  if (params.author) qs.set("author", clip(params.author, 60));
  if (params.date) qs.set("date", params.date);

  return `${BASE_URL}/api/og?${qs.toString()}`;
}

/**
 * Build a full Metadata.openGraph.images + twitter.images pair for a page.
 * Returns the shape to spread into a Metadata object.
 */
export function ogImagesForMetadata(params: OgParams): {
  openGraph: { images: { url: string; width: number; height: number }[] };
  twitter: { images: string[] };
} {
  const url = buildOgUrl(params);
  return {
    openGraph: { images: [{ url, width: 1200, height: 630 }] },
    twitter: { images: [url] },
  };
}

/** Pick a sensible accent given a region. Keeps regional OGs visually distinct. */
export function accentForRegion(region: Region | null | undefined): OgAccent {
  switch (region) {
    case "uae":
      return "emerald";
    case "uk":
      return "purple";
    case "usa":
      return "blue";
    case "monaco":
      return "rose";
    case "tokyo":
      return "rose";
    case "singapore":
      return "emerald";
    case "spain":
      return "amber";
    case "portugal":
      return "emerald";
    case "turkey":
      return "rose";
    case "saudi":
      return "emerald";
    default:
      return "violet";
  }
}
