// ---------------------------------------------------------------------------
// Global Real Estate Market Comparison — Metric Taxonomy & Comparison Framework
// ---------------------------------------------------------------------------
// This file defines every metric, its formatting, ranking logic, insight
// generators, and comparison presets. Imported by the tool UI and any
// server-side analysis helpers.
// ---------------------------------------------------------------------------

// ═══════════════════════════════════════════════════════════════════════════
// 1. CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MetricCategory =
  | "property_market"
  | "rental_market"
  | "affordability"
  | "investment_climate"
  | "economic_fundamentals"
  | "demographics"
  | "market_dynamics"
  | "quality_of_life";

export type MetricFormat =
  | "currency"
  | "percent"
  | "number"
  | "index"
  | "boolean"
  | "qualitative"
  | "years"
  | "days"
  | "ratio";

export type MetricDirection = "higher_better" | "lower_better" | "neutral";
export type DataSource = "BIS" | "OECD" | "World Bank" | "Frankfurter" | "Curated";
export type DataLevel = "country" | "city" | "both";

export interface MetricDefinition {
  id: string;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  unit: string;
  format: MetricFormat;
  direction: MetricDirection;
  description: string;
  source: DataSource;
  dataLevel: DataLevel;
  getValue: string; // dot-path key in the data object
  /** Insight when value is significantly above global average */
  insightAboveAvg: string;
  /** Insight when value is significantly below global average */
  insightBelowAvg: string;
}

export interface CategoryDefinition {
  id: MetricCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: string; // emoji fallback — UI can map to SVGs
  color: string; // tailwind border/text color token
}

export interface ComparisonPreset {
  id: string;
  label: string;
  description: string;
  /** ISO-2 country codes or city slugs */
  items: string[];
  /** Which level this preset operates on */
  level: "country" | "city" | "mixed";
  /** Optional: sort by this metric id (descending unless metric is lower_better) */
  sortBy?: string;
  /** Tags for filtering/search in UI */
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const METRIC_CATEGORIES: CategoryDefinition[] = [
  {
    id: "property_market",
    label: "Property Market",
    shortLabel: "Property",
    description: "Price levels, indices, and year-over-year changes across residential real estate markets.",
    icon: "🏠",
    color: "blue-400",
  },
  {
    id: "rental_market",
    label: "Rental Market",
    shortLabel: "Rental",
    description: "Rental yields, average rents, and rental market momentum.",
    icon: "🔑",
    color: "violet-400",
  },
  {
    id: "affordability",
    label: "Affordability",
    shortLabel: "Afford.",
    description: "How accessible property ownership is relative to local incomes, mortgage terms, and financing conditions.",
    icon: "💰",
    color: "amber-400",
  },
  {
    id: "investment_climate",
    label: "Investment Climate",
    shortLabel: "Invest.",
    description: "Tax regime, transaction costs, foreign ownership rules, and residency-by-investment programs.",
    icon: "📊",
    color: "emerald-400",
  },
  {
    id: "economic_fundamentals",
    label: "Economic Fundamentals",
    shortLabel: "Economy",
    description: "Macro indicators that drive long-term real estate demand and pricing.",
    icon: "📈",
    color: "cyan-400",
  },
  {
    id: "demographics",
    label: "Demographics",
    shortLabel: "Demog.",
    description: "Population size, growth trajectory, and urbanization rate — core demand drivers.",
    icon: "👥",
    color: "orange-400",
  },
  {
    id: "market_dynamics",
    label: "Market Dynamics",
    shortLabel: "Dynamics",
    description: "Transaction volumes, supply pipeline, and market liquidity indicators.",
    icon: "⚡",
    color: "rose-400",
  },
  {
    id: "quality_of_life",
    label: "Quality of Life",
    shortLabel: "QoL",
    description: "Safety, liveability, and quality-of-life scores that influence long-term desirability.",
    icon: "🌍",
    color: "teal-400",
  },
];

// Helper: get category by id
export function getCategoryById(id: MetricCategory): CategoryDefinition | undefined {
  return METRIC_CATEGORIES.find((c) => c.id === id);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. METRIC DEFINITIONS — FULL TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════

export const METRICS: MetricDefinition[] = [
  // ─── Property Market ─────────────────────────────────────────────────
  {
    id: "nominal_price_index",
    label: "Nominal Price Index",
    shortLabel: "Price Index",
    category: "property_market",
    unit: "index",
    format: "index",
    direction: "neutral",
    description: "Nominal residential property price index (2010 = 100). Tracks absolute price level changes since the base year.",
    source: "BIS",
    dataLevel: "country",
    getValue: "nominalPriceIndex",
    insightAboveAvg: "Property prices have risen significantly above the global average since 2010, indicating a prolonged bull market or structural supply shortage.",
    insightBelowAvg: "Prices have lagged the global average since 2010 — potential value opportunity or a sign of persistent weak demand.",
  },
  {
    id: "real_price_index",
    label: "Real Price Index",
    shortLabel: "Real Index",
    category: "property_market",
    unit: "index",
    format: "index",
    direction: "neutral",
    description: "Inflation-adjusted residential property price index (2010 = 100). Strips out currency devaluation effects.",
    source: "BIS",
    dataLevel: "country",
    getValue: "realPriceIndex",
    insightAboveAvg: "Real prices significantly outpace inflation — genuine wealth creation for property owners.",
    insightBelowAvg: "Real prices have declined in inflation-adjusted terms — property has been losing purchasing power.",
  },
  {
    id: "nominal_price_yoy",
    label: "Nominal Price Change (YoY)",
    shortLabel: "Price Change",
    category: "property_market",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Year-over-year change in nominal property prices. Positive = prices rising.",
    source: "BIS",
    dataLevel: "country",
    getValue: "nominalPriceYoY",
    insightAboveAvg: "Rapid price appreciation — could signal strong demand or speculative heat. Watch for correction risk.",
    insightBelowAvg: "Prices falling or stagnant — buyer's market conditions. Check whether driven by fundamentals or sentiment.",
  },
  {
    id: "real_price_yoy",
    label: "Real Price Change (YoY)",
    shortLabel: "Real Change",
    category: "property_market",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Year-over-year change in inflation-adjusted property prices.",
    source: "BIS",
    dataLevel: "country",
    getValue: "realPriceYoY",
    insightAboveAvg: "Strong real price growth — property is outrunning inflation, building genuine equity.",
    insightBelowAvg: "Negative real returns — inflation is eroding property value faster than prices are rising.",
  },
  {
    id: "avg_price_per_sqm",
    label: "Average Price per sqm",
    shortLabel: "Price/sqm",
    category: "property_market",
    unit: "$",
    format: "currency",
    direction: "neutral",
    description: "Average residential property price per square meter in USD. City-center average.",
    source: "Curated",
    dataLevel: "city",
    getValue: "avgPricePerSqm",
    insightAboveAvg: "One of the most expensive markets per square meter globally — premium location pricing.",
    insightBelowAvg: "Below-average prices per sqm — either an emerging market or one with structural oversupply.",
  },
  {
    id: "avg_price_per_sqm_suburb",
    label: "Average Price per sqm (Suburbs)",
    shortLabel: "Suburb Price/sqm",
    category: "property_market",
    unit: "$",
    format: "currency",
    direction: "neutral",
    description: "Average residential property price per square meter outside city center in USD.",
    source: "Curated",
    dataLevel: "city",
    getValue: "avgPricePerSqmSuburb",
    insightAboveAvg: "Even suburban areas command premium prices — indicates broad market strength.",
    insightBelowAvg: "Significant city-center-to-suburb price gap — typical of markets with concentrated demand.",
  },
  {
    id: "price_5y_change",
    label: "5-Year Price Change",
    shortLabel: "5Y Change",
    category: "property_market",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Cumulative property price change over the past 5 years. Long-term trend indicator.",
    source: "Curated",
    dataLevel: "city",
    getValue: "price5YChange",
    insightAboveAvg: "Strong 5-year momentum — consistent long-term growth trend favoring existing owners.",
    insightBelowAvg: "Weak or negative 5-year returns — new entrants may find better value but should examine why.",
  },

  // ─── Rental Market ───────────────────────────────────────────────────
  {
    id: "gross_rental_yield",
    label: "Gross Rental Yield",
    shortLabel: "Yield",
    category: "rental_market",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Annual gross rental income as a percentage of property price. Higher = better cash flow for investors.",
    source: "Curated",
    dataLevel: "city",
    getValue: "grossRentalYield",
    insightAboveAvg: "High-yield market — strong cash-on-cash returns for buy-to-let investors.",
    insightBelowAvg: "Low yields — investors depend on capital appreciation rather than rental income. Typical in premium markets.",
  },
  {
    id: "avg_rent_1br_center",
    label: "Avg Rent — 1BR (City Center)",
    shortLabel: "1BR Rent",
    category: "rental_market",
    unit: "$/mo",
    format: "currency",
    direction: "neutral",
    description: "Average monthly rent for a 1-bedroom apartment in the city center (USD).",
    source: "Curated",
    dataLevel: "city",
    getValue: "avgRent1brCenter",
    insightAboveAvg: "High rents reflect strong tenant demand and limited supply in prime locations.",
    insightBelowAvg: "Affordable renting — lower cost of living but may limit rental income for investors.",
  },
  {
    id: "avg_rent_3br_center",
    label: "Avg Rent — 3BR (City Center)",
    shortLabel: "3BR Rent",
    category: "rental_market",
    unit: "$/mo",
    format: "currency",
    direction: "neutral",
    description: "Average monthly rent for a 3-bedroom apartment in the city center (USD).",
    source: "Curated",
    dataLevel: "city",
    getValue: "avgRent3brCenter",
    insightAboveAvg: "Family-sized units command premium rents — strong demand from expat families and professionals.",
    insightBelowAvg: "Relatively affordable family housing — attractive for tenants, tighter margins for landlords.",
  },
  {
    id: "rent_yoy_change",
    label: "Rent Change (YoY)",
    shortLabel: "Rent Change",
    category: "rental_market",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Year-over-year change in average rents. Positive = rents rising.",
    source: "Curated",
    dataLevel: "city",
    getValue: "rentYoYChange",
    insightAboveAvg: "Rents rising fast — landlord-friendly market with strong tenant demand.",
    insightBelowAvg: "Rents declining or flat — tenant-friendly conditions, possible oversupply.",
  },
  {
    id: "price_to_rent",
    label: "Price-to-Rent Ratio",
    shortLabel: "Price/Rent",
    category: "rental_market",
    unit: "index",
    format: "index",
    direction: "lower_better",
    description: "Property price relative to annual rent (2015 = 100). Lower = better yields relative to prices.",
    source: "OECD",
    dataLevel: "country",
    getValue: "priceToRent",
    insightAboveAvg: "Prices have significantly outrun rents — yields are compressed. Buying to rent is relatively expensive.",
    insightBelowAvg: "Rents are strong relative to prices — attractive rental yield environment.",
  },
  {
    id: "price_to_rent_deviation",
    label: "Price/Rent vs Long-Term Average",
    shortLabel: "Yield Gap",
    category: "rental_market",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "How far the price-to-rent ratio is from its historical average. Negative = yields better than historical norm.",
    source: "OECD",
    dataLevel: "country",
    getValue: "priceToRentDeviation",
    insightAboveAvg: "Price-to-rent stretched well above historical norms — rental yields are historically compressed.",
    insightBelowAvg: "Price-to-rent below historical average — unusually good rental yield environment.",
  },

  // ─── Affordability ───────────────────────────────────────────────────
  {
    id: "price_to_income",
    label: "Price-to-Income Ratio",
    shortLabel: "Price/Income",
    category: "affordability",
    unit: "index",
    format: "index",
    direction: "lower_better",
    description: "Property prices relative to household income (2015 = 100). Lower = more affordable.",
    source: "OECD",
    dataLevel: "country",
    getValue: "priceToIncome",
    insightAboveAvg: "Severely unaffordable — property prices have significantly outpaced income growth.",
    insightBelowAvg: "Relatively affordable — incomes have kept pace with or outgrown property prices.",
  },
  {
    id: "price_to_income_deviation",
    label: "Price/Income vs Long-Term Average",
    shortLabel: "Afford. Gap",
    category: "affordability",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "How far price-to-income is from its historical average. Positive = more overvalued than usual.",
    source: "OECD",
    dataLevel: "country",
    getValue: "priceToIncomeDeviation",
    insightAboveAvg: "Affordability stretched to historically extreme levels — correction risk is elevated.",
    insightBelowAvg: "More affordable than historical norms — potential buying opportunity.",
  },
  {
    id: "years_to_buy",
    label: "Years of Income to Buy",
    shortLabel: "Years to Buy",
    category: "affordability",
    unit: "years",
    format: "number",
    direction: "lower_better",
    description: "Number of years of average gross salary needed to buy a typical 60sqm apartment.",
    source: "Curated",
    dataLevel: "city",
    getValue: "yearsToBuy",
    insightAboveAvg: "Requires many years of income to buy — heavily reliant on mortgages or family wealth.",
    insightBelowAvg: "Achievable with a few years of income — accessible to first-time buyers.",
  },
  {
    id: "mortgage_rate",
    label: "Mortgage Interest Rate",
    shortLabel: "Mortgage Rate",
    category: "affordability",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Typical mortgage interest rate for a 20-year fixed-rate home loan.",
    source: "Curated",
    dataLevel: "city",
    getValue: "mortgageRate",
    insightAboveAvg: "High borrowing costs — significantly increases the total cost of ownership.",
    insightBelowAvg: "Cheap debt — leverage amplifies returns and makes ownership more accessible.",
  },
  {
    id: "max_ltv",
    label: "Maximum Loan-to-Value",
    shortLabel: "Max LTV",
    category: "affordability",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Maximum loan-to-value ratio available to buyers. Higher = less cash needed upfront.",
    source: "Curated",
    dataLevel: "city",
    getValue: "maxLtv",
    insightAboveAvg: "Generous LTV — buyers can enter the market with less upfront capital.",
    insightBelowAvg: "Low LTV limits — large down payments required, favoring cash-rich buyers.",
  },
  {
    id: "mortgage_available_foreigners",
    label: "Mortgages for Foreigners",
    shortLabel: "Foreign Mortgage",
    category: "affordability",
    unit: "",
    format: "qualitative",
    direction: "neutral",
    description: "Availability and typical terms of mortgage financing for non-resident foreign buyers.",
    source: "Curated",
    dataLevel: "city",
    getValue: "mortgageAvailableForeigners",
    insightAboveAvg: "Easy access to financing for foreign buyers — lowers barrier to entry.",
    insightBelowAvg: "Limited or no mortgage access for foreigners — cash purchase often required.",
  },

  // ─── Investment Climate ──────────────────────────────────────────────
  {
    id: "property_tax_rate",
    label: "Annual Property Tax Rate",
    shortLabel: "Property Tax",
    category: "investment_climate",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Effective annual property tax rate as percentage of property value.",
    source: "Curated",
    dataLevel: "city",
    getValue: "propertyTaxRate",
    insightAboveAvg: "High recurring tax burden — significantly eats into net rental yield and total returns.",
    insightBelowAvg: "Low or zero property tax — holding costs are minimal, boosting net yields.",
  },
  {
    id: "rental_income_tax",
    label: "Rental Income Tax Rate",
    shortLabel: "Rental Tax",
    category: "investment_climate",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Effective income tax rate on rental income for a non-resident investor.",
    source: "Curated",
    dataLevel: "city",
    getValue: "rentalIncomeTax",
    insightAboveAvg: "High tax on rental income — net yields are substantially lower than gross figures suggest.",
    insightBelowAvg: "Low or zero rental income tax — what you earn is close to what you keep.",
  },
  {
    id: "capital_gains_tax",
    label: "Capital Gains Tax on Property",
    shortLabel: "CGT",
    category: "investment_climate",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Tax rate on profit from selling property. Some jurisdictions offer exemptions for long-term holds.",
    source: "Curated",
    dataLevel: "city",
    getValue: "capitalGainsTax",
    insightAboveAvg: "Significant exit tax — factor into your total return calculation before buying.",
    insightBelowAvg: "Low or zero capital gains tax — you keep most of the upside on exit.",
  },
  {
    id: "total_transaction_cost_buy",
    label: "Total Buy-Side Transaction Cost",
    shortLabel: "Buy Costs",
    category: "investment_climate",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Total costs to purchase (registration, transfer tax, agent fees, legal, etc.) as % of property value.",
    source: "Curated",
    dataLevel: "city",
    getValue: "totalTransactionCostBuy",
    insightAboveAvg: "Expensive to enter — high stamp duty and fees add significantly to the purchase price.",
    insightBelowAvg: "Low entry costs — easy to get in, improving overall IRR.",
  },
  {
    id: "total_transaction_cost_sell",
    label: "Total Sell-Side Transaction Cost",
    shortLabel: "Sell Costs",
    category: "investment_climate",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Total costs to sell (agent commission, legal, CGT, etc.) as % of sale price.",
    source: "Curated",
    dataLevel: "city",
    getValue: "totalTransactionCostSell",
    insightAboveAvg: "Expensive to exit — high selling costs reduce net profit significantly.",
    insightBelowAvg: "Low exit costs — seller-friendly market mechanics.",
  },
  {
    id: "foreign_ownership",
    label: "Foreign Ownership Rules",
    shortLabel: "Foreign Own.",
    category: "investment_climate",
    unit: "",
    format: "qualitative",
    direction: "neutral",
    description: "Whether foreigners can own freehold property. Values: 'freehold', 'leasehold', 'restricted', 'prohibited'.",
    source: "Curated",
    dataLevel: "city",
    getValue: "foreignOwnership",
    insightAboveAvg: "Full freehold ownership available to foreigners — no structural barriers to entry.",
    insightBelowAvg: "Restricted or leasehold only — adds complexity and risk for international investors.",
  },
  {
    id: "golden_visa",
    label: "Golden Visa / Residency by Investment",
    shortLabel: "Golden Visa",
    category: "investment_climate",
    unit: "",
    format: "boolean",
    direction: "higher_better",
    description: "Whether property investment qualifies for a residency visa or permit.",
    source: "Curated",
    dataLevel: "city",
    getValue: "goldenVisa",
    insightAboveAvg: "Property purchase unlocks residency — dual benefit of investment + mobility.",
    insightBelowAvg: "No residency-linked property program — investment is purely financial.",
  },
  {
    id: "golden_visa_min_investment",
    label: "Golden Visa Minimum Investment",
    shortLabel: "Visa Min.",
    category: "investment_climate",
    unit: "$",
    format: "currency",
    direction: "lower_better",
    description: "Minimum property investment required to qualify for residency/golden visa (USD).",
    source: "Curated",
    dataLevel: "city",
    getValue: "goldenVisaMinInvestment",
    insightAboveAvg: "High threshold — residency-by-investment reserved for significant capital deployment.",
    insightBelowAvg: "Accessible threshold — residency achievable with a modest property purchase.",
  },
  {
    id: "regulatory_ease",
    label: "Regulatory Ease Score",
    shortLabel: "Reg. Ease",
    category: "investment_climate",
    unit: "/10",
    format: "number",
    direction: "higher_better",
    description: "Ease of navigating property purchase regulations as a foreign buyer (1-10 scale, curated assessment).",
    source: "Curated",
    dataLevel: "city",
    getValue: "regulatoryEase",
    insightAboveAvg: "Streamlined process — foreign buyers face minimal bureaucratic friction.",
    insightBelowAvg: "Complex regulatory environment — expect paperwork, delays, and possibly mandatory local partners.",
  },

  // ─── Economic Fundamentals ───────────────────────────────────────────
  {
    id: "gdp_per_capita",
    label: "GDP per Capita",
    shortLabel: "GDP/Capita",
    category: "economic_fundamentals",
    unit: "$",
    format: "currency",
    direction: "higher_better",
    description: "Gross Domestic Product per person (current USD). Proxy for economic development and purchasing power.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "gdpPerCapita",
    insightAboveAvg: "High-income economy — strong purchasing power supports premium property pricing.",
    insightBelowAvg: "Lower-income economy — property prices may be lower but so is local demand capacity.",
  },
  {
    id: "gdp_growth",
    label: "GDP Growth Rate",
    shortLabel: "GDP Growth",
    category: "economic_fundamentals",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Annual GDP growth rate. Positive growth typically correlates with rising property demand.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "gdpGrowth",
    insightAboveAvg: "Fast-growing economy — expanding wealth drives property demand and prices upward.",
    insightBelowAvg: "Sluggish or contracting economy — demand headwinds for property markets.",
  },
  {
    id: "inflation",
    label: "Inflation Rate",
    shortLabel: "Inflation",
    category: "economic_fundamentals",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Annual consumer price inflation. High inflation erodes real returns unless property prices keep pace.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "inflation",
    insightAboveAvg: "High inflation — real returns at risk unless rents and prices adjust upward quickly.",
    insightBelowAvg: "Low, stable inflation — currency and purchasing power are well-maintained.",
  },
  {
    id: "fdi_inflows",
    label: "Foreign Direct Investment Inflows",
    shortLabel: "FDI",
    category: "economic_fundamentals",
    unit: "$",
    format: "currency",
    direction: "higher_better",
    description: "Net FDI inflows in USD. High FDI signals international confidence and economic openness.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "fdiInflows",
    insightAboveAvg: "Major FDI magnet — international capital is flowing in, supporting economic and property growth.",
    insightBelowAvg: "Low FDI — less international investment interest, which may limit property market growth.",
  },
  {
    id: "gross_savings",
    label: "Gross Savings Rate",
    shortLabel: "Savings",
    category: "economic_fundamentals",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Gross savings as percentage of GDP. Higher savings = more domestic capital available for investment.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "grossSavings",
    insightAboveAvg: "High domestic savings — strong pool of investable capital supporting property markets.",
    insightBelowAvg: "Low savings rate — property market more dependent on foreign capital and debt.",
  },
  {
    id: "exchange_rate_usd",
    label: "Exchange Rate to USD",
    shortLabel: "FX Rate",
    category: "economic_fundamentals",
    unit: "per USD",
    format: "number",
    direction: "neutral",
    description: "Local currency units per 1 USD. For pegged currencies (AED, HKD), this is fixed.",
    source: "Frankfurter",
    dataLevel: "country",
    getValue: "exchangeRateToUSD",
    insightAboveAvg: "Weak local currency vs USD — property may be cheap for dollar-based buyers.",
    insightBelowAvg: "Strong local currency vs USD — property is expensive for dollar-based buyers.",
  },
  {
    id: "currency_stability",
    label: "Currency Stability (5Y)",
    shortLabel: "FX Stability",
    category: "economic_fundamentals",
    unit: "",
    format: "qualitative",
    direction: "higher_better",
    description: "5-year currency volatility assessment: 'pegged', 'stable', 'moderate', 'volatile'.",
    source: "Curated",
    dataLevel: "country",
    getValue: "currencyStability",
    insightAboveAvg: "Stable or pegged currency — minimal FX risk for international investors.",
    insightBelowAvg: "Volatile currency — FX risk can wipe out property gains when converting back to home currency.",
  },

  // ─── Demographics ────────────────────────────────────────────────────
  {
    id: "population",
    label: "Population",
    shortLabel: "Population",
    category: "demographics",
    unit: "",
    format: "number",
    direction: "neutral",
    description: "Total population. Larger populations mean bigger potential markets but also more complex dynamics.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "population",
    insightAboveAvg: "Large population — massive demand base but property dynamics vary widely by region.",
    insightBelowAvg: "Smaller population — niche market that can be moved by relatively small capital flows.",
  },
  {
    id: "population_growth",
    label: "Population Growth Rate",
    shortLabel: "Pop. Growth",
    category: "demographics",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Annual population growth rate. Higher growth = structurally rising housing demand.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "populationGrowth",
    insightAboveAvg: "Rapid population growth — structural demand tailwind for housing. Supply often lags.",
    insightBelowAvg: "Stagnant or shrinking population — long-term demand headwind for property.",
  },
  {
    id: "urbanization",
    label: "Urbanization Rate",
    shortLabel: "Urban %",
    category: "demographics",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Percentage of population living in urban areas. Higher urbanization concentrates housing demand.",
    source: "World Bank",
    dataLevel: "country",
    getValue: "urbanization",
    insightAboveAvg: "Highly urbanized — nearly all demand concentrated in cities, supporting urban property values.",
    insightBelowAvg: "Lower urbanization — ongoing rural-to-urban migration could drive future city-level demand.",
  },
  {
    id: "city_population",
    label: "City Population",
    shortLabel: "City Pop.",
    category: "demographics",
    unit: "",
    format: "number",
    direction: "neutral",
    description: "Metropolitan area population.",
    source: "Curated",
    dataLevel: "city",
    getValue: "cityPopulation",
    insightAboveAvg: "Major metropolis — deep market with high liquidity and diverse demand sources.",
    insightBelowAvg: "Smaller city — potentially less liquid but can offer outsized returns in growth phases.",
  },
  {
    id: "expat_percentage",
    label: "Expat / Foreign-Born Population",
    shortLabel: "Expat %",
    category: "demographics",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Percentage of residents who are foreign-born or non-citizen. High = internationally connected market.",
    source: "Curated",
    dataLevel: "city",
    getValue: "expatPercentage",
    insightAboveAvg: "Highly international population — demand driven by global mobility and corporate relocations.",
    insightBelowAvg: "Predominantly local population — market dynamics driven by domestic factors.",
  },
  {
    id: "median_age",
    label: "Median Age",
    shortLabel: "Med. Age",
    category: "demographics",
    unit: "years",
    format: "number",
    direction: "neutral",
    description: "Median age of the population. Younger populations drive first-time buyer demand; older populations drive different housing needs.",
    source: "Curated",
    dataLevel: "city",
    getValue: "medianAge",
    insightAboveAvg: "Aging population — potential demand shift toward downsizing, retirement properties, and care facilities.",
    insightBelowAvg: "Young population — strong future demand for first homes and family-sized housing.",
  },

  // ─── Market Dynamics ─────────────────────────────────────────────────
  {
    id: "transaction_volume_yoy",
    label: "Transaction Volume Change (YoY)",
    shortLabel: "Volume Change",
    category: "market_dynamics",
    unit: "%",
    format: "percent",
    direction: "higher_better",
    description: "Year-over-year change in number of property transactions. Rising = market gaining momentum.",
    source: "Curated",
    dataLevel: "city",
    getValue: "transactionVolumeYoY",
    insightAboveAvg: "Transaction volumes surging — strong buyer activity and market confidence.",
    insightBelowAvg: "Falling transaction volumes — market cooling, buyers waiting on the sidelines.",
  },
  {
    id: "avg_days_on_market",
    label: "Average Days on Market",
    shortLabel: "Days on Market",
    category: "market_dynamics",
    unit: "days",
    format: "days",
    direction: "lower_better",
    description: "Average number of days a property takes to sell after listing.",
    source: "Curated",
    dataLevel: "city",
    getValue: "avgDaysOnMarket",
    insightAboveAvg: "Properties sitting on market longer than average — buyers have negotiating power.",
    insightBelowAvg: "Properties selling fast — competitive market, limited negotiation window for buyers.",
  },
  {
    id: "supply_pipeline",
    label: "Supply Pipeline (Units Under Construction)",
    shortLabel: "Pipeline",
    category: "market_dynamics",
    unit: "",
    format: "number",
    direction: "neutral",
    description: "Number of residential units currently under construction or approved for development.",
    source: "Curated",
    dataLevel: "city",
    getValue: "supplyPipeline",
    insightAboveAvg: "Large supply pipeline — new inventory incoming, which may moderate price growth.",
    insightBelowAvg: "Limited supply pipeline — scarcity supports pricing power for existing owners.",
  },
  {
    id: "off_plan_share",
    label: "Off-Plan Sales Share",
    shortLabel: "Off-Plan %",
    category: "market_dynamics",
    unit: "%",
    format: "percent",
    direction: "neutral",
    description: "Percentage of transactions that are off-plan (pre-completion) sales.",
    source: "Curated",
    dataLevel: "city",
    getValue: "offPlanShare",
    insightAboveAvg: "Heavily off-plan market — speculative activity and developer financing driving transactions.",
    insightBelowAvg: "Mature market dominated by completed/resale properties — lower development risk.",
  },
  {
    id: "vacancy_rate",
    label: "Residential Vacancy Rate",
    shortLabel: "Vacancy",
    category: "market_dynamics",
    unit: "%",
    format: "percent",
    direction: "lower_better",
    description: "Percentage of residential units that are unoccupied. Lower = tighter market.",
    source: "Curated",
    dataLevel: "city",
    getValue: "vacancyRate",
    insightAboveAvg: "High vacancy — oversupply or weak demand. Landlords may need to cut rents to attract tenants.",
    insightBelowAvg: "Low vacancy — very tight market. Strong landlord pricing power.",
  },

  // ─── Quality of Life ─────────────────────────────────────────────────
  {
    id: "safety_index",
    label: "Safety Index",
    shortLabel: "Safety",
    category: "quality_of_life",
    unit: "/100",
    format: "number",
    direction: "higher_better",
    description: "Composite safety score (0-100) based on crime rates, personal safety perception, and rule of law.",
    source: "Curated",
    dataLevel: "city",
    getValue: "safetyIndex",
    insightAboveAvg: "Exceptionally safe — a key draw for families and a factor in premium property pricing.",
    insightBelowAvg: "Below-average safety — may suppress demand from international buyers and families.",
  },
  {
    id: "qol_index",
    label: "Quality of Life Index",
    shortLabel: "QoL",
    category: "quality_of_life",
    unit: "/100",
    format: "number",
    direction: "higher_better",
    description: "Composite quality-of-life score (0-100) covering healthcare, education, infrastructure, environment, and culture.",
    source: "Curated",
    dataLevel: "city",
    getValue: "qolIndex",
    insightAboveAvg: "Top-tier liveability — commands premium pricing and attracts global talent.",
    insightBelowAvg: "Lower quality of life — may offer value for investors but limits end-user appeal.",
  },
  {
    id: "climate_score",
    label: "Climate Score",
    shortLabel: "Climate",
    category: "quality_of_life",
    unit: "/10",
    format: "number",
    direction: "higher_better",
    description: "Climate desirability rating (1-10) based on temperature, sunshine hours, extreme weather risk.",
    source: "Curated",
    dataLevel: "city",
    getValue: "climateScore",
    insightAboveAvg: "Desirable climate — attracts retirees, digital nomads, and lifestyle migrants year-round.",
    insightBelowAvg: "Less favorable climate — seasonal or extreme conditions may limit year-round appeal.",
  },
  {
    id: "healthcare_score",
    label: "Healthcare Quality",
    shortLabel: "Healthcare",
    category: "quality_of_life",
    unit: "/10",
    format: "number",
    direction: "higher_better",
    description: "Healthcare quality and access rating (1-10).",
    source: "Curated",
    dataLevel: "city",
    getValue: "healthcareScore",
    insightAboveAvg: "World-class healthcare — critical for attracting families and retirees.",
    insightBelowAvg: "Below-average healthcare — potential deal-breaker for long-term residents.",
  },
  {
    id: "connectivity_score",
    label: "International Connectivity",
    shortLabel: "Connectivity",
    category: "quality_of_life",
    unit: "/10",
    format: "number",
    direction: "higher_better",
    description: "International flight connections, hub airport proximity, ease of global travel (1-10).",
    source: "Curated",
    dataLevel: "city",
    getValue: "connectivityScore",
    insightAboveAvg: "Major global hub — easy to reach from anywhere, supporting international buyer demand.",
    insightBelowAvg: "Limited international connections — harder to reach, which can suppress foreign investment.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 4. HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Get all metrics in a given category */
export function getMetricsByCategory(category: MetricCategory): MetricDefinition[] {
  return METRICS.filter((m) => m.category === category);
}

/** Get a single metric by id */
export function getMetricById(id: string): MetricDefinition | undefined {
  return METRICS.find((m) => m.id === id);
}

/** Get metrics available at a given data level */
export function getMetricsByLevel(level: DataLevel): MetricDefinition[] {
  return METRICS.filter((m) => m.dataLevel === level || m.dataLevel === "both");
}

/** Get metrics by source */
export function getMetricsBySource(source: DataSource): MetricDefinition[] {
  return METRICS.filter((m) => m.source === source);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. RANKING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

export type RankDirection = "asc" | "desc";

/**
 * Determines the sort direction for ranking on a given metric.
 * - "higher_better" → rank descending (highest first)
 * - "lower_better"  → rank ascending  (lowest first)
 * - "neutral"       → defaults to descending (biggest number first)
 */
export function getRankDirection(metric: MetricDefinition): RankDirection {
  return metric.direction === "lower_better" ? "asc" : "desc";
}

/**
 * Rank an array of items by a numeric metric value.
 * Returns items sorted with rank position attached.
 */
export function rankByMetric<T extends Record<string, unknown>>(
  items: T[],
  metricId: string,
  getValue: (item: T) => number | null,
): Array<T & { rank: number; metricValue: number | null }> {
  const metric = getMetricById(metricId);
  if (!metric) return items.map((item, i) => ({ ...item, rank: i + 1, metricValue: getValue(item) }));

  const direction = getRankDirection(metric);
  const withValues = items.map((item) => ({ ...item, metricValue: getValue(item) }));

  // Nulls always go to the bottom
  const hasValue = withValues.filter((v) => v.metricValue !== null);
  const noValue = withValues.filter((v) => v.metricValue === null);

  hasValue.sort((a, b) => {
    const av = a.metricValue!;
    const bv = b.metricValue!;
    return direction === "asc" ? av - bv : bv - av;
  });

  return [...hasValue, ...noValue].map((item, i) => ({ ...item, rank: i + 1 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. INSIGHT GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

export interface MetricInsight {
  metricId: string;
  metricLabel: string;
  location: string;
  value: number | string;
  formattedValue: string;
  position: "above_avg" | "below_avg" | "near_avg";
  insight: string;
  /** How many standard deviations from the mean (if numeric) */
  zScore?: number;
}

/**
 * Compute a z-score for a value within a dataset.
 * Returns null if there's insufficient data.
 */
function computeZScore(value: number, allValues: number[]): number | null {
  if (allValues.length < 3) return null;
  const mean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
  const variance = allValues.reduce((s, v) => s + (v - mean) ** 2, 0) / allValues.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return null;
  return (value - mean) / stdDev;
}

/**
 * Generate an insight for a single metric value relative to the full dataset.
 * The `threshold` parameter controls how many standard deviations away from the
 * mean counts as "significant" (default 1.0).
 */
export function generateInsight(
  metricId: string,
  locationName: string,
  value: number,
  formattedValue: string,
  allValues: number[],
  threshold = 1.0,
): MetricInsight | null {
  const metric = getMetricById(metricId);
  if (!metric) return null;

  const z = computeZScore(value, allValues);
  if (z === null) return null;

  let position: MetricInsight["position"];
  let insight: string;

  if (z > threshold) {
    position = "above_avg";
    insight = metric.insightAboveAvg;
  } else if (z < -threshold) {
    position = "below_avg";
    insight = metric.insightBelowAvg;
  } else {
    position = "near_avg";
    insight = `${locationName}'s ${metric.shortLabel} is near the global average.`;
  }

  return {
    metricId,
    metricLabel: metric.label,
    location: locationName,
    value,
    formattedValue,
    position,
    insight,
    zScore: Math.round(z * 100) / 100,
  };
}

/**
 * Generate a pairwise comparison insight between two locations.
 * Example: "Dubai's 0% property tax saves ~$X,XXX/year compared to London's Y%"
 */
export function generatePairwiseInsight(
  metricId: string,
  locationA: { name: string; value: number; formatted: string },
  locationB: { name: string; value: number; formatted: string },
): string | null {
  const metric = getMetricById(metricId);
  if (!metric) return null;

  const diff = locationA.value - locationB.value;
  const absDiff = Math.abs(diff);
  const pctDiff = locationB.value !== 0
    ? Math.round(Math.abs((diff / locationB.value) * 100))
    : null;

  if (metric.direction === "lower_better") {
    const cheaper = diff < 0 ? locationA : locationB;
    const dearer = diff < 0 ? locationB : locationA;
    if (pctDiff && pctDiff > 10) {
      return `${cheaper.name} is ${pctDiff}% ${getDirectionLabel(metric)} than ${dearer.name} on ${metric.shortLabel}.`;
    }
  } else if (metric.direction === "higher_better") {
    const better = diff > 0 ? locationA : locationB;
    const worse = diff > 0 ? locationB : locationA;
    if (pctDiff && pctDiff > 10) {
      return `${better.name} outperforms ${worse.name} by ${pctDiff}% on ${metric.shortLabel}.`;
    }
  } else {
    // Neutral — just state the difference
    if (pctDiff && pctDiff > 10) {
      const higher = diff > 0 ? locationA : locationB;
      const lower = diff > 0 ? locationB : locationA;
      return `${higher.name}'s ${metric.shortLabel} (${higher.formatted}) is ${pctDiff}% higher than ${lower.name} (${lower.formatted}).`;
    }
  }

  return null;
}

function getDirectionLabel(metric: MetricDefinition): string {
  switch (metric.id) {
    case "property_tax_rate":
    case "rental_income_tax":
    case "capital_gains_tax":
      return "cheaper";
    case "total_transaction_cost_buy":
    case "total_transaction_cost_sell":
      return "cheaper to transact";
    case "mortgage_rate":
      return "cheaper to borrow";
    case "avg_days_on_market":
      return "faster to sell";
    case "inflation":
      return "more stable";
    case "years_to_buy":
      return "more affordable";
    default:
      return "lower";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. FORMAT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a metric value for display based on its MetricDefinition.
 */
export function formatMetricValue(metricId: string, value: number | string | boolean | null): string {
  if (value === null || value === undefined) return "—";

  const metric = getMetricById(metricId);
  if (!metric) return String(value);

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    // Qualitative values — capitalize first letter
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  const v = value as number;

  switch (metric.format) {
    case "currency":
      if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
      if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
      return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    case "percent":
      return `${v > 0 && metric.direction !== "neutral" ? "+" : ""}${v.toFixed(1)}%`;

    case "index":
      return v.toFixed(1);

    case "number":
      if (metric.unit === "/100" || metric.unit === "/10") return `${v.toFixed(1)}${metric.unit}`;
      if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return v.toFixed(1);

    case "years":
      return `${v.toFixed(1)} years`;

    case "days":
      return `${Math.round(v)} days`;

    case "ratio":
      return `${v.toFixed(1)}x`;

    default:
      return String(v);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. COMPARISON PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const COMPARISON_PRESETS: ComparisonPreset[] = [
  // ─── Country-Level Presets ───────────────────────────────────────────
  {
    id: "gulf_vs_west",
    label: "Gulf vs West",
    description: "Compare Middle East hubs against Western real estate powerhouses.",
    items: ["AE", "SA", "GB", "US"],
    level: "country",
    tags: ["popular", "regional"],
  },
  {
    id: "investment_hotspots",
    label: "Investment Hotspots",
    description: "Markets attracting the most international real estate investment.",
    items: ["AE", "SG", "PT", "TR"],
    level: "country",
    tags: ["popular", "investment"],
  },
  {
    id: "brics_markets",
    label: "BRICS Markets",
    description: "Emerging market giants — high growth potential, higher risk.",
    items: ["BR", "RU", "IN", "CN", "ZA"],
    level: "country",
    tags: ["regional", "emerging"],
  },
  {
    id: "european_hubs",
    label: "European Hubs",
    description: "The continent's largest and most liquid real estate markets.",
    items: ["GB", "DE", "FR", "ES", "NL"],
    level: "country",
    tags: ["regional"],
  },
  {
    id: "asia_pacific",
    label: "Asia Pacific",
    description: "Key Asia-Pacific markets from city-states to continental powers.",
    items: ["SG", "HK", "JP", "AU", "KR"],
    level: "country",
    tags: ["regional"],
  },
  {
    id: "expat_favorites",
    label: "Expat Favorites",
    description: "Top destinations for international professionals and retirees.",
    items: ["AE", "SG", "PT", "ES", "TH"],
    level: "country",
    tags: ["popular", "lifestyle"],
  },
  {
    id: "safe_havens",
    label: "Safe Haven Markets",
    description: "Politically stable, low-risk markets that hold value through cycles.",
    items: ["CH", "SG", "US", "AU", "DE"],
    level: "country",
    tags: ["investment", "stability"],
  },
  {
    id: "fastest_growing",
    label: "Fastest Growing",
    description: "Markets with the strongest recent price appreciation.",
    items: ["AE", "TR", "GR", "PT", "IN"],
    level: "country",
    sortBy: "real_price_yoy",
    tags: ["investment", "growth"],
  },
  {
    id: "most_affordable",
    label: "Most Affordable",
    description: "Markets where property is most accessible relative to local incomes.",
    items: ["DE", "JP", "US", "AU", "KR"],
    level: "country",
    sortBy: "price_to_income",
    tags: ["affordability"],
  },

  // ─── City-Level Presets ──────────────────────────────────────────────
  {
    id: "tax_free_havens",
    label: "Tax-Free Havens",
    description: "Cities with zero or near-zero property and income taxes.",
    items: ["dubai", "abu-dhabi", "monaco", "singapore", "hong-kong", "nassau"],
    level: "city",
    sortBy: "property_tax_rate",
    tags: ["investment", "tax"],
  },
  {
    id: "highest_yields",
    label: "Highest Yields",
    description: "Cities offering the best gross rental yields for investors.",
    items: ["dubai", "istanbul", "bangkok", "cairo", "kuala-lumpur", "manila"],
    level: "city",
    sortBy: "gross_rental_yield",
    tags: ["investment", "yield"],
  },
  {
    id: "most_affordable_cities",
    label: "Most Affordable Cities",
    description: "Cities where years-to-buy is lowest relative to local incomes.",
    items: ["dubai", "lisbon", "kuala-lumpur", "istanbul", "bangkok", "riyadh"],
    level: "city",
    sortBy: "years_to_buy",
    tags: ["affordability"],
  },
  {
    id: "fastest_growing_cities",
    label: "Fastest Growing Cities",
    description: "Cities with the strongest year-over-year price appreciation.",
    items: ["dubai", "riyadh", "athens", "lisbon", "mumbai", "istanbul"],
    level: "city",
    sortBy: "nominal_price_yoy",
    tags: ["growth"],
  },
  {
    id: "best_foreign_investors",
    label: "Best for Foreign Investors",
    description: "Considering ownership rules, tax burden, golden visa, and regulatory ease.",
    items: ["dubai", "abu-dhabi", "singapore", "lisbon", "bangkok", "panama-city"],
    level: "city",
    sortBy: "regulatory_ease",
    tags: ["investment", "foreigners"],
  },
  {
    id: "gulf_rivalry",
    label: "Gulf Rivalry",
    description: "The GCC's real estate heavyweights go head to head.",
    items: ["dubai", "abu-dhabi", "riyadh", "doha", "jeddah", "muscat"],
    level: "city",
    tags: ["regional", "popular"],
  },
  {
    id: "global_alpha_cities",
    label: "Global Alpha Cities",
    description: "The world's premier gateway cities for real estate capital.",
    items: ["london", "new-york", "singapore", "hong-kong", "tokyo", "dubai"],
    level: "city",
    tags: ["popular", "premium"],
  },
  {
    id: "golden_visa_destinations",
    label: "Golden Visa Destinations",
    description: "Cities where property investment unlocks residency or citizenship.",
    items: ["dubai", "lisbon", "athens", "madrid", "istanbul", "kuala-lumpur"],
    level: "city",
    sortBy: "golden_visa_min_investment",
    tags: ["investment", "visa"],
  },
  {
    id: "luxury_lifestyle",
    label: "Luxury & Lifestyle",
    description: "Premium lifestyle destinations for high-net-worth buyers.",
    items: ["dubai", "monaco", "miami", "marbella", "singapore", "sydney"],
    level: "city",
    tags: ["lifestyle", "premium"],
  },
  {
    id: "digital_nomad_picks",
    label: "Digital Nomad Picks",
    description: "Affordable, well-connected cities with great quality of life.",
    items: ["lisbon", "bangkok", "dubai", "istanbul", "kuala-lumpur", "tbilisi"],
    level: "city",
    tags: ["lifestyle", "affordability"],
  },
  {
    id: "safest_cities",
    label: "Safest Cities",
    description: "Cities with the highest safety scores for residents and investors.",
    items: ["dubai", "abu-dhabi", "singapore", "tokyo", "zurich", "doha"],
    level: "city",
    sortBy: "safety_index",
    tags: ["lifestyle", "safety"],
  },
  {
    id: "emerging_markets",
    label: "Emerging Market Cities",
    description: "High-growth cities in developing economies with strong upside potential.",
    items: ["istanbul", "cairo", "nairobi", "mumbai", "ho-chi-minh", "lagos"],
    level: "city",
    tags: ["emerging", "growth"],
  },
];

/** Get presets filtered by tag */
export function getPresetsByTag(tag: string): ComparisonPreset[] {
  return COMPARISON_PRESETS.filter((p) => p.tags.includes(tag));
}

/** Get presets by level */
export function getPresetsByLevel(level: ComparisonPreset["level"]): ComparisonPreset[] {
  return COMPARISON_PRESETS.filter((p) => p.level === level);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CITY DATA SCHEMA (for curated monthly updates)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The shape of city-level curated data. This is what the owner updates monthly.
 * Each city entry lives in a separate data source (Supabase, JSON, etc.)
 * and is merged with country-level API data at runtime.
 */
export interface CityData {
  slug: string;                          // URL-friendly unique id, e.g. "dubai"
  name: string;                          // Display name, e.g. "Dubai"
  country: string;                       // ISO-2 country code, e.g. "AE"
  countryName: string;                   // e.g. "United Arab Emirates"
  currency: string;                      // e.g. "AED"
  lastUpdated: string;                   // ISO date of last curated update

  // Property Market (curated)
  avgPricePerSqm: number | null;         // USD — city center
  avgPricePerSqmSuburb: number | null;   // USD — outside city center
  price5YChange: number | null;          // % cumulative

  // Rental Market (curated)
  grossRentalYield: number | null;       // %
  avgRent1brCenter: number | null;       // USD/month
  avgRent3brCenter: number | null;       // USD/month
  rentYoYChange: number | null;          // %

  // Affordability (curated)
  yearsToBuy: number | null;             // years of gross salary for 60sqm
  mortgageRate: number | null;           // % typical 20-year fixed
  maxLtv: number | null;                 // % max LTV for residents
  mortgageAvailableForeigners: string | null; // "yes", "limited", "no"

  // Investment Climate (curated)
  propertyTaxRate: number | null;        // % annual
  rentalIncomeTax: number | null;        // % for non-residents
  capitalGainsTax: number | null;        // %
  totalTransactionCostBuy: number | null; // % of purchase price
  totalTransactionCostSell: number | null; // % of sale price
  foreignOwnership: string | null;       // "freehold" | "leasehold" | "restricted" | "prohibited"
  goldenVisa: boolean | null;
  goldenVisaMinInvestment: number | null; // USD
  regulatoryEase: number | null;         // 1-10

  // Demographics (curated)
  cityPopulation: number | null;
  expatPercentage: number | null;        // %
  medianAge: number | null;              // years

  // Market Dynamics (curated)
  transactionVolumeYoY: number | null;   // %
  avgDaysOnMarket: number | null;        // days
  supplyPipeline: number | null;         // units
  offPlanShare: number | null;           // %
  vacancyRate: number | null;            // %

  // Quality of Life (curated)
  safetyIndex: number | null;            // 0-100
  qolIndex: number | null;              // 0-100
  climateScore: number | null;           // 1-10
  healthcareScore: number | null;        // 1-10
  connectivityScore: number | null;      // 1-10
}

/**
 * Factory to create an empty city data object.
 * Use this when adding a new city to the curated dataset.
 */
export function emptyCityData(slug: string, name: string, country: string, countryName: string, currency: string): CityData {
  return {
    slug, name, country, countryName, currency,
    lastUpdated: new Date().toISOString().split("T")[0],
    avgPricePerSqm: null, avgPricePerSqmSuburb: null, price5YChange: null,
    grossRentalYield: null, avgRent1brCenter: null, avgRent3brCenter: null, rentYoYChange: null,
    yearsToBuy: null, mortgageRate: null, maxLtv: null, mortgageAvailableForeigners: null,
    propertyTaxRate: null, rentalIncomeTax: null, capitalGainsTax: null,
    totalTransactionCostBuy: null, totalTransactionCostSell: null,
    foreignOwnership: null, goldenVisa: null, goldenVisaMinInvestment: null, regulatoryEase: null,
    cityPopulation: null, expatPercentage: null, medianAge: null,
    transactionVolumeYoY: null, avgDaysOnMarket: null, supplyPipeline: null,
    offPlanShare: null, vacancyRate: null,
    safetyIndex: null, qolIndex: null, climateScore: null, healthcareScore: null, connectivityScore: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. AGGREGATE SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a normalized composite score for a city across a set of metrics.
 * Each metric is min-max normalized to 0-1, inverted for lower_better, then averaged.
 * Null values are skipped. Returns null if fewer than `minMetrics` have data.
 */
export function computeCompositeScore(
  cityData: CityData,
  metricIds: string[],
  allCities: CityData[],
  minMetrics = 3,
): number | null {
  let sum = 0;
  let count = 0;

  for (const id of metricIds) {
    const metric = getMetricById(id);
    if (!metric) continue;

    const key = metric.getValue as keyof CityData;
    const value = cityData[key];
    if (value === null || value === undefined || typeof value !== "number") continue;

    // Collect all non-null values for this metric across all cities
    const allValues = allCities
      .map((c) => c[key])
      .filter((v): v is number => typeof v === "number");

    if (allValues.length < 2) continue;

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    if (max === min) continue;

    // Normalize to 0-1
    let normalized = (value - min) / (max - min);

    // Invert for lower_better so that lower raw values get higher scores
    if (metric.direction === "lower_better") {
      normalized = 1 - normalized;
    }

    sum += normalized;
    count++;
  }

  if (count < minMetrics) return null;
  return Math.round((sum / count) * 100) / 100; // 0.00 to 1.00
}

/** Predefined composite score sets */
export const COMPOSITE_SCORES = {
  investorScore: {
    label: "Investor Score",
    description: "Weighted score for buy-to-let investment attractiveness.",
    metrics: [
      "gross_rental_yield",
      "property_tax_rate",
      "rental_income_tax",
      "capital_gains_tax",
      "total_transaction_cost_buy",
      "foreign_ownership",
      "regulatory_ease",
      "vacancy_rate",
    ],
  },
  affordabilityScore: {
    label: "Affordability Score",
    description: "How accessible is property ownership here?",
    metrics: [
      "avg_price_per_sqm",
      "price_to_income",
      "years_to_buy",
      "mortgage_rate",
      "max_ltv",
    ],
  },
  liveabilityScore: {
    label: "Liveability Score",
    description: "How desirable is this city to live in?",
    metrics: [
      "safety_index",
      "qol_index",
      "climate_score",
      "healthcare_score",
      "connectivity_score",
    ],
  },
  growthScore: {
    label: "Growth Score",
    description: "Market momentum and future demand indicators.",
    metrics: [
      "real_price_yoy",
      "rent_yoy_change",
      "transaction_volume_yoy",
      "population_growth",
      "gdp_growth",
      "price_5y_change",
    ],
  },
} as const;
