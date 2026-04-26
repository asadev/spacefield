// Shared game data — Dubai market scenarios, events, area profiles for games

export interface MarketEvent {
  year: number;
  quarter: number;
  title: string;
  description: string;
  impact: Record<string, number>; // area → price change multiplier (e.g., 1.05 = +5%)
  globalImpact: number; // fallback multiplier for areas not specified
  rentImpact: number; // multiplier for rental yields
  category: "boom" | "correction" | "policy" | "infrastructure" | "global";
}

export interface GameArea {
  name: string;
  segment: "luxury" | "mid" | "affordable";
  basePriceSqft: number; // 2020 baseline
  baseYield: number; // %
  volatility: number; // 0-1, higher = more price swings
  avgServiceCharge: number; // per sqft/yr
  goldenVisa: boolean;
  description: string;
}

export const GAME_AREAS: GameArea[] = [
  { name: "Palm Jumeirah", segment: "luxury", basePriceSqft: 1800, baseYield: 4.8, volatility: 0.6, avgServiceCharge: 28, goldenVisa: true, description: "Iconic island, ultra-luxury, beach living" },
  { name: "Downtown Dubai", segment: "luxury", basePriceSqft: 1600, baseYield: 5.2, volatility: 0.5, avgServiceCharge: 30, goldenVisa: true, description: "Burj Khalifa, Dubai Mall, city center" },
  { name: "Dubai Marina", segment: "luxury", basePriceSqft: 1200, baseYield: 5.8, volatility: 0.45, avgServiceCharge: 22, goldenVisa: true, description: "Waterfront high-rises, JBR walk" },
  { name: "Business Bay", segment: "mid", basePriceSqft: 1000, baseYield: 6.2, volatility: 0.5, avgServiceCharge: 20, goldenVisa: false, description: "Canal views, CBD adjacent" },
  { name: "Dubai Hills Estate", segment: "mid", basePriceSqft: 900, baseYield: 5.5, volatility: 0.4, avgServiceCharge: 18, goldenVisa: true, description: "Golf course, family community, Emaar" },
  { name: "JVC", segment: "affordable", basePriceSqft: 550, baseYield: 7.5, volatility: 0.55, avgServiceCharge: 14, goldenVisa: false, description: "Highest volume, family-friendly, central" },
  { name: "Creek Harbour", segment: "mid", basePriceSqft: 1100, baseYield: 5.0, volatility: 0.45, avgServiceCharge: 20, goldenVisa: true, description: "Emaar master plan, creek views" },
  { name: "JLT", segment: "mid", basePriceSqft: 750, baseYield: 6.5, volatility: 0.4, avgServiceCharge: 16, goldenVisa: false, description: "Free zone proximity, lake views" },
  { name: "Arjan", segment: "affordable", basePriceSqft: 450, baseYield: 8.0, volatility: 0.65, avgServiceCharge: 12, goldenVisa: false, description: "Emerging area, Miracle Garden, high growth" },
  { name: "International City", segment: "affordable", basePriceSqft: 300, baseYield: 8.8, volatility: 0.7, avgServiceCharge: 8, goldenVisa: false, description: "Cheapest entry point, Dragon Mart" },
  { name: "Dubai South", segment: "affordable", basePriceSqft: 380, baseYield: 7.8, volatility: 0.75, avgServiceCharge: 10, goldenVisa: false, description: "Al Maktoum Airport, long-term bet" },
  { name: "Town Square", segment: "affordable", basePriceSqft: 480, baseYield: 7.2, volatility: 0.5, avgServiceCharge: 12, goldenVisa: false, description: "Self-contained community, Nshama" },
  { name: "DIFC", segment: "luxury", basePriceSqft: 1700, baseYield: 4.5, volatility: 0.55, avgServiceCharge: 32, goldenVisa: true, description: "Financial center, premium corporate" },
  { name: "Sports City", segment: "affordable", basePriceSqft: 500, baseYield: 7.0, volatility: 0.5, avgServiceCharge: 13, goldenVisa: false, description: "Stadium district, canal views" },
  { name: "Al Furjan", segment: "mid", basePriceSqft: 620, baseYield: 6.8, volatility: 0.5, avgServiceCharge: 14, goldenVisa: false, description: "Metro connected, pavilion villas" },
  { name: "MBR City", segment: "luxury", basePriceSqft: 1100, baseYield: 5.0, volatility: 0.5, avgServiceCharge: 20, goldenVisa: true, description: "District One, crystal lagoon, villas" },
];

export const MARKET_EVENTS: MarketEvent[] = [
  // 2020
  { year: 2020, quarter: 1, title: "COVID-19 Pandemic", description: "Global lockdowns hit Dubai tourism and property market. Prices drop sharply.", impact: {}, globalImpact: 0.92, rentImpact: 0.88, category: "global" },
  { year: 2020, quarter: 2, title: "Market Bottom", description: "Prices reach multi-year lows. Smart money starts buying.", impact: { "International City": 0.88, "Dubai South": 0.85 }, globalImpact: 0.95, rentImpact: 0.90, category: "correction" },
  { year: 2020, quarter: 3, title: "Recovery Begins", description: "Visa reforms and remote work drive expat inflows.", impact: { "Palm Jumeirah": 1.05, "Dubai Hills Estate": 1.04 }, globalImpact: 1.02, rentImpact: 0.95, category: "policy" },
  { year: 2020, quarter: 4, title: "Golden Visa Expansion", description: "UAE expands Golden Visa to property investors. AED 2M threshold announced.", impact: { "Palm Jumeirah": 1.06, "Downtown Dubai": 1.05, "DIFC": 1.04 }, globalImpact: 1.03, rentImpact: 1.0, category: "policy" },

  // 2021
  { year: 2021, quarter: 1, title: "Vaccination Drive", description: "UAE leads global vaccination. Confidence returns.", impact: {}, globalImpact: 1.04, rentImpact: 1.02, category: "global" },
  { year: 2021, quarter: 2, title: "Expo Countdown", description: "Expo 2020 preparation drives infrastructure spending.", impact: { "Dubai South": 1.08, "JVC": 1.05, "Business Bay": 1.05 }, globalImpact: 1.05, rentImpact: 1.03, category: "infrastructure" },
  { year: 2021, quarter: 3, title: "Russian Investor Wave", description: "Geopolitical tensions drive Russian HNWIs to Dubai.", impact: { "Palm Jumeirah": 1.08, "Dubai Marina": 1.06, "Downtown Dubai": 1.06 }, globalImpact: 1.04, rentImpact: 1.03, category: "boom" },
  { year: 2021, quarter: 4, title: "Expo 2020 Opens", description: "World Expo draws millions. Dubai tourism booms.", impact: { "Dubai South": 1.10 }, globalImpact: 1.06, rentImpact: 1.05, category: "infrastructure" },

  // 2022
  { year: 2022, quarter: 1, title: "Bull Market Confirmed", description: "Transaction volumes hit records. Off-plan sales surge.", impact: { "JVC": 1.08, "Business Bay": 1.07, "Arjan": 1.09 }, globalImpact: 1.06, rentImpact: 1.05, category: "boom" },
  { year: 2022, quarter: 2, title: "Interest Rate Hikes Begin", description: "Fed raises rates. UAE follows (pegged to USD). Mortgage costs rise.", impact: { "International City": 0.98 }, globalImpact: 1.03, rentImpact: 1.04, category: "global" },
  { year: 2022, quarter: 3, title: "Crypto Winter", description: "Crypto crash reduces some speculative buyers. Minimal market impact.", impact: { "Business Bay": 1.02 }, globalImpact: 1.04, rentImpact: 1.05, category: "global" },
  { year: 2022, quarter: 4, title: "Corporate Tax Announced", description: "UAE announces 9% CT for 2023. Individual investors exempt.", impact: {}, globalImpact: 1.03, rentImpact: 1.03, category: "policy" },

  // 2023
  { year: 2023, quarter: 1, title: "Off-Plan Frenzy", description: "Developers launch record projects. Off-plan dominates transactions.", impact: { "JVC": 1.07, "Arjan": 1.08, "Dubai South": 1.06 }, globalImpact: 1.05, rentImpact: 1.04, category: "boom" },
  { year: 2023, quarter: 2, title: "Palm Jebel Ali Revival", description: "Nakheel announces Palm Jebel Ali. Surrounding areas surge.", impact: { "Dubai South": 1.09 }, globalImpact: 1.04, rentImpact: 1.03, category: "infrastructure" },
  { year: 2023, quarter: 3, title: "Rental Crisis", description: "Rents spike 20-30% in popular areas. RERA caps discussion.", impact: {}, globalImpact: 1.03, rentImpact: 1.10, category: "boom" },
  { year: 2023, quarter: 4, title: "COP28 Dubai", description: "Climate conference puts Dubai on global stage.", impact: { "Downtown Dubai": 1.04 }, globalImpact: 1.04, rentImpact: 1.03, category: "global" },

  // 2024
  { year: 2024, quarter: 1, title: "Record Transactions", description: "Dubai records highest ever quarterly transactions.", impact: { "JVC": 1.06, "Business Bay": 1.06 }, globalImpact: 1.05, rentImpact: 1.04, category: "boom" },
  { year: 2024, quarter: 2, title: "Rate Plateau", description: "Interest rates stabilize. Mortgage demand recovers.", impact: {}, globalImpact: 1.04, rentImpact: 1.03, category: "global" },
  { year: 2024, quarter: 3, title: "RERA Cooling-Off Period", description: "14-day cooling-off for off-plan. Slightly cools speculative buying.", impact: { "Arjan": 1.02, "JVC": 1.02 }, globalImpact: 1.03, rentImpact: 1.03, category: "policy" },
  { year: 2024, quarter: 4, title: "Supply Concerns", description: "72,000 units expected by 2026. Market debates oversupply.", impact: { "Arjan": 1.01, "JVC": 1.01 }, globalImpact: 1.02, rentImpact: 1.02, category: "correction" },

  // 2025
  { year: 2025, quarter: 1, title: "Market Maturation", description: "Growth slows to sustainable levels. Quality over quantity.", impact: { "Palm Jumeirah": 1.04, "Sobha Hartland": 1.05 }, globalImpact: 1.03, rentImpact: 1.03, category: "boom" },
  { year: 2025, quarter: 2, title: "AI Disruption", description: "AI-powered property platforms emerge. Market transparency improves.", impact: {}, globalImpact: 1.03, rentImpact: 1.02, category: "infrastructure" },
  { year: 2025, quarter: 3, title: "Rate Cuts Begin", description: "Fed cuts rates. UAE follows. Mortgage demand surges.", impact: { "Business Bay": 1.05, "JVC": 1.05, "Dubai Hills Estate": 1.05 }, globalImpact: 1.04, rentImpact: 1.02, category: "global" },
  { year: 2025, quarter: 4, title: "Luxury Surge", description: "Ultra-luxury segment breaks records. Branded residences premium.", impact: { "Palm Jumeirah": 1.06, "DIFC": 1.05, "Downtown Dubai": 1.05 }, globalImpact: 1.03, rentImpact: 1.02, category: "boom" },

  // 2026
  { year: 2026, quarter: 1, title: "Supply Absorption Test", description: "First wave of mega projects delivers. Market watches absorption rates.", impact: { "Arjan": 0.99, "Dubai South": 0.98 }, globalImpact: 1.02, rentImpact: 1.01, category: "correction" },
  { year: 2026, quarter: 2, title: "Digital Title Deeds", description: "Blockchain-based ownership goes live. Fractional ownership framework.", impact: {}, globalImpact: 1.03, rentImpact: 1.02, category: "policy" },
  { year: 2026, quarter: 3, title: "Population Milestone", description: "Dubai population hits 4 million. Demand fundamentals strong.", impact: {}, globalImpact: 1.04, rentImpact: 1.04, category: "infrastructure" },
  { year: 2026, quarter: 4, title: "Year-End Rally", description: "Strong end to 2026. Market up 30% from 2024 baseline.", impact: { "Palm Jumeirah": 1.05, "Creek Harbour": 1.05 }, globalImpact: 1.04, rentImpact: 1.03, category: "boom" },
];

// Client scenario data for Broker's Gauntlet
export interface ClientScenario {
  id: string;
  description: string;
  requirements: string[];
  bestArea: string;
  acceptableAreas: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
}

export const CLIENT_SCENARIOS: ClientScenario[] = [
  // Easy
  { id: "s1", description: "First-time buyer, AED 800K budget, wants high rental yield, cash purchase", requirements: ["Budget: AED 800K", "Goal: Rental yield", "Cash buyer"], bestArea: "JVC", acceptableAreas: ["JVC", "Arjan", "Town Square", "Sports City"], explanation: "JVC offers 8%+ yields at this budget with high demand and central location.", difficulty: "easy" },
  { id: "s2", description: "Family with 2 kids, AED 2M budget, needs schools and parks nearby", requirements: ["Budget: AED 2M", "Family-friendly", "Schools/parks"], bestArea: "Dubai Hills Estate", acceptableAreas: ["Dubai Hills Estate", "Town Square", "Al Furjan"], explanation: "Dubai Hills has the best schools, parks, and Dubai Hills Mall — built for families.", difficulty: "easy" },
  { id: "s3", description: "Russian investor, AED 5M, wants beachfront and Golden Visa", requirements: ["Budget: AED 5M", "Beachfront", "Golden Visa"], bestArea: "Palm Jumeirah", acceptableAreas: ["Palm Jumeirah", "Dubai Marina"], explanation: "Palm Jumeirah is the top choice for HNW beachfront buyers seeking Golden Visa.", difficulty: "easy" },
  { id: "s4", description: "Young professional, AED 500K budget, wants to live near work in DMCC", requirements: ["Budget: AED 500K", "Near DMCC", "Personal use"], bestArea: "JLT", acceptableAreas: ["JLT", "Dubai Marina", "JVC"], explanation: "JLT is directly connected to DMCC free zone and fits the budget.", difficulty: "easy" },
  { id: "s5", description: "Retiree, AED 1.5M, wants quiet community, low service charges", requirements: ["Budget: AED 1.5M", "Quiet", "Low SC"], bestArea: "Town Square", acceptableAreas: ["Town Square", "Al Furjan", "Sports City"], explanation: "Town Square offers a peaceful community with some of the lowest service charges in Dubai.", difficulty: "easy" },

  // Medium
  { id: "s6", description: "Investor wants 9%+ yield, budget AED 400K, doesn't mind older buildings", requirements: ["Budget: AED 400K", "Yield: 9%+", "Tolerates old stock"], bestArea: "International City", acceptableAreas: ["International City"], explanation: "International City is the only area delivering 9%+ yields at this price point.", difficulty: "medium" },
  { id: "s7", description: "Chinese investor, AED 3M, wants off-plan with post-handover payment plan, Emaar preferred", requirements: ["Budget: AED 3M", "Off-plan", "Post-handover plan", "Emaar"], bestArea: "Creek Harbour", acceptableAreas: ["Creek Harbour", "Dubai Hills Estate"], explanation: "Creek Harbour is Emaar's flagship off-plan community with flexible payment plans.", difficulty: "medium" },
  { id: "s8", description: "Portfolio investor, already owns in Marina and JVC, wants diversification into affordable with growth", requirements: ["Diversification", "Affordable segment", "High growth"], bestArea: "Arjan", acceptableAreas: ["Arjan", "Dubai South", "International City"], explanation: "Arjan offers 20%+ YoY growth in the affordable segment, diversifying from established areas.", difficulty: "medium" },
  { id: "s9", description: "Finance executive, AED 4M, wants to walk to work in DIFC, branded residence preferred", requirements: ["Budget: AED 4M", "Near DIFC", "Branded"], bestArea: "DIFC", acceptableAreas: ["DIFC", "Downtown Dubai"], explanation: "DIFC has branded residences within walking distance of the financial center.", difficulty: "medium" },
  { id: "s10", description: "Couple, AED 1.2M, want canal or water views, good for Airbnb potential", requirements: ["Budget: AED 1.2M", "Water view", "Short-term rental potential"], bestArea: "Business Bay", acceptableAreas: ["Business Bay", "JLT"], explanation: "Business Bay canal-view apartments at this budget are excellent for holiday home licensing.", difficulty: "medium" },

  // Hard
  { id: "s11", description: "Investor wants Golden Visa but maximum yield. Budget AED 2.1M. Will use mortgage.", requirements: ["Golden Visa", "Maximum yield", "Budget: AED 2.1M", "Mortgage"], bestArea: "Dubai Hills Estate", acceptableAreas: ["Dubai Hills Estate", "Creek Harbour"], explanation: "At AED 2.1M with mortgage, equity must reach 2M. Dubai Hills offers best yield among Golden Visa areas.", difficulty: "hard" },
  { id: "s12", description: "Developer looking to buy 5 units for portfolio in one community, max AED 4M total, all must be 1BR", requirements: ["5 units", "Budget: AED 4M total", "1BR only", "Same community"], bestArea: "Arjan", acceptableAreas: ["Arjan", "International City"], explanation: "At AED 800K per unit, Arjan's 1BR apartments offer the best combination of yield and growth.", difficulty: "hard" },
  { id: "s13", description: "British expat leaving in 3 years, wants to buy and sell for profit. Budget AED 1.5M. Minimum 15% total return.", requirements: ["3-year horizon", "Budget: AED 1.5M", "15%+ return target"], bestArea: "Arjan", acceptableAreas: ["Arjan", "JVC", "Dubai South"], explanation: "Arjan's 20%+ annual appreciation makes the 15% three-year target most achievable.", difficulty: "hard" },
  { id: "s14", description: "Non-resident from India, AED 2.5M, wants off-plan with 60/40 plan, prefer established developer", requirements: ["Non-resident", "Budget: AED 2.5M", "Off-plan 60/40", "Established developer"], bestArea: "Downtown Dubai", acceptableAreas: ["Downtown Dubai", "Dubai Hills Estate", "Creek Harbour"], explanation: "Non-resident LTV is 50% for off-plan. Emaar's Downtown projects offer 60/40 plans from an established developer.", difficulty: "hard" },
  { id: "s15", description: "Wants to flip off-plan before handover. Budget AED 1M. Maximum 20% down payment initially.", requirements: ["Flip strategy", "Budget: AED 1M", "Max 20% initial payment"], bestArea: "JVC", acceptableAreas: ["JVC", "Arjan", "Dubai South"], explanation: "JVC off-plan with 20% down and high demand makes flipping before handover most viable.", difficulty: "hard" },

  // Expert
  { id: "s16", description: "Fund manager, AED 15M, wants 5 properties across 3 segments (luxury, mid, affordable), optimized for risk-adjusted return", requirements: ["AED 15M", "5 properties", "3 segments", "Risk-adjusted"], bestArea: "Dubai Hills Estate", acceptableAreas: ["Palm Jumeirah", "Dubai Hills Estate", "Business Bay", "JVC", "Town Square"], explanation: "Optimal mix: 1 Palm (luxury anchor), 1 Hills (mid growth), 1 Business Bay (mid yield), 2 JVC/Town Square (affordable yield).", difficulty: "expert" },
  { id: "s17", description: "Client wants passive income of AED 30K/month from property. Has AED 8M. Minimize management headaches.", requirements: ["AED 30K/mo passive income", "Budget: AED 8M", "Low management"], bestArea: "Dubai Marina", acceptableAreas: ["Dubai Marina", "JLT", "Business Bay", "JVC"], explanation: "Need ~AED 360K/yr rental at 6-7% yield = ~AED 5.5M invested. Marina/JLT offer high demand with property management services.", difficulty: "expert" },
  { id: "s18", description: "Wants maximum capital preservation with inflation hedge. AED 10M. Will hold 10+ years. Already has Golden Visa.", requirements: ["Capital preservation", "Inflation hedge", "AED 10M", "10+ year hold"], bestArea: "Palm Jumeirah", acceptableAreas: ["Palm Jumeirah", "Downtown Dubai", "Emirates Hills"], explanation: "Palm Jumeirah villas are the ultimate store of value in Dubai — limited supply, proven demand, consistent appreciation.", difficulty: "expert" },
  { id: "s19", description: "Tech entrepreneur, AED 6M, wants a property that doubles as holiday home AND generates 6%+ yield when not using it", requirements: ["AED 6M", "Personal use + rental", "6%+ yield", "Holiday home"], bestArea: "Palm Jumeirah", acceptableAreas: ["Palm Jumeirah", "Dubai Marina", "Downtown Dubai"], explanation: "Palm apartments with holiday home license can yield 6-8% through premium short-term rates when owner isn't using it.", difficulty: "expert" },
  { id: "s20", description: "Three partners pooling AED 9M. Each wants separate title deed. All must qualify for Golden Visa. Maximize combined yield.", requirements: ["3 separate properties", "AED 3M each", "All Golden Visa", "Maximum yield"], bestArea: "Dubai Hills Estate", acceptableAreas: ["Dubai Hills Estate", "Creek Harbour", "Downtown Dubai", "MBR City"], explanation: "Each partner needs AED 2M+ property value for Golden Visa. Dubai Hills at AED 3M offers best yield among qualifying areas.", difficulty: "expert" },
];

// Area stats for Area Detective game
export interface AreaClue {
  type: "yield" | "price" | "demographic" | "service_charge" | "location" | "feature" | "transaction";
  text: string;
  difficulty: number; // 1 = very revealing, 5 = vague
}

export function getAreaClues(area: GameArea): AreaClue[] {
  const clues: AreaClue[] = [];

  // Very revealing clues (difficulty 1)
  if (area.name === "Palm Jumeirah") clues.push({ type: "feature", text: "This area is shaped like a palm tree", difficulty: 1 });
  if (area.name === "Downtown Dubai") clues.push({ type: "feature", text: "Home to the world's tallest building", difficulty: 1 });
  if (area.name === "DIFC") clues.push({ type: "feature", text: "Dubai's financial district", difficulty: 1 });
  if (area.name === "Dubai Marina") clues.push({ type: "feature", text: "One of the world's largest man-made marinas", difficulty: 1 });

  // Moderately revealing (difficulty 2-3)
  clues.push({ type: "price", text: `Average price: AED ${area.basePriceSqft * 1.8}-${area.basePriceSqft * 2.2}/sqft (2025)`, difficulty: 2 });
  clues.push({ type: "yield", text: `Average rental yield: ${(area.baseYield * 0.9).toFixed(1)}-${(area.baseYield * 1.1).toFixed(1)}%`, difficulty: 2 });
  clues.push({ type: "service_charge", text: `Service charges: ~AED ${area.avgServiceCharge}/sqft per year`, difficulty: 3 });

  // Vague clues (difficulty 4-5)
  clues.push({ type: "demographic", text: `Segment: ${area.segment}`, difficulty: 4 });
  clues.push({ type: "feature", text: area.goldenVisa ? "Properties here can qualify for Golden Visa" : "Most properties here don't reach Golden Visa threshold", difficulty: 4 });
  clues.push({ type: "location", text: area.description, difficulty: 3 });

  return clues;
}
