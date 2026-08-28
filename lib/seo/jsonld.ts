/**
 * Structured data (schema.org JSON-LD) builders.
 *
 * Kept separate from lib/seo.ts (Metadata helpers) so schema reuse is easy
 * across server and client components. These return plain objects — render
 * them with <JsonLd data={...} /> from components/JsonLd.tsx.
 */
import type { Region } from "@/lib/region";
import { REGION_MARKET_LABEL } from "@/lib/region";

const BASE_URL = "https://example.com";

export const ORG_SAMEAS: string[] = [
  // Add your own social profile URLs here (used for schema.org sameAs).
];

/** Organization / brand entity. Rendered in root layout. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: "Spacefield",
    legalName: "example.com",
    url: BASE_URL,
    logo: `${BASE_URL}/og-image.png`,
    description:
      "Real estate intelligence platform — tools, market data, courses, and a verified broker network across 10 markets.",
    founder: {
      "@type": "Person",
      name: "Spacefield",
      url: BASE_URL,
    },
    sameAs: ORG_SAMEAS,
  };
}

/** WebSite entity with a Sitelinks Search Box target. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE_URL}/#website`,
    url: BASE_URL,
    name: "Spacefield",
    description:
      "Professional real estate tools, market games, courses, and a verified broker network.",
    publisher: { "@id": `${BASE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/blog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** ProfessionalService schema for a region home. */
export function regionServiceJsonLd(region: Region) {
  const prefix = region === "uae" ? "" : `/${region}`;
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${BASE_URL}${prefix}/#service`,
    name: `${REGION_MARKET_LABEL[region]} Real Estate Intelligence`,
    url: `${BASE_URL}${prefix || "/"}`,
    areaServed: {
      "@type": "Country",
      name: REGION_MARKET_LABEL[region],
    },
    provider: { "@id": `${BASE_URL}/#organization` },
    serviceType: "Real estate market intelligence",
  };
}

/** WebApplication (free, browser-based) schema for tool pages. */
export function webAppJsonLd(params: {
  path: string;
  name: string;
  description: string;
  category?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: params.name,
    description: params.description,
    url: `${BASE_URL}${params.path}`,
    applicationCategory: params.category || "BusinessApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires modern browser with JavaScript enabled.",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    provider: { "@id": `${BASE_URL}/#organization` },
  };
}

/** Article schema for blog posts (Google prefers Article / NewsArticle
 * over BlogPosting for rich-result eligibility). */
export function articleJsonLd(params: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
  section?: string;
  tags?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}${params.path}` },
    headline: params.headline,
    description: params.description,
    datePublished: params.datePublished,
    dateModified: params.dateModified || params.datePublished,
    author: {
      "@type": "Person",
      name: params.author || "Spacefield",
      url: BASE_URL,
    },
    publisher: { "@id": `${BASE_URL}/#organization` },
    image: params.image ? [params.image] : [`${BASE_URL}/og-image.png`],
    articleSection: params.section,
    keywords: (params.tags || []).join(", ") || undefined,
  };
}

/** Person / RealEstateAgent schema for broker profile pages. */
export function brokerPersonJsonLd(params: {
  id: string;
  name: string;
  firm?: string | null;
  bio?: string | null;
  photo?: string | null;
  regions: string[];
  languages: string[];
  specialties: string[];
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
}) {
  const jobTitle = params.firm ? `Real estate broker at ${params.firm}` : "Real estate broker";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${BASE_URL}/network/${params.id}#agent`,
    name: params.name,
    url: `${BASE_URL}/network/${params.id}`,
    jobTitle,
    description: params.bio || `${params.name} — ${jobTitle}.`,
    image: params.photo || undefined,
    worksFor: params.firm
      ? { "@type": "Organization", name: params.firm }
      : undefined,
    areaServed: params.regions.map((r) => ({
      "@type": "Country",
      name: r,
    })),
    knowsLanguage: params.languages,
    knowsAbout: params.specialties,
    email: params.email || undefined,
    telephone: params.phone || undefined,
    sameAs: [params.website, params.linkedin].filter(Boolean),
  };
}

/** Course schema for /learn/[slug] pages. */
export function courseJsonLd(params: {
  path: string;
  name: string;
  description: string;
  lessonCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: params.name,
    description: params.description,
    url: `${BASE_URL}${params.path}`,
    provider: { "@id": `${BASE_URL}/#organization` },
    numberOfLessons: params.lessonCount,
    educationalLevel: "Professional",
    inLanguage: "en",
  };
}

/** FAQ schema. Pass an array of {q, a} pairs. */
export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

/** BreadcrumbList schema — pass a sequence of {name, url} in crawl order. */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url.startsWith("http") ? it.url : `${BASE_URL}${it.url}`,
    })),
  };
}
