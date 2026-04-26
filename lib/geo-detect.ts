// Client-side IP geolocation → preferred region.
// Only runs once per session, only when the user has no stored region
// preference. Respects stored pref; silent on unsupported countries.

import { COUNTRY_TO_REGION } from "@/lib/cities";
import type { Region } from "@/lib/region";

const SESSION_KEY = "geo-detect-ran";
const STORAGE_KEY = "preferred-region";

/**
 * Detect the user's preferred region from their IP.
 * Returns null if:
 * - called on the server
 * - already ran this session
 * - user has a stored region preference
 * - the fetch fails
 * - the country isn't mapped to a supported region
 */
export async function detectPreferredRegion(): Promise<Region | null> {
  if (typeof window === "undefined") return null;

  // Already stored preference wins
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return null;
  } catch {}

  // Only run once per session
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return null;
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {}

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://ipapi.co/json/", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string };
    const code = (data.country_code ?? "").toUpperCase();
    return COUNTRY_TO_REGION[code] ?? null;
  } catch {
    return null;
  }
}
