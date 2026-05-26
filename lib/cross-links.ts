// Cross-section linking — maps between tools, courses, and games

export const TOOL_TO_COURSES: Record<string, string[]> = {
  "investment-advisor": ["investment-analysis", "dubai-re-101"],
  "property-valuation": ["investment-analysis", "market-intelligence"],
  "deal-scoring": ["investment-analysis", "due-diligence-masterclass"],
  "market-pulse": ["market-intelligence", "investment-analysis"],
  "mortgage-calculator": ["dubai-re-101", "legal-framework"],
  "roi-calculator": ["investment-analysis", "dubai-re-101"],
  "dld-fee-calculator": ["dubai-re-101", "legal-framework"],
  "commission-calculator": ["rera-certification", "brokerage-operations"],
  "affordability": ["dubai-re-101", "investment-analysis"],
  "rent-vs-buy": ["investment-analysis", "dubai-re-101"],
  "offplan-analyzer": ["offplan-strategy", "investment-analysis"],
  "cash-flow-modeler": ["investment-analysis"],
  "portfolio-tracker": ["investment-analysis"],
  "investment-simulator": ["investment-analysis", "market-intelligence"],
  "golden-visa-checker": ["dubai-re-101", "legal-framework"],
  "tenant-screening": ["market-intelligence"],
  "neighborhood-report": ["dubai-re-101", "market-intelligence"],
  "yield-heatmap": ["investment-analysis", "market-intelligence"],
  "area-comparison": ["dubai-re-101", "market-intelligence"],
  "property-comparison": ["investment-analysis"],
  "service-charge-comparison": ["due-diligence-masterclass"],
  "developer-track-record": ["offplan-strategy", "due-diligence-masterclass"],
  "developer-pipeline": ["offplan-strategy", "market-intelligence"],
  "global-market-comparison": ["market-intelligence", "investment-analysis"],
  "regulation-monitor": ["legal-framework", "rera-certification"],
  "due-diligence": ["due-diligence-masterclass", "legal-framework"],
  "sales-offer-generator": ["client-advisory", "rera-certification"],
  "poster-creator": ["digital-marketing-agents"],
};

export const TOOL_TO_GAMES: Record<string, string[]> = {
  "deal-scoring": ["blind-valuation", "flip-or-hold"],
  "yield-heatmap": ["area-detective"],
  "neighborhood-report": ["area-detective", "brokers-gauntlet"],
  "area-comparison": ["area-detective"],
  "investment-advisor": ["property-tycoon", "portfolio-wars"],
  "roi-calculator": ["property-tycoon", "flip-or-hold"],
  "offplan-analyzer": ["flip-or-hold"],
  "market-pulse": ["market-prediction"],
  "regulation-monitor": ["regulation-gauntlet"],
  "property-valuation": ["blind-valuation"],
  "portfolio-tracker": ["portfolio-wars"],
};

export const GAME_TO_COURSES: Record<string, string[]> = {
  "property-tycoon": ["investment-analysis", "offplan-strategy"],
  "portfolio-wars": ["investment-analysis"],
  "flip-or-hold": ["investment-analysis", "market-intelligence"],
  "brokers-gauntlet": ["client-advisory", "rera-certification"],
  "blind-valuation": ["investment-analysis", "market-intelligence"],
  "market-prediction": ["market-intelligence", "investment-analysis"],
  "regulation-gauntlet": ["legal-framework", "rera-certification"],
  "area-detective": ["dubai-re-101", "market-intelligence"],
};

export const COURSE_NAMES: Record<string, string> = {
  "dubai-re-101": "Dubai RE 101",
  "due-diligence-masterclass": "Due Diligence Masterclass",
  "investment-analysis": "Investment Analysis Deep Dive",
  "offplan-strategy": "Off-Plan Investment Strategy",
  "rera-certification": "RERA Certification Prep",
  "client-advisory": "Client Advisory Skills",
  "digital-marketing-agents": "Digital Marketing for Agents",
  "luxury-specialist": "Luxury Specialist",
  "brokerage-operations": "Brokerage Operations",
  "ai-automation-re": "AI & Automation for RE",
  "market-intelligence": "Market Intelligence & Data",
  "legal-framework": "Dubai RE Legal Framework",
};

export const GAME_NAMES: Record<string, string> = {
  "property-tycoon": "Dubai Property Tycoon",
  "portfolio-wars": "Portfolio Wars",
  "flip-or-hold": "Flip or Hold",
  "brokers-gauntlet": "Broker's Gauntlet",
  "blind-valuation": "Blind Valuation",
  "market-prediction": "Market Prediction",
  "regulation-gauntlet": "Regulation Gauntlet",
  "area-detective": "Area Detective",
};
