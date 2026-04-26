// Shared server component for a city landing page (programmatic SEO).
// Used by /app/<region>/cities/[slug]/page.tsx across all 7 multi-city regions.
// All content is statically generated at build time.

import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import type { Region } from "@/lib/region";
import type { CityMarketData, CityNeighborhood, CityYieldZone } from "@/lib/city-data";
import { loadCityData } from "@/lib/city-data";
import { findCity } from "@/lib/cities";
import {
  cityFAQs,
  CITY_REFS,
  findCityRefByRegion,
  REGION_FEATURED_TOOLS,
  REGION_TAX_SUMMARY,
  type CityRef,
} from "@/lib/seo/prog-seo-data";

const BASE = "https://example.com";

// Region path prefix for URL construction (keep in sync with lib/region.ts).
const REGION_PREFIX: Record<Region, string> = {
  uae: "/uae",
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

// Simple intensity color for the yield heatmap.
function yieldColor(y: number): string {
  if (y >= 8) return "bg-emerald-500/60 border-emerald-400/40";
  if (y >= 6.5) return "bg-emerald-500/35 border-emerald-400/30";
  if (y >= 5.5) return "bg-amber-500/30 border-amber-400/30";
  if (y >= 4.5) return "bg-orange-500/30 border-orange-400/30";
  return "bg-rose-500/25 border-rose-400/30";
}

export async function CityLanding({
  region,
  citySlug,
}: {
  region: Region;
  citySlug: string;
}) {
  const city = findCity(region, citySlug);
  if (!city) return null;

  const data = await loadCityData(region, citySlug);
  const market: CityMarketData | null = data?.market ?? null;
  const neighborhoods: CityNeighborhood[] = data?.neighborhoods ?? [];
  const yieldZones: CityYieldZone[] = data?.yieldZones ?? [];

  // Canonical ref for cross-links
  const thisRef = findCityRefByRegion(region, citySlug);
  const relatedCities = CITY_REFS.filter(
    (c) => c.region === region && c.regionCitySlug !== citySlug,
  ).slice(0, 4);
  const relatedComparisons = thisRef
    ? CITY_REFS.filter((c) => c.slug !== thisRef.slug)
        .slice(0, 6)
        .map((other) => {
          const pair = [thisRef.slug, other.slug].sort().join("-vs-");
          return { label: `${thisRef.display} vs ${other.display}`, href: `/compare/${pair}` };
        })
    : [];

  const tax = REGION_TAX_SUMMARY[region];
  const featuredTools = REGION_FEATURED_TOOLS[region] ?? [];
  const regionBase = REGION_PREFIX[region];

  const cityDisplay = market?.city ?? city.name;
  const pricePerUnit = market?.pricePerUnit ?? 0;
  const unitLabel = market?.unitLabel ?? "sqft";
  const currency = market?.currency ?? "";
  const yoyChange = market?.yoyChange ?? 0;
  const grossYield = market?.grossYield;

  const faqs = cityFAQs({
    city: cityDisplay,
    country: thisRef?.country ?? "",
    currency,
    pricePerUnit,
    unitLabel,
    yoyChange,
    grossYield,
    topNeighborhoods: neighborhoods.slice(0, 6).map((n) => n.name),
  });

  const pageUrl = `${BASE}${regionBase}/cities/${citySlug}`;
  const articleDescription = market
    ? `${cityDisplay} residential market Q1 2026: average ${currency} ${pricePerUnit.toLocaleString()}/${unitLabel}, ${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}% YoY, ${grossYield ? grossYield.toFixed(1) + "% gross yield" : "full yield breakdown"}. Neighbourhoods, brokers, tools.`
    : `${cityDisplay} real estate market — prices, neighbourhoods, yields and tools on example.com.`;

  // Schema: Article + Place + RealEstateAgent (the agent is the platform itself
  // as a directory entry; verified brokers are fetched client-side via a
  // server action on a parallel route if needed — for static generation we
  // reference the platform's broker directory).
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        headline: `${cityDisplay} Real Estate Market`,
        description: articleDescription,
        datePublished: "2026-04-23",
        dateModified: "2026-04-23",
        author: { "@type": "Organization", name: "example.com" },
        publisher: { "@type": "Organization", name: "example.com" },
        mainEntityOfPage: pageUrl,
      },
      {
        "@type": "Place",
        "@id": `${pageUrl}#place`,
        name: cityDisplay,
        address: thisRef ? { "@type": "PostalAddress", addressLocality: cityDisplay, addressCountry: thisRef.country } : undefined,
      },
      {
        "@type": "RealEstateAgent",
        "@id": `${BASE}/network#agent-directory`,
        name: "example.com Verified Broker Directory",
        areaServed: thisRef?.country ?? undefined,
        url: `${BASE}/network`,
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={schema} />
      <main className="relative min-h-screen bg-[#050507] text-white">
        {/* Hero */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-12 sm:pt-28">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40">
            {thisRef?.country} · Market Intelligence
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {cityDisplay} Real Estate Market
          </h1>
          {market && (
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/60 sm:text-lg">
              {market.summary}
            </p>
          )}
        </section>

        {/* Key stats */}
        {market && (
          <section className="relative z-10 mx-auto max-w-6xl border-y border-white/[0.05] bg-white/[0.01] px-6 py-16">
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {cityDisplay} — Q1 2026 at a glance
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {market.stats.slice(0, 8).map((stat) => (
                <div
                  key={stat.label}
                  className="relative overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.04] p-5 transition-colors hover:border-white/[0.20]"
                >
                  <span className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-emerald-400/40" />
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-white/40">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{stat.value}</p>
                  {stat.change && (
                    <p
                      className={`mt-1 text-xs ${stat.changePositive === false ? "text-rose-300/80" : "text-emerald-300/80"}`}
                    >
                      {stat.change}
                    </p>
                  )}
                  {stat.note && (
                    <p className="mt-2 text-[0.7rem] leading-snug text-white/40">{stat.note}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top neighborhoods */}
        {neighborhoods.length > 0 && (
          <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-amber-300/70">
              Neighbourhoods
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Top {cityDisplay} neighbourhoods by data quality
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/50">
              Communities ranked by depth of transaction data, not by popularity. Every figure
              below is drawn from registered sales and listing medians — no estimates, no guesses.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {neighborhoods.slice(0, 12).map((n) => (
                <div
                  key={n.slug}
                  className="relative overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.05] p-5 transition-colors hover:border-white/[0.20] hover:bg-white/[0.07]"
                >
                  <span className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-amber-400/40" />
                  <div className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-white">{n.name}</h3>
                    {n.grossYield != null && (
                      <span className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-300/80">
                        {n.grossYield.toFixed(1)}% yield
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    {currency} {n.pricePerUnit.toLocaleString()}/{n.unitLabel}
                    {" · "}
                    <span className={n.yoyChange >= 0 ? "text-emerald-300/70" : "text-rose-300/70"}>
                      {n.yoyChange >= 0 ? "+" : ""}
                      {n.yoyChange.toFixed(1)}% YoY
                    </span>
                  </p>
                  {n.vibe && <p className="mt-3 text-sm leading-snug text-white/60">{n.vibe}</p>}
                  {n.tags && n.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {n.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-white/50"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Yield heatmap */}
        {yieldZones.length > 0 && (
          <section className="relative z-10 mx-auto max-w-6xl border-t border-white/[0.05] px-6 py-20">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-emerald-300/70">
              Yield Heatmap
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {cityDisplay} gross rental yields by zone
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/50">
              Gross rental yield = median listed annual rent divided by median listed asking
              price, on the dominant unit type in each zone.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {yieldZones.slice(0, 16).map((z) => (
                <div
                  key={z.zone}
                  className={`rounded-md border p-3 text-left ${yieldColor(z.grossYield)}`}
                >
                  <p className="text-xs font-semibold text-white">{z.zone}</p>
                  <p className="mt-1 text-lg font-bold text-white">{z.grossYield.toFixed(1)}%</p>
                  <p className="mt-0.5 text-[0.65rem] text-white/70">{z.priceBand}</p>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={`${regionBase}/tools/yield-heatmap`}
                className="text-sm text-emerald-300/80 transition hover:text-emerald-200"
              >
                Open the full {cityDisplay} yield heatmap tool &rarr;
              </Link>
            </div>
          </section>
        )}

        {/* Tax / transaction cost (region-level) */}
        {tax && (
          <section className="relative z-10 mx-auto max-w-6xl border-t border-white/[0.05] bg-white/[0.01] px-6 py-16">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-purple-300/70">
              Transaction Costs
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Buying in {cityDisplay} — tax and fees
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.10] bg-white/[0.05] p-5">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-white/40">
                  Headline tax
                </p>
                <p className="mt-2 text-base font-semibold text-white">{tax.headline}</p>
              </div>
              <div className="rounded-lg border border-white/[0.10] bg-white/[0.05] p-5">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-white/40">
                  Typical all-in
                </p>
                <p className="mt-2 text-base font-semibold text-white">{tax.range}</p>
              </div>
              <div className="rounded-lg border border-white/[0.10] bg-white/[0.05] p-5">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-white/40">
                  Note
                </p>
                <p className="mt-2 text-sm leading-snug text-white/70">{tax.note}</p>
              </div>
            </div>
          </section>
        )}

        {/* Featured tools */}
        {featuredTools.length > 0 && (
          <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-purple-300/70">
              Tools
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Featured tools for the {cityDisplay} market
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featuredTools.map((t) => (
                <Link
                  key={t.slug}
                  href={`${regionBase}/tools/${t.slug}`}
                  className="group relative block overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.05] p-5 transition-all hover:border-white/[0.20] hover:bg-white/[0.07]"
                >
                  <span className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-purple-400/40" />
                  <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{t.desc}</p>
                  <span className="mt-3 inline-flex text-xs text-purple-300/70 transition group-hover:text-purple-200">
                    Open tool &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Related cities + cross-links */}
        <section className="relative z-10 mx-auto max-w-6xl border-t border-white/[0.05] px-6 py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            {relatedCities.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40">
                  Also in {thisRef?.country}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Explore nearby markets
                </h3>
                <ul className="mt-4 space-y-2">
                  {relatedCities.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`${REGION_PREFIX[c.region]}/cities/${c.regionCitySlug}`}
                        className="text-sm text-white/70 transition hover:text-white"
                      >
                        {c.display} market overview &rarr;
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {relatedComparisons.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40">
                  Compare
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Head-to-head with other markets
                </h3>
                <ul className="mt-4 space-y-2">
                  {relatedComparisons.map((cmp) => (
                    <li key={cmp.href}>
                      <Link
                        href={cmp.href}
                        className="text-sm text-white/70 transition hover:text-white"
                      >
                        {cmp.label} &rarr;
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Brokers CTA */}
        <section className="relative z-10 mx-auto max-w-6xl border-t border-white/[0.05] bg-white/[0.01] px-6 py-16">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-emerald-300/70">
            Brokers
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Verified brokers covering {cityDisplay}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-white/50">
            Cross-border specialists and local market experts — every broker in our directory is
            identity-verified and status-approved. Filter by region, language, or specialty.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/network?region=${region}`}
              className="inline-block rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Browse {cityDisplay} brokers
            </Link>
            <Link
              href="/network/apply"
              className="inline-block rounded-md border border-white/15 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Apply to join
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 mx-auto max-w-4xl px-6 py-20">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/40">
            FAQ
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {cityDisplay} real estate — frequently asked
          </h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-lg border border-white/[0.10] bg-white/[0.04] p-5 transition-colors hover:border-white/[0.20]"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                  {f.q}
                  <span className="float-right text-white/40 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

// Helper: generate metadata
export function cityMetadata(region: Region, citySlug: string, thisRef: CityRef | null, market: CityMarketData | null) {
  const cityDisplay = market?.city ?? thisRef?.display ?? citySlug;
  const title = `${cityDisplay} Real Estate Market — Prices, Yields, Neighborhoods | example.com`;
  const description = market
    ? `${cityDisplay} Q1 2026: ${market.currency} ${market.pricePerUnit.toLocaleString()}/${market.unitLabel}, ${market.yoyChange >= 0 ? "+" : ""}${market.yoyChange.toFixed(1)}% YoY${market.grossYield ? ", " + market.grossYield.toFixed(1) + "% yield" : ""}. Neighbourhoods, tools, brokers.`
    : `${cityDisplay} real estate market intelligence — prices, yields, neighbourhoods, tools.`;
  const url = `${BASE}${REGION_PREFIX[region]}/cities/${citySlug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" as const },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}
