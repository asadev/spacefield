import type { MetadataRoute } from "next";

const BASE = "https://example.com";

/**
 * Sitemap index. Next renders this file as /sitemap.xml, but we point it at
 * dedicated child sitemap routes so crawlers can fetch each section (core,
 * tools, blog, network) independently. Splitting is the recommended layout
 * once the combined URL count passes a few hundred — it makes incremental
 * re-crawls cheaper and surfaces "last modified" signals more reliably.
 *
 * Child sitemaps live at:
 *   /sitemap-core    — home + region homes + marketing / section roots
 *   /sitemap-blog    — static + DB-authored blog posts across all regions
 *   /sitemap-network — verified broker directory + profile pages
 *   /sitemap-seo     — programmatic SEO pages (city landings, region comparisons, migration corridors)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  return [
    { url: `${BASE}/sitemap-core.xml`, lastModified: now },
    { url: `${BASE}/sitemap-blog.xml`, lastModified: now },
    { url: `${BASE}/sitemap-network.xml`, lastModified: now },
    { url: `${BASE}/sitemap-seo.xml`, lastModified: now },
  ];
}
