// US state codes, names, and 3-digit ZIP prefix ranges.
// Source: USPS ZIP code book (public data). Used to auto-classify entered ZIPs
// or city names into a US state for heatmap and capacity planning views.

export interface StateInfo {
  code: string;
  name: string;
  zipRanges: Array<[number, number]>; // 3-digit ZIP prefix ranges
  region: "Northeast" | "South" | "Midwest" | "West";
}

export const US_STATES: StateInfo[] = [
  { code: "AL", name: "Alabama", zipRanges: [[350, 369]], region: "South" },
  { code: "AK", name: "Alaska", zipRanges: [[995, 999]], region: "West" },
  { code: "AZ", name: "Arizona", zipRanges: [[850, 865]], region: "West" },
  { code: "AR", name: "Arkansas", zipRanges: [[716, 729]], region: "South" },
  { code: "CA", name: "California", zipRanges: [[900, 961]], region: "West" },
  { code: "CO", name: "Colorado", zipRanges: [[800, 816]], region: "West" },
  { code: "CT", name: "Connecticut", zipRanges: [[60, 69]], region: "Northeast" },
  { code: "DE", name: "Delaware", zipRanges: [[197, 199]], region: "South" },
  { code: "DC", name: "District of Columbia", zipRanges: [[200, 205]], region: "South" },
  { code: "FL", name: "Florida", zipRanges: [[320, 349]], region: "South" },
  { code: "GA", name: "Georgia", zipRanges: [[300, 319], [398, 399]], region: "South" },
  { code: "HI", name: "Hawaii", zipRanges: [[967, 968]], region: "West" },
  { code: "ID", name: "Idaho", zipRanges: [[832, 838]], region: "West" },
  { code: "IL", name: "Illinois", zipRanges: [[600, 629]], region: "Midwest" },
  { code: "IN", name: "Indiana", zipRanges: [[460, 479]], region: "Midwest" },
  { code: "IA", name: "Iowa", zipRanges: [[500, 528]], region: "Midwest" },
  { code: "KS", name: "Kansas", zipRanges: [[660, 679]], region: "Midwest" },
  { code: "KY", name: "Kentucky", zipRanges: [[400, 427]], region: "South" },
  { code: "LA", name: "Louisiana", zipRanges: [[700, 714]], region: "South" },
  { code: "ME", name: "Maine", zipRanges: [[39, 49]], region: "Northeast" },
  { code: "MD", name: "Maryland", zipRanges: [[206, 219]], region: "South" },
  { code: "MA", name: "Massachusetts", zipRanges: [[10, 27], [55, 55]], region: "Northeast" },
  { code: "MI", name: "Michigan", zipRanges: [[480, 499]], region: "Midwest" },
  { code: "MN", name: "Minnesota", zipRanges: [[550, 567]], region: "Midwest" },
  { code: "MS", name: "Mississippi", zipRanges: [[386, 397]], region: "South" },
  { code: "MO", name: "Missouri", zipRanges: [[630, 658]], region: "Midwest" },
  { code: "MT", name: "Montana", zipRanges: [[590, 599]], region: "West" },
  { code: "NE", name: "Nebraska", zipRanges: [[680, 693]], region: "Midwest" },
  { code: "NV", name: "Nevada", zipRanges: [[889, 898]], region: "West" },
  { code: "NH", name: "New Hampshire", zipRanges: [[30, 38]], region: "Northeast" },
  { code: "NJ", name: "New Jersey", zipRanges: [[70, 89]], region: "Northeast" },
  { code: "NM", name: "New Mexico", zipRanges: [[870, 884]], region: "West" },
  { code: "NY", name: "New York", zipRanges: [[4, 5], [100, 149]], region: "Northeast" },
  { code: "NC", name: "North Carolina", zipRanges: [[270, 289]], region: "South" },
  { code: "ND", name: "North Dakota", zipRanges: [[580, 588]], region: "Midwest" },
  { code: "OH", name: "Ohio", zipRanges: [[430, 459]], region: "Midwest" },
  { code: "OK", name: "Oklahoma", zipRanges: [[730, 749]], region: "South" },
  { code: "OR", name: "Oregon", zipRanges: [[970, 979]], region: "West" },
  { code: "PA", name: "Pennsylvania", zipRanges: [[150, 196]], region: "Northeast" },
  { code: "RI", name: "Rhode Island", zipRanges: [[28, 29]], region: "Northeast" },
  { code: "SC", name: "South Carolina", zipRanges: [[290, 299]], region: "South" },
  { code: "SD", name: "South Dakota", zipRanges: [[570, 577]], region: "Midwest" },
  { code: "TN", name: "Tennessee", zipRanges: [[370, 385]], region: "South" },
  { code: "TX", name: "Texas", zipRanges: [[750, 799], [885, 885]], region: "South" },
  { code: "UT", name: "Utah", zipRanges: [[840, 847]], region: "West" },
  { code: "VT", name: "Vermont", zipRanges: [[50, 59]], region: "Northeast" },
  { code: "VA", name: "Virginia", zipRanges: [[220, 246]], region: "South" },
  { code: "WA", name: "Washington", zipRanges: [[980, 994]], region: "West" },
  { code: "WV", name: "West Virginia", zipRanges: [[247, 268]], region: "South" },
  { code: "WI", name: "Wisconsin", zipRanges: [[530, 549]], region: "Midwest" },
  { code: "WY", name: "Wyoming", zipRanges: [[820, 831]], region: "West" },
];

/**
 * Resolve a ZIP code (string or number) to the US state code.
 * Returns null for non-US or unknown.
 */
export function zipToState(input: string): StateInfo | null {
  const digits = input.trim().replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 5) return null;
  const prefix = parseInt(digits.slice(0, 3), 10);
  for (const s of US_STATES) {
    for (const [lo, hi] of s.zipRanges) {
      if (prefix >= lo && prefix <= hi) return s;
    }
  }
  return null;
}

/**
 * Try to resolve a string (ZIP or city) to a state. For cities, we check
 * against a small manual map of common major US cities.
 */
const CITY_TO_STATE: Record<string, string> = {
  // Format: lowercased city → state code
  "new york": "NY", manhattan: "NY", brooklyn: "NY", queens: "NY", bronx: "NY",
  "los angeles": "CA", "san francisco": "CA", "san diego": "CA", sacramento: "CA",
  oakland: "CA", "san jose": "CA", fresno: "CA", "long beach": "CA",
  chicago: "IL", houston: "TX", dallas: "TX", austin: "TX", "san antonio": "TX",
  "fort worth": "TX", phoenix: "AZ", tucson: "AZ", philadelphia: "PA",
  pittsburgh: "PA", boston: "MA", cambridge: "MA", seattle: "WA",
  portland: "OR", denver: "CO", miami: "FL", orlando: "FL", tampa: "FL",
  jacksonville: "FL", atlanta: "GA", charlotte: "NC", raleigh: "NC",
  detroit: "MI", minneapolis: "MN", cleveland: "OH", columbus: "OH",
  cincinnati: "OH", indianapolis: "IN", nashville: "TN", memphis: "TN",
  "washington dc": "DC", washington: "DC", baltimore: "MD",
  "salt lake city": "UT", "las vegas": "NV", milwaukee: "WI", kansas: "KS",
  "kansas city": "MO", "st louis": "MO", "saint louis": "MO",
  "new orleans": "LA", honolulu: "HI", anchorage: "AK",
};

export function resolveToState(input: string): StateInfo | null {
  const cleaned = input.trim().toLowerCase();
  // Try ZIP first
  const byZip = zipToState(cleaned);
  if (byZip) return byZip;
  // Try city lookup
  const stateCode = CITY_TO_STATE[cleaned];
  if (stateCode) return US_STATES.find((s) => s.code === stateCode) || null;
  // Try direct state code or name match
  const upper = cleaned.toUpperCase();
  const byCode = US_STATES.find((s) => s.code === upper);
  if (byCode) return byCode;
  const byName = US_STATES.find((s) => s.name.toLowerCase() === cleaned);
  if (byName) return byName;
  return null;
}
