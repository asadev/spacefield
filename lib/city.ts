// City preference per region — mirrors /lib/region.ts pattern.
// Each region has an independent preferred city, stored under
// preferred-city::<region>. City dropdown and city-aware tool pages
// subscribe to changes to stay in sync (same tab + across tabs).

import {
  CITIES_BY_REGION,
  findCity,
  getDefaultCity,
  type City,
} from "@/lib/cities";
import type { Region } from "@/lib/region";

const STORAGE_PREFIX = "preferred-city::";
const EVENT_NAME = "city-preference-change";

function storageKey(region: Region): string {
  return STORAGE_PREFIX + region;
}

/** Read current city preference for a region (SSR-safe). */
export function getCity(region: Region): City {
  if (typeof window === "undefined") return getDefaultCity(region);
  try {
    const slug = window.localStorage.getItem(storageKey(region));
    if (slug) {
      const match = findCity(region, slug);
      if (match) return match;
    }
  } catch {}
  return getDefaultCity(region);
}

/** Persist city preference for a region and notify subscribers in this tab. */
export function setCity(region: Region, citySlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(region), citySlug);
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { region, citySlug } })
    );
  } catch {}
}

/**
 * Subscribe to city changes in this tab AND other tabs.
 * Callback receives (region, city). Returns an unsubscribe function.
 */
export function subscribeCity(
  callback: (region: Region, city: City) => void
) {
  if (typeof window === "undefined") return () => {};

  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { region: Region; citySlug: string }
      | undefined;
    if (!detail) return;
    const city = findCity(detail.region, detail.citySlug);
    if (city) callback(detail.region, city);
  };

  const storageHandler = (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
    const region = e.key.slice(STORAGE_PREFIX.length) as Region;
    if (!CITIES_BY_REGION[region]) return;
    const slug = e.newValue;
    if (!slug) return;
    const city = findCity(region, slug);
    if (city) callback(region, city);
  };

  window.addEventListener(EVENT_NAME, customHandler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, customHandler);
    window.removeEventListener("storage", storageHandler);
  };
}
