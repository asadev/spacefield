"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Global Market Comparison — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no frame=1 logic, no PageHeader, no back-links, no ToolRecommendations,
   no bespoke macOS chrome. Width-driven layout (compact at < 720, picker
   grid columns scale with width, table reflows). All city/country data and
   comparison math preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  COMPARISON_PRESETS,
  getCategoryById,
  type MetricCategory,
  type ComparisonPreset,
} from "@/lib/global-market-metrics";
import {
  CITY_DATA,
  REGIONS,
  type CityData,
  type Region,
} from "@/lib/global-market-data";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// Width thresholds
const COMPACT_BREAKPOINT = 720;

// ---------------------------------------------------------------------------
// Country data interface (from the API)
// ---------------------------------------------------------------------------
interface CountryData {
  code: string;
  name: string;
  realPriceIndex: number | null;
  realPriceYoY: number | null;
  nominalPriceIndex: number | null;
  nominalPriceYoY: number | null;
  priceToIncome: number | null;
  priceToRent: number | null;
  priceToIncomeDeviation: number | null;
  priceToRentDeviation: number | null;
  gdpPerCapita: number | null;
  population: number | null;
  populationGrowth: number | null;
  inflation: number | null;
  fdiInflows: number | null;
  urbanization: number | null;
  grossSavings: number | null;
  exchangeRateToUSD: number | null;
  bisYear: string | null;
  oecdYear: string | null;
  wbYear: string | null;
}

type ComparisonMode = "cities" | "countries";

// ---------------------------------------------------------------------------
// Flag emoji from ISO-2 country code
// ---------------------------------------------------------------------------
function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🏳";
  const upper = code.toUpperCase();
  const A = 0x41;
  const REG_A = 0x1f1e6;
  return String.fromCodePoint(
    REG_A + (upper.charCodeAt(0) - A),
    REG_A + (upper.charCodeAt(1) - A)
  );
}

// ---------------------------------------------------------------------------
// City metric rows
// ---------------------------------------------------------------------------
interface CityMetricRow {
  key: string;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  getValue: (c: CityData) => number | string | boolean | null;
  direction: "higher_better" | "lower_better" | "neutral";
  format?: "currency" | "percent" | "number" | "boolean" | "qualitative" | "days";
}

const CITY_METRIC_ROWS: CityMetricRow[] = [
  // Property Market
  { key: "avgPricePerSqft", label: "Avg Price/sqft", shortLabel: "Price/sqft", category: "property_market", getValue: (c) => c.avgPricePerSqft, direction: "neutral", format: "currency" },
  { key: "avgPricePerSqm", label: "Avg Price/sqm", shortLabel: "Price/sqm", category: "property_market", getValue: (c) => c.avgPricePerSqm, direction: "neutral", format: "currency" },
  { key: "avgApartmentPrice", label: "Avg Apartment Price", shortLabel: "Apt Price", category: "property_market", getValue: (c) => c.avgApartmentPrice, direction: "neutral", format: "currency" },
  { key: "priceChangeYoY", label: "Price Change (YoY)", shortLabel: "YoY Change", category: "property_market", getValue: (c) => c.priceChangeYoY, direction: "neutral", format: "percent" },
  { key: "priceChange5Y", label: "5-Year Price Change", shortLabel: "5Y Change", category: "property_market", getValue: (c) => c.priceChange5Y, direction: "higher_better", format: "percent" },

  // Rental Market
  { key: "avgRentalYield", label: "Gross Rental Yield", shortLabel: "Yield", category: "rental_market", getValue: (c) => c.avgRentalYield, direction: "higher_better", format: "percent" },
  { key: "avgMonthlyRent1BR", label: "Avg Rent — 1BR", shortLabel: "1BR Rent", category: "rental_market", getValue: (c) => c.avgMonthlyRent1BR, direction: "neutral", format: "currency" },
  { key: "avgMonthlyRent2BR", label: "Avg Rent — 2BR", shortLabel: "2BR Rent", category: "rental_market", getValue: (c) => c.avgMonthlyRent2BR, direction: "neutral", format: "currency" },
  { key: "rentChangeYoY", label: "Rent Change (YoY)", shortLabel: "Rent Change", category: "rental_market", getValue: (c) => c.rentChangeYoY, direction: "neutral", format: "percent" },

  // Affordability
  { key: "priceToIncomeRatio", label: "Price-to-Income Ratio", shortLabel: "Price/Income", category: "affordability", getValue: (c) => c.priceToIncomeRatio, direction: "lower_better", format: "number" },
  { key: "mortgageRate", label: "Mortgage Rate", shortLabel: "Mortgage", category: "affordability", getValue: (c) => c.mortgageRate, direction: "lower_better", format: "percent" },
  { key: "maxLTV", label: "Max LTV", shortLabel: "Max LTV", category: "affordability", getValue: (c) => c.maxLTV, direction: "higher_better", format: "percent" },

  // Investment Climate
  { key: "foreignOwnership", label: "Foreign Ownership", shortLabel: "Foreign Own.", category: "investment_climate", getValue: (c) => c.foreignOwnershipAllowed, direction: "neutral", format: "qualitative" },
  { key: "freehold", label: "Freehold Available", shortLabel: "Freehold", category: "investment_climate", getValue: (c) => c.freeholdAvailable, direction: "higher_better", format: "boolean" },
  { key: "goldenVisaThreshold", label: "Golden Visa Threshold", shortLabel: "Visa Min.", category: "investment_climate", getValue: (c) => c.goldenVisaThreshold, direction: "lower_better", format: "currency" },
  { key: "propertyTaxRate", label: "Property Tax", shortLabel: "Prop. Tax", category: "investment_climate", getValue: (c) => c.propertyTaxRate, direction: "lower_better", format: "percent" },
  { key: "capitalGainsTax", label: "Capital Gains Tax", shortLabel: "CGT", category: "investment_climate", getValue: (c) => c.capitalGainsTax, direction: "lower_better", format: "percent" },
  { key: "rentalIncomeTax", label: "Rental Income Tax", shortLabel: "Rental Tax", category: "investment_climate", getValue: (c) => c.rentalIncomeTax, direction: "lower_better", format: "percent" },
  { key: "transactionCostBuyer", label: "Buyer Transaction Costs", shortLabel: "Buy Costs", category: "investment_climate", getValue: (c) => c.transactionCostBuyer, direction: "lower_better", format: "percent" },
  { key: "transactionCostSeller", label: "Seller Transaction Costs", shortLabel: "Sell Costs", category: "investment_climate", getValue: (c) => c.transactionCostSeller, direction: "lower_better", format: "percent" },

  // Market Dynamics
  { key: "annualTransactions", label: "Annual Transactions", shortLabel: "Transactions", category: "market_dynamics", getValue: (c) => c.annualTransactions, direction: "higher_better", format: "number" },
  { key: "avgDaysOnMarket", label: "Days on Market", shortLabel: "Days on Mkt", category: "market_dynamics", getValue: (c) => c.avgDaysOnMarket, direction: "lower_better", format: "days" },
  { key: "newSupplyPipeline", label: "Supply Pipeline", shortLabel: "Pipeline", category: "market_dynamics", getValue: (c) => c.newSupplyPipeline, direction: "neutral", format: "qualitative" },

  // Quality of Life
  { key: "safetyIndex", label: "Safety Index", shortLabel: "Safety", category: "quality_of_life", getValue: (c) => c.safetyIndex, direction: "higher_better", format: "number" },
  { key: "qualityOfLifeIndex", label: "Quality of Life Index", shortLabel: "QoL", category: "quality_of_life", getValue: (c) => c.qualityOfLifeIndex, direction: "higher_better", format: "number" },
];

// Country-level metric rows
interface CountryMetricRow {
  key: string;
  label: string;
  shortLabel: string;
  category: "housing" | "economy" | "demographics";
  getValue: (d: CountryData) => number | null;
  format: (v: number) => string;
  direction: "higher" | "lower" | "neutral";
  description: string;
  source: string;
}

const COUNTRY_METRICS: CountryMetricRow[] = [
  { key: "realPriceYoY", label: "Real Price Change (YoY)", shortLabel: "Price Change", category: "housing", getValue: (d) => d.realPriceYoY, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, direction: "neutral", description: "Year-over-year change in inflation-adjusted property prices", source: "BIS" },
  { key: "nominalPriceIndex", label: "Nominal Price Index", shortLabel: "Price Index", category: "housing", getValue: (d) => d.nominalPriceIndex, format: (v) => v.toFixed(1), direction: "neutral", description: "Nominal property price index (2010 = 100)", source: "BIS" },
  { key: "realPriceIndex", label: "Real Price Index", shortLabel: "Real Index", category: "housing", getValue: (d) => d.realPriceIndex, format: (v) => v.toFixed(1), direction: "neutral", description: "Inflation-adjusted property price index (2010 = 100)", source: "BIS" },
  { key: "priceToIncome", label: "Price-to-Income Ratio", shortLabel: "Price/Income", category: "housing", getValue: (d) => d.priceToIncome, format: (v) => v.toFixed(1), direction: "lower", description: "Property prices relative to household income (2015 = 100)", source: "OECD" },
  { key: "priceToRent", label: "Price-to-Rent Ratio", shortLabel: "Price/Rent", category: "housing", getValue: (d) => d.priceToRent, format: (v) => v.toFixed(1), direction: "lower", description: "Property prices relative to rents (2015 = 100)", source: "OECD" },
  { key: "priceToIncomeDeviation", label: "Price/Income vs Long-Term Avg", shortLabel: "Affordability Gap", category: "housing", getValue: (d) => d.priceToIncomeDeviation, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, direction: "lower", description: "How far price-to-income is from its historical average", source: "OECD" },
  { key: "priceToRentDeviation", label: "Price/Rent vs Long-Term Avg", shortLabel: "Yield Gap", category: "housing", getValue: (d) => d.priceToRentDeviation, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, direction: "lower", description: "How far price-to-rent is from its historical average", source: "OECD" },
  { key: "gdpPerCapita", label: "GDP per Capita", shortLabel: "GDP/Capita", category: "economy", getValue: (d) => d.gdpPerCapita, format: (v) => `$${(v / 1000).toFixed(1)}K`, direction: "higher", description: "Gross Domestic Product per person (current USD)", source: "World Bank" },
  { key: "inflation", label: "Inflation Rate", shortLabel: "Inflation", category: "economy", getValue: (d) => d.inflation, format: (v) => `${v.toFixed(1)}%`, direction: "lower", description: "Annual consumer price inflation", source: "World Bank" },
  { key: "fdiInflows", label: "FDI Inflows", shortLabel: "FDI", category: "economy", getValue: (d) => d.fdiInflows, format: (v) => { if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`; if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`; return `$${v.toFixed(0)}`; }, direction: "higher", description: "Foreign Direct Investment net inflows", source: "World Bank" },
  { key: "grossSavings", label: "Gross Savings Rate", shortLabel: "Savings", category: "economy", getValue: (d) => d.grossSavings, format: (v) => `${v.toFixed(1)}%`, direction: "higher", description: "Gross savings as percentage of GDP", source: "World Bank" },
  { key: "population", label: "Population", shortLabel: "Population", category: "demographics", getValue: (d) => d.population, format: (v) => { if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`; if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`; return `${(v / 1000).toFixed(0)}K`; }, direction: "neutral", description: "Total population", source: "World Bank" },
  { key: "populationGrowth", label: "Population Growth", shortLabel: "Pop Growth", category: "demographics", getValue: (d) => d.populationGrowth, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, direction: "higher", description: "Annual population growth rate", source: "World Bank" },
  { key: "urbanization", label: "Urbanization", shortLabel: "Urban %", category: "demographics", getValue: (d) => d.urbanization, format: (v) => `${v.toFixed(1)}%`, direction: "neutral", description: "Percentage of population living in urban areas", source: "World Bank" },
];

// ---------------------------------------------------------------------------
// Format helpers for city metrics
// ---------------------------------------------------------------------------
function formatCityValue(row: CityMetricRow, value: number | string | boolean | null): string {
  if (value === null || value === undefined) return "—";

  if (row.format === "boolean") {
    return value ? "✓" : "✗";
  }
  if (row.format === "qualitative") {
    if (typeof value === "string") return value.charAt(0).toUpperCase() + value.slice(1);
    return String(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const v = value as number;
  switch (row.format) {
    case "currency":
      if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
      return `$${v.toFixed(0)}`;
    case "percent":
      return `${v > 0 && row.key.includes("Change") ? "+" : ""}${v.toFixed(1)}%`;
    case "number":
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return v.toFixed(1);
    case "days":
      return `${Math.round(v)} days`;
    default:
      return String(v);
  }
}

function isBestCityValue(row: CityMetricRow, value: number | string | boolean | null, allValues: (number | string | boolean | null)[]): boolean {
  if (row.direction === "neutral") return false;
  if (value === null || value === undefined) return false;
  if (typeof value !== "number") return false;

  const numericValues = allValues.filter((v): v is number => typeof v === "number");
  if (numericValues.length < 2) return false;

  if (row.direction === "higher_better") return value === Math.max(...numericValues);
  if (row.direction === "lower_better") return value === Math.min(...numericValues);
  return false;
}

// ---------------------------------------------------------------------------
// Qualitative value
// ---------------------------------------------------------------------------
function QualitativeValue({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted text-sm">{"—"}</span>;
  const colorMap: Record<string, string> = {
    high: "text-rose-500 dark:text-rose-400",
    medium: "text-amber-500 dark:text-amber-400",
    low: "text-emerald-500 dark:text-emerald-400",
    yes: "text-emerald-500 dark:text-emerald-400",
    limited: "text-amber-500 dark:text-amber-400",
    no: "text-rose-500 dark:text-rose-400",
  };
  const color = colorMap[value.toLowerCase()] || "text-app";
  return <span className={`text-sm font-medium ${color}`}>{value.charAt(0).toUpperCase() + value.slice(1)}</span>;
}

// ---------------------------------------------------------------------------
// Change indicator
// ---------------------------------------------------------------------------
function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <span className="text-emerald-500 dark:text-emerald-400 text-[0.6rem]">{"▲"}</span>;
  if (value < 0) return <span className="text-rose-500 dark:text-rose-400 text-[0.6rem]">{"▼"}</span>;
  return <span className="text-muted text-[0.6rem]">{"—"}</span>;
}

// ---------------------------------------------------------------------------
// City tile
// ---------------------------------------------------------------------------
function CityTile({
  city,
  selected,
  disabled,
  onToggle,
}: {
  city: CityData;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-tool-accent/50 bg-tool-accent-soft ring-1 ring-tool-accent/30"
          : "border-app bg-app-elevated hover:border-tool-accent/30 hover:bg-tool-accent-soft/40"
      } disabled:cursor-not-allowed disabled:opacity-30`}
      aria-pressed={selected}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {flagEmoji(city.countryCode)}
        </span>
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tool-accent">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M16.7 4.2a.75.75 0 0 1 .14 1.05l-8 10.5a.75.75 0 0 1-1.13.07l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.48-9.82a.75.75 0 0 1 1.05-.14Z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-semibold leading-tight ${selected ? "text-tool-accent" : "text-app"}`}>
          {city.name}
        </div>
        <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted">
          {city.country}
        </div>
      </div>
      {city.avgRentalYield !== null && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-secondary">
          <span className="tabular-nums font-semibold text-app">
            {city.avgRentalYield.toFixed(1)}%
          </span>
          <span>yield</span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Country tile
// ---------------------------------------------------------------------------
function CountryTile({
  data,
  selected,
  disabled,
  onToggle,
}: {
  data: CountryData;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-tool-accent/50 bg-tool-accent-soft ring-1 ring-tool-accent/30"
          : "border-app bg-app-elevated hover:border-tool-accent/30 hover:bg-tool-accent-soft/40"
      } disabled:cursor-not-allowed disabled:opacity-30`}
      aria-pressed={selected}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {flagEmoji(data.code)}
        </span>
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tool-accent">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M16.7 4.2a.75.75 0 0 1 .14 1.05l-8 10.5a.75.75 0 0 1-1.13.07l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.48-9.82a.75.75 0 0 1 1.05-.14Z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-semibold leading-tight ${selected ? "text-tool-accent" : "text-app"}`}>
          {data.name}
        </div>
        <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted">
          {data.code}
        </div>
      </div>
      {data.gdpPerCapita !== null && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-secondary">
          <span className="tabular-nums font-semibold text-app">
            ${(data.gdpPerCapita / 1000).toFixed(0)}K
          </span>
          <span>GDP/cap</span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helper: width-driven grid columns class for the picker tile grid
// ---------------------------------------------------------------------------
function pickerGridClass(width: number): string {
  if (width >= 1100) return "grid-cols-5";
  if (width >= 880) return "grid-cols-4";
  if (width >= 640) return "grid-cols-3";
  return "grid-cols-2";
}

// ---------------------------------------------------------------------------
// City picker (collapsible drawer)
// ---------------------------------------------------------------------------
function CityPicker({
  cities,
  selectedIds,
  onChange,
  maxItems = 6,
  regionFilter,
  setRegionFilter,
  width,
}: {
  cities: CityData[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxItems?: number;
  regionFilter: "all" | Region;
  setRegionFilter: (r: "all" | Region) => void;
  width: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
    );
  }, [cities, search]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else if (selectedIds.length < maxItems) {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex flex-wrap items-center gap-3 border-b border-app px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent">
            Cities
          </span>
          <span className="text-[11px] text-secondary tabular-nums">
            {selectedIds.length} / {maxItems}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-app px-3 py-1.5 text-[11px] font-medium text-app transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
        >
          {open ? "Done" : "Pick cities"}
          <svg
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-app px-4 py-3">
          {selectedIds.map((id) => {
            const c = cities.find((x) => x.id === id);
            if (!c) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 py-1 text-[11px] font-medium text-tool-accent ring-1 ring-inset ring-tool-accent/30"
              >
                <span aria-hidden>{flagEmoji(c.countryCode)}</span>
                {c.name}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="text-tool-accent/70 transition hover:text-tool-accent"
                  aria-label={`Remove ${c.name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="cities-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 border-b border-app px-4 py-3">
              <button
                type="button"
                onClick={() => setRegionFilter("all")}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  regionFilter === "all"
                    ? "bg-tool-accent text-white"
                    : "bg-app-elevated text-secondary ring-1 ring-inset ring-app hover:bg-tool-accent-soft hover:text-tool-accent"
                }`}
              >
                All regions
              </button>
              {(Object.keys(REGIONS) as Region[]).map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => setRegionFilter(region)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    regionFilter === region
                      ? "bg-tool-accent text-white"
                      : "bg-app-elevated text-secondary ring-1 ring-inset ring-app hover:bg-tool-accent-soft hover:text-tool-accent"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="border-b border-app px-4 py-3">
              <div className="flex items-center gap-2 rounded-lg bg-app px-3 py-2 ring-1 ring-inset ring-app focus-within:ring-tool-accent">
                <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cities or countries..."
                  className="w-full bg-transparent text-sm text-app outline-none placeholder:text-muted"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-muted hover:text-app"
                    aria-label="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-4">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No cities match your search.</p>
              ) : (
                <div className={`grid gap-2 ${pickerGridClass(width)}`}>
                  {filtered.map((city) => (
                    <CityTile
                      key={city.id}
                      city={city}
                      selected={selectedIds.includes(city.id)}
                      disabled={selectedIds.length >= maxItems}
                      onToggle={() => toggle(city.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Country picker (collapsible drawer)
// ---------------------------------------------------------------------------
function CountryPicker({
  countries,
  selectedCodes,
  onChange,
  maxItems = 6,
  width,
}: {
  countries: CountryData[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  maxItems?: number;
  width: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countries, search]);

  const toggle = (code: string) => {
    if (selectedCodes.includes(code)) {
      onChange(selectedCodes.filter((s) => s !== code));
    } else if (selectedCodes.length < maxItems) {
      onChange([...selectedCodes, code]);
    }
  };

  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex flex-wrap items-center gap-3 border-b border-app px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent">
            Countries
          </span>
          <span className="text-[11px] text-secondary tabular-nums">
            {selectedCodes.length} / {maxItems}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-app px-3 py-1.5 text-[11px] font-medium text-app transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
        >
          {open ? "Done" : "Pick countries"}
          <svg
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {selectedCodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-app px-4 py-3">
          {selectedCodes.map((code) => {
            const d = countries.find((x) => x.code === code);
            if (!d) return null;
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 py-1 text-[11px] font-medium text-tool-accent ring-1 ring-inset ring-tool-accent/30"
              >
                <span aria-hidden>{flagEmoji(code)}</span>
                {d.name}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  className="text-tool-accent/70 transition hover:text-tool-accent"
                  aria-label={`Remove ${d.name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="countries-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="border-b border-app px-4 py-3">
              <div className="flex items-center gap-2 rounded-lg bg-app px-3 py-2 ring-1 ring-inset ring-app focus-within:ring-tool-accent">
                <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search countries..."
                  className="w-full bg-transparent text-sm text-app outline-none placeholder:text-muted"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-muted hover:text-app"
                    aria-label="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-4">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No countries match your search.</p>
              ) : (
                <div className={`grid gap-2 ${pickerGridClass(width)}`}>
                  {filtered.map((d) => (
                    <CountryTile
                      key={d.code}
                      data={d}
                      selected={selectedCodes.includes(d.code)}
                      disabled={selectedCodes.length >= maxItems}
                      onToggle={() => toggle(d.code)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slim in-app header
// ---------------------------------------------------------------------------
function ToolAppHeader({ compact }: { compact: boolean }) {
  return (
    <div className="tool-hero relative overflow-hidden border-b border-app">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 28px)",
          color: "var(--tool-accent)",
          maskImage: "radial-gradient(ellipse at 90% 0%, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 90% 0%, black 0%, transparent 70%)",
        }}
      />

      <div
        className={`relative flex flex-col gap-3 px-4 py-3 ${
          compact ? "" : "md:flex-row md:items-end md:justify-between md:px-5 md:py-4"
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-tool-accent-soft px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-tool-accent ring-1 ring-inset ring-tool-accent/30">
              <span className="h-1.5 w-1.5 rounded-full bg-tool-accent animate-pulse" />
              Intelligence
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-tool-accent">
              USD normalised
            </span>
          </div>
          <h1 className="mt-1.5 text-[1.1rem] font-bold leading-tight tracking-tight text-app">
            Global Market Comparison
          </h1>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-secondary">
            48 curated cities plus live country indices from BIS, OECD &amp; World Bank — all values converted to USD.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// City categories for filter row
// ---------------------------------------------------------------------------
const CITY_CATEGORIES: MetricCategory[] = [
  "property_market",
  "rental_market",
  "affordability",
  "investment_climate",
  "market_dynamics",
  "quality_of_life",
];

const COUNTRY_CATEGORIES = ["all", "housing", "economy", "demographics"] as const;

// ---------------------------------------------------------------------------
// Main native app component
// ---------------------------------------------------------------------------
export default function GlobalMarketComparisonApp({ width }: NativeAppProps) {
  const compact = width < COMPACT_BREAKPOINT;

  // ── State ──
  const [mode, setMode] = useState<ComparisonMode>("cities");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Country mode state
  const [countryData, setCountryData] = useState<Record<string, CountryData>>({});
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["AE", "GB", "US", "SG"]);
  const [countryCategoryFilter, setCountryCategoryFilter] = useState<typeof COUNTRY_CATEGORIES[number]>("all");
  const [cached, setCached] = useState(false);

  // City mode state
  const [selectedCities, setSelectedCities] = useState<string[]>(["dubai", "london", "singapore", "new-york"]);
  const [regionFilter, setRegionFilter] = useState<"all" | Region>("all");
  const [cityCategoryFilter, setCityCategoryFilter] = useState<"all" | MetricCategory>("all");

  // ── Fetch country data ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market-data");
        if (!res.ok) throw new Error("Failed to fetch market data");
        const json = await res.json();
        setCountryData(json.countries);
        setCached(json.cached);
      } catch (e) {
        setError("Failed to load market data. Please try again.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Derived data: countries ──
  const allCountries = useMemo(
    () => Object.values(countryData).sort((a, b) => a.name.localeCompare(b.name)),
    [countryData]
  );

  const selectedCountryData = useMemo(
    () => selectedCountries.map((code) => countryData[code]).filter(Boolean),
    [selectedCountries, countryData]
  );

  const filteredCountryMetrics = useMemo(
    () => countryCategoryFilter === "all" ? COUNTRY_METRICS : COUNTRY_METRICS.filter((m) => m.category === countryCategoryFilter),
    [countryCategoryFilter]
  );

  const bestPerCountryMetric = useMemo(() => {
    const best: Record<string, string> = {};
    for (const metric of COUNTRY_METRICS) {
      let bestCode = "";
      let bestVal: number | null = null;
      for (const d of selectedCountryData) {
        const v = metric.getValue(d);
        if (v === null) continue;
        if (bestVal === null) { bestVal = v; bestCode = d.code; }
        else if (metric.direction === "higher" && v > bestVal) { bestVal = v; bestCode = d.code; }
        else if (metric.direction === "lower" && v < bestVal) { bestVal = v; bestCode = d.code; }
      }
      if (bestCode) best[metric.key] = bestCode;
    }
    return best;
  }, [selectedCountryData]);

  // ── Derived data: cities ──
  const filteredCities = useMemo(() => {
    if (regionFilter === "all") return CITY_DATA;
    const regionCityIds = REGIONS[regionFilter] as readonly string[];
    return CITY_DATA.filter((c) => regionCityIds.includes(c.id));
  }, [regionFilter]);

  const selectedCityData = useMemo(
    () => selectedCities.map((id) => CITY_DATA.find((c) => c.id === id)).filter(Boolean) as CityData[],
    [selectedCities]
  );

  const filteredCityMetrics = useMemo(
    () => cityCategoryFilter === "all" ? CITY_METRIC_ROWS : CITY_METRIC_ROWS.filter((m) => m.category === cityCategoryFilter),
    [cityCategoryFilter]
  );

  // Group city metrics by category for section headers
  const groupedCityMetrics = useMemo(() => {
    const groups: { category: MetricCategory; metrics: CityMetricRow[] }[] = [];
    let currentCat: MetricCategory | null = null;
    for (const m of filteredCityMetrics) {
      if (m.category !== currentCat) {
        currentCat = m.category;
        groups.push({ category: m.category, metrics: [] });
      }
      groups[groups.length - 1].metrics.push(m);
    }
    return groups;
  }, [filteredCityMetrics]);

  // ── Presets ──
  const activePresets = useMemo(
    () => COMPARISON_PRESETS.filter((p) => mode === "cities" ? p.level === "city" : p.level === "country"),
    [mode]
  );

  const handlePreset = useCallback(
    (preset: ComparisonPreset) => {
      if (mode === "cities") {
        const validIds = preset.items.filter((id) => CITY_DATA.some((c) => c.id === id));
        setSelectedCities(validIds.slice(0, 6));
      } else {
        const validCodes = preset.items.filter((code) => countryData[code]);
        setSelectedCountries(validCodes.slice(0, 6));
      }
    },
    [mode, countryData]
  );

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="global-market-comparison"
      className="tool-shell relative h-full w-full overflow-y-auto bg-app text-app"
    >
      <ToolAppHeader compact={compact} />

      {/* Mode toggle bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-app bg-tool-accent-soft/30 px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
          Compare by
        </span>
        <div className="inline-flex items-center rounded-full bg-app-elevated p-0.5 ring-1 ring-inset ring-app">
          <button
            type="button"
            onClick={() => setMode("cities")}
            className={`rounded-full px-3.5 py-1 text-[11px] font-semibold transition ${
              mode === "cities"
                ? "bg-tool-accent text-white shadow-sm"
                : "text-secondary hover:text-app"
            }`}
          >
            Cities · 48
          </button>
          <button
            type="button"
            onClick={() => setMode("countries")}
            className={`rounded-full px-3.5 py-1 text-[11px] font-semibold transition ${
              mode === "countries"
                ? "bg-tool-accent text-white shadow-sm"
                : "text-secondary hover:text-app"
            }`}
          >
            Countries · Live
          </button>
        </div>

        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-secondary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
          {mode === "cities"
            ? `${selectedCities.length} cities`
            : `${selectedCountries.length} countries`}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 sm:px-5">
        {/* Loading / Error */}
        {mode === "countries" && loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-tool-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="mt-4 text-sm text-secondary">
              Loading live data from BIS, OECD &amp; World Bank...
            </p>
          </div>
        ) : mode === "countries" && error ? (
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-6 text-center">
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          </div>
        ) : (
          <>
            {/* Presets */}
            <div className="mb-5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Quick Presets
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {activePresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePreset(p)}
                    title={p.description}
                    className="rounded-full border border-app bg-app-elevated px-3 py-1 text-[11px] font-medium text-secondary transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CITY MODE */}
            {mode === "cities" && (
              <>
                <CityPicker
                  cities={filteredCities}
                  selectedIds={selectedCities}
                  onChange={setSelectedCities}
                  maxItems={6}
                  regionFilter={regionFilter}
                  setRegionFilter={setRegionFilter}
                  width={width}
                />

                <div className="mt-5">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Metric Category
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCityCategoryFilter("all")}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        cityCategoryFilter === "all"
                          ? "bg-tool-accent text-white"
                          : "bg-app-elevated text-secondary ring-1 ring-inset ring-app hover:bg-tool-accent-soft hover:text-tool-accent"
                      }`}
                    >
                      All
                    </button>
                    {CITY_CATEGORIES.map((catId) => {
                      const cat = getCategoryById(catId);
                      const active = cityCategoryFilter === catId;
                      return (
                        <button
                          key={catId}
                          type="button"
                          onClick={() => setCityCategoryFilter(catId)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                            active
                              ? "bg-tool-accent text-white"
                              : "bg-app-elevated text-secondary ring-1 ring-inset ring-app hover:bg-tool-accent-soft hover:text-tool-accent"
                          }`}
                        >
                          {cat?.shortLabel || catId}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Comparison table */}
                <div className="mt-5">
                  {selectedCityData.length > 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease }}
                      className="overflow-hidden rounded-xl border border-app bg-app-elevated"
                    >
                      <div className="overflow-x-auto touch-pan-x">
                        <table className="w-full min-w-[700px] border-collapse">
                          <thead>
                            <tr className="bg-tool-accent-soft/40">
                              <th className="sticky left-0 z-10 bg-app-elevated px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent border-b border-r border-app min-w-[140px]">
                                Metric
                              </th>
                              {selectedCityData.map((city) => (
                                <th
                                  key={city.id}
                                  className="px-3 py-3 text-center text-[10px] uppercase tracking-[0.15em] text-secondary border-b border-app min-w-[120px]"
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-xl leading-none" aria-hidden>
                                      {flagEmoji(city.countryCode)}
                                    </span>
                                    <span className="text-[12px] font-semibold text-app normal-case tracking-normal">
                                      {city.name}
                                    </span>
                                    <span className="text-[9px] text-muted normal-case tracking-normal">
                                      {city.country}
                                    </span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {groupedCityMetrics.map((group) => {
                              const cat = getCategoryById(group.category);
                              return (
                                <React.Fragment key={group.category}>
                                  <tr>
                                    <td
                                      colSpan={selectedCityData.length + 1}
                                      className="bg-tool-accent-soft/30 px-4 py-2 border-b border-app"
                                    >
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                                        {cat?.label}
                                      </span>
                                    </td>
                                  </tr>
                                  {group.metrics.map((row, rowIdx) => {
                                    const allValues = selectedCityData.map((city) => row.getValue(city));
                                    return (
                                      <tr
                                        key={row.key}
                                        className={`border-b border-app ${rowIdx % 2 === 0 ? "bg-app-elevated" : "bg-app"}`}
                                      >
                                        <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 border-r border-app">
                                          <span className="text-xs font-medium text-app whitespace-nowrap">
                                            {row.shortLabel}
                                          </span>
                                        </td>
                                        {selectedCityData.map((city) => {
                                          const value = row.getValue(city);
                                          const isBest = isBestCityValue(row, value, allValues);

                                          if (row.format === "boolean") {
                                            return (
                                              <td
                                                key={city.id}
                                                className={`px-3 py-2.5 text-center ${isBest ? "bg-tool-accent-soft" : ""}`}
                                              >
                                                {value === true ? (
                                                  <span className="text-emerald-500 dark:text-emerald-400 text-sm font-semibold">
                                                    {"✓"}
                                                  </span>
                                                ) : (
                                                  <span className="text-rose-500/70 dark:text-rose-400/60 text-sm">
                                                    {"✗"}
                                                  </span>
                                                )}
                                              </td>
                                            );
                                          }

                                          if (row.format === "qualitative") {
                                            return (
                                              <td
                                                key={city.id}
                                                className="px-3 py-2.5 text-center"
                                              >
                                                <QualitativeValue value={value as string | null} />
                                              </td>
                                            );
                                          }

                                          return (
                                            <td
                                              key={city.id}
                                              className={`px-3 py-2.5 text-center ${isBest ? "bg-tool-accent-soft" : ""}`}
                                            >
                                              <div className="flex items-center justify-center gap-1">
                                                {(row.key.includes("Change") || row.key.includes("YoY")) &&
                                                  typeof value === "number" && (
                                                    <ChangeIndicator value={value} />
                                                  )}
                                                <span
                                                  className={`text-xs sm:text-sm tabular-nums font-semibold ${
                                                    isBest
                                                      ? "text-tool-accent"
                                                      : value === null
                                                        ? "text-muted"
                                                        : "text-app"
                                                  }`}
                                                >
                                                  {formatCityValue(row, value)}
                                                </span>
                                              </div>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="rounded-xl border border-app bg-app-elevated p-12 text-center">
                      <p className="text-sm text-secondary">Pick at least one city to start comparing.</p>
                    </div>
                  )}
                </div>

                {/* Data freshness */}
                {selectedCityData.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {selectedCityData.map((city) => (
                      <span key={city.id} className="text-[10px] text-muted">
                        {city.name}: updated {city.lastUpdated}
                      </span>
                    ))}
                  </div>
                )}

                {/* Sources */}
                <div className="mt-6 border-t border-app pt-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                      Sources
                    </span>
                    <span className="text-[10px] text-secondary">
                      Curated from public sources (Numbeo, Global Property Guide, local DLD/registry data)
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted">
                    City data updated monthly. Property prices, rents, and transaction data sourced from official registries and market research.
                  </p>
                </div>
              </>
            )}

            {/* COUNTRY MODE */}
            {mode === "countries" && !loading && !error && (
              <>
                <CountryPicker
                  countries={allCountries}
                  selectedCodes={selectedCountries}
                  onChange={setSelectedCountries}
                  maxItems={6}
                  width={width}
                />

                <div className="mt-5">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    Metric Category
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {COUNTRY_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCountryCategoryFilter(cat)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition capitalize ${
                          countryCategoryFilter === cat
                            ? "bg-tool-accent text-white"
                            : "bg-app-elevated text-secondary ring-1 ring-inset ring-app hover:bg-tool-accent-soft hover:text-tool-accent"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comparison table */}
                <div className="mt-5">
                  {selectedCountryData.length > 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease }}
                      className="overflow-hidden rounded-xl border border-app bg-app-elevated"
                    >
                      <div className="overflow-x-auto touch-pan-x">
                        <table className="w-full min-w-[600px] border-collapse">
                          <thead>
                            <tr className="bg-tool-accent-soft/40">
                              <th className="sticky left-0 z-10 bg-app-elevated px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent border-b border-r border-app min-w-[160px]">
                                Metric
                              </th>
                              {selectedCountryData.map((d) => (
                                <th
                                  key={d.code}
                                  className="px-3 py-3 text-center text-[10px] uppercase tracking-[0.15em] text-secondary border-b border-app min-w-[120px]"
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-xl leading-none" aria-hidden>
                                      {flagEmoji(d.code)}
                                    </span>
                                    <span className="text-[12px] font-semibold text-app normal-case tracking-normal">
                                      {d.name}
                                    </span>
                                    <span className="text-[9px] text-muted normal-case tracking-normal">
                                      {d.code}
                                    </span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCountryMetrics.map((metric, idx) => (
                              <tr
                                key={metric.key}
                                className={`border-b border-app ${idx % 2 === 0 ? "bg-app-elevated" : "bg-app"}`}
                              >
                                <td className="sticky left-0 z-10 bg-inherit px-4 py-3 border-r border-app">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs font-medium text-app whitespace-nowrap">
                                      {metric.shortLabel}
                                    </span>
                                    {!compact && (
                                      <span className="text-[9px] text-muted leading-snug">
                                        {metric.description}
                                      </span>
                                    )}
                                    {!compact && (
                                      <span className="text-[9px] uppercase tracking-wider text-tool-accent">
                                        {metric.source}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {selectedCountryData.map((d) => {
                                  const val = metric.getValue(d);
                                  const isBest =
                                    bestPerCountryMetric[metric.key] === d.code &&
                                    metric.direction !== "neutral";
                                  return (
                                    <td
                                      key={d.code}
                                      className={`px-3 py-3 text-center ${isBest ? "bg-tool-accent-soft" : ""}`}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        {(metric.key.includes("YoY") ||
                                          metric.key.includes("Growth") ||
                                          metric.key.includes("Deviation")) && (
                                          <ChangeIndicator value={val} />
                                        )}
                                        {val === null ? (
                                          <span className="text-muted text-xs sm:text-sm">{"—"}</span>
                                        ) : (
                                          <span
                                            className={`text-xs sm:text-sm tabular-nums font-semibold ${
                                              isBest ? "text-tool-accent" : "text-app"
                                            }`}
                                          >
                                            {metric.format(val)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="rounded-xl border border-app bg-app-elevated p-12 text-center">
                      <p className="text-sm text-secondary">Pick at least one country to start comparing.</p>
                    </div>
                  )}
                </div>

                {/* Sources */}
                <div className="mt-6 border-t border-app pt-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                      Sources
                    </span>
                    <span className="text-[10px] text-secondary">
                      BIS — Property price indices (quarterly)
                    </span>
                    <span className="text-[10px] text-secondary">
                      OECD — Housing affordability ratios (annual)
                    </span>
                    <span className="text-[10px] text-secondary">
                      World Bank — Economic indicators (annual)
                    </span>
                    <span className="text-[10px] text-secondary">
                      Frankfurter — Exchange rates (daily)
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted">
                    UAE data sourced from DLD annual reports and public market research. All other data auto-updates from official sources.
                    {cached && " Showing cached data (refreshes every 12 hours)."}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
