// City-level data schema + dynamic loader.
//
// Each city (in multi-city regions) ships four data files under
// /lib/<region>/cities/<city-slug>/:
//   - market.ts    → CityMarketData (stats, price trends)
//   - neighborhoods.ts → CityNeighborhood[] (areas within the city)
//   - yield.ts     → CityYieldZone[] (yield heatmap zones)
//   - pulse.ts     → CityMarketPulse (sentiment / momentum)
//
// Each file also exports a sourceMetadata const per the admin-panel schema.
//
// Single-city regions (Monaco, Singapore, Tokyo) fall back to their
// country-level data files — they don't ship city-specific files.

import { isSingleCityRegion } from "@/lib/cities";
import type { Region } from "@/lib/region";

// -------------------- Shared types --------------------

export type CityMarketStat = {
  label: string;
  value: string;            // formatted display (e.g. "AED 2,850/sqft")
  change?: string;          // e.g. "+12.4%"
  changePositive?: boolean;
  note?: string;
};

export type CityMarketData = {
  city: string;             // display name
  slug: string;
  currency: string;         // ISO 4217 (USD, EUR, AED, SAR, TRY, GBP)
  pricePerUnit: number;     // typical transaction $/unit in local currency
  unitLabel: string;        // "sqft" | "sqm"
  yoyChange: number;        // %
  transactionVolume?: number;
  medianList?: number;
  medianRent?: number;
  grossYield?: number;      // %
  stats: CityMarketStat[];  // 4–8 headline stats for UI
  summary: string;          // 2–4 sentence market overview
};

export type CityNeighborhood = {
  slug: string;
  name: string;
  pricePerUnit: number;
  unitLabel: string;
  yoyChange: number;
  grossYield?: number;
  vibe?: string;            // 1-line character description
  tags?: string[];          // "waterfront", "family", "tech-hub", etc.
};

export type CityYieldZone = {
  zone: string;
  grossYield: number;       // %
  priceBand: string;        // "AED 1,800-2,400/sqft"
  sampleProperties?: number;
};

export type CityMarketPulse = {
  sentiment: "bullish" | "neutral" | "bearish";
  sentimentScore: number;   // -100 to +100
  momentum: "accelerating" | "steady" | "cooling";
  signals: {
    label: string;
    value: string;
    direction: "up" | "down" | "flat";
  }[];
  summary: string;
};

// -------------------- Dynamic loader --------------------

type CityBundle = {
  market: CityMarketData;
  neighborhoods: CityNeighborhood[];
  yieldZones: CityYieldZone[];
  pulse: CityMarketPulse;
};

/**
 * Load a city's data bundle. Returns null if the region is single-city
 * (caller should fall back to country-level data) or if the city's data
 * files haven't been written yet (missing-import returns null gracefully).
 */
export async function loadCityData(
  region: Region,
  citySlug: string
): Promise<Partial<CityBundle> | null> {
  if (isSingleCityRegion(region)) return null;

  const base = `./${region}/cities/${citySlug}`;
  const result: Partial<CityBundle> = {};

  try {
    const mod = await import(`${base}/market`);
    if (mod.cityMarket) result.market = mod.cityMarket;
  } catch {}
  try {
    const mod = await import(`${base}/neighborhoods`);
    if (mod.cityNeighborhoods) result.neighborhoods = mod.cityNeighborhoods;
  } catch {}
  try {
    const mod = await import(`${base}/yield`);
    if (mod.cityYieldZones) result.yieldZones = mod.cityYieldZones;
  } catch {}
  try {
    const mod = await import(`${base}/pulse`);
    if (mod.cityPulse) result.pulse = mod.cityPulse;
  } catch {}

  // Nothing loaded → caller falls back to country-level data
  if (Object.keys(result).length === 0) return null;
  return result;
}
