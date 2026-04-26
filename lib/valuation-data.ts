// AI Property Valuation — Comparable-based automated valuation model
// Sources: DLD transaction data, property portals, market reports

export interface AreaBenchmark {
  area: string;
  pricePerSqftStudio: number;
  pricePerSqft1BR: number;
  pricePerSqft2BR: number;
  pricePerSqft3BR: number;
  pricePerSqftVilla: number;
  yoyAppreciation: number; // %
  premiumFactors: PremiumFactor[];
  avgServiceCharge: number; // per sqft
  avgAge: number; // years
  transactionVolume: number; // monthly
}

export interface PremiumFactor {
  factor: string;
  impact: number; // % adjustment
}

export const AREA_BENCHMARKS: AreaBenchmark[] = [
  {
    area: "Palm Jumeirah",
    pricePerSqftStudio: 2400, pricePerSqft1BR: 2600, pricePerSqft2BR: 2850, pricePerSqft3BR: 3100, pricePerSqftVilla: 3500,
    yoyAppreciation: 12.3, avgServiceCharge: 28, avgAge: 12, transactionVolume: 140,
    premiumFactors: [
      { factor: "Full sea view", impact: 15 },
      { factor: "Beach access", impact: 10 },
      { factor: "High floor (20+)", impact: 8 },
      { factor: "Upgraded/renovated", impact: 12 },
      { factor: "Atlantis view", impact: 7 },
      { factor: "Private pool", impact: 20 },
    ],
  },
  {
    area: "Downtown Dubai",
    pricePerSqftStudio: 2000, pricePerSqft1BR: 2200, pricePerSqft2BR: 2450, pricePerSqft3BR: 2700, pricePerSqftVilla: 0,
    yoyAppreciation: 9.8, avgServiceCharge: 30, avgAge: 10, transactionVolume: 225,
    premiumFactors: [
      { factor: "Burj Khalifa view", impact: 20 },
      { factor: "Fountain view", impact: 18 },
      { factor: "High floor (30+)", impact: 10 },
      { factor: "Boulevard facing", impact: 8 },
      { factor: "Upgraded/renovated", impact: 10 },
      { factor: "Branded residence", impact: 25 },
    ],
  },
  {
    area: "Dubai Marina",
    pricePerSqftStudio: 1500, pricePerSqft1BR: 1700, pricePerSqft2BR: 1900, pricePerSqft3BR: 2100, pricePerSqftVilla: 0,
    yoyAppreciation: 8.2, avgServiceCharge: 22, avgAge: 13, transactionVolume: 295,
    premiumFactors: [
      { factor: "Full marina view", impact: 12 },
      { factor: "Sea view", impact: 15 },
      { factor: "High floor (25+)", impact: 8 },
      { factor: "Walk to beach", impact: 6 },
      { factor: "Upgraded/renovated", impact: 10 },
      { factor: "JBR facing", impact: 5 },
    ],
  },
  {
    area: "Business Bay",
    pricePerSqftStudio: 1400, pricePerSqft1BR: 1600, pricePerSqft2BR: 1800, pricePerSqft3BR: 2000, pricePerSqftVilla: 0,
    yoyAppreciation: 11.5, avgServiceCharge: 20, avgAge: 8, transactionVolume: 415,
    premiumFactors: [
      { factor: "Canal view", impact: 15 },
      { factor: "Burj Khalifa view", impact: 12 },
      { factor: "High floor (20+)", impact: 8 },
      { factor: "Branded residence", impact: 20 },
      { factor: "Upgraded/renovated", impact: 10 },
    ],
  },
  {
    area: "Dubai Hills Estate",
    pricePerSqftStudio: 1300, pricePerSqft1BR: 1450, pricePerSqft2BR: 1600, pricePerSqft3BR: 1750, pricePerSqftVilla: 1400,
    yoyAppreciation: 15.8, avgServiceCharge: 18, avgAge: 4, transactionVolume: 365,
    premiumFactors: [
      { factor: "Golf course view", impact: 15 },
      { factor: "Park view", impact: 10 },
      { factor: "Corner unit", impact: 5 },
      { factor: "High floor (15+)", impact: 6 },
      { factor: "Near Dubai Hills Mall", impact: 8 },
    ],
  },
  {
    area: "JVC",
    pricePerSqftStudio: 800, pricePerSqft1BR: 900, pricePerSqft2BR: 1000, pricePerSqft3BR: 1050, pricePerSqftVilla: 850,
    yoyAppreciation: 18.5, avgServiceCharge: 14, avgAge: 5, transactionVolume: 700,
    premiumFactors: [
      { factor: "Pool view", impact: 5 },
      { factor: "Corner unit", impact: 4 },
      { factor: "Near Circle Mall", impact: 6 },
      { factor: "Branded developer", impact: 8 },
      { factor: "Newer building (2023+)", impact: 7 },
    ],
  },
  {
    area: "JLT",
    pricePerSqftStudio: 1000, pricePerSqft1BR: 1100, pricePerSqft2BR: 1250, pricePerSqft3BR: 1350, pricePerSqftVilla: 0,
    yoyAppreciation: 10.8, avgServiceCharge: 16, avgAge: 14, transactionVolume: 260,
    premiumFactors: [
      { factor: "Lake view", impact: 10 },
      { factor: "High floor (20+)", impact: 7 },
      { factor: "Near Metro", impact: 5 },
      { factor: "Upgraded/renovated", impact: 10 },
    ],
  },
  {
    area: "Creek Harbour",
    pricePerSqftStudio: 1500, pricePerSqft1BR: 1650, pricePerSqft2BR: 1850, pricePerSqft3BR: 2000, pricePerSqftVilla: 0,
    yoyAppreciation: 16.2, avgServiceCharge: 20, avgAge: 3, transactionVolume: 290,
    premiumFactors: [
      { factor: "Creek view", impact: 15 },
      { factor: "Burj Khalifa view", impact: 12 },
      { factor: "High floor (20+)", impact: 8 },
      { factor: "Emaar branded", impact: 5 },
    ],
  },
  {
    area: "Al Furjan",
    pricePerSqftStudio: 850, pricePerSqft1BR: 950, pricePerSqft2BR: 1100, pricePerSqft3BR: 1150, pricePerSqftVilla: 900,
    yoyAppreciation: 14.2, avgServiceCharge: 14, avgAge: 6, transactionVolume: 215,
    premiumFactors: [
      { factor: "Near Metro station", impact: 8 },
      { factor: "Pavilion villa", impact: 10 },
      { factor: "Corner unit", impact: 5 },
      { factor: "Garden view", impact: 4 },
    ],
  },
  {
    area: "Arjan",
    pricePerSqftStudio: 750, pricePerSqft1BR: 830, pricePerSqft2BR: 920, pricePerSqft3BR: 980, pricePerSqftVilla: 0,
    yoyAppreciation: 20.1, avgServiceCharge: 12, avgAge: 3, transactionVolume: 325,
    premiumFactors: [
      { factor: "Near Miracle Garden", impact: 5 },
      { factor: "Pool view", impact: 4 },
      { factor: "Branded developer", impact: 7 },
      { factor: "Newer building (2024+)", impact: 6 },
    ],
  },
  {
    area: "Sports City",
    pricePerSqftStudio: 680, pricePerSqft1BR: 750, pricePerSqft2BR: 830, pricePerSqft3BR: 900, pricePerSqftVilla: 750,
    yoyAppreciation: 12.3, avgServiceCharge: 13, avgAge: 10, transactionVolume: 175,
    premiumFactors: [
      { factor: "Stadium view", impact: 5 },
      { factor: "Canal view", impact: 8 },
      { factor: "Corner unit", impact: 4 },
      { factor: "Upgraded/renovated", impact: 8 },
    ],
  },
  {
    area: "Town Square",
    pricePerSqftStudio: 650, pricePerSqft1BR: 720, pricePerSqft2BR: 800, pricePerSqft3BR: 880, pricePerSqftVilla: 0,
    yoyAppreciation: 16.8, avgServiceCharge: 12, avgAge: 5, transactionVolume: 240,
    premiumFactors: [
      { factor: "Park view", impact: 6 },
      { factor: "Near Town Square Park", impact: 5 },
      { factor: "Higher floor", impact: 4 },
    ],
  },
  {
    area: "Dubai Silicon Oasis",
    pricePerSqftStudio: 700, pricePerSqft1BR: 770, pricePerSqft2BR: 850, pricePerSqft3BR: 920, pricePerSqftVilla: 750,
    yoyAppreciation: 13.5, avgServiceCharge: 13, avgAge: 9, transactionVolume: 195,
    premiumFactors: [
      { factor: "Near Academic City", impact: 5 },
      { factor: "Villa community", impact: 8 },
      { factor: "Newer building", impact: 6 },
    ],
  },
  {
    area: "International City",
    pricePerSqftStudio: 450, pricePerSqft1BR: 500, pricePerSqft2BR: 580, pricePerSqft3BR: 650, pricePerSqftVilla: 0,
    yoyAppreciation: 22.3, avgServiceCharge: 8, avgAge: 16, transactionVolume: 480,
    premiumFactors: [
      { factor: "Phase 2 (newer)", impact: 15 },
      { factor: "Near Dragon Mart", impact: 5 },
      { factor: "Renovated unit", impact: 12 },
    ],
  },
  {
    area: "Discovery Gardens",
    pricePerSqftStudio: 520, pricePerSqft1BR: 580, pricePerSqft2BR: 650, pricePerSqft3BR: 0, pricePerSqftVilla: 0,
    yoyAppreciation: 15.8, avgServiceCharge: 10, avgAge: 18, transactionVolume: 140,
    premiumFactors: [
      { factor: "Near Ibn Battuta Mall", impact: 6 },
      { factor: "Garden facing", impact: 4 },
      { factor: "Renovated", impact: 10 },
    ],
  },
  {
    area: "DIFC",
    pricePerSqftStudio: 2200, pricePerSqft1BR: 2450, pricePerSqft2BR: 2700, pricePerSqft3BR: 3000, pricePerSqftVilla: 0,
    yoyAppreciation: 14.1, avgServiceCharge: 32, avgAge: 12, transactionVolume: 70,
    premiumFactors: [
      { factor: "Gate Avenue access", impact: 5 },
      { factor: "High floor", impact: 8 },
      { factor: "Branded residence", impact: 20 },
      { factor: "Burj Khalifa view", impact: 10 },
    ],
  },
  {
    area: "Mirdif",
    pricePerSqftStudio: 750, pricePerSqft1BR: 830, pricePerSqft2BR: 920, pricePerSqft3BR: 1000, pricePerSqftVilla: 800,
    yoyAppreciation: 8.3, avgServiceCharge: 12, avgAge: 12, transactionVolume: 115,
    premiumFactors: [
      { factor: "Mirdif City Centre proximity", impact: 5 },
      { factor: "Villa with garden", impact: 10 },
      { factor: "Newer Mirdif Hills", impact: 8 },
    ],
  },
  {
    area: "Dubai South",
    pricePerSqftStudio: 580, pricePerSqft1BR: 650, pricePerSqft2BR: 730, pricePerSqft3BR: 800, pricePerSqftVilla: 680,
    yoyAppreciation: 19.5, avgServiceCharge: 10, avgAge: 4, transactionVolume: 225,
    premiumFactors: [
      { factor: "Near Expo/District 2020", impact: 8 },
      { factor: "Near Al Maktoum Airport", impact: 6 },
      { factor: "Newer development", impact: 5 },
    ],
  },
];

export const PROPERTY_TYPES = ["Studio", "1BR", "2BR", "3BR", "Villa"] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export const VIEWS = [
  "No specific view",
  "Pool/Garden view",
  "Community view",
  "Park view",
  "Sea/Water view",
  "Landmark view (Burj Khalifa, etc.)",
  "Golf course view",
] as const;

export const CONDITIONS = [
  "Original (no upgrades)",
  "Well maintained",
  "Partially upgraded",
  "Fully renovated/upgraded",
  "Brand new (never lived in)",
] as const;

export const FLOOR_CATEGORIES = [
  { label: "Low floor (1-5)", adjustment: -3 },
  { label: "Mid floor (6-15)", adjustment: 0 },
  { label: "High floor (16-25)", adjustment: 5 },
  { label: "Very high floor (26+)", adjustment: 10 },
] as const;

export const VIEW_ADJUSTMENTS: Record<string, number> = {
  "No specific view": 0,
  "Pool/Garden view": 3,
  "Community view": 2,
  "Park view": 6,
  "Sea/Water view": 15,
  "Landmark view (Burj Khalifa, etc.)": 18,
  "Golf course view": 12,
};

export const CONDITION_ADJUSTMENTS: Record<string, number> = {
  "Original (no upgrades)": -5,
  "Well maintained": 0,
  "Partially upgraded": 5,
  "Fully renovated/upgraded": 12,
  "Brand new (never lived in)": 8,
};

export const AGE_ADJUSTMENTS = [
  { maxAge: 2, adjustment: 5 },
  { maxAge: 5, adjustment: 2 },
  { maxAge: 10, adjustment: 0 },
  { maxAge: 15, adjustment: -3 },
  { maxAge: 20, adjustment: -6 },
  { maxAge: 100, adjustment: -10 },
];
