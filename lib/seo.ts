import type { Metadata } from "next";
import { buildOgUrl, type OgAccent, type OgType } from "@/lib/seo/og";

const BASE_URL = "https://spacefield.co";

function ogImageUrl(type: OgType, title: string, subtitle: string, accent: OgAccent = "violet"): string {
  return buildOgUrl({ type, title, subtitle, accent });
}

export function toolMeta(slug: string, title: string, description: string): Metadata {
  const og = ogImageUrl("tool", title, description, "violet");
  return {
    title,
    description,
    openGraph: {
      title: `${title} | Space Field`,
      description,
      url: `${BASE_URL}/tools/${slug}`,
      type: "website",
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
    alternates: {
      canonical: `${BASE_URL}/tools/${slug}`,
    },
  };
}

export function gameMeta(slug: string, title: string, description: string): Metadata {
  const og = ogImageUrl("tool", title, description, "emerald");
  return {
    title,
    description,
    openGraph: {
      title: `${title} | Space Field`,
      description,
      url: `${BASE_URL}/games/${slug}`,
      type: "website",
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
    alternates: {
      canonical: `${BASE_URL}/games/${slug}`,
    },
  };
}

export function pageMeta(path: string, title: string, description: string): Metadata {
  const og = ogImageUrl("default", title, description, "violet");
  return {
    title,
    description,
    openGraph: {
      title: `${title} | Space Field`,
      description,
      url: `${BASE_URL}${path}`,
      type: "website",
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
    alternates: {
      canonical: `${BASE_URL}${path}`,
    },
  };
}

// JSON-LD generators
export function toolJsonLd(slug: string, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: `${BASE_URL}/tools/${slug}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

export function courseJsonLd(slug: string, name: string, description: string, lessonCount: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name,
    description,
    url: `${BASE_URL}/learn/${slug}`,
    provider: {
      "@type": "Person",
      name: "Spacefield",
      url: BASE_URL,
    },
    numberOfLessons: lessonCount,
    educationalLevel: "Professional",
  };
}

export function blogJsonLd(slug: string, title: string, excerpt: string, date: string, readTime: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: excerpt,
    url: `${BASE_URL}/blog/${slug}`,
    datePublished: date,
    author: {
      "@type": "Person",
      name: "Spacefield",
      url: BASE_URL,
    },
    timeRequired: readTime,
  };
}
