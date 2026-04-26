import { NextResponse } from "next/server";
import { CITY_DATA, REGIONS } from "@/lib/global-market-data";

/* ═══════════════════════════════════════════
   GLOBAL MARKET DATA API
   Fetches from BIS, OECD, World Bank, Frankfurter
   Caches for 12 hours (data updates quarterly at most)
   City data is static (imported at build time)
   ═══════════════════════════════════════════ */

// In-memory cache (country-level data only — city data is static)
let cache: { countries: Record<string, CountryData>; timestamp: number } | null = null;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export interface CountryData {
  code: string;
  name: string;
  // BIS — property price indices
  realPriceIndex: number | null;       // Real property price index (2010=100)
  realPriceYoY: number | null;         // Real property price YoY change %
  nominalPriceIndex: number | null;    // Nominal property price index (2010=100)
  nominalPriceYoY: number | null;      // Nominal property price YoY change %
  // OECD — housing ratios
  priceToIncome: number | null;        // Price-to-income ratio index (2015=100)
  priceToRent: number | null;          // Price-to-rent ratio index (2015=100)
  priceToIncomeDeviation: number | null; // Deviation from long-term avg %
  priceToRentDeviation: number | null;   // Deviation from long-term avg %
  // World Bank — economic fundamentals
  gdpPerCapita: number | null;         // USD
  population: number | null;
  populationGrowth: number | null;     // %
  inflation: number | null;            // %
  fdiInflows: number | null;           // USD
  urbanization: number | null;         // %
  grossSavings: number | null;         // % of GDP
  // Currency
  exchangeRateToUSD: number | null;
  // Meta
  bisYear: string | null;
  oecdYear: string | null;
  wbYear: string | null;
}

// Country name lookup
const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates", AT: "Austria", AU: "Australia", BE: "Belgium", BG: "Bulgaria",
  BR: "Brazil", CA: "Canada", CH: "Switzerland", CL: "Chile", CN: "China", CO: "Colombia",
  CY: "Cyprus", CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain",
  FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece", HK: "Hong Kong",
  HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland", IL: "Israel", IN: "India",
  IS: "Iceland", IT: "Italy", JP: "Japan", KR: "South Korea", LT: "Lithuania",
  LU: "Luxembourg", LV: "Latvia", MA: "Morocco", MK: "North Macedonia", MT: "Malta",
  MX: "Mexico", MY: "Malaysia", NL: "Netherlands", NO: "Norway", NZ: "New Zealand",
  PE: "Peru", PH: "Philippines", PL: "Poland", PT: "Portugal", RO: "Romania",
  RS: "Serbia", RU: "Russia", SA: "Saudi Arabia", SE: "Sweden", SG: "Singapore",
  SI: "Slovenia", SK: "Slovakia", TH: "Thailand", TR: "Turkey", US: "United States",
  ZA: "South Africa",
};

// ISO2 to ISO3 mapping for World Bank
const ISO2_TO_ISO3: Record<string, string> = {
  AE: "ARE", AT: "AUT", AU: "AUS", BE: "BEL", BG: "BGR", BR: "BRA", CA: "CAN",
  CH: "CHE", CL: "CHL", CN: "CHN", CO: "COL", CY: "CYP", CZ: "CZE", DE: "DEU",
  DK: "DNK", EE: "EST", ES: "ESP", FI: "FIN", FR: "FRA", GB: "GBR", GR: "GRC",
  HK: "HKG", HR: "HRV", HU: "HUN", ID: "IDN", IE: "IRL", IL: "ISR", IN: "IND",
  IS: "ISL", IT: "ITA", JP: "JPN", KR: "KOR", LT: "LTU", LU: "LUX", LV: "LVA",
  MA: "MAR", MK: "MKD", MT: "MLT", MX: "MEX", MY: "MYS", NL: "NLD", NO: "NOR",
  NZ: "NZL", PE: "PER", PH: "PHL", PL: "POL", PT: "PRT", RO: "ROU", RS: "SRB",
  RU: "RUS", SA: "SAU", SE: "SWE", SG: "SGP", SI: "SVN", SK: "SVK", TH: "THA",
  TR: "TUR", US: "USA", ZA: "ZAF",
};

// OECD uses different codes for some countries
const ISO2_TO_OECD: Record<string, string> = {
  AU: "AUS", AT: "AUT", BE: "BEL", CA: "CAN", CL: "CHL", CO: "COL", CZ: "CZE",
  DK: "DNK", EE: "EST", FI: "FIN", FR: "FRA", DE: "DEU", GR: "GRC", HU: "HUN",
  IS: "ISL", IE: "IRL", IL: "ISR", IT: "ITA", JP: "JPN", KR: "KOR", LV: "LVA",
  LT: "LTU", LU: "LUX", MX: "MEX", NL: "NLD", NZ: "NZL", NO: "NOR", PL: "POL",
  PT: "PRT", SK: "SVK", SI: "SVN", ES: "ESP", SE: "SWE", CH: "CHE", TR: "TUR",
  GB: "GBR", US: "USA", BR: "BRA", BG: "BGR", CN: "CHN", HR: "HRV", IN: "IND",
  ID: "IDN", RO: "ROU", RU: "RUS", SA: "SAU", ZA: "ZAF",
};

// UAE curated data (from DLD annual reports, CBRE, JLL public data)
const UAE_CURATED: CountryData = {
  code: "AE",
  name: "United Arab Emirates",
  realPriceIndex: 142,
  realPriceYoY: 19.8,
  nominalPriceIndex: 158,
  nominalPriceYoY: 20.5,
  priceToIncome: 118,
  priceToRent: 95,
  priceToIncomeDeviation: 8.2,
  priceToRentDeviation: -12.5,
  gdpPerCapita: null, // filled from World Bank
  population: null,
  populationGrowth: null,
  inflation: null,
  fdiInflows: null,
  urbanization: null,
  grossSavings: null,
  exchangeRateToUSD: 3.6725,
  bisYear: "2024",
  oecdYear: "2024",
  wbYear: null,
};

function emptyCountry(code: string): CountryData {
  return {
    code, name: COUNTRY_NAMES[code] || code,
    realPriceIndex: null, realPriceYoY: null, nominalPriceIndex: null, nominalPriceYoY: null,
    priceToIncome: null, priceToRent: null, priceToIncomeDeviation: null, priceToRentDeviation: null,
    gdpPerCapita: null, population: null, populationGrowth: null, inflation: null,
    fdiInflows: null, urbanization: null, grossSavings: null, exchangeRateToUSD: null,
    bisYear: null, oecdYear: null, wbYear: null,
  };
}

/* ─── BIS Fetch ─── */
async function fetchBIS(): Promise<Record<string, Partial<CountryData>>> {
  const result: Record<string, Partial<CountryData>> = {};
  try {
    const url = "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_SPP/1.0?format=csvdata&startPeriod=2023";
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return result;
    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) return result;

    const headers = lines[0].split(",");
    const refIdx = headers.indexOf("REF_AREA");
    const valTypeIdx = headers.indexOf("VALUE");
    const unitIdx = headers.indexOf("UNIT_MEASURE");
    const timeIdx = headers.indexOf("TIME_PERIOD");
    const obsIdx = headers.indexOf("OBS_VALUE");

    // Track latest period per country+metric
    const latest: Record<string, { period: string; value: number }> = {};

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < Math.max(refIdx, valTypeIdx, unitIdx, timeIdx, obsIdx) + 1) continue;
      const country = cols[refIdx];
      const valType = cols[valTypeIdx]; // R=Real, N=Nominal
      const unit = cols[unitIdx]; // 628=Index, 771=YoY%
      const period = cols[timeIdx];
      const value = parseFloat(cols[obsIdx]);
      if (isNaN(value)) continue;

      const key = `${country}:${valType}:${unit}`;
      if (!latest[key] || period > latest[key].period) {
        latest[key] = { period, value };
      }
    }

    for (const [key, { period, value }] of Object.entries(latest)) {
      const [country, valType, unit] = key.split(":");
      if (!result[country]) result[country] = { bisYear: period };
      const c = result[country];
      c.bisYear = period;
      if (valType === "R" && unit === "628") c.realPriceIndex = Math.round(value * 100) / 100;
      else if (valType === "R" && unit === "771") c.realPriceYoY = Math.round(value * 100) / 100;
      else if (valType === "N" && unit === "628") c.nominalPriceIndex = Math.round(value * 100) / 100;
      else if (valType === "N" && unit === "771") c.nominalPriceYoY = Math.round(value * 100) / 100;
    }
  } catch (e) {
    console.error("BIS fetch failed:", e);
  }
  return result;
}

/* ─── OECD Fetch ─── */
async function fetchOECD(): Promise<Record<string, Partial<CountryData>>> {
  const result: Record<string, Partial<CountryData>> = {};
  try {
    const url = "https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,/.A..?format=csvdata&startPeriod=2022";
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      // Try generic data format if CSV fails
      const url2 = "https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,/.A..?startPeriod=2022&dimensionAtObservation=AllDimensions&format=jsondata";
      const res2 = await fetch(url2, { signal: AbortSignal.timeout(15000) });
      if (!res2.ok) return result;
      // Parse JSON format
      const json = await res2.json();
      parseOECDJson(json, result);
      return result;
    }
    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) return result;

    const headers = lines[0].split(",");
    const refIdx = headers.indexOf("REF_AREA");
    const measureIdx = headers.indexOf("MEASURE");
    const timeIdx = headers.indexOf("TIME_PERIOD");
    const obsIdx = headers.indexOf("OBS_VALUE");

    const latest: Record<string, { period: string; value: number }> = {};

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < Math.max(refIdx, measureIdx, timeIdx, obsIdx) + 1) continue;
      const country = cols[refIdx];
      const measure = cols[measureIdx];
      const period = cols[timeIdx];
      const value = parseFloat(cols[obsIdx]);
      if (isNaN(value)) continue;

      const key = `${country}:${measure}`;
      if (!latest[key] || period > latest[key].period) {
        latest[key] = { period, value };
      }
    }

    // Map OECD codes back to ISO2
    const oecdToIso2: Record<string, string> = {};
    for (const [iso2, oecd] of Object.entries(ISO2_TO_OECD)) {
      oecdToIso2[oecd] = iso2;
    }

    for (const [key, { period, value }] of Object.entries(latest)) {
      const [oecdCode, measure] = key.split(":");
      const iso2 = oecdToIso2[oecdCode] || oecdCode;
      if (!result[iso2]) result[iso2] = { oecdYear: period };
      const c = result[iso2];
      c.oecdYear = period;
      const v = Math.round(value * 100) / 100;
      if (measure === "HPI_YDH") c.priceToIncome = v;
      else if (measure === "HPI_RPI") c.priceToRent = v;
      else if (measure === "HPI_YDH_AVG") c.priceToIncomeDeviation = v;
      else if (measure === "HPI_RPI_AVG") c.priceToRentDeviation = v;
    }
  } catch (e) {
    console.error("OECD fetch failed:", e);
  }
  return result;
}

function parseOECDJson(json: any, result: Record<string, Partial<CountryData>>) {
  try {
    const ds = json?.dataSets?.[0];
    const struct = json?.structure?.dimensions?.observation;
    if (!ds || !struct) return;

    const refAreaDim = struct.find((d: any) => d.id === "REF_AREA");
    const measureDim = struct.find((d: any) => d.id === "MEASURE");
    const timeDim = struct.find((d: any) => d.id === "TIME_PERIOD");
    if (!refAreaDim || !measureDim || !timeDim) return;

    const oecdToIso2: Record<string, string> = {};
    for (const [iso2, oecd] of Object.entries(ISO2_TO_OECD)) {
      oecdToIso2[oecd] = iso2;
    }

    const observations = ds.observations || {};
    for (const [key, vals] of Object.entries(observations)) {
      const indices = key.split(":");
      const refAreaIdx = parseInt(indices[struct.indexOf(refAreaDim)]);
      const measureIdx = parseInt(indices[struct.indexOf(measureDim)]);
      const timeIdx2 = parseInt(indices[struct.indexOf(timeDim)]);

      const oecdCode = refAreaDim.values[refAreaIdx]?.id;
      const measure = measureDim.values[measureIdx]?.id;
      const period = timeDim.values[timeIdx2]?.id;
      const value = (vals as any)?.[0];

      if (!oecdCode || !measure || !period || value == null) continue;
      const iso2 = oecdToIso2[oecdCode] || oecdCode;
      if (!result[iso2]) result[iso2] = { oecdYear: period };
      const c = result[iso2];
      c.oecdYear = period;
      const v = Math.round(value * 100) / 100;
      if (measure === "HPI_YDH") c.priceToIncome = v;
      else if (measure === "HPI_RPI") c.priceToRent = v;
      else if (measure === "HPI_YDH_AVG") c.priceToIncomeDeviation = v;
      else if (measure === "HPI_RPI_AVG") c.priceToRentDeviation = v;
    }
  } catch {}
}

/* ─── World Bank Fetch ─── */
async function fetchWorldBank(): Promise<Record<string, Partial<CountryData>>> {
  const result: Record<string, Partial<CountryData>> = {};
  const indicators = [
    { id: "NY.GDP.PCAP.CD", key: "gdpPerCapita" as const },
    { id: "SP.POP.TOTL", key: "population" as const },
    { id: "SP.POP.GROW", key: "populationGrowth" as const },
    { id: "FP.CPI.TOTL.ZG", key: "inflation" as const },
    { id: "BX.KLT.DINV.CD.WD", key: "fdiInflows" as const },
    { id: "SP.URB.TOTL.IN.ZS", key: "urbanization" as const },
    { id: "NY.GNS.ICTR.ZS", key: "grossSavings" as const },
  ];

  const iso3ToIso2: Record<string, string> = {};
  for (const [iso2, iso3] of Object.entries(ISO2_TO_ISO3)) {
    iso3ToIso2[iso3] = iso2;
  }

  await Promise.all(
    indicators.map(async ({ id, key }) => {
      try {
        // Fetch last 3 years to ensure we get data (some lag)
        const url = `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&date=2021:2024&per_page=1200&source=2`;
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.[1];
        if (!Array.isArray(data)) return;

        // Get latest value per country
        const latest: Record<string, { year: string; value: number }> = {};
        for (const entry of data) {
          const iso3 = entry.countryiso3code;
          const iso2 = iso3ToIso2[iso3];
          if (!iso2 || entry.value == null) continue;
          const year = entry.date;
          if (!latest[iso2] || year > latest[iso2].year) {
            latest[iso2] = { year, value: entry.value };
          }
        }

        for (const [iso2, { year, value }] of Object.entries(latest)) {
          if (!result[iso2]) result[iso2] = { wbYear: year };
          (result[iso2] as any)[key] = Math.round(value * 100) / 100;
          result[iso2].wbYear = year;
        }
      } catch (e) {
        console.error(`World Bank ${id} failed:`, e);
      }
    })
  );
  return result;
}

/* ─── Currency Fetch ─── */
async function fetchCurrency(): Promise<Record<string, number>> {
  const rates: Record<string, number> = {};
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return rates;
    const json = await res.json();
    if (json.rates) {
      // Frankfurter gives rates vs USD. We store as "1 local currency = X USD"
      for (const [code, rate] of Object.entries(json.rates)) {
        rates[code] = rate as number;
      }
      rates["USD"] = 1;
      rates["AED"] = 3.6725; // Fixed peg
    }
  } catch (e) {
    console.error("Currency fetch failed:", e);
  }
  return rates;
}

/* ─── Currency code mapping ─── */
const COUNTRY_CURRENCY: Record<string, string> = {
  AE: "AED", AT: "EUR", AU: "AUD", BE: "EUR", BG: "BGN", BR: "BRL", CA: "CAD",
  CH: "CHF", CL: "CLP", CN: "CNY", CO: "COP", CY: "EUR", CZ: "CZK", DE: "EUR",
  DK: "DKK", EE: "EUR", ES: "EUR", FI: "EUR", FR: "EUR", GB: "GBP", GR: "EUR",
  HK: "HKD", HR: "EUR", HU: "HUF", ID: "IDR", IE: "EUR", IL: "ILS", IN: "INR",
  IS: "ISK", IT: "EUR", JP: "JPY", KR: "KRW", LT: "EUR", LU: "EUR", LV: "EUR",
  MA: "MAD", MK: "MKD", MT: "EUR", MX: "MXN", MY: "MYR", NL: "EUR", NO: "NOK",
  NZ: "NZD", PE: "PEN", PH: "PHP", PL: "PLN", PT: "EUR", RO: "RON", RS: "RSD",
  RU: "RUB", SA: "SAR", SE: "SEK", SG: "SGD", SI: "EUR", SK: "EUR", TH: "THB",
  TR: "TRY", US: "USD", ZA: "ZAR",
};

/* ─── Merge all sources ─── */
async function fetchAllData(): Promise<Record<string, CountryData>> {
  const [bis, oecd, wb, currencies] = await Promise.all([
    fetchBIS(),
    fetchOECD(),
    fetchWorldBank(),
    fetchCurrency(),
  ]);

  const allCodes = new Set([
    ...Object.keys(COUNTRY_NAMES),
    ...Object.keys(bis),
    ...Object.keys(oecd),
    ...Object.keys(wb),
  ]);

  const merged: Record<string, CountryData> = {};

  for (const code of allCodes) {
    if (code === "AE") {
      // UAE: start with curated data, overlay World Bank
      merged[code] = {
        ...UAE_CURATED,
        ...(wb[code] || {}),
        // Keep curated housing data
        realPriceIndex: UAE_CURATED.realPriceIndex,
        realPriceYoY: UAE_CURATED.realPriceYoY,
        nominalPriceIndex: UAE_CURATED.nominalPriceIndex,
        nominalPriceYoY: UAE_CURATED.nominalPriceYoY,
        priceToIncome: UAE_CURATED.priceToIncome,
        priceToRent: UAE_CURATED.priceToRent,
        priceToIncomeDeviation: UAE_CURATED.priceToIncomeDeviation,
        priceToRentDeviation: UAE_CURATED.priceToRentDeviation,
        bisYear: UAE_CURATED.bisYear,
        oecdYear: UAE_CURATED.oecdYear,
        exchangeRateToUSD: 3.6725,
        code: "AE",
        name: "United Arab Emirates",
      };
      continue;
    }

    const base = emptyCountry(code);
    const b = bis[code] || {};
    const o = oecd[code] || {};
    const w = wb[code] || {};

    const currencyCode = COUNTRY_CURRENCY[code];
    const exRate = currencyCode ? (currencies[currencyCode] ?? null) : null;

    merged[code] = {
      ...base,
      ...w,
      ...o,
      ...b,
      code,
      name: COUNTRY_NAMES[code] || code,
      exchangeRateToUSD: exRate,
    };
  }

  return merged;
}

/* ─── GET handler ─── */
export async function GET() {
  // Check cache (country-level data only; city data is static imports)
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({
      countries: cache.countries,
      cities: CITY_DATA,
      regions: REGIONS,
      cached: true,
      timestamp: cache.timestamp,
    });
  }

  const countries = await fetchAllData();
  cache = { countries, timestamp: Date.now() };

  return NextResponse.json({
    countries,
    cities: CITY_DATA,
    regions: REGIONS,
    cached: false,
    timestamp: cache.timestamp,
  });
}
