"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { TOOL_TO_COURSES, TOOL_TO_GAMES, COURSE_NAMES, GAME_NAMES } from "@/lib/cross-links";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface ToolInfo {
  name: string;
  description: string;
}

const TOOL_INFO: Record<string, ToolInfo> = {
  "deal-scoring": {
    name: "Deal Scoring Engine",
    description: "Know if a listing is a steal or overpriced in seconds",
  },
  "due-diligence": {
    name: "Due Diligence Checklist",
    description: "Every check you can't afford to skip before buying",
  },
  affordability: {
    name: "What Can I Afford?",
    description: "Your max budget under UAE Central Bank rules",
  },
  "sales-offer-generator": {
    name: "Sales Offer Generator",
    description: "Ready-to-send offers in seconds, not 30 minutes",
  },
  "roi-calculator": {
    name: "ROI Calculator",
    description: "Your real return after every cost — not the brochure number",
  },
  "commission-calculator": {
    name: "Commission Calculator",
    description: "Know exactly what you take home from any deal",
  },
  "property-comparison": {
    name: "Property Comparison",
    description: "Pick the winner from up to 4 shortlisted units",
  },
  "neighborhood-report": {
    name: "Neighborhood Report",
    description: "The honest picture of any community before you commit",
  },
  "yield-heatmap": {
    name: "Rental Yield Heatmap",
    description: "See where landlords are earning the most right now",
  },
  "developer-track-record": {
    name: "Developer Track Record",
    description: "Who delivers on time and who doesn't — 30+ developers scored",
  },
  "service-charge-comparison": {
    name: "Service Charge Comparison",
    description: "Find out if your building is overcharging you",
  },
  "investment-simulator": {
    name: "Investment Simulator",
    description: "See how much you left on the table by not buying sooner",
  },
  "golden-visa-checker": {
    name: "Golden Visa Checker",
    description: "Does your property qualify you for a 10-year visa?",
  },
  "area-comparison": {
    name: "Area Comparison",
    description: "Settle the area debate with data across 20+ metrics",
  },
  "poster-creator": {
    name: "Poster Creator",
    description: "Industry-aware poster templates — real estate, fashion, food, more",
  },
  "global-market-comparison": {
    name: "Global Market Comparison",
    description: "How any market stacks up against 60+ countries",
  },
  "mortgage-calculator": {
    name: "Mortgage Calculator",
    description: "Your exact payment across 10 UAE banks before you commit",
  },
  "dld-fee-calculator": {
    name: "DLD Fee Calculator",
    description: "No surprises at closing — every fee to the fils",
  },
  "offplan-analyzer": {
    name: "Off-Plan Payment Analyzer",
    description: "Find which payment plan actually costs you less",
  },
  "rent-vs-buy": {
    name: "Rent vs Buy Calculator",
    description: "Your exact breakeven year in the UAE market",
  },
  "market-pulse": {
    name: "Market Pulse Dashboard",
    description: "Where money is flowing right now",
  },
  "portfolio-tracker": {
    name: "Portfolio Tracker",
    description: "Your entire portfolio's health in one view",
  },
  "property-valuation": {
    name: "AI Property Valuation",
    description: "What any property is actually worth right now",
  },
  "developer-pipeline": {
    name: "Developer Pipeline Tracker",
    description: "What's on schedule, what's delayed, what's coming",
  },
  "regulation-monitor": {
    name: "Regulation Monitor",
    description: "Never get blindsided by a rule change",
  },
  "tenant-screening": {
    name: "Tenant Screening Score",
    description: "Will tenants line up or will you sit vacant?",
  },
  "cash-flow-modeler": {
    name: "Cash Flow Modeler",
    description: "Will this property actually put money in your pocket?",
  },
  "investment-advisor": {
    name: "AI Investment Advisor",
    description: "A strategy matched to your budget and goals",
  },
};

const RECOMMENDATIONS: Record<string, string[]> = {
  // Original 16
  "deal-scoring": ["property-valuation", "roi-calculator", "neighborhood-report"],
  "due-diligence": ["dld-fee-calculator", "regulation-monitor", "golden-visa-checker"],
  affordability: ["mortgage-calculator", "rent-vs-buy", "golden-visa-checker"],
  "sales-offer-generator": ["commission-calculator", "poster-creator", "dld-fee-calculator"],
  "roi-calculator": ["cash-flow-modeler", "investment-simulator", "rent-vs-buy"],
  "commission-calculator": ["dld-fee-calculator", "sales-offer-generator", "roi-calculator"],
  "property-comparison": ["deal-scoring", "property-valuation", "area-comparison"],
  "neighborhood-report": ["area-comparison", "yield-heatmap", "tenant-screening"],
  "yield-heatmap": ["neighborhood-report", "tenant-screening", "market-pulse"],
  "developer-track-record": ["developer-pipeline", "offplan-analyzer", "deal-scoring"],
  "service-charge-comparison": ["cash-flow-modeler", "roi-calculator", "neighborhood-report"],
  "investment-simulator": ["roi-calculator", "market-pulse", "global-market-comparison"],
  "golden-visa-checker": ["affordability", "investment-advisor", "dld-fee-calculator"],
  "area-comparison": ["neighborhood-report", "yield-heatmap", "tenant-screening"],
  "poster-creator": ["sales-offer-generator", "commission-calculator", "deal-scoring"],
  "global-market-comparison": ["market-pulse", "investment-simulator", "investment-advisor"],
  // New 12
  "mortgage-calculator": ["affordability", "dld-fee-calculator", "rent-vs-buy"],
  "dld-fee-calculator": ["mortgage-calculator", "commission-calculator", "due-diligence"],
  "offplan-analyzer": ["developer-pipeline", "developer-track-record", "cash-flow-modeler"],
  "rent-vs-buy": ["mortgage-calculator", "affordability", "cash-flow-modeler"],
  "market-pulse": ["yield-heatmap", "investment-simulator", "global-market-comparison"],
  "portfolio-tracker": ["cash-flow-modeler", "roi-calculator", "property-valuation"],
  "property-valuation": ["deal-scoring", "property-comparison", "neighborhood-report"],
  "developer-pipeline": ["developer-track-record", "offplan-analyzer", "market-pulse"],
  "regulation-monitor": ["due-diligence", "golden-visa-checker", "dld-fee-calculator"],
  "tenant-screening": ["neighborhood-report", "yield-heatmap", "cash-flow-modeler"],
  "cash-flow-modeler": ["roi-calculator", "portfolio-tracker", "rent-vs-buy"],
  "investment-advisor": ["deal-scoring", "market-pulse", "mortgage-calculator"],
};

export default function ToolRecommendations({ slug }: { slug: string }) {
  const slugs = RECOMMENDATIONS[slug];
  const relatedCourses = TOOL_TO_COURSES[slug] || [];
  const relatedGames = TOOL_TO_GAMES[slug] || [];

  return (
    <div className="mt-16 space-y-10">
      {/* Related Tools */}
      {slugs && slugs.length > 0 && (
        <div>
          <p className="mb-6 text-[0.6rem] uppercase tracking-[0.25em] text-gray-500">
            Related Tools
          </p>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slugs.map((toolSlug, i) => {
              const info = TOOL_INFO[toolSlug];
              if (!info) return null;
              return (
                <motion.div
                  key={toolSlug}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease }}
                >
                  <Link href={`/tools/${toolSlug}`} className="group block">
                    <div className="relative overflow-hidden border border-white/[0.10] bg-white/[0.05] p-4 sm:p-6 transition-all duration-500 hover:border-white/[0.16] hover:bg-white/[0.07]">
                      <div className="absolute top-0 left-0 h-5 w-px bg-white/10 transition-all duration-500 group-hover:h-7 group-hover:bg-white/20" />
                      <div className="absolute top-0 left-0 h-px w-5 bg-white/10 transition-all duration-500 group-hover:w-7 group-hover:bg-white/20" />
                      <div className="absolute right-0 bottom-0 h-5 w-px bg-white/10 transition-all duration-500 group-hover:h-7 group-hover:bg-white/20" />
                      <div className="absolute right-0 bottom-0 h-px w-5 bg-white/10 transition-all duration-500 group-hover:w-7 group-hover:bg-white/20" />

                      <h4 className="text-sm font-semibold text-white transition-colors group-hover:text-gray-200">
                        {info.name}
                      </h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                        {info.description}
                      </p>
                      <span className="mt-4 inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.15em] text-gray-500 transition-colors group-hover:text-white">
                        Open
                        <span className="transition-transform duration-300 group-hover:translate-x-0.5">
                          &rarr;
                        </span>
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Related Courses */}
      {relatedCourses.length > 0 && (
        <div>
          <p className="mb-4 text-[0.6rem] uppercase tracking-[0.25em] text-gray-500">
            Learn More
          </p>
          <div className="flex flex-wrap gap-3">
            {relatedCourses.map((courseSlug) => (
              <Link
                key={courseSlug}
                href={`/learn/${courseSlug}`}
                className="group flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
              >
                <span className="text-[0.6rem] text-gray-600">📖</span>
                <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                  {COURSE_NAMES[courseSlug] || courseSlug}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Related Games */}
      {relatedGames.length > 0 && (
        <div>
          <p className="mb-4 text-[0.6rem] uppercase tracking-[0.25em] text-gray-500">
            Practice in Games
          </p>
          <div className="flex flex-wrap gap-3">
            {relatedGames.map((gameSlug) => (
              <Link
                key={gameSlug}
                href={`/games/${gameSlug}`}
                className="group flex items-center gap-2 border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
              >
                <span className="text-[0.6rem] text-gray-600">🎮</span>
                <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                  {GAME_NAMES[gameSlug] || gameSlug}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
