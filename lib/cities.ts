// City catalog — top real-estate cities per region.
// Monaco, Singapore, and Tokyo are single-city regions; their "city" is the
// region itself. The UI hides the city dropdown for those regions.

import type { Region } from "@/lib/region";

export type City = {
  slug: string;   // URL-safe (lowercase, hyphenated)
  name: string;   // Display name
  region: Region;
};

export const CITIES_BY_REGION: Record<Region, City[]> = {
  uae: [
    { slug: "dubai", name: "Dubai", region: "uae" },
    { slug: "abudhabi", name: "Abu Dhabi", region: "uae" },
    { slug: "rak", name: "Ras Al Khaimah", region: "uae" },
  ],
  uk: [
    { slug: "london", name: "London", region: "uk" },
    { slug: "manchester", name: "Manchester", region: "uk" },
    { slug: "edinburgh", name: "Edinburgh", region: "uk" },
  ],
  monaco: [{ slug: "monaco", name: "Monaco", region: "monaco" }],
  tokyo: [{ slug: "tokyo", name: "Tokyo", region: "tokyo" }],
  singapore: [{ slug: "singapore", name: "Singapore", region: "singapore" }],
  usa: [
    { slug: "nyc", name: "New York", region: "usa" },
    { slug: "miami", name: "Miami", region: "usa" },
    { slug: "la", name: "Los Angeles", region: "usa" },
  ],
  spain: [
    { slug: "madrid", name: "Madrid", region: "spain" },
    { slug: "barcelona", name: "Barcelona", region: "spain" },
    { slug: "marbella", name: "Marbella", region: "spain" },
  ],
  portugal: [
    { slug: "lisbon", name: "Lisbon", region: "portugal" },
    { slug: "porto", name: "Porto", region: "portugal" },
    { slug: "algarve", name: "Algarve", region: "portugal" },
  ],
  turkey: [
    { slug: "istanbul", name: "Istanbul", region: "turkey" },
    { slug: "antalya", name: "Antalya", region: "turkey" },
    { slug: "bodrum", name: "Bodrum", region: "turkey" },
  ],
  saudi: [
    { slug: "riyadh", name: "Riyadh", region: "saudi" },
    { slug: "jeddah", name: "Jeddah", region: "saudi" },
    { slug: "neom", name: "NEOM", region: "saudi" },
  ],
};

export function getCitiesForRegion(region: Region): City[] {
  return CITIES_BY_REGION[region];
}

export function getDefaultCity(region: Region): City {
  return CITIES_BY_REGION[region][0];
}

export function isSingleCityRegion(region: Region): boolean {
  return CITIES_BY_REGION[region].length <= 1;
}

export function findCity(region: Region, slug: string): City | null {
  return CITIES_BY_REGION[region].find((c) => c.slug === slug) ?? null;
}

/** Country code → region mapping for IP geolocation redirects. */
export const COUNTRY_TO_REGION: Record<string, Region> = {
  AE: "uae",
  GB: "uk",
  UK: "uk",
  MC: "monaco",
  JP: "tokyo",
  SG: "singapore",
  US: "usa",
  ES: "spain",
  PT: "portugal",
  TR: "turkey",
  SA: "saudi",
};
