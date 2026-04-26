// Programmatic-SEO shared data
// ─────────────────────────────
// One source of truth for:
//  • city × city comparison pairs (capped at ~50 meaningful pairs)
//  • region × region comparison pairs (top-volume corridors)
//  • migration corridors ("moving from X to Y") with buyer copy
//  • FAQ templates that each page type can specialise
//
// Lives in /lib/seo/ (separate from market data) so the generators
// can pull in a single small bundle instead of reaching into every
// region file. The pairs/corridors below are intentional — they are
// the only ones that should ship as statically generated pages, so
// we don't explode the sitemap with low-intent combinatorics.

import type { Region } from "@/lib/region";

// ────────────────────────────────────────────────
// City pair reference — one canonical slug per city
// ────────────────────────────────────────────────

export type CityRef = {
  slug: string;        // URL slug for /compare/<a>-vs-<b>. Must be globally unique.
  region: Region;
  regionCitySlug: string; // slug inside /lib/<region>/cities/<slug>
  display: string;     // UI display name
  country: string;     // for hero + schema
  currency: string;
};

// Globally unique short slugs for comparison URLs. Keep these stable — they
// determine canonical URLs and internal links.
export const CITY_REFS: CityRef[] = [
  // UAE
  { slug: "dubai", region: "uae", regionCitySlug: "dubai", display: "Dubai", country: "United Arab Emirates", currency: "AED" },
  { slug: "abu-dhabi", region: "uae", regionCitySlug: "abudhabi", display: "Abu Dhabi", country: "United Arab Emirates", currency: "AED" },
  { slug: "ras-al-khaimah", region: "uae", regionCitySlug: "rak", display: "Ras Al Khaimah", country: "United Arab Emirates", currency: "AED" },
  // UK
  { slug: "london", region: "uk", regionCitySlug: "london", display: "London", country: "United Kingdom", currency: "GBP" },
  { slug: "manchester", region: "uk", regionCitySlug: "manchester", display: "Manchester", country: "United Kingdom", currency: "GBP" },
  { slug: "edinburgh", region: "uk", regionCitySlug: "edinburgh", display: "Edinburgh", country: "United Kingdom", currency: "GBP" },
  // USA
  { slug: "new-york", region: "usa", regionCitySlug: "nyc", display: "New York", country: "United States", currency: "USD" },
  { slug: "miami", region: "usa", regionCitySlug: "miami", display: "Miami", country: "United States", currency: "USD" },
  { slug: "los-angeles", region: "usa", regionCitySlug: "la", display: "Los Angeles", country: "United States", currency: "USD" },
  // Spain
  { slug: "madrid", region: "spain", regionCitySlug: "madrid", display: "Madrid", country: "Spain", currency: "EUR" },
  { slug: "barcelona", region: "spain", regionCitySlug: "barcelona", display: "Barcelona", country: "Spain", currency: "EUR" },
  { slug: "marbella", region: "spain", regionCitySlug: "marbella", display: "Marbella", country: "Spain", currency: "EUR" },
  // Portugal
  { slug: "lisbon", region: "portugal", regionCitySlug: "lisbon", display: "Lisbon", country: "Portugal", currency: "EUR" },
  { slug: "porto", region: "portugal", regionCitySlug: "porto", display: "Porto", country: "Portugal", currency: "EUR" },
  { slug: "algarve", region: "portugal", regionCitySlug: "algarve", display: "Algarve", country: "Portugal", currency: "EUR" },
  // Turkey
  { slug: "istanbul", region: "turkey", regionCitySlug: "istanbul", display: "Istanbul", country: "Turkey", currency: "TRY" },
  { slug: "antalya", region: "turkey", regionCitySlug: "antalya", display: "Antalya", country: "Turkey", currency: "TRY" },
  { slug: "bodrum", region: "turkey", regionCitySlug: "bodrum", display: "Bodrum", country: "Turkey", currency: "TRY" },
  // Saudi
  { slug: "riyadh", region: "saudi", regionCitySlug: "riyadh", display: "Riyadh", country: "Saudi Arabia", currency: "SAR" },
  { slug: "jeddah", region: "saudi", regionCitySlug: "jeddah", display: "Jeddah", country: "Saudi Arabia", currency: "SAR" },
  { slug: "neom", region: "saudi", regionCitySlug: "neom", display: "NEOM", country: "Saudi Arabia", currency: "SAR" },
];

export function findCityRef(slug: string): CityRef | null {
  return CITY_REFS.find((c) => c.slug === slug) ?? null;
}

export function findCityRefByRegion(region: Region, regionCitySlug: string): CityRef | null {
  return CITY_REFS.find((c) => c.region === region && c.regionCitySlug === regionCitySlug) ?? null;
}

// ────────────────────────────────────────────────
// Comparison pairs — high-search-volume only
// ────────────────────────────────────────────────
//
// Rules of thumb for inclusion:
//   • Major global wealth corridor (Dubai ↔ London, Dubai ↔ NY, Dubai ↔ Singapore)
//   • Substitutable lifestyle markets (Lisbon ↔ Barcelona, Marbella ↔ Ibiza-style)
//   • Same-region rival cities (Madrid ↔ Barcelona, Manchester ↔ London)
//   • Cross-border residency plays (Istanbul ↔ Dubai, Portugal ↔ Spain)

export type ComparisonPair = {
  slug: string;           // a-vs-b
  a: string;              // city slug
  b: string;              // city slug
  thesis: string;         // 1-line editorial thesis for hero subtitle
};

function pair(a: string, b: string, thesis: string): ComparisonPair {
  return { slug: `${a}-vs-${b}`, a, b, thesis };
}

export const COMPARISON_PAIRS: ComparisonPair[] = [
  // Dubai as global hub — paired with every major money centre
  pair("dubai", "london", "The tax-free growth market vs the world's most mature prime capital."),
  pair("dubai", "new-york", "Two transaction engines on opposite sides of the leverage cycle."),
  pair("dubai", "singapore", "Zero income tax vs the world's highest buyer stamp duty."),
  pair("dubai", "miami", "The UAE's yield play vs Florida's domestic migration magnet."),
  pair("dubai", "istanbul", "Premium dollar-linked prices vs lira-discounted citizenship plays."),
  pair("dubai", "riyadh", "Established expat market vs the fastest-growing GCC capital."),
  pair("dubai", "abu-dhabi", "UAE's volume and velocity vs its quieter, more institutional neighbour."),
  pair("dubai", "lisbon", "The Gulf's yield market vs Europe's lifestyle-led capital play."),
  pair("dubai", "madrid", "Off-plan volume and yields vs Spain's deepest prime resale market."),
  pair("dubai", "barcelona", "Investor-led off-plan vs restricted-licence Mediterranean prime."),

  // London as Europe's benchmark
  pair("london", "new-york", "The two global cities that set the world's prime benchmark."),
  pair("london", "paris", "N/A"), // placeholder — Paris not in our data; will be filtered out below
  pair("london", "lisbon", "Post-Brexit capital vs Europe's warmest residency-friendly capital."),
  pair("london", "madrid", "The anchor Anglo prime market vs Southern Europe's fastest-climbing capital."),
  pair("london", "barcelona", "Global-finance capital vs supply-constrained Mediterranean city."),
  pair("london", "dubai", "Mirror of dubai-vs-london for query symmetry — canonicalised to the primary slug."), // will dedupe
  pair("london", "manchester", "The prime capital vs Britain's highest-growth northern powerhouse."),
  pair("london", "edinburgh", "Global finance capital vs Scotland's prime and festival-driven market."),
  pair("london", "miami", "Established sterling prime vs dollar-denominated growth market."),

  // NY as US benchmark
  pair("new-york", "miami", "Northeast financial capital vs tax-advantaged Sunbelt migration story."),
  pair("new-york", "los-angeles", "Coast vs coast — density and yield vs spread-out luxury and sun."),
  pair("new-york", "london", "Symmetry of london-vs-new-york."),

  // Spain internal + cross-border
  pair("madrid", "barcelona", "Capital-market liquidity vs restricted-licence Mediterranean prime."),
  pair("madrid", "lisbon", "Iberia's two capitals — which beats which on yield and capital growth."),
  pair("barcelona", "lisbon", "Two of Europe's most watched coastal-city resets, side by side."),
  pair("marbella", "ibiza", "N/A"), // placeholder — not in CITY_REFS
  pair("marbella", "algarve", "Spain's Costa del Sol luxury anchor vs Portugal's lifestyle coast."),
  pair("barcelona", "madrid", "Symmetry."),

  // Portugal
  pair("lisbon", "porto", "Portugal's capital premium vs Porto's value-first second-city story."),
  pair("lisbon", "algarve", "Urban residency play vs the golf-and-golden-coast rental market."),
  pair("porto", "algarve", "Portugal's deepest resale stock vs its most tourism-driven returns."),
  pair("lisbon", "barcelona", "Symmetry."),

  // Turkey
  pair("istanbul", "antalya", "Bosphorus-facing citizenship prime vs the Mediterranean holiday-let corridor."),
  pair("istanbul", "bodrum", "City wealth vs Aegean luxury second-home demand."),
  pair("istanbul", "dubai", "Symmetry."),
  pair("antalya", "bodrum", "Two very different Turkish coasts — year-round vs seasonal."),

  // Saudi
  pair("riyadh", "jeddah", "The administrative capital vs the Red Sea commercial hub."),
  pair("riyadh", "dubai", "Symmetry."),
  pair("riyadh", "neom", "Established market vs the world's largest speculative greenfield."),

  // UK internal
  pair("manchester", "london", "Symmetry."),
  pair("manchester", "edinburgh", "Northern English yield vs Scottish capital prime."),

  // USA internal
  pair("miami", "los-angeles", "Sun-belt vs coast — which spends the next decade better."),
  pair("miami", "new-york", "Symmetry."),

  // UAE internal
  pair("abu-dhabi", "dubai", "Symmetry."),
  pair("abu-dhabi", "ras-al-khaimah", "Institutional capital vs RAK's emerging yield-and-tourism story."),
];

// Dedupe + filter:
//  • Drop any pair where either side isn't in CITY_REFS (e.g. Paris, Ibiza).
//  • Canonicalise so "dubai-vs-london" wins over "london-vs-dubai".
export function getCanonicalComparisonPairs(): ComparisonPair[] {
  const knownSlugs = new Set(CITY_REFS.map((c) => c.slug));
  const seen = new Set<string>();
  const out: ComparisonPair[] = [];

  for (const p of COMPARISON_PAIRS) {
    if (!knownSlugs.has(p.a) || !knownSlugs.has(p.b)) continue;
    if (p.a === p.b) continue;
    const canonical = [p.a, p.b].sort().join("|");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    // Canonical URL uses the order specified in the first non-symmetry entry
    // we saw (which is the editorially chosen side). If the first occurrence
    // was a symmetry placeholder, skip — the primary pair will have been added.
    if (p.thesis.toLowerCase().startsWith("symmetry") || p.thesis === "N/A") continue;
    out.push(p);
  }
  return out;
}

// ────────────────────────────────────────────────
// Migration corridors
// ────────────────────────────────────────────────

export type OriginCountry = {
  slug: string;       // URL slug for /moving-to/<origin>-to-<target>
  display: string;
  flag: string;       // emoji for the hero
  currency: string;
};

// Origin countries we publish migration pages for. Not all of these are
// Regions — India, China, Russia, Germany are pure buyer-origin countries.
export const ORIGIN_COUNTRIES: OriginCountry[] = [
  { slug: "uk", display: "the UK", flag: "🇬🇧", currency: "GBP" },
  { slug: "us", display: "the US", flag: "🇺🇸", currency: "USD" },
  { slug: "india", display: "India", flag: "🇮🇳", currency: "INR" },
  { slug: "china", display: "China", flag: "🇨🇳", currency: "CNY" },
  { slug: "russia", display: "Russia", flag: "🇷🇺", currency: "RUB" },
  { slug: "germany", display: "Germany", flag: "🇩🇪", currency: "EUR" },
];

// Target destinations — these must map to a Region for tool/broker linking.
export type TargetDestination = {
  slug: string;           // URL piece (e.g. "uae", "portugal", "spain")
  region: Region;
  display: string;        // "UAE", "Portugal"
  primaryCity: string;    // CityRef slug — used for hero stats ("moving to UAE" → Dubai headlines)
  flag: string;
};

export const TARGET_DESTINATIONS: TargetDestination[] = [
  { slug: "uae",      region: "uae",      display: "the UAE",   primaryCity: "dubai",    flag: "🇦🇪" },
  { slug: "portugal", region: "portugal", display: "Portugal",  primaryCity: "lisbon",   flag: "🇵🇹" },
  { slug: "spain",    region: "spain",    display: "Spain",     primaryCity: "madrid",   flag: "🇪🇸" },
  { slug: "turkey",   region: "turkey",   display: "Turkey",    primaryCity: "istanbul", flag: "🇹🇷" },
  { slug: "monaco",   region: "monaco",   display: "Monaco",    primaryCity: "",         flag: "🇲🇨" },
  { slug: "uk",       region: "uk",       display: "the UK",    primaryCity: "london",   flag: "🇬🇧" },
];

// Explicit corridor list — ~20 pages. Each has bespoke editorial copy.
export type Corridor = {
  origin: string;     // OriginCountry.slug
  target: string;     // TargetDestination.slug
  thesis: string;     // one-line hero subtitle
  motivation: string; // 3–5 sentence "why this corridor"
  residencyNotes: string; // residency / visa angle specific to this pair
  costTimeline: {
    phase: string;
    timing: string;
    notes: string;
  }[];
};

export const CORRIDORS: Corridor[] = [
  {
    origin: "uk",
    target: "uae",
    thesis: "The UK's single biggest outbound corridor — zero income tax, sterling-linked wealth, warmer winters.",
    motivation:
      "The UK-to-UAE corridor is the highest-volume individual migration story we track. It's driven by three stacked factors: the UK's top-rate income tax (45%) and frozen thresholds eating real incomes, the gradual erosion of non-dom status finalised in 2025, and a family-and-schools infrastructure in Dubai and Abu Dhabi that now rivals anywhere in the world. Typical buyer: mid-career professional or business owner, £700k-£3m budget, buying a villa or ready apartment in Dubai Hills, Palm Jumeirah, or Saadiyat Island. Rental yields of 5-7% are a pleasant secondary to the headline tax saving.",
    residencyNotes:
      "The UAE Golden Visa (10-year renewable) is the dominant path — AED 2m property investment threshold, straightforward for UK citizens with clean records. Investor and remote-worker visas offer shorter-term alternatives. UK tax residence is lost from the date of physical departure subject to the Statutory Residence Test — get a cross-border accountant involved before you exchange.",
    costTimeline: [
      { phase: "Property search + due diligence", timing: "4–8 weeks", notes: "Off-plan vs ready matters for visa timing — ready completes faster." },
      { phase: "Exchange + 4% DLD fee", timing: "Day of sale", notes: "DLD + agent fees run ~6–7% of price all-in." },
      { phase: "Golden Visa application", timing: "3–6 weeks post-completion", notes: "Medical + Emirates ID issued during processing." },
      { phase: "Relocation + school placements", timing: "8–12 weeks", notes: "Best Dubai/AD schools often waitlisted — start early." },
      { phase: "UK tax-residency exit", timing: "Tax year-aligned", notes: "SRT day counting is strict; document your timeline." },
    ],
  },
  {
    origin: "uk",
    target: "portugal",
    thesis: "Europe's softest-landing residency market — a flight from the UK, similar time zone, lower cost base.",
    motivation:
      "Portugal has become the default European lifestyle migration destination for UK citizens post-Brexit. The NHR 2.0 regime is narrower than the original but still attractive for qualifying professions and retirees. Lisbon and the Algarve dominate demand; Porto is catching up on the value side. Typical buyer: near-retirement or remote-working family, £400k-£1.5m budget, buying an apartment in Lisbon or a villa in the Algarve.",
    residencyNotes:
      "The Golden Visa now requires fund/investment routes rather than direct property purchase, but the D7 (passive income) and D8 (digital nomad) visas are both well-trodden. Citizenship eligibility opens at 5 years of residency. Portuguese tax residence kicks in at 183 days physically present — plan your first full year carefully.",
    costTimeline: [
      { phase: "Property hunt + NIF setup", timing: "4–6 weeks", notes: "Get a Portuguese tax number (NIF) before you view — every broker will ask." },
      { phase: "CPCV (promissory contract)", timing: "Week 6–8", notes: "10% deposit + IMT estimate." },
      { phase: "Escritura (deed)", timing: "Week 10–14", notes: "IMT + 0.8% stamp duty paid at deed." },
      { phase: "Visa application", timing: "Parallel", notes: "D7 or D8 lodged at consulate; residence card issued on arrival." },
      { phase: "NHR 2.0 registration", timing: "By 31 March Y+1", notes: "Strict deadline — miss it and you lose the regime for 10 years." },
    ],
  },
  {
    origin: "uk",
    target: "spain",
    thesis: "Mediterranean-side residency, bigger cities than Portugal, more direct flights.",
    motivation:
      "Spain captures the UK buyers who want a bigger country, better transport, and a wider spread of city-vs-coast options than Portugal. Malaga, Marbella, Madrid and Barcelona dominate. Spain's abolition of the Golden Visa in April 2025 has pushed more buyers onto the Non-Lucrative Visa (NLV) and Digital Nomad Visa (DNV) routes, but the real estate demand has barely flinched. Typical buyer: £500k-£2m, mid-to-late career or retiring.",
    residencyNotes:
      "Golden Visa is closed as of April 2025. Current paths: Non-Lucrative Visa (passive income), Digital Nomad Visa (remote worker), or Beckham Law for qualifying high earners relocating with an employer. Spain taxes worldwide income and wealth — get a gestor involved before moving.",
    costTimeline: [
      { phase: "NIE + property search", timing: "3–6 weeks", notes: "NIE (foreigner ID) needed before any purchase paperwork." },
      { phase: "Arras contract", timing: "Week 6–8", notes: "10% deposit, doubles-back if seller walks." },
      { phase: "Escritura + ITP (6–10%)", timing: "Week 10–14", notes: "Rates vary by Comunidad Autónoma." },
      { phase: "Visa lodged at Spanish consulate", timing: "Parallel", notes: "NLV needs proof of €28k+ annual passive income per primary applicant." },
      { phase: "Empadronamiento + tax registration", timing: "First 30 days in-country", notes: "Ties you to your municipality and starts the tax residence clock." },
    ],
  },
  {
    origin: "us",
    target: "portugal",
    thesis: "The biggest US-to-Europe lifestyle corridor — affordable, English-friendly, Atlantic-facing.",
    motivation:
      "Portugal is the runaway #1 destination for US citizens buying or relocating to Europe. It's Atlantic-facing (one flight from the East Coast), English-widely-spoken, safer than almost anywhere in Europe by most measures, and materially cheaper than coastal US metros. Lisbon and the Algarve are saturated with American buyers; Porto is increasingly Americanised. Typical buyer: $500k-$1.5m, remote-working or pre-retirement.",
    residencyNotes:
      "D7 (passive income) and D8 (digital nomad) visas are the go-to routes. Golden Visa via investment funds remains open. The US-Portugal tax treaty prevents double taxation, but Portugal still taxes worldwide income — structure with a cross-border CPA. Citizenship at 5 years means a second passport is on the table.",
    costTimeline: [
      { phase: "NIF (Portuguese tax ID)", timing: "1–2 weeks remotely", notes: "Required before any property viewing or lease." },
      { phase: "Property search + offer", timing: "4–8 weeks", notes: "Lisbon moves fast; Algarve has more inventory." },
      { phase: "CPCV + 10% deposit", timing: "Week 8–10", notes: "Binding promissory contract." },
      { phase: "Escritura + IMT + IS", timing: "Week 12–16", notes: "All-in ~7–10% above price." },
      { phase: "Visa + residence card", timing: "8–16 weeks", notes: "D8 fast-tracked for qualifying remote workers." },
    ],
  },
  {
    origin: "us",
    target: "uae",
    thesis: "Fast-growing corridor — zero income tax, dollar-pegged currency, scaling family infrastructure.",
    motivation:
      "US-to-UAE is smaller than UK-to-UAE but accelerating fast — driven by remote-work founders, Web3 operators, and finance professionals who want a zero-income-tax base with direct flights to both Asia and Europe. The AED's peg to the USD removes currency risk for Americans. Biggest caveat: US citizens are taxed on worldwide income regardless of where they live, so UAE residency doesn't eliminate the IRS — but it does eliminate state income tax and FEIE-eligible earned income up to the annual cap.",
    residencyNotes:
      "Golden Visa (AED 2m property) is the dominant path. US citizens retain US tax obligations — FEIE, foreign tax credits, and state-severance planning all matter. Work with a US/UAE cross-border tax advisor before committing.",
    costTimeline: [
      { phase: "Property + DLD fees", timing: "4–8 weeks", notes: "Ready preferred for faster visa." },
      { phase: "Golden Visa", timing: "3–6 weeks", notes: "Includes medical, biometrics, Emirates ID." },
      { phase: "US state exit planning", timing: "Parallel", notes: "Severing state ties (CA, NY) is the fiddly bit." },
      { phase: "FBAR + FATCA setup", timing: "Ongoing", notes: "New UAE bank accounts = new reporting obligations." },
      { phase: "Relocation", timing: "6–10 weeks", notes: "Container shipping from US east coast ~6 weeks." },
    ],
  },
  {
    origin: "us",
    target: "spain",
    thesis: "Mediterranean lifestyle, deeper culture and cities than Portugal, trickier tax.",
    motivation:
      "US citizens moving to Spain get a bigger country than Portugal with better food, better football, and deeper cities — at the cost of a more complex tax regime. Madrid, Barcelona, Valencia and Malaga dominate American demand. Typical buyer: $600k-$2m, often pre- or post-retirement.",
    residencyNotes:
      "Non-Lucrative Visa (NLV) is the dominant path for retirees and passive-income buyers. Digital Nomad Visa for remote workers. Spain taxes worldwide income AND wealth above regional thresholds — US citizens in Spain typically pay more Spanish tax than US tax, with a credit against US liability.",
    costTimeline: [
      { phase: "NIE + tax-advisor onboarding", timing: "2–4 weeks", notes: "Start with the gestor, not the agent." },
      { phase: "Property search", timing: "4–8 weeks", notes: "Madrid/Barcelona tighter than the coast." },
      { phase: "Arras + escritura", timing: "10–14 weeks", notes: "ITP 6–10% + notary/registry ~2%." },
      { phase: "NLV at consulate", timing: "Parallel", notes: "Proof of $30k+ passive income required." },
      { phase: "TIE (residence card) + empadronamiento", timing: "First 30 days", notes: "Wealth tax / IRPF clock starts now." },
    ],
  },
  {
    origin: "india",
    target: "uae",
    thesis: "The largest single foreign-buyer corridor in Dubai — geography, tax, and family infrastructure stacked.",
    motivation:
      "Indian buyers are consistently the #1 foreign nationality in Dubai's transaction register. The drivers: 2.5-hour flights from every major Indian city, zero inheritance and income tax, AED-INR trade scale, and a network effect — every Indian buyer knows another Indian buyer. Typical buyer: Mumbai, Delhi, or Bangalore-based family, AED 1.5m-8m budget, buying a villa in Dubai Hills or an apartment in Downtown/Marina. LRS remittance limits of USD 250k per person per year are the main binding constraint.",
    residencyNotes:
      "Golden Visa at AED 2m property threshold is the standard route. Indian citizens benefit from the India-UAE DTAA (double taxation avoidance agreement) — provided UAE tax residence is genuinely established (~183 days + substance test), overseas income can be repatriated tax-efficiently. LRS and RBI remittance rules are the operational headache.",
    costTimeline: [
      { phase: "LRS remittance planning", timing: "Start 6–12 months out", notes: "Multi-year, multi-person family planning." },
      { phase: "Property + DLD 4% fee", timing: "4–8 weeks", notes: "Ready + handover preferred for immediate visa." },
      { phase: "Golden Visa + Emirates ID", timing: "3–6 weeks", notes: "Dependents covered under the sponsor." },
      { phase: "UAE tax-residency certificate", timing: "After 183 days", notes: "Required to claim DTAA benefits." },
      { phase: "Indian FEMA / RBI filings", timing: "Ongoing", notes: "LRS annual declarations + outward remittance records." },
    ],
  },
  {
    origin: "china",
    target: "uae",
    thesis: "Second-largest non-GCC buyer source after India — capital flight, geography, and Belt-and-Road trade.",
    motivation:
      "Chinese demand for Dubai real estate accelerated through 2024-2026 as capital controls tightened at home and mainland property underperformed. Dubai sits on direct flights from Beijing, Shanghai, Shenzhen and Guangzhou, and the Chinese-speaking agent and professional services infrastructure has matured rapidly. Typical buyer: HNW mainland family, AED 3m+ budget, often purchasing through a Chinese-speaking brokerage.",
    residencyNotes:
      "Golden Visa is the standard path. Mainland Chinese FX controls (USD 50k per person annual quota) are the binding operational constraint — buyers typically use pre-positioned Hong Kong or Singapore structures, Bitcoin bridges (with full legal compliance), or corporate-route purchases through BVI/HK holding companies.",
    costTimeline: [
      { phase: "Fund pre-positioning (HK/SG structure)", timing: "3–12 months", notes: "Operational cornerstone." },
      { phase: "Property + DLD 4%", timing: "4–8 weeks", notes: "Off-plan acceptable for larger deployments." },
      { phase: "Golden Visa", timing: "3–6 weeks", notes: "Mandarin-speaking PROs available in most UAE brokerages." },
      { phase: "Chinese reporting", timing: "Ongoing", notes: "SAFE compliance for outward remittance chains." },
      { phase: "Relocation (family, schools)", timing: "3–6 months", notes: "Chinese-curriculum and bilingual schools expanding." },
    ],
  },
  {
    origin: "china",
    target: "uk",
    thesis: "London's longest-running foreign-buyer corridor — education, prime capital, visa overhaul.",
    motivation:
      "Chinese demand for London prime has been the single most persistent foreign-buyer story of the last 15 years. The drivers: UK university placements, prime central London as a store of value, and the City of London's role as the offshore RMB hub. The overhauled UK immigration regime (Investor Tier 1 closed in 2022, HK BN(O) visa, Global Talent) has shifted the mix but not the flow. Typical buyer: £1.5m+, Prime Central London apartment.",
    residencyNotes:
      "No more Tier 1 Investor. Current paths: Global Talent, Skilled Worker sponsorship, BN(O) for Hong Kong British Nationals Overseas (the single largest post-2020 Chinese-origin inflow), and the High-Potential Individual visa for top-university graduates. UK SDLT 2% non-resident surcharge applies on top of standard bands.",
    costTimeline: [
      { phase: "Prime agent engagement", timing: "4–8 weeks", notes: "PCL stock is tightly held; off-market dominates." },
      { phase: "Legal + AML onboarding", timing: "Parallel", notes: "UK AML rules are strict for non-UK-source funds." },
      { phase: "Exchange + SDLT", timing: "Week 10–14", notes: "Standard SDLT + 2% non-resident + 3% additional for second home = 5% surcharge worst case." },
      { phase: "Completion + registration", timing: "4–8 weeks after exchange", notes: "HMLR registration finalises ownership." },
      { phase: "Visa route (if relocating)", timing: "Parallel, 12+ weeks", notes: "BN(O) visa dominates HK-origin applications." },
    ],
  },
  {
    origin: "russia",
    target: "uae",
    thesis: "Largest post-2022 relocation corridor — sanctions-neutral, family-friendly, dollar-linked.",
    motivation:
      "UAE became the most-watched destination for Russian relocations after 2022. The UAE has not joined Western sanctions regimes, remains dollar-linked, and has a large, well-established Russian-speaking professional community. Dubai dominates (especially Marina, JBR, Palm), with a growing Ras Al Khaimah second-home segment. Typical buyer: former Moscow or St Petersburg tech, finance, or resource-sector professional, AED 2-10m+ budget.",
    residencyNotes:
      "Golden Visa at AED 2m remains the standard route. UAE has no sanctions restrictions on Russian buyers as of this writing, but UAE banks apply enhanced due diligence — expect 4–12 week onboarding. Ruble-to-AED remittance typically routes via UAE exchange houses or intermediate CIS jurisdictions.",
    costTimeline: [
      { phase: "Bank onboarding / EDD", timing: "4–12 weeks", notes: "Main blocker — plan first." },
      { phase: "Property + DLD 4%", timing: "4–8 weeks", notes: "Ready preferred for immediate visa." },
      { phase: "Golden Visa", timing: "3–6 weeks", notes: "Russian-speaking PROs widely available." },
      { phase: "Schools + family relocation", timing: "8–16 weeks", notes: "Russian-curriculum schools expanding." },
      { phase: "Remittance / wealth structuring", timing: "Ongoing", notes: "Cross-border CPA required." },
    ],
  },
  {
    origin: "russia",
    target: "monaco",
    thesis: "Europe's most exclusive sanctions-conscious destination — tiny market, tight due diligence.",
    motivation:
      "Monaco continues to host a meaningful Russian-origin resident population, though post-2022 the due-diligence bar has risen sharply. For compliant, sanctions-screened families with multi-generational EU linkage, Monaco offers zero income tax on residents, a fully-controlled micro-state environment, and some of the most concentrated prime real estate on earth. Average prices above €53,000/sqm make this the most expensive corridor we track.",
    residencyNotes:
      "Residency requires either a 500k-EUR+ Monaco bank deposit or property purchase plus clean criminal and financial background. Sanctions screening is now a hard gate — many banks will not onboard Russian-passport clients irrespective of tax residence. EU-passport routes (Cyprus, Malta, etc.) used to be a backdoor and have mostly closed.",
    costTimeline: [
      { phase: "Pre-screening + bank relationship", timing: "2–6 months", notes: "Absolute first step." },
      { phase: "Property search (ultra-tight)", timing: "3–12 months", notes: "Off-market dominates." },
      { phase: "Acquisition + registration tax", timing: "8–12 weeks", notes: "Registration tax ~4.5%." },
      { phase: "Residency application", timing: "3–6 months", notes: "Includes police certificate, bank reference, property proof." },
      { phase: "Family relocation", timing: "6–12 months", notes: "Schools (ISM) and healthcare placements." },
    ],
  },
  {
    origin: "russia",
    target: "turkey",
    thesis: "The cheapest residency path on the Euro-Asia seam — citizenship by investment still live.",
    motivation:
      "Turkey is the only major destination still offering citizenship by property investment (USD 400k threshold). Istanbul and Antalya dominate Russian demand. The lira volatility is a structural feature — Russian buyers tend to buy USD-denominated off-plan to hedge. Typical buyer: USD 400k-1.2m, looking for a third passport and a warm-water base.",
    residencyNotes:
      "Citizenship by Investment: USD 400k in property (must be held 3 years), passport in ~6–9 months. Short-term residence permits for sub-threshold buyers still available. Turkey has cooperated with Western sanctions only selectively — individual screening still applies.",
    costTimeline: [
      { phase: "Pre-approval + eligibility check", timing: "2–4 weeks", notes: "Title checks critical." },
      { phase: "Property purchase (USD appraisal)", timing: "4–8 weeks", notes: "Official USD valuation must exceed $400k." },
      { phase: "CBI application", timing: "4–8 weeks", notes: "Filed via lawyer." },
      { phase: "Passport issued", timing: "4–6 months", notes: "Family members included." },
      { phase: "Long-term holding", timing: "3 years", notes: "Property cannot be sold during hold period." },
    ],
  },
  {
    origin: "germany",
    target: "portugal",
    thesis: "Germany's largest EU-internal lifestyle corridor — Schengen-easy, NHR-aware.",
    motivation:
      "Germany-to-Portugal is a structural demographic story. Post-Covid remote work, Portugal's warmer winters, and NHR's favourability vs Germany's headline tax rates have pulled a steady stream of German professionals and pre-retirees south. Typical buyer: €400k-€1.2m, Lisbon or Algarve, often a second home first before moving residency.",
    residencyNotes:
      "No visa required — EU free movement. Tax residence triggers at 183 days physically present or centre of vital interests. NHR 2.0 is the tax headline but eligibility is narrower than under the original regime. Germany's exit-tax rules on shareholdings >1% apply to moves abroad.",
    costTimeline: [
      { phase: "NIF + property search", timing: "4–6 weeks", notes: "No visa barrier = faster than non-EU buyers." },
      { phase: "CPCV + 10% deposit", timing: "Week 6–8", notes: "Standard Portuguese process." },
      { phase: "Escritura + taxes", timing: "Week 10–14", notes: "IMT + 0.8% stamp." },
      { phase: "Residency registration", timing: "30 days post-arrival", notes: "Certificado de Registo de Cidadão da União at city hall." },
      { phase: "NHR 2.0 (if eligible)", timing: "By 31 March Y+1", notes: "Tight deadline." },
    ],
  },
  {
    origin: "germany",
    target: "spain",
    thesis: "The Mediterranean classic — bigger and cheaper than Portugal, same EU-free-movement ease.",
    motivation:
      "Germans are the second-largest foreign buyer group in the Spanish property market after the British. Mallorca, Costa Blanca, Barcelona, and Madrid dominate. No visa barrier means this corridor skews older and more casual than the UK/US flows. Typical buyer: €350k-€1m, often a second home that gradually becomes primary.",
    residencyNotes:
      "No visa required. Tax residence at 183 days or centre of vital interests. Spanish wealth tax applies above regional thresholds (€500k–€3m depending on Comunidad) — Madrid still has a 100% bonification, so wealthy German retirees often choose Madrid for that reason alone. Beckham Law available for qualifying high earners relocating with an employer.",
    costTimeline: [
      { phase: "NIE + property search", timing: "4–6 weeks", notes: "NIE needed before any transaction." },
      { phase: "Arras + escritura", timing: "8–12 weeks", notes: "ITP 6–10% varies by region." },
      { phase: "Empadronamiento", timing: "First 30 days", notes: "Ties residency to a municipality." },
      { phase: "Tax registration", timing: "Tax-year aligned", notes: "Beckham Law election if eligible." },
      { phase: "German exit-tax check", timing: "Before move", notes: "Share ownership >1% may trigger §6 AStG." },
    ],
  },
];

// ────────────────────────────────────────────────
// FAQ templates
// ────────────────────────────────────────────────

export type FAQ = { q: string; a: string };

/**
 * Generate a default 5-FAQ set for a city page. The caller can override by
 * appending additional question/answer pairs before rendering.
 */
export function cityFAQs(args: {
  city: string;
  country: string;
  currency: string;
  pricePerUnit: number;
  unitLabel: string;
  yoyChange: number;
  grossYield?: number;
  topNeighborhoods: string[];
}): FAQ[] {
  const { city, country, currency, pricePerUnit, unitLabel, yoyChange, grossYield, topNeighborhoods } = args;
  const yoyDirection = yoyChange > 0 ? "up" : yoyChange < 0 ? "down" : "flat";
  const priceStr = `${currency} ${pricePerUnit.toLocaleString()}/${unitLabel}`;
  const yieldStr = grossYield != null ? `${grossYield.toFixed(1)}%` : "6%";

  return [
    {
      q: `What's the average property price in ${city}?`,
      a: `Based on Q1 2026 transaction and listing data, the citywide blended average in ${city} is approximately ${priceStr}. Prices have moved ${yoyDirection} ${Math.abs(yoyChange).toFixed(1)}% year-on-year. Premium neighbourhoods (${topNeighborhoods.slice(0, 2).join(", ")}) trade materially above this figure, while mid-market zones sit below.`,
    },
    {
      q: `What's the typical rental yield in ${city}?`,
      a: `${city}'s blended gross rental yield is approximately ${yieldStr}. Yields vary significantly by neighbourhood: mid-market and high-density apartment zones tend to run 1–2 percentage points above the city average, while ultra-prime villa communities yield materially lower because rental stock is thinner and returns are driven by capital growth instead.`,
    },
    {
      q: `Are there restrictions for foreign buyers in ${city}?`,
      a: `${country}'s foreign-ownership rules apply at the national level — see our region guide and residency tools for full detail. In ${city} specifically, the practical considerations are due diligence on title, developer track record (for off-plan), and whether your purchase qualifies you for residency under ${country}'s investor-visa programmes.`,
    },
    {
      q: `What neighbourhoods should I look at in ${city}?`,
      a: `Our top-performing neighbourhoods by a blend of liquidity, yield, and data quality are: ${topNeighborhoods.slice(0, 5).join(", ")}. The right choice depends on strategy — yield hunters, end-users, and capital-growth investors all optimise for different areas, which our neighbourhood and yield-heatmap tools break out.`,
    },
    {
      q: `Is now a good time to buy in ${city}?`,
      a: `${city} is running at a ${yoyDirection} ${Math.abs(yoyChange).toFixed(1)}% annual rate into Q1 2026. Whether that's a good entry point depends on your holding period and leverage — we'd suggest running a specific listing through our deal-scoring and rent-vs-buy tools rather than timing the market on headline numbers.`,
    },
  ];
}

/** Comparison-page FAQ template (5 Q&As). */
export function compareFAQs(args: {
  a: string;
  b: string;
  countryA: string;
  countryB: string;
}): FAQ[] {
  const { a, b, countryA, countryB } = args;
  return [
    {
      q: `Which is a better real estate investment, ${a} or ${b}?`,
      a: `Neither market dominates on every axis — the right answer depends on whether you're optimising for rental yield, capital growth, tax efficiency, or residency. Our side-by-side comparison above breaks out the key metrics; the "Who each market is best for" section translates the numbers into buyer profiles.`,
    },
    {
      q: `How do rental yields in ${a} compare to ${b}?`,
      a: `See the yield row in the comparison table above — yields reflect gross rent against asking price on the dominant unit type in each city. Mid-market neighbourhoods typically run 1–2 percentage points above the city average in both cities.`,
    },
    {
      q: `What are the transaction costs for buying in ${a} vs ${b}?`,
      a: `${countryA} and ${countryB} have materially different transaction-tax regimes — see the tax/transaction-cost section above. All-in closing costs are the most direct like-for-like comparison: they typically land between 4% and 12% of purchase price depending on jurisdiction.`,
    },
    {
      q: `Can a foreign buyer purchase property in both ${a} and ${b}?`,
      a: `Yes in both cases, subject to each country's foreign-ownership and residency rules. Our regional tool pages cover eligibility, visa routes, and any restrictions on freehold vs leasehold for non-residents.`,
    },
    {
      q: `Which market is more liquid — ${a} or ${b}?`,
      a: `Liquidity is best captured by transaction volume and days-on-market, both in the headline stats. In general, the higher-volume market is easier to exit but also typically more correlated to headline news; the lower-volume market rewards patience and local relationships.`,
    },
  ];
}

/** Corridor-page FAQ template (5 Q&As). */
export function corridorFAQs(args: {
  origin: string;
  target: string;
  targetCountry: string;
}): FAQ[] {
  const { origin, target, targetCountry } = args;
  return [
    {
      q: `What's the best residency path when moving from ${origin} to ${target}?`,
      a: `Every corridor has a dominant route — see the Residency Considerations section above for the specific visa we'd recommend and the alternatives. In almost every case, speaking to an immigration lawyer who handles both jurisdictions is the single highest-leverage thing you can do before committing funds.`,
    },
    {
      q: `How long does it take to move from ${origin} to ${target}?`,
      a: `The Typical Path section above maps out the realistic timeline, which usually sits between 3 and 9 months end-to-end once you've decided. Property transactions are faster; visa and residency paperwork is the long pole in the tent.`,
    },
    {
      q: `What are the tax implications of relocating from ${origin} to ${target}?`,
      a: `Tax is the most corridor-specific question and the most expensive one to get wrong. Work with a cross-border accountant who covers both jurisdictions before you exchange — our region tax pages give you a starting point but are not a substitute for personalised advice.`,
    },
    {
      q: `Do I need to sell my property in ${origin} before buying in ${target}?`,
      a: `No — plenty of buyers keep their original property as a rental or family base. What you'll want to understand is how each jurisdiction treats worldwide rental income, capital gains on eventual sale, and inheritance — the answer varies enormously by corridor.`,
    },
    {
      q: `What's the minimum investment to secure residency in ${targetCountry}?`,
      a: `See the Residency Considerations section above — thresholds change frequently and are the single most important operational number for this corridor. Check our region-level residency tools for the latest published figures.`,
    },
  ];
}

// ────────────────────────────────────────────────
// Tools available per region (re-exported for convenience)
// ────────────────────────────────────────────────
//
// We don't re-import region.ts's private constants here (the sets are already
// strict). This map picks a small editorial "featured" list per region that
// the SEO pages can link to without duplicating the larger tools index.

export const REGION_FEATURED_TOOLS: Record<Region, { slug: string; name: string; desc: string }[]> = {
  uae: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Model UAE mortgage payments across lenders before you commit." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Total-return model for Dubai and wider-UAE investment property." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "See the highest-yielding Dubai and Abu Dhabi communities at a glance." },
    { slug: "deal-scoring", name: "Deal Scoring", desc: "Know in seconds whether a UAE listing is undervalued, fair, or overpriced." },
    { slug: "golden-visa-checker", name: "Golden Visa Checker", desc: "Check your eligibility for the 10-year UAE Golden Visa." },
  ],
  uk: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Work out exact monthly payments across UK lenders." },
    { slug: "stamp-duty-calculator", name: "Stamp Duty Calculator", desc: "Know your SDLT liability — standard, FTB, or second home." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Model total return on a UK buy-to-let." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding UK cities and boroughs at a glance." },
    { slug: "deal-scoring", name: "Deal Scoring", desc: "Know in seconds whether a UK listing is fairly priced." },
  ],
  usa: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Model US mortgage payments across FHA, conventional, jumbo." },
    { slug: "closing-cost-calculator", name: "Closing Cost Calculator", desc: "State-by-state estimate of US closing costs." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Total-return model for US investment property." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding US metros at a glance." },
    { slug: "rent-vs-buy", name: "Rent vs Buy", desc: "Break-even math for US markets." },
  ],
  spain: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Model a Spanish hipoteca with ITP and notary costs baked in." },
    { slug: "itp-calculator", name: "ITP Calculator", desc: "Resale transfer tax by Comunidad Autónoma." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Total-return model for Spanish investment property." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding Spanish cities and barrios." },
    { slug: "rent-vs-buy", name: "Rent vs Buy", desc: "Break-even on Spanish purchases." },
  ],
  portugal: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Portuguese mortgage payments with IMT and IS." },
    { slug: "imt-calculator", name: "IMT Calculator", desc: "Transfer tax brackets for mainland Portugal." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Portuguese buy-to-let total return." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding Portuguese regions." },
    { slug: "rent-vs-buy", name: "Rent vs Buy", desc: "Lisbon and Porto break-even math." },
  ],
  turkey: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Turkish lira mortgage payments with tax baked in." },
    { slug: "citizenship-eligibility", name: "Citizenship Eligibility", desc: "USD 400k threshold checker for Turkish CBI." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Turkish investment-property total return." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding Turkish cities." },
    { slug: "rent-vs-buy", name: "Rent vs Buy", desc: "Istanbul, Antalya break-even math." },
  ],
  saudi: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Saudi mortgage payments with transaction tax." },
    { slug: "premium-residency-checker", name: "Premium Residency Checker", desc: "Saudi Premium Residency eligibility." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Saudi investment-property total return." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Highest-yielding Saudi cities." },
    { slug: "rent-vs-buy", name: "Rent vs Buy", desc: "Riyadh and Jeddah break-even math." },
  ],
  monaco: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Monaco mortgage payments with registration tax." },
    { slug: "registration-tax-calculator", name: "Registration Tax Calculator", desc: "Monaco registration tax by buyer type." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Monaco total-return model." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Monaco's highest-yielding districts." },
    { slug: "residency-checker", name: "Residency Checker", desc: "Monaco residency requirements." },
  ],
  tokyo: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Japanese mortgage payments with acquisition tax." },
    { slug: "acquisition-tax-calculator", name: "Acquisition Tax Calculator", desc: "Tokyo real-estate acquisition tax." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Tokyo investment-property total return." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Tokyo's highest-yielding wards." },
    { slug: "foreign-ownership-checker", name: "Foreign Ownership Checker", desc: "Japan foreign-ownership rules." },
  ],
  singapore: [
    { slug: "mortgage-calculator", name: "Mortgage Calculator", desc: "Singapore mortgage payments with ABSD." },
    { slug: "absd-calculator", name: "ABSD Calculator", desc: "Additional Buyer's Stamp Duty." },
    { slug: "roi-calculator", name: "ROI Calculator", desc: "Singapore investment-property total return." },
    { slug: "yield-heatmap", name: "Yield Heatmap", desc: "Singapore's highest-yielding districts." },
    { slug: "foreign-buyer-checker", name: "Foreign Buyer Checker", desc: "Singapore foreign-buyer eligibility." },
  ],
};

// ────────────────────────────────────────────────
// Region transaction-cost summaries (for comparison pages)
// ────────────────────────────────────────────────
// Hand-curated single-line summaries of typical all-in transaction cost and
// buyer tax headline. Sourced from the per-region tax data files.

export const REGION_TAX_SUMMARY: Record<Region, { headline: string; range: string; note: string }> = {
  uae:      { headline: "DLD 4% transfer fee",                range: "~6–7% all-in",  note: "No income or capital-gains tax on resident owners." },
  uk:       { headline: "SDLT 0–15% banded",                  range: "~3–17% all-in", note: "Non-resident +2% and second-home +3% surcharges stack." },
  usa:      { headline: "State-dependent closing costs",      range: "~3–6% all-in",  note: "No federal transfer tax; state/city recording + title + legal vary." },
  spain:    { headline: "ITP 6–10% (resale) or IVA 10%+AJD",  range: "~9–13% all-in", note: "Varies by Comunidad Autónoma; new-build uses IVA + AJD instead." },
  portugal: { headline: "IMT banded + IS 0.8% + IMI annual",  range: "~7–10% all-in", note: "Primary-residence and youth reductions available." },
  turkey:   { headline: "Title deed fee 4% + VAT if new",     range: "~5–8% all-in",  note: "Citizenship-eligible transactions require USD 400k valuation." },
  saudi:    { headline: "5% RETT (Real Estate Transaction Tax)", range: "~6–8% all-in", note: "Foreigner-ownership restricted outside designated zones." },
  monaco:   { headline: "Registration tax 4.5% (res.) or 7.5%",  range: "~6–9% all-in", note: "Notary + agency fees additional; no annual property tax." },
  tokyo:    { headline: "Acquisition tax + registration",     range: "~7–9% all-in",  note: "Fixed Asset Tax annual; foreign ownership unrestricted." },
  singapore:{ headline: "BSD 1–6% + ABSD 60% (foreign)",      range: "~65–70% all-in (foreign)", note: "Foreigners pay the highest stamp-duty stack globally." },
};
