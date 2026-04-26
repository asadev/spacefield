/**
 * Hreflang / language alternates for the region-home metadata.
 *
 * Each region has its own top-level section (/uk, /tokyo, /spain, ...) and
 * the UAE market lives at the root. Most regions still serve English content
 * today, but we declare locale-appropriate hreflang values so crawlers can
 * pick the right regional edition for each audience, and so we can layer in
 * localised copy later without reshuffling the URL tree.
 */
import type { Region } from "@/lib/region";
import { ALL_REGIONS } from "@/lib/region";

const BASE_URL = "https://example.com";

export const REGION_HREFLANG: Record<Region, string> = {
  uae: "en-AE",
  uk: "en-GB",
  usa: "en-US",
  singapore: "en-SG",
  tokyo: "ja-JP",
  spain: "es-ES",
  portugal: "pt-PT",
  turkey: "tr-TR",
  saudi: "ar-SA",
  monaco: "fr-MC",
};

function regionPrefix(region: Region): string {
  return region === "uae" ? "" : `/${region}`;
}

/**
 * Return an alternates.languages map for a given section path, linking each
 * region's equivalent page. Pass the section as "" (home), "/tools",
 * "/blog", "/learn", etc. — paths must exist under every region.
 */
export function regionAlternates(
  section: string = ""
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const region of ALL_REGIONS) {
    out[REGION_HREFLANG[region]] = `${BASE_URL}${regionPrefix(region)}${section}`;
  }
  // x-default → UAE (root); Google uses this for users whose region/language
  // doesn't match any declared hreflang.
  out["x-default"] = `${BASE_URL}${section}`;
  return out;
}
