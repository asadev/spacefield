// Market Pulse Dashboard — Dubai RE transaction data
// Sources: DLD Mo'asher reports, Property Monitor, ValuStrat

export interface AreaTransaction {
  area: string;
  avgPrice: number; // AED per sqft
  avgPriceChange: number; // YoY %
  transactions: number; // Q1 2026
  transactionsChange: number; // YoY %
  avgRent: number; // AED/yr for 1BR
  rentalYield: number; // %
  topProject: string;
  segment: "luxury" | "mid" | "affordable";
}

export interface MonthlyVolume {
  month: string;
  year: number;
  totalTransactions: number;
  totalValue: number; // AED billions
  ready: number;
  offplan: number;
  mortgage: number;
  cash: number;
}

export interface SupplyPipeline {
  year: number;
  expectedUnits: number;
  delivered: number;
  segment: string;
}

export const MONTHLY_VOLUMES: MonthlyVolume[] = [
  { month: "Jan", year: 2024, totalTransactions: 9810, totalValue: 28.5, ready: 4200, offplan: 5610, mortgage: 3340, cash: 6470 },
  { month: "Feb", year: 2024, totalTransactions: 10250, totalValue: 30.1, ready: 4380, offplan: 5870, mortgage: 3490, cash: 6760 },
  { month: "Mar", year: 2024, totalTransactions: 12430, totalValue: 37.8, ready: 5360, offplan: 7070, mortgage: 4230, cash: 8200 },
  { month: "Apr", year: 2024, totalTransactions: 11870, totalValue: 35.2, ready: 5100, offplan: 6770, mortgage: 4040, cash: 7830 },
  { month: "May", year: 2024, totalTransactions: 13200, totalValue: 41.5, ready: 5940, offplan: 7260, mortgage: 4490, cash: 8710 },
  { month: "Jun", year: 2024, totalTransactions: 14580, totalValue: 45.3, ready: 6410, offplan: 8170, mortgage: 4960, cash: 9620 },
  { month: "Jul", year: 2024, totalTransactions: 13950, totalValue: 43.2, ready: 6130, offplan: 7820, mortgage: 4750, cash: 9200 },
  { month: "Aug", year: 2024, totalTransactions: 12680, totalValue: 39.1, ready: 5580, offplan: 7100, mortgage: 4310, cash: 8370 },
  { month: "Sep", year: 2024, totalTransactions: 14320, totalValue: 46.8, ready: 6290, offplan: 8030, mortgage: 4870, cash: 9450 },
  { month: "Oct", year: 2024, totalTransactions: 15100, totalValue: 49.5, ready: 6640, offplan: 8460, mortgage: 5130, cash: 9970 },
  { month: "Nov", year: 2024, totalTransactions: 16200, totalValue: 53.7, ready: 7130, offplan: 9070, mortgage: 5510, cash: 10690 },
  { month: "Dec", year: 2024, totalTransactions: 17500, totalValue: 58.2, ready: 7700, offplan: 9800, mortgage: 5950, cash: 11550 },
  { month: "Jan", year: 2025, totalTransactions: 14800, totalValue: 47.5, ready: 6510, offplan: 8290, mortgage: 5030, cash: 9770 },
  { month: "Feb", year: 2025, totalTransactions: 15400, totalValue: 50.1, ready: 6780, offplan: 8620, mortgage: 5240, cash: 10160 },
  { month: "Mar", year: 2025, totalTransactions: 17800, totalValue: 59.3, ready: 7830, offplan: 9970, mortgage: 6050, cash: 11750 },
  { month: "Apr", year: 2025, totalTransactions: 16900, totalValue: 55.8, ready: 7440, offplan: 9460, mortgage: 5750, cash: 11150 },
  { month: "May", year: 2025, totalTransactions: 18200, totalValue: 62.1, ready: 8010, offplan: 10190, mortgage: 6190, cash: 12010 },
  { month: "Jun", year: 2025, totalTransactions: 19500, totalValue: 67.4, ready: 8580, offplan: 10920, mortgage: 6630, cash: 12870 },
  { month: "Jul", year: 2025, totalTransactions: 18800, totalValue: 64.5, ready: 8270, offplan: 10530, mortgage: 6390, cash: 12410 },
  { month: "Aug", year: 2025, totalTransactions: 17100, totalValue: 57.8, ready: 7520, offplan: 9580, mortgage: 5810, cash: 11290 },
  { month: "Sep", year: 2025, totalTransactions: 19200, totalValue: 66.1, ready: 8450, offplan: 10750, mortgage: 6530, cash: 12670 },
  { month: "Oct", year: 2025, totalTransactions: 20100, totalValue: 70.5, ready: 8840, offplan: 11260, mortgage: 6830, cash: 13270 },
  { month: "Nov", year: 2025, totalTransactions: 21500, totalValue: 76.3, ready: 9460, offplan: 12040, mortgage: 7310, cash: 14190 },
  { month: "Dec", year: 2025, totalTransactions: 22800, totalValue: 82.1, ready: 10030, offplan: 12770, mortgage: 7750, cash: 15050 },
  { month: "Jan", year: 2026, totalTransactions: 19500, totalValue: 68.2, ready: 8580, offplan: 10920, mortgage: 6630, cash: 12870 },
  { month: "Feb", year: 2026, totalTransactions: 20300, totalValue: 72.1, ready: 8930, offplan: 11370, mortgage: 6900, cash: 13400 },
  { month: "Mar", year: 2026, totalTransactions: 23500, totalValue: 85.4, ready: 10340, offplan: 13160, mortgage: 7990, cash: 15510 },
];

export const AREA_DATA: AreaTransaction[] = [
  // Luxury
  { area: "Palm Jumeirah", avgPrice: 2850, avgPriceChange: 12.3, transactions: 420, transactionsChange: 8.5, avgRent: 180000, rentalYield: 5.2, topProject: "Palm Beach Towers", segment: "luxury" },
  { area: "Downtown Dubai", avgPrice: 2400, avgPriceChange: 9.8, transactions: 680, transactionsChange: 11.2, avgRent: 120000, rentalYield: 5.8, topProject: "Burj Royale", segment: "luxury" },
  { area: "Dubai Marina", avgPrice: 1850, avgPriceChange: 8.2, transactions: 890, transactionsChange: 6.4, avgRent: 95000, rentalYield: 6.5, topProject: "Marina Gate", segment: "luxury" },
  { area: "DIFC", avgPrice: 2650, avgPriceChange: 14.1, transactions: 210, transactionsChange: 18.3, avgRent: 140000, rentalYield: 5.0, topProject: "One Za'abeel", segment: "luxury" },
  { area: "Business Bay", avgPrice: 1750, avgPriceChange: 11.5, transactions: 1250, transactionsChange: 14.8, avgRent: 85000, rentalYield: 6.8, topProject: "Paramount Tower", segment: "luxury" },
  { area: "Emirates Hills", avgPrice: 3200, avgPriceChange: 7.5, transactions: 85, transactionsChange: -2.1, avgRent: 350000, rentalYield: 3.8, topProject: "Sector V Villas", segment: "luxury" },
  { area: "Bluewaters Island", avgPrice: 2700, avgPriceChange: 10.2, transactions: 95, transactionsChange: 5.3, avgRent: 160000, rentalYield: 4.9, topProject: "Bluewaters Residences", segment: "luxury" },
  { area: "Dubai Hills Estate", avgPrice: 1600, avgPriceChange: 15.8, transactions: 1100, transactionsChange: 22.1, avgRent: 90000, rentalYield: 5.9, topProject: "Park Heights", segment: "luxury" },

  // Mid-market
  { area: "JVC (Jumeirah Village Circle)", avgPrice: 950, avgPriceChange: 18.5, transactions: 2100, transactionsChange: 25.3, avgRent: 55000, rentalYield: 8.2, topProject: "Binghatti Stars", segment: "mid" },
  { area: "JLT (Jumeirah Lake Towers)", avgPrice: 1200, avgPriceChange: 10.8, transactions: 780, transactionsChange: 9.2, avgRent: 72000, rentalYield: 7.1, topProject: "Cluster D", segment: "mid" },
  { area: "Al Furjan", avgPrice: 1050, avgPriceChange: 14.2, transactions: 650, transactionsChange: 16.8, avgRent: 62000, rentalYield: 7.5, topProject: "Azizi Riviera", segment: "mid" },
  { area: "Arjan", avgPrice: 880, avgPriceChange: 20.1, transactions: 980, transactionsChange: 28.5, avgRent: 48000, rentalYield: 8.8, topProject: "Miracle Garden Res.", segment: "mid" },
  { area: "Sports City", avgPrice: 800, avgPriceChange: 12.3, transactions: 520, transactionsChange: 8.7, avgRent: 45000, rentalYield: 7.9, topProject: "Giovanni Boutique", segment: "mid" },
  { area: "Motor City", avgPrice: 850, avgPriceChange: 11.5, transactions: 380, transactionsChange: 7.2, avgRent: 48000, rentalYield: 7.6, topProject: "Oia Residence", segment: "mid" },
  { area: "Town Square", avgPrice: 780, avgPriceChange: 16.8, transactions: 720, transactionsChange: 19.4, avgRent: 42000, rentalYield: 8.0, topProject: "Rawda Apartments", segment: "mid" },
  { area: "Dubai Silicon Oasis", avgPrice: 820, avgPriceChange: 13.5, transactions: 580, transactionsChange: 12.1, avgRent: 44000, rentalYield: 7.8, topProject: "Binghatti Avenue", segment: "mid" },
  { area: "Mirdif", avgPrice: 900, avgPriceChange: 8.3, transactions: 340, transactionsChange: 5.6, avgRent: 52000, rentalYield: 6.9, topProject: "Mirdif Hills", segment: "mid" },
  { area: "Creek Harbour", avgPrice: 1800, avgPriceChange: 16.2, transactions: 870, transactionsChange: 20.5, avgRent: 95000, rentalYield: 5.5, topProject: "Creek Edge", segment: "mid" },

  // Affordable
  { area: "International City", avgPrice: 550, avgPriceChange: 22.3, transactions: 1450, transactionsChange: 30.2, avgRent: 32000, rentalYield: 9.5, topProject: "Phase 2 Dragon Mart", segment: "affordable" },
  { area: "Discovery Gardens", avgPrice: 620, avgPriceChange: 15.8, transactions: 420, transactionsChange: 12.4, avgRent: 36000, rentalYield: 8.8, topProject: "Mediterranean Cluster", segment: "affordable" },
  { area: "Dubai South", avgPrice: 700, avgPriceChange: 19.5, transactions: 680, transactionsChange: 35.2, avgRent: 38000, rentalYield: 8.5, topProject: "The Pulse", segment: "affordable" },
  { area: "Dubailand", avgPrice: 750, avgPriceChange: 17.2, transactions: 890, transactionsChange: 24.8, avgRent: 40000, rentalYield: 8.3, topProject: "Villanova", segment: "affordable" },
  { area: "Remraam", avgPrice: 680, avgPriceChange: 14.5, transactions: 310, transactionsChange: 10.8, avgRent: 38000, rentalYield: 8.6, topProject: "Al Ramth", segment: "affordable" },
  { area: "Liwan", avgPrice: 600, avgPriceChange: 21.0, transactions: 520, transactionsChange: 27.5, avgRent: 33000, rentalYield: 9.1, topProject: "Queue Point", segment: "affordable" },
];

export const SUPPLY_PIPELINE: SupplyPipeline[] = [
  { year: 2024, expectedUnits: 38000, delivered: 29500, segment: "All" },
  { year: 2025, expectedUnits: 52000, delivered: 35200, segment: "All" },
  { year: 2026, expectedUnits: 72000, delivered: 18500, segment: "All" },
  { year: 2027, expectedUnits: 65000, delivered: 0, segment: "All" },
  { year: 2028, expectedUnits: 48000, delivered: 0, segment: "All" },
];

export interface MarketSummary {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

export const MARKET_SUMMARY: MarketSummary[] = [
  { label: "Total Transactions (Q1 2026)", value: "63,300", change: "+18.2%", positive: true },
  { label: "Total Value (Q1 2026)", value: "AED 225.7B", change: "+22.5%", positive: true },
  { label: "Average Price/sqft", value: "AED 1,420", change: "+11.8%", positive: true },
  { label: "Off-Plan Share", value: "56.4%", change: "+3.1pp", positive: true },
  { label: "Average Rental Yield", value: "7.2%", change: "+0.3pp", positive: true },
  { label: "Mortgage Share", value: "34.1%", change: "-1.2pp", positive: false },
];

export const PRICE_INDEX: { quarter: string; index: number }[] = [
  { quarter: "Q1 2020", index: 100 },
  { quarter: "Q2 2020", index: 97 },
  { quarter: "Q3 2020", index: 95 },
  { quarter: "Q4 2020", index: 98 },
  { quarter: "Q1 2021", index: 103 },
  { quarter: "Q2 2021", index: 108 },
  { quarter: "Q3 2021", index: 112 },
  { quarter: "Q4 2021", index: 118 },
  { quarter: "Q1 2022", index: 125 },
  { quarter: "Q2 2022", index: 132 },
  { quarter: "Q3 2022", index: 138 },
  { quarter: "Q4 2022", index: 142 },
  { quarter: "Q1 2023", index: 148 },
  { quarter: "Q2 2023", index: 153 },
  { quarter: "Q3 2023", index: 157 },
  { quarter: "Q4 2023", index: 162 },
  { quarter: "Q1 2024", index: 170 },
  { quarter: "Q2 2024", index: 178 },
  { quarter: "Q3 2024", index: 184 },
  { quarter: "Q4 2024", index: 192 },
  { quarter: "Q1 2025", index: 200 },
  { quarter: "Q2 2025", index: 208 },
  { quarter: "Q3 2025", index: 214 },
  { quarter: "Q4 2025", index: 222 },
  { quarter: "Q1 2026", index: 230 },
];
