// Developer Pipeline Tracker — Dubai developer projects data
// Sources: DLD, developer announcements, property portals

export interface Developer {
  name: string;
  established: number;
  totalProjects: number;
  completedProjects: number;
  activeProjects: number;
  deliveryScore: number; // 0-100
  qualityScore: number; // 0-100
  avgDelay: number; // months
  speciality: string;
  headquarters: string;
}

export interface Project {
  name: string;
  developer: string;
  area: string;
  type: "residential" | "mixed" | "commercial";
  units: number;
  status: "announced" | "under-construction" | "near-completion" | "completed" | "delayed";
  launchDate: string; // YYYY-MM
  expectedHandover: string; // YYYY-QN
  actualHandover?: string;
  startPrice: number; // AED
  pricePerSqft: number;
  percentComplete: number; // 0-100
  paymentPlan: string;
  highlights: string[];
}

export const DEVELOPERS: Developer[] = [
  { name: "Emaar Properties", established: 1997, totalProjects: 92, completedProjects: 68, activeProjects: 24, deliveryScore: 82, qualityScore: 90, avgDelay: 6, speciality: "Master Communities", headquarters: "Dubai" },
  { name: "DAMAC Properties", established: 2002, totalProjects: 78, completedProjects: 51, activeProjects: 27, deliveryScore: 65, qualityScore: 72, avgDelay: 14, speciality: "Luxury Living", headquarters: "Dubai" },
  { name: "Nakheel", established: 2000, totalProjects: 45, completedProjects: 35, activeProjects: 10, deliveryScore: 78, qualityScore: 80, avgDelay: 8, speciality: "Waterfront / Islands", headquarters: "Dubai" },
  { name: "Meraas", established: 2007, totalProjects: 28, completedProjects: 20, activeProjects: 8, deliveryScore: 85, qualityScore: 92, avgDelay: 4, speciality: "Design-Led Lifestyle", headquarters: "Dubai" },
  { name: "Dubai Properties", established: 2004, totalProjects: 35, completedProjects: 25, activeProjects: 10, deliveryScore: 70, qualityScore: 74, avgDelay: 10, speciality: "Integrated Communities", headquarters: "Dubai" },
  { name: "Sobha Realty", established: 1976, totalProjects: 22, completedProjects: 14, activeProjects: 8, deliveryScore: 88, qualityScore: 95, avgDelay: 3, speciality: "Ultra-Premium Finish", headquarters: "Dubai" },
  { name: "Azizi Developments", established: 2007, totalProjects: 42, completedProjects: 22, activeProjects: 20, deliveryScore: 58, qualityScore: 65, avgDelay: 18, speciality: "Volume Mid-Market", headquarters: "Dubai" },
  { name: "Danube Properties", established: 1993, totalProjects: 30, completedProjects: 18, activeProjects: 12, deliveryScore: 72, qualityScore: 68, avgDelay: 8, speciality: "Affordable Luxury", headquarters: "Dubai" },
  { name: "Binghatti Developers", established: 2008, totalProjects: 48, completedProjects: 30, activeProjects: 18, deliveryScore: 75, qualityScore: 70, avgDelay: 6, speciality: "Iconic Architecture", headquarters: "Dubai" },
  { name: "Ellington Properties", established: 2014, totalProjects: 18, completedProjects: 10, activeProjects: 8, deliveryScore: 90, qualityScore: 93, avgDelay: 2, speciality: "Design-Focused", headquarters: "Dubai" },
  { name: "Omniyat", established: 2005, totalProjects: 15, completedProjects: 10, activeProjects: 5, deliveryScore: 86, qualityScore: 96, avgDelay: 5, speciality: "Super Luxury", headquarters: "Dubai" },
  { name: "Select Group", established: 2002, totalProjects: 20, completedProjects: 14, activeProjects: 6, deliveryScore: 80, qualityScore: 82, avgDelay: 6, speciality: "Marina & Waterfront", headquarters: "Dubai" },
  { name: "MAG Group", established: 2003, totalProjects: 16, completedProjects: 10, activeProjects: 6, deliveryScore: 68, qualityScore: 66, avgDelay: 12, speciality: "Affordable Segment", headquarters: "Dubai" },
  { name: "Samana Developers", established: 2017, totalProjects: 35, completedProjects: 12, activeProjects: 23, deliveryScore: 70, qualityScore: 71, avgDelay: 8, speciality: "Resort-Style Living", headquarters: "Dubai" },
  { name: "Reportage Properties", established: 2014, totalProjects: 12, completedProjects: 6, activeProjects: 6, deliveryScore: 74, qualityScore: 70, avgDelay: 7, speciality: "Value Investing", headquarters: "Abu Dhabi" },
  { name: "Tiger Group", established: 1976, totalProjects: 25, completedProjects: 18, activeProjects: 7, deliveryScore: 72, qualityScore: 68, avgDelay: 9, speciality: "Business Bay", headquarters: "Dubai" },
];

export const PROJECTS: Project[] = [
  // Emaar
  { name: "The Valley Phase 3", developer: "Emaar Properties", area: "The Valley", type: "residential", units: 1800, status: "under-construction", launchDate: "2024-03", expectedHandover: "2027-Q2", startPrice: 1200000, pricePerSqft: 1100, percentComplete: 35, paymentPlan: "60/40", highlights: ["Town Square concept", "Central park", "Retail boulevard"] },
  { name: "Emaar Beachfront Phase 2", developer: "Emaar Properties", area: "Dubai Harbour", type: "residential", units: 950, status: "under-construction", launchDate: "2023-09", expectedHandover: "2026-Q4", startPrice: 2800000, pricePerSqft: 2200, percentComplete: 60, paymentPlan: "70/30", highlights: ["Private beach", "Marina views", "Premium finish"] },
  { name: "Dubai Hills Vista", developer: "Emaar Properties", area: "Dubai Hills Estate", type: "residential", units: 620, status: "under-construction", launchDate: "2024-06", expectedHandover: "2027-Q3", startPrice: 1850000, pricePerSqft: 1650, percentComplete: 25, paymentPlan: "60/40", highlights: ["Golf course views", "Smart home", "Park access"] },
  { name: "Creek Rise", developer: "Emaar Properties", area: "Creek Harbour", type: "mixed", units: 1400, status: "under-construction", launchDate: "2024-01", expectedHandover: "2027-Q1", startPrice: 1500000, pricePerSqft: 1750, percentComplete: 40, paymentPlan: "80/20", highlights: ["Creek views", "Retail podium", "Metro proximity"] },

  // DAMAC
  { name: "DAMAC Lagoons Phase 3", developer: "DAMAC Properties", area: "DAMAC Lagoons", type: "residential", units: 2200, status: "under-construction", launchDate: "2023-06", expectedHandover: "2026-Q3", startPrice: 1100000, pricePerSqft: 950, percentComplete: 55, paymentPlan: "1% monthly", highlights: ["Crystal lagoons", "Themed clusters", "Townhouses"] },
  { name: "DAMAC Sun City", developer: "DAMAC Properties", area: "Dubailand", type: "residential", units: 3500, status: "under-construction", launchDate: "2024-09", expectedHandover: "2028-Q2", startPrice: 800000, pricePerSqft: 820, percentComplete: 15, paymentPlan: "60/40", highlights: ["Mega community", "Waterpark", "Affordable luxury"] },
  { name: "Safa Gate", developer: "DAMAC Properties", area: "Al Safa", type: "residential", units: 450, status: "under-construction", launchDate: "2024-04", expectedHandover: "2027-Q1", startPrice: 3200000, pricePerSqft: 2800, percentComplete: 30, paymentPlan: "50/50", highlights: ["Safa Park views", "Roberto Cavalli interiors"] },

  // Nakheel
  { name: "Palm Jebel Ali", developer: "Nakheel", area: "Palm Jebel Ali", type: "residential", units: 4500, status: "under-construction", launchDate: "2023-10", expectedHandover: "2028-Q4", startPrice: 5000000, pricePerSqft: 2100, percentComplete: 20, paymentPlan: "80/20 post-handover", highlights: ["Mega island", "Beachfront villas", "Next Palm"] },
  { name: "Como Residences", developer: "Nakheel", area: "Palm Jumeirah", type: "residential", units: 250, status: "under-construction", launchDate: "2023-04", expectedHandover: "2027-Q2", startPrice: 21000000, pricePerSqft: 4500, percentComplete: 45, paymentPlan: "70/30", highlights: ["Ultra luxury", "Penthouse collection", "Private pools"] },

  // Sobha
  { name: "Sobha Siniya Island", developer: "Sobha Realty", area: "Siniya Island, UAQ", type: "residential", units: 800, status: "under-construction", launchDate: "2024-02", expectedHandover: "2028-Q1", startPrice: 3500000, pricePerSqft: 1800, percentComplete: 20, paymentPlan: "80/20", highlights: ["Island living", "Mangroves", "Private beach"] },
  { name: "Sobha One Phase 2", developer: "Sobha Realty", area: "Sobha Hartland", type: "residential", units: 1500, status: "under-construction", launchDate: "2023-11", expectedHandover: "2026-Q4", startPrice: 1600000, pricePerSqft: 1700, percentComplete: 55, paymentPlan: "60/40", highlights: ["71 floors", "Lagoon views", "Premium finish"] },

  // Binghatti
  { name: "Binghatti Ghost", developer: "Binghatti Developers", area: "Al Jaddaf", type: "residential", units: 700, status: "under-construction", launchDate: "2024-07", expectedHandover: "2027-Q2", startPrice: 900000, pricePerSqft: 1400, percentComplete: 20, paymentPlan: "60/40", highlights: ["Iconic design", "Waterfront", "Jacob & Co collab"] },
  { name: "Mercedes-Benz Places", developer: "Binghatti Developers", area: "Downtown Dubai", type: "residential", units: 340, status: "under-construction", launchDate: "2024-01", expectedHandover: "2027-Q4", startPrice: 2500000, pricePerSqft: 3200, percentComplete: 25, paymentPlan: "70/30", highlights: ["Mercedes-Benz branded", "Luxury finishes", "Iconic tower"] },

  // Azizi
  { name: "Azizi Venice Phase 4", developer: "Azizi Developments", area: "Dubai South", type: "residential", units: 2800, status: "under-construction", launchDate: "2023-08", expectedHandover: "2027-Q1", startPrice: 600000, pricePerSqft: 750, percentComplete: 35, paymentPlan: "1% monthly", highlights: ["Canal community", "Expo proximity", "Affordable"] },
  { name: "Azizi Riviera", developer: "Azizi Developments", area: "Meydan", type: "residential", units: 16000, status: "under-construction", launchDate: "2019-01", expectedHandover: "2026-Q2", actualHandover: undefined, startPrice: 750000, pricePerSqft: 950, percentComplete: 75, paymentPlan: "50/50", highlights: ["French Riviera inspired", "Crystal lagoon", "Mega project"] },

  // Danube
  { name: "Bayz 102", developer: "Danube Properties", area: "Business Bay", type: "residential", units: 800, status: "under-construction", launchDate: "2024-05", expectedHandover: "2027-Q3", startPrice: 1200000, pricePerSqft: 1500, percentComplete: 20, paymentPlan: "1% monthly post-handover", highlights: ["102 floors", "Tallest Danube tower", "Furnished"] },
  { name: "Diamondz", developer: "Danube Properties", area: "JLT", type: "residential", units: 1100, status: "near-completion", launchDate: "2023-02", expectedHandover: "2026-Q2", startPrice: 900000, pricePerSqft: 1200, percentComplete: 85, paymentPlan: "1% monthly", highlights: ["JLT waterfront", "Furnished", "Amenity rich"] },

  // Ellington
  { name: "Ellington Beach House 3", developer: "Ellington Properties", area: "Palm Jumeirah", type: "residential", units: 180, status: "under-construction", launchDate: "2024-03", expectedHandover: "2027-Q1", startPrice: 4800000, pricePerSqft: 3500, percentComplete: 30, paymentPlan: "70/30", highlights: ["Palm beachfront", "Design-led", "Japanese-inspired"] },
  { name: "Wilton Terraces 3", developer: "Ellington Properties", area: "MBR City", type: "residential", units: 350, status: "near-completion", launchDate: "2022-11", expectedHandover: "2026-Q2", startPrice: 1200000, pricePerSqft: 1550, percentComplete: 90, paymentPlan: "60/40", highlights: ["Design apartments", "District One views", "Premium quality"] },

  // Samana
  { name: "Samana Portofino", developer: "Samana Developers", area: "Dubai Production City", type: "residential", units: 600, status: "under-construction", launchDate: "2024-08", expectedHandover: "2027-Q2", startPrice: 550000, pricePerSqft: 850, percentComplete: 15, paymentPlan: "1% monthly post-handover", highlights: ["Private pools", "Furnished", "Resort living"] },
  { name: "Samana Manhattan 2", developer: "Samana Developers", area: "JVC", type: "residential", units: 450, status: "under-construction", launchDate: "2024-11", expectedHandover: "2027-Q4", startPrice: 700000, pricePerSqft: 1000, percentComplete: 10, paymentPlan: "1% monthly", highlights: ["NYC inspired", "Private pools in every unit"] },

  // Meraas
  { name: "Bvlgari Lighthouse", developer: "Meraas", area: "Jumeirah Bay", type: "residential", units: 60, status: "under-construction", launchDate: "2024-06", expectedHandover: "2028-Q1", startPrice: 35000000, pricePerSqft: 6500, percentComplete: 15, paymentPlan: "Custom", highlights: ["Ultra luxury", "Bvlgari branded", "Private island"] },
  { name: "Port de La Mer Phase 2", developer: "Meraas", area: "La Mer", type: "residential", units: 450, status: "near-completion", launchDate: "2022-06", expectedHandover: "2026-Q3", startPrice: 2200000, pricePerSqft: 2400, percentComplete: 80, paymentPlan: "60/40", highlights: ["Mediterranean design", "Marina", "Beach access"] },

  // Omniyat
  { name: "Vela Viento", developer: "Omniyat", area: "Business Bay", type: "residential", units: 280, status: "under-construction", launchDate: "2024-04", expectedHandover: "2027-Q4", startPrice: 4500000, pricePerSqft: 3800, percentComplete: 20, paymentPlan: "70/30", highlights: ["Zaha Hadid design", "Canal front", "Super luxury"] },
  { name: "The Lana", developer: "Omniyat", area: "Business Bay", type: "residential", units: 225, status: "completed", launchDate: "2021-03", expectedHandover: "2024-Q4", actualHandover: "2024-Q4", startPrice: 6000000, pricePerSqft: 4200, percentComplete: 100, paymentPlan: "N/A", highlights: ["Dorchester Collection", "Delivered on time", "Ultra premium"] },
];

export const STATUS_COLORS: Record<Project["status"], string> = {
  "announced": "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "under-construction": "text-amber-400 bg-amber-400/10 border-amber-400/20",
  "near-completion": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "completed": "text-white bg-white/10 border-white/20",
  "delayed": "text-red-400 bg-red-400/10 border-red-400/20",
};
