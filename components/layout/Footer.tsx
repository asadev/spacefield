"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  getRegion,
  regionFromPath,
  subscribeRegion,
  REGION_SHORT,
  type Region,
} from "@/lib/region";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type FooterLink = { href: string; label: string };

type FooterColumns = {
  tools: FooterLink[];
  games?: FooterLink[];
  learn: FooterLink[];
  community: FooterLink[];
  platform: FooterLink[];
};

const UAE_FEATURED_TOOLS: FooterLink[] = [
  { href: "/tools/investment-advisor", label: "AI Investment Advisor" },
  { href: "/tools/property-valuation", label: "AI Property Valuation" },
  { href: "/tools/mortgage-calculator", label: "Mortgage Calculator" },
  { href: "/tools/deal-scoring", label: "Deal Scoring Engine" },
  { href: "/tools/market-pulse", label: "Market Pulse" },
  { href: "/tools/dld-fee-calculator", label: "DLD Fee Calculator" },
  { href: "/tools/yield-heatmap", label: "Yield Heatmap" },
  { href: "/tools/neighborhood-report", label: "Neighborhood Reports" },
  { href: "/tools", label: "All Tools" },
];

const UAE_GAMES: FooterLink[] = [
  { href: "/games/property-tycoon", label: "Dubai Property Tycoon" },
  { href: "/games/portfolio-wars", label: "Portfolio Wars" },
  { href: "/games/brokers-gauntlet", label: "Broker's Gauntlet" },
  { href: "/games/blind-valuation", label: "Blind Valuation" },
  { href: "/games", label: "All 8 Games" },
];

// Featured tools per region — each region's 1 region-specific tool plus
// the 5 most broadly useful common ones.
const REGION_FEATURED_TOOL_SLUGS: Record<
  Exclude<Region, "uae">,
  { slug: string; label: string }[]
> = {
  uk: [
    { slug: "stamp-duty-calculator", label: "Stamp Duty Calculator" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  monaco: [
    { slug: "registration-tax-calculator", label: "Registration Tax" },
    { slug: "residency-checker", label: "Residency Checker" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  tokyo: [
    { slug: "acquisition-tax-calculator", label: "Acquisition Tax" },
    { slug: "foreign-ownership-checker", label: "Foreign Ownership" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  singapore: [
    { slug: "absd-calculator", label: "ABSD Calculator" },
    { slug: "foreign-buyer-checker", label: "Foreign Buyer Check" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  usa: [
    { slug: "closing-cost-calculator", label: "Closing Cost Calculator" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  spain: [
    { slug: "itp-calculator", label: "ITP Calculator" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  portugal: [
    { slug: "imt-calculator", label: "IMT Calculator" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  turkey: [
    { slug: "citizenship-eligibility", label: "Citizenship Eligibility" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
  saudi: [
    { slug: "premium-residency-checker", label: "Premium Residency" },
    { slug: "mortgage-calculator", label: "Mortgage Calculator" },
    { slug: "investment-advisor", label: "AI Investment Advisor" },
    { slug: "property-valuation", label: "Property Valuation" },
    { slug: "yield-heatmap", label: "Yield Heatmap" },
    { slug: "market-pulse", label: "Market Pulse" },
  ],
};

const PREFIX_BY_REGION: Record<Region, string> = {
  uae: "",
  uk: "/uk",
  monaco: "/monaco",
  tokyo: "/tokyo",
  singapore: "/singapore",
  usa: "/usa",
  spain: "/spain",
  portugal: "/portugal",
  turkey: "/turkey",
  saudi: "/saudi",
};

function buildColumns(region: Region): FooterColumns {
  if (region === "uae") {
    return {
      tools: UAE_FEATURED_TOOLS,
      games: UAE_GAMES,
      learn: [
        { href: "/learn", label: "All Courses" },
        { href: "/learn#investor", label: "For Investors" },
        { href: "/learn#agent", label: "For Agents" },
        { href: "/blog", label: "Blog & Analysis" },
      ],
      community: [
        { href: "/community", label: "Broker Community" },
        { href: "/community/events", label: "Events" },
        { href: "/leaderboard", label: "Leaderboard" },
        { href: "/market", label: "Live Market Data" },
      ],
      platform: [
        { href: "/about", label: "About" },
        { href: "/solutions", label: "Solutions" },
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms of Use" },
      ],
    };
  }

  const prefix = PREFIX_BY_REGION[region];
  const featured = REGION_FEATURED_TOOL_SLUGS[region];
  const regionLabel = REGION_SHORT[region];

  return {
    tools: [
      ...featured.map((t) => ({ href: `${prefix}/tools/${t.slug}`, label: t.label })),
      { href: `${prefix}/tools`, label: `All ${regionLabel} Tools` },
    ],
    // No games outside UAE
    learn: [
      { href: `${prefix}/learn`, label: `${regionLabel} Courses` },
      { href: `${prefix}/blog`, label: `${regionLabel} Blog & Analysis` },
    ],
    community: [
      { href: `${prefix}/community`, label: `${regionLabel} Community` },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: `${prefix}/market`, label: `${regionLabel} Market Data` },
    ],
    platform: [
      { href: `${prefix}/about`, label: "About" },
      { href: "/solutions", label: "Solutions" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
    ],
  };
}

function FooterColumn({
  title,
  links,
  delay,
}: {
  title: string;
  links: FooterLink[];
  delay: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease }}
    >
      <h4 className="text-xs sm:text-[0.65rem] font-medium uppercase tracking-[0.2em] text-secondary">
        {title}
      </h4>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group flex items-center gap-2 text-sm text-muted transition-colors duration-300 hover:text-app"
            >
              <span className="block h-px w-3 bg-app-strong border-app transition-all duration-300 group-hover:w-5" style={{ backgroundColor: "var(--text-faint)" }} />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

export default function Footer() {
  const pathname = usePathname();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  // Resolve active region the same way Nav does:
  // path region wins; otherwise stored preference; default "uae".
  const pathRegion = regionFromPath(pathname);
  const [prefRegion, setPrefRegion] = useState<Region>("uae");
  useEffect(() => {
    setPrefRegion(getRegion());
    return subscribeRegion(setPrefRegion);
  }, []);

  const region: Region = pathRegion ?? prefRegion;
  const columns = buildColumns(region);
  const regionLabel = REGION_SHORT[region];
  const homeHref = region === "uae" ? "/" : PREFIX_BY_REGION[region];
  const columnCount = columns.games ? 6 : 5;

  return (
    <footer ref={ref} className="relative border-t-0 bg-app">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={isInView ? { scaleX: 1 } : {}}
        transition={{ duration: 1.2, ease }}
        style={{ originX: 0 }}
        className="absolute top-0 left-0 right-0 h-px section-divider"
      />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-10">
        <div
          className={`grid grid-cols-1 gap-8 sm:gap-12 py-12 sm:py-16 sm:grid-cols-2 lg:gap-8 lg:py-20 ${
            columnCount === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5"
          }`}
        >
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1, ease }}
            className="lg:col-span-1 lg:pr-4"
          >
            <Link href={homeHref} className="inline-block">
              <h3 className="text-lg font-semibold tracking-wide text-app flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--text-faint)" }} />
                example.com
              </h3>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-secondary">
              Real estate intelligence platform. Professional tools, market data, courses, and community.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <span className="status-pulse block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[0.55rem] uppercase tracking-[0.25em] text-muted">
                Platform Online
              </span>
            </div>
          </motion.div>

          <FooterColumn title="Tools" links={columns.tools} delay={0.15} />
          {columns.games && (
            <FooterColumn title="Games" links={columns.games} delay={0.2} />
          )}
          <FooterColumn title="Learn" links={columns.learn} delay={0.25} />
          <FooterColumn title="Community" links={columns.community} delay={0.3} />
          <FooterColumn title="Platform" links={columns.platform} delay={0.35} />
        </div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.5, ease }}
          className="flex flex-col items-center justify-between gap-4 border-t border-app py-8 sm:flex-row"
        >
          <p className="text-xs sm:text-[0.65rem] uppercase tracking-[0.15em] text-muted">
            &copy; {new Date().getFullYear()} example.com. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-xs sm:text-[0.6rem] uppercase tracking-[0.15em] text-muted">
              {regionLabel}
            </span>
            <span className="h-px w-4" style={{ backgroundColor: "var(--text-faint)" }} />
            <span className="text-xs sm:text-[0.6rem] uppercase tracking-[0.15em] text-muted">
              Real estate intelligence platform
            </span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
