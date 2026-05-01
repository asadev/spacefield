"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Golden Visa Checker — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome. Width-driven layout — two columns on wide windows, single column
   when narrow. The full eligibility engine, FAQ data and visa-category
   reference are preserved verbatim from page.tsx; only the chrome and
   navigation surrounds change.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import {
  visaCategories,
  faqs,
  DATA_UPDATED,
  type VisaCategory,
} from "@/lib/golden-visa-data";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ───── types ───── */

type PropertyStatus = "completed" | "off-plan" | "under-construction";
type AgeRange = "under-55" | "55-plus";
type EligibilityStatus = "eligible" | "conditional" | "not-eligible";
type VisaTrack = "investor" | "skilled" | "specialist";

interface EligibilityResult {
  status: EligibilityStatus;
  headline: string;
  category: VisaCategory | null;
  conditions: string[];
  gap: number;
  suggestions: string[];
}

/* ───── helpers ───── */

function formatAED(value: number): string {
  return new Intl.NumberFormat("en-AE").format(value);
}

function parseAED(str: string): number {
  return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
}

/* ───── visa cost data ───── */
const VISA_COST_ITEMS = [
  { label: "Application Fee", amount: 2860 },
  { label: "UAE ID", amount: 573 },
  { label: "Medical Insurance (est./year)", amount: 650 },
  { label: "Typing Fee", amount: 230 },
  { label: "Service Charge", amount: 153 },
  { label: "Passport Stamping", amount: 650 },
];
const VISA_COST_TOTAL = VISA_COST_ITEMS.reduce((s, i) => s + i.amount, 0);

/* ───── processing timeline ───── */
const TIMELINE_STEPS = [
  { label: "Application", duration: "Day 1" },
  { label: "Document Review", duration: "5-10 days" },
  { label: "Medical + Emirates ID", duration: "3-5 days" },
  { label: "Visa Stamping", duration: "2-3 days" },
];

/* ───── visa-track copy ───── */
const VISA_TRACKS: { id: VisaTrack; label: string; sub: string }[] = [
  { id: "investor", label: "Property Investor", sub: "AED 2M+ in real estate" },
  { id: "skilled", label: "Skilled Professional", sub: "Salary AED 30K+ / month" },
  { id: "specialist", label: "Specialist Talent", sub: "Doctors, scientists, creatives" },
];

/* ───── eligibility engine (preserved verbatim from page.tsx) ───── */

function checkEligibility(input: {
  propertyValue: number;
  portfolioValue: number;
  propertyStatus: PropertyStatus;
  hasMortgage: boolean;
  mortgagePaidPercent: number;
  multipleProperties: boolean;
  ageRange: AgeRange;
}): EligibilityResult {
  let effectiveValue: number;
  if (input.multipleProperties) {
    effectiveValue = input.portfolioValue;
  } else if (input.hasMortgage) {
    effectiveValue = input.propertyValue * (input.mortgagePaidPercent / 100);
  } else {
    effectiveValue = input.propertyValue;
  }

  const totalValue = input.multipleProperties
    ? input.portfolioValue
    : input.propertyValue;

  const conditions: string[] = [];
  const suggestions: string[] = [];

  if (effectiveValue >= 2_000_000) {
    if (input.propertyStatus === "off-plan") {
      conditions.push(
        "Off-plan properties initially qualify for a 5-year Golden Visa, upgradeable to 10 years upon handover."
      );
      conditions.push(
        "The developer must be RERA-registered and approved by DLD."
      );
      conditions.push("Oqood (initial registration) must be completed.");

      const cat =
        visaCategories.find((c) => c.id === "golden-visa-5yr-offplan") ??
        visaCategories[0];
      return {
        status: "conditional",
        headline: "Conditionally Eligible — 5-Year Golden Visa (Off-Plan)",
        category: cat,
        conditions,
        gap: 0,
        suggestions: [
          "Once your property is completed and the title deed is issued, you can upgrade to a 10-year Golden Visa.",
        ],
      };
    }

    if (input.propertyStatus === "under-construction") {
      conditions.push(
        "Under-construction properties are treated similarly to off-plan. You may qualify for a 5-year visa initially."
      );
      conditions.push("Confirm with GDRFA that your project is approved.");

      const cat =
        visaCategories.find((c) => c.id === "golden-visa-5yr-offplan") ??
        visaCategories[0];
      return {
        status: "conditional",
        headline:
          "Conditionally Eligible — 5-Year Golden Visa (Under Construction)",
        category: cat,
        conditions,
        gap: 0,
        suggestions: [
          "Wait for handover and title deed issuance to secure a 10-year Golden Visa.",
        ],
      };
    }

    if (input.hasMortgage) {
      conditions.push(
        `Your equity (${input.mortgagePaidPercent}% paid = AED ${formatAED(effectiveValue)}) meets the AED 2M threshold. Mortgage must be with a UAE-approved bank.`
      );
    }

    const cat = visaCategories.find((c) => c.id === "golden-visa-10yr")!;
    return {
      status: "eligible",
      headline: "Eligible for 10-Year Golden Visa",
      category: cat,
      conditions,
      gap: 0,
      suggestions: [],
    };
  }

  if (input.hasMortgage && !input.multipleProperties && totalValue >= 2_000_000 && effectiveValue < 2_000_000) {
    const equityNeeded = 2_000_000;
    const pctNeeded = Math.ceil((equityNeeded / totalValue) * 100);
    suggestions.push(
      `Your property is worth AED ${formatAED(totalValue)} but only ${input.mortgagePaidPercent}% is paid off (equity: AED ${formatAED(effectiveValue)}). You need at least ${pctNeeded}% paid to reach AED 2M in equity.`
    );
    suggestions.push(
      "Continue paying down your mortgage or make a lump-sum payment to increase your equity above AED 2,000,000."
    );

    return {
      status: "not-eligible",
      headline: "Not Eligible — Insufficient Equity",
      category: null,
      conditions: [],
      gap: equityNeeded - effectiveValue,
      suggestions,
    };
  }

  if (
    input.ageRange === "55-plus" &&
    effectiveValue >= 1_000_000 &&
    input.propertyStatus === "completed"
  ) {
    if (input.hasMortgage) {
      return {
        status: "not-eligible",
        headline: "Not Eligible — Mortgage Disqualifies Retirement Visa",
        category: null,
        conditions: [],
        gap: 0,
        suggestions: [
          "The 5-year Retirement Visa requires a fully paid property (no mortgage).",
          `You need AED ${formatAED(2_000_000 - effectiveValue)} more in equity to qualify for the 10-year Golden Visa instead, which does allow mortgages.`,
          "Alternatively, pay off your mortgage to qualify for the Retirement Visa.",
        ],
      };
    }

    const cat = visaCategories.find((c) => c.id === "retirement-visa-5yr")!;
    return {
      status: "eligible",
      headline: "Eligible for 5-Year Retirement Visa",
      category: cat,
      conditions: [
        "You must also meet one financial requirement: property worth AED 1M+, savings of AED 1M+, or monthly income of AED 20,000+.",
      ],
      gap: 0,
      suggestions: [],
    };
  }

  const gapTo2M = Math.max(0, 2_000_000 - effectiveValue);
  const gapTo1M = Math.max(0, 1_000_000 - effectiveValue);

  if (effectiveValue > 0) {
    suggestions.push(
      `You need AED ${formatAED(gapTo2M)} more in property equity to qualify for the 10-year Golden Visa (AED 2M minimum).`
    );
  } else {
    suggestions.push(
      "Invest in Dubai property worth at least AED 2,000,000 to qualify for the 10-year Golden Visa."
    );
  }

  if (input.ageRange === "55-plus" && effectiveValue < 1_000_000) {
    suggestions.push(
      `As a retiree (55+), you need AED ${formatAED(gapTo1M)} more to qualify for the 5-year Retirement Visa (AED 1M minimum, fully paid property).`
    );
  }

  if (input.propertyStatus !== "completed") {
    suggestions.push(
      "Consider completed (ready) properties for faster and simpler visa processing."
    );
  }

  if (!input.multipleProperties && totalValue > 0 && totalValue < 2_000_000) {
    suggestions.push(
      "You can combine multiple properties to reach the AED 2M threshold."
    );
  }

  return {
    status: "not-eligible",
    headline: "Not Currently Eligible",
    category: null,
    conditions: [],
    gap: gapTo2M,
    suggestions,
  };
}

/* ───── small UI components ───── */

function FieldLabel({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <label className="block mb-2">
      <span className="block text-[11px] uppercase tracking-[0.12em] text-muted font-medium">
        {children}
      </span>
      {sub && (
        <span className="block text-xs text-muted mt-1 normal-case tracking-normal">
          {sub}
        </span>
      )}
    </label>
  );
}

function PillButton({
  selected,
  onClick,
  children,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] px-4 py-3 rounded-xl border text-left transition-all duration-200 ${
        selected
          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
          : "border-app bg-app-elevated text-secondary hover:border-app-strong"
      }`}
    >
      <span className="block text-sm font-semibold">{children}</span>
      {sub && (
        <span className={`block text-[11px] mt-0.5 ${selected ? "text-tool-accent/80" : "text-muted"}`}>
          {sub}
        </span>
      )}
    </button>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-app rounded-xl overflow-hidden bg-app-elevated">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full text-left px-5 py-4 min-h-[44px] flex items-start justify-between gap-4 hover:bg-tool-accent-soft transition-colors"
      >
        <span className="text-sm font-medium text-app">{question}</span>
        <span className="text-tool-accent text-lg shrink-0 mt-[-2px] font-light">
          {open ? "−" : "+"}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
          >
            <div className="px-5 pb-4 text-sm text-secondary leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const INPUT_CLASSES =
  "w-full bg-app-elevated border border-app rounded-xl px-4 py-3 text-sm text-app " +
  "focus:outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/25 " +
  "transition-colors placeholder:text-muted";

/* ───── main app ───── */

export default function GoldenVisaCheckerApp(props: NativeAppProps) {
  const { width, openApp } = props;
  // Width-driven layout — collapse to a single column for narrow windows.
  // isMobile triggers iOS-style touches (full-width inputs, sticky CTA, larger tap targets).
  const isMobile = width < 700;
  const isNarrow = width < 860 || isMobile;
  const isUltra = width < 560 || isMobile;

  /* form state */
  const [visaTrack, setVisaTrack] = useState<VisaTrack>("investor");
  const [propertyValue, setPropertyValue] = useState("");
  const [propertyStatus, setPropertyStatus] =
    useState<PropertyStatus>("completed");
  const [hasMortgage, setHasMortgage] = useState(false);
  const [mortgagePaidPercent, setMortgagePaidPercent] = useState("0");
  const [multipleProperties, setMultipleProperties] = useState(false);
  const [portfolioValue, setPortfolioValue] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("under-55");
  const [dependentCount, setDependentCount] = useState("0");

  /* result state */
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [checkedDocs, setCheckedDocs] = useState<Set<number>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [copied, setCopied] = useState(false);
  const xpAwarded = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const getShareText = useCallback(() => {
    if (!result) return "";
    const pv = parseAED(propertyValue);
    const statusText =
      result.status === "eligible"
        ? "Eligible"
        : result.status === "conditional"
          ? "Conditionally Eligible"
          : "Not Eligible";
    const conditions = result.conditions.length;
    const total = result.category?.requiredDocuments?.length ?? 0;
    const lines = [
      `Golden Visa Eligibility`,
      `---`,
      `Property Value: AED ${formatAED(pv)}`,
      `Status: ${statusText}`,
    ];
    if (result.category) {
      lines.push(`Visa Type: ${result.category.duration} ${result.category.name}`);
    }
    if (conditions > 0) {
      lines.push(`Conditions: ${conditions}`);
    }
    if (total > 0) {
      lines.push(`Documents Required: ${total}`);
    }
    lines.push(`---`);
    lines.push(`Check your eligibility at spacefield.co/tools/golden-visa-checker`);
    return lines.join("\n");
  }, [result, propertyValue]);

  const copyResults = useCallback(() => {
    navigator.clipboard.writeText(getShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getShareText]);

  const shareWhatsApp = useCallback(() => {
    const text = getShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [getShareText]);

  const canCheck = useMemo(() => {
    const v = parseAED(propertyValue);
    if (v <= 0) return false;
    if (multipleProperties && parseAED(portfolioValue) <= 0) return false;
    return true;
  }, [propertyValue, multipleProperties, portfolioValue]);

  /* effective equity (drives the verdict dial / threshold meter) */
  const effectiveValue = useMemo(() => {
    const pv = parseAED(propertyValue);
    if (multipleProperties) return parseAED(portfolioValue);
    if (hasMortgage) {
      const pct = parseInt(mortgagePaidPercent, 10) || 0;
      return pv * (pct / 100);
    }
    return pv;
  }, [propertyValue, portfolioValue, multipleProperties, hasMortgage, mortgagePaidPercent]);

  const thresholdPct = useMemo(
    () => Math.min(100, Math.round((effectiveValue / 2_000_000) * 100)),
    [effectiveValue]
  );

  const handleCheck = useCallback(() => {
    const r = checkEligibility({
      propertyValue: parseAED(propertyValue),
      portfolioValue: multipleProperties
        ? parseAED(portfolioValue)
        : parseAED(propertyValue),
      propertyStatus,
      hasMortgage,
      mortgagePaidPercent: parseInt(mortgagePaidPercent, 10) || 0,
      multipleProperties,
      ageRange,
    });
    setResult(r);
    setCheckedDocs(new Set());
    setShowResult(true);
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "golden-visa-checker").catch(() => {});
    }
    // Smooth-scroll the results into view inside the workspace window.
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [
    propertyValue,
    portfolioValue,
    propertyStatus,
    hasMortgage,
    mortgagePaidPercent,
    multipleProperties,
    ageRange,
  ]);

  const toggleDoc = (i: number) => {
    setCheckedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const numDependents = parseInt(dependentCount, 10) || 0;
  const totalVisaCost = VISA_COST_TOTAL * (1 + numDependents);

  /* verdict label & dial percent */
  const verdictLabel =
    result?.status === "eligible"
      ? "Eligible"
      : result?.status === "conditional"
        ? "Maybe"
        : "Not yet";
  const dialPct =
    result?.status === "eligible"
      ? 100
      : result?.status === "conditional"
        ? 70
        : Math.max(8, thresholdPct);

  const dialSize = isUltra ? 110 : 140;

  /* requirements checklist (live, before submit + after) */
  const requirements = useMemo(() => {
    const pct = parseInt(mortgagePaidPercent, 10) || 0;
    const equity = effectiveValue;
    return [
      {
        label: "Property worth AED 2M+ (or AED 1M+ for retirees 55+)",
        met:
          (ageRange === "55-plus" && equity >= 1_000_000) ||
          equity >= 2_000_000,
      },
      {
        label: "Property is completed and title deed issued",
        met: propertyStatus === "completed",
      },
      {
        label: hasMortgage
          ? `Mortgage paid down enough — currently ${pct}% paid`
          : "No mortgage (or mortgage equity counted toward threshold)",
        met: !hasMortgage || equity >= 2_000_000,
      },
      {
        label: "RERA-registered developer (off-plan only)",
        met: propertyStatus !== "off-plan" || true,
      },
    ];
  }, [effectiveValue, ageRange, propertyStatus, hasMortgage, mortgagePaidPercent]);

  const dialColor = "var(--tool-accent)";

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="golden-visa-checker"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className={isMobile ? "px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]" : "px-5 py-5 sm:px-6"}>
        <div
          className={
            isNarrow
              ? "grid gap-6 grid-cols-1"
              : "grid gap-6 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start"
          }
        >
          {/* ───────────── LEFT — Inputs + live checklist ───────────── */}
          <div className="space-y-6">
            {/* Visa-Track Selector */}
            <section>
              <FieldLabel sub="Most property buyers fall under Investor — switch if your case differs">
                Visa Track
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                {VISA_TRACKS.map((t) => (
                  <PillButton
                    key={t.id}
                    selected={visaTrack === t.id}
                    onClick={() => setVisaTrack(t.id)}
                    sub={t.sub}
                  >
                    {t.label}
                  </PillButton>
                ))}
              </div>
              {visaTrack !== "investor" && (
                <div className="mt-3 rounded-lg border border-app bg-app-elevated p-4 text-sm text-secondary leading-relaxed">
                  The {visaTrack === "skilled" ? "Skilled Professional" : "Specialist Talent"} track
                  is checked through your employer or sector-specific authority — this tool focuses on
                  the property-investor route. Switch to <strong className="text-app">Property Investor</strong> to score your real estate.
                </div>
              )}
            </section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className="space-y-6"
            >
              {/* property value */}
              <div>
                <FieldLabel sub="Purchase price or current valuation">
                  Property Value (AED)
                </FieldLabel>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-xs uppercase tracking-wider">
                    AED
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={propertyValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setPropertyValue(raw ? formatAED(parseInt(raw, 10)) : "");
                    }}
                    placeholder="2,000,000"
                    className={`${INPUT_CLASSES} pl-14 tabular-nums`}
                  />
                </div>
              </div>

              {/* threshold meter (live) */}
              {effectiveValue > 0 && (
                <div className="rounded-xl border border-app bg-app-elevated p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium">
                      Investment Threshold (AED 2M)
                    </span>
                    <span className="text-xs tabular-nums text-tool-accent font-semibold">
                      AED {formatAED(Math.round(effectiveValue))} / 2,000,000
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-tool-accent-soft overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${thresholdPct}%` }}
                      transition={{ duration: 0.6, ease }}
                      className="h-full bg-tool-accent"
                    />
                  </div>
                  <p className="text-[11px] text-muted mt-2">
                    {thresholdPct >= 100
                      ? "Threshold met. You qualify for the 10-year track."
                      : `${100 - thresholdPct}% short of the 10-year Golden Visa equity threshold.`}
                  </p>
                </div>
              )}

              {/* property status */}
              <div>
                <FieldLabel>Property Status</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["completed", "Completed / Ready"],
                      ["off-plan", "Off-Plan"],
                      ["under-construction", "Under Construction"],
                    ] as const
                  ).map(([val, label]) => (
                    <PillButton
                      key={val}
                      selected={propertyStatus === val}
                      onClick={() => setPropertyStatus(val)}
                    >
                      {label}
                    </PillButton>
                  ))}
                </div>
              </div>

              {/* mortgage */}
              <div>
                <FieldLabel>Mortgage on this property?</FieldLabel>
                <div className="flex gap-2">
                  <PillButton
                    selected={!hasMortgage}
                    onClick={() => setHasMortgage(false)}
                  >
                    No Mortgage
                  </PillButton>
                  <PillButton
                    selected={hasMortgage}
                    onClick={() => setHasMortgage(true)}
                  >
                    Yes, Mortgaged
                  </PillButton>
                </div>
                <AnimatePresence>
                  {hasMortgage && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4">
                        <FieldLabel sub="Only the paid-off portion counts toward the AED 2M visa threshold">
                          How much has been paid? (%)
                        </FieldLabel>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={mortgagePaidPercent}
                            onChange={(e) => setMortgagePaidPercent(e.target.value)}
                            className={`${INPUT_CLASSES} w-32 tabular-nums`}
                          />
                          <span className="text-sm text-muted">%</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* multiple properties */}
              <div>
                <FieldLabel sub="You can combine multiple properties to reach the threshold">
                  Single or multiple Dubai properties?
                </FieldLabel>
                <div className="flex gap-2">
                  <PillButton
                    selected={!multipleProperties}
                    onClick={() => setMultipleProperties(false)}
                  >
                    Single Property
                  </PillButton>
                  <PillButton
                    selected={multipleProperties}
                    onClick={() => setMultipleProperties(true)}
                  >
                    Multiple Properties
                  </PillButton>
                </div>
                <AnimatePresence>
                  {multipleProperties && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4">
                        <FieldLabel sub="Combined value of all your Dubai properties">
                          Total Portfolio Value (AED)
                        </FieldLabel>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-xs uppercase tracking-wider">
                            AED
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={portfolioValue}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, "");
                              setPortfolioValue(
                                raw ? formatAED(parseInt(raw, 10)) : ""
                              );
                            }}
                            placeholder="3,500,000"
                            className={`${INPUT_CLASSES} pl-14 tabular-nums`}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* age range */}
              <div>
                <FieldLabel sub="Applicants 55+ may qualify for the Retirement Visa">
                  Applicant Age
                </FieldLabel>
                <div className="flex gap-2">
                  <PillButton
                    selected={ageRange === "under-55"}
                    onClick={() => setAgeRange("under-55")}
                  >
                    Under 55
                  </PillButton>
                  <PillButton
                    selected={ageRange === "55-plus"}
                    onClick={() => setAgeRange("55-plus")}
                  >
                    55 or Older
                  </PillButton>
                </div>
              </div>

              {/* dependents */}
              <div>
                <FieldLabel sub="Spouse, children, and dependents to include">
                  Number of Dependents
                </FieldLabel>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={dependentCount}
                  onChange={(e) => setDependentCount(e.target.value)}
                  className={`${INPUT_CLASSES} w-32 tabular-nums`}
                />
              </div>

              {/* live requirements checklist */}
              <div className="rounded-xl border border-app bg-app-elevated p-5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium mb-4">
                  Requirements Checklist
                </p>
                <ul className="space-y-2.5">
                  {requirements.map((req, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                        req.met ? "bg-tool-accent-soft" : "bg-app"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          req.met
                            ? "bg-tool-accent text-white"
                            : "bg-app-elevated text-muted border border-app"
                        }`}
                      >
                        {req.met ? "✓" : ""}
                      </span>
                      <span className={`text-sm leading-snug ${req.met ? "text-app" : "text-muted"}`}>
                        {req.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* check CTA */}
              <motion.button
                type="button"
                onClick={handleCheck}
                disabled={!canCheck}
                whileHover={canCheck ? { scale: 1.01 } : {}}
                whileTap={canCheck ? { scale: 0.99 } : {}}
                className={`w-full py-4 rounded-xl text-sm font-semibold uppercase tracking-[0.15em] transition-all duration-200 ${
                  canCheck
                    ? "bg-tool-accent text-white hover:opacity-95 shadow-lg cursor-pointer"
                    : "bg-app-elevated text-muted border border-app cursor-not-allowed"
                }`}
              >
                {canCheck ? "Check My Eligibility" : "Enter property value to start"}
              </motion.button>
            </motion.section>
          </div>

          {/* ───────────── RIGHT — Verdict + results dashboard ───────────── */}
          <div className="space-y-6" ref={resultsRef}>
            {/* Verdict hero */}
            <section>
              <div className="relative overflow-hidden rounded-2xl border border-tool-accent/30 bg-tool-accent-soft p-6 sm:p-7">
                <div aria-hidden className="absolute inset-0 tool-hero opacity-60 pointer-events-none" />
                <div
                  className={
                    isUltra
                      ? "relative grid gap-6 grid-cols-1 items-center"
                      : "relative grid gap-6 grid-cols-[1fr_auto] items-center"
                  }
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold mb-2">
                      Eligibility Verdict
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-app tracking-tight">
                      {result ? verdictLabel : "Awaiting input"}
                    </h1>
                    <p className="text-sm text-secondary mt-2 max-w-md leading-relaxed">
                      {result
                        ? result.headline
                        : "Enter your property details — we'll score it against UAE Golden Visa thresholds in real time."}
                    </p>
                    {result?.category && (
                      <p className="text-xs text-muted mt-3">
                        {result.category.duration} · Renewable ·{" "}
                        {result.category.dependentsIncluded
                          ? "Family included"
                          : "Individual only"}
                      </p>
                    )}
                  </div>

                  {/* Dial */}
                  <div
                    className="relative mx-auto sm:mx-0"
                    style={{ width: dialSize, height: dialSize }}
                  >
                    <svg width={dialSize} height={dialSize} className="-rotate-90">
                      <circle
                        cx={dialSize / 2}
                        cy={dialSize / 2}
                        r={dialSize / 2 - 12}
                        stroke="currentColor"
                        strokeWidth="10"
                        fill="none"
                        className="text-app/30"
                      />
                      <motion.circle
                        cx={dialSize / 2}
                        cy={dialSize / 2}
                        r={dialSize / 2 - 12}
                        stroke={dialColor}
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * (dialSize / 2 - 12)}
                        initial={{ strokeDashoffset: 2 * Math.PI * (dialSize / 2 - 12) }}
                        animate={{
                          strokeDashoffset:
                            2 *
                            Math.PI *
                            (dialSize / 2 - 12) *
                            (1 - (result ? dialPct : thresholdPct) / 100),
                        }}
                        transition={{ duration: 1.0, ease }}
                        style={{ filter: "drop-shadow(0 0 10px var(--tool-accent))" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-tool-accent tabular-nums">
                        {result ? dialPct : thresholdPct}%
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted mt-1">
                        Threshold
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Results stack */}
            <AnimatePresence>
              {showResult && result && (
                <motion.section
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  transition={{ duration: 0.5, ease }}
                  className="space-y-6"
                >
                  {/* conditions / suggestions */}
                  {(result.conditions.length > 0 || result.suggestions.length > 0) && (
                    <div className="rounded-xl border border-app bg-app-elevated p-6">
                      {result.conditions.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium mb-3">
                            Conditions
                          </p>
                          <ul className="space-y-2">
                            {result.conditions.map((c, i) => (
                              <li key={i} className="text-sm text-secondary flex items-start gap-2.5 leading-relaxed">
                                <span className="text-tool-accent mt-1 text-[6px]">●</span>
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.suggestions.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium mb-3">
                            {result.status === "not-eligible" ? "What You Can Do" : "Next Steps"}
                          </p>
                          <ul className="space-y-2">
                            {result.suggestions.map((s, i) => (
                              <li key={i} className="text-sm text-secondary flex items-start gap-2.5 leading-relaxed">
                                <span className="text-tool-accent mt-0.5">→</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Apply / Share */}
                  <div className={isUltra ? "flex flex-col gap-3" : "flex flex-row gap-3"}>
                    {result.status === "eligible" && (
                      <a
                        href="https://gdrfrsd.gov.ae"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center rounded-xl bg-tool-accent px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-white hover:opacity-95 transition-opacity"
                      >
                        Apply at GDRFA →
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={copyResults}
                      className="rounded-xl border border-app bg-app-elevated px-5 py-3.5 text-xs uppercase tracking-[0.15em] text-secondary hover:border-app-strong transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={shareWhatsApp}
                      className="rounded-xl border border-tool-accent/40 bg-tool-accent-soft px-5 py-3.5 text-xs uppercase tracking-[0.15em] text-tool-accent hover:bg-tool-accent/15 transition-colors"
                    >
                      Share on WhatsApp
                    </button>
                  </div>

                  {/* total visa cost */}
                  <div className="rounded-xl border border-app bg-app-elevated p-6">
                    <h3 className="text-base font-semibold text-app mb-4">
                      Total Visa Cost Estimate
                    </h3>
                    <div className="space-y-1">
                      {VISA_COST_ITEMS.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between border-b border-app py-2.5 text-sm"
                        >
                          <span className="text-secondary">{item.label}</span>
                          <span className="text-app tabular-nums">
                            AED {formatAED(item.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-3 text-sm font-semibold">
                        <span className="text-app">Per Applicant</span>
                        <span className="text-app tabular-nums">
                          ~AED {formatAED(VISA_COST_TOTAL)}
                        </span>
                      </div>
                      {numDependents > 0 && (
                        <>
                          <div className="flex items-center justify-between pt-2 text-sm text-secondary">
                            <span>
                              Main + {numDependents} dependent{numDependents > 1 ? "s" : ""}
                            </span>
                            <span className="tabular-nums">
                              {1 + numDependents} applicants
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 text-sm font-semibold text-tool-accent">
                            <span>Total Estimated Cost</span>
                            <span className="tabular-nums">~AED {formatAED(totalVisaCost)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* processing timeline */}
                  <div className="rounded-xl border border-app bg-app-elevated p-6">
                    <h3 className="text-base font-semibold text-app mb-5">
                      Processing Timeline
                    </h3>
                    <div className="flex items-start gap-0">
                      {TIMELINE_STEPS.map((step, i) => (
                        <div key={step.label} className="flex-1 relative">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-tool-accent relative z-10" />
                            {i < TIMELINE_STEPS.length - 1 && (
                              <div className="absolute top-1.5 left-[calc(50%+6px)] right-0 h-px bg-app w-[calc(100%-6px)]" />
                            )}
                            <p className="mt-3 text-xs font-medium text-app text-center">
                              {step.label}
                            </p>
                            <p className="mt-1 text-[10px] text-muted text-center">
                              {step.duration}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 text-xs text-muted text-center">
                      Total estimated processing time: 2-4 weeks
                    </p>
                  </div>

                  {/* documents checklist */}
                  {result.category && (
                    <div className="rounded-xl border border-app bg-app-elevated p-6">
                      <h3 className="text-base font-semibold text-app mb-1">
                        Required Documents
                      </h3>
                      <p className="text-xs text-muted mb-4">
                        Tick documents as you prepare them
                      </p>
                      <ul className="space-y-1">
                        {result.category.requiredDocuments.map((doc, i) => {
                          const checked = checkedDocs.has(i);
                          return (
                            <li
                              key={i}
                              className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                                checked ? "bg-tool-accent-soft" : "hover:bg-app"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleDoc(i)}
                                className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all text-xs ${
                                  checked
                                    ? "bg-tool-accent border-tool-accent text-white"
                                    : "border-app bg-app text-transparent hover:border-tool-accent/50"
                                }`}
                              >
                                ✓
                              </button>
                              <span
                                className={`text-sm transition-all leading-snug ${
                                  checked ? "text-muted line-through" : "text-app"
                                }`}
                              >
                                {doc}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-4 text-xs text-muted">
                        {checkedDocs.size} of {result.category.requiredDocuments.length} ready
                      </div>
                    </div>
                  )}

                  {/* fees & timeline */}
                  {result.category && (
                    <div
                      className="grid gap-4"
                      style={{
                        gridTemplateColumns: isUltra
                          ? "1fr"
                          : "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      <div className="rounded-xl border border-app bg-app-elevated p-5">
                        <h3 className="text-sm font-semibold text-app mb-2">Government Fees</h3>
                        <p className="text-sm text-secondary leading-relaxed">
                          {result.category.governmentFees}
                        </p>
                      </div>
                      <div className="rounded-xl border border-app bg-app-elevated p-5">
                        <h3 className="text-sm font-semibold text-app mb-2">Processing Time</h3>
                        <p className="text-sm text-secondary leading-relaxed">
                          {result.category.processingTime}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* key benefits */}
                  {result.category && (
                    <div className="rounded-xl border border-app bg-app-elevated p-6">
                      <h3 className="text-base font-semibold text-app mb-4">Key Benefits</h3>
                      <ul
                        className="grid gap-2.5"
                        style={{
                          gridTemplateColumns: isUltra
                            ? "1fr"
                            : "repeat(2, minmax(0, 1fr))",
                        }}
                      >
                        {result.category.keyBenefits.map((b, i) => (
                          <li key={i} className="text-sm text-secondary flex items-start gap-2.5 leading-relaxed">
                            <span className="text-tool-accent mt-1 text-[6px]">●</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* dependents */}
                  {result.category && result.category.dependentsIncluded && (
                    <div className="rounded-xl border border-app bg-app-elevated p-5">
                      <h3 className="text-sm font-semibold text-app mb-2">Family Sponsorship</h3>
                      <p className="text-sm text-secondary leading-relaxed">
                        {result.category.dependentsNote}
                      </p>
                    </div>
                  )}

                  {/* mortgage note */}
                  {result.category && hasMortgage && (
                    <div className="rounded-xl border border-app bg-app-elevated p-5">
                      <h3 className="text-sm font-semibold text-app mb-2">Mortgage Information</h3>
                      <p className="text-sm text-secondary leading-relaxed">
                        {result.category.mortgageNote}
                      </p>
                    </div>
                  )}

                  {/* Cross-tool jumps via openApp */}
                  <div className="rounded-xl border border-app bg-app-elevated p-5">
                    <h3 className="text-sm font-semibold text-app mb-3">Explore More Tools</h3>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => openApp("deal-scoring")}
                        className="w-full flex items-center justify-between min-h-[44px] py-3 px-1 text-sm text-secondary hover:text-tool-accent transition-colors text-left"
                      >
                        <span>Find properties that qualify — Deal Scoring with AED 2M+ filter</span>
                        <span className="text-tool-accent">→</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openApp("affordability")}
                        className="w-full flex items-center justify-between min-h-[44px] py-3 px-1 text-sm text-secondary hover:text-tool-accent transition-colors border-t border-app text-left"
                      >
                        <span>Check if you can afford a qualifying property</span>
                        <span className="text-tool-accent">→</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openApp("due-diligence")}
                        className="w-full flex items-center justify-between min-h-[44px] py-3 px-1 text-sm text-secondary hover:text-tool-accent transition-colors border-t border-app text-left"
                      >
                        <span>Run the full due diligence checklist before buying</span>
                        <span className="text-tool-accent">→</span>
                      </button>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ───── visa categories reference ───── */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-app mb-2">
            Understanding the Golden Visa
          </h2>
          <p className="text-sm text-muted mb-6">
            UAE property investor visa categories for real estate owners
          </p>

          <div className="space-y-4">
            {visaCategories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border border-app bg-app-elevated p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h3 className="text-base font-semibold text-app">{cat.name}</h3>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-tool-accent-soft text-tool-accent whitespace-nowrap font-medium">
                    {cat.duration}
                  </span>
                </div>
                <p className="text-sm text-secondary leading-relaxed mb-4">
                  {cat.description}
                </p>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: isUltra
                      ? "repeat(2, minmax(0, 1fr))"
                      : "repeat(4, minmax(0, 1fr))",
                  }}
                >
                  <div className="rounded-lg bg-app p-3 border border-app">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Min. Value</div>
                    <div className="text-sm font-medium text-app tabular-nums">
                      AED {formatAED(cat.minPropertyValue)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-app p-3 border border-app">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Mortgage</div>
                    <div className="text-sm font-medium text-app">
                      {cat.mortgageAllowed ? "Allowed" : "Not Allowed"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-app p-3 border border-app">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Multi-Property</div>
                    <div className="text-sm font-medium text-app">
                      {cat.multipleProperties ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-app p-3 border border-app">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Family</div>
                    <div className="text-sm font-medium text-app">
                      {cat.dependentsIncluded ? "Included" : "No"}
                    </div>
                  </div>
                </div>

                {cat.restrictions.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
                      Important Notes
                    </h4>
                    <ul className="space-y-1">
                      {cat.restrictions.map((r, i) => (
                        <li
                          key={i}
                          className="text-xs text-secondary flex items-start gap-2 leading-relaxed"
                        >
                          <span className="text-tool-accent mt-1 text-[6px]">●</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ───── FAQ ───── */}
        <section className="mt-10">
          <h2 className="text-xl font-bold text-app mb-2">Frequently Asked Questions</h2>
          <p className="text-sm text-muted mb-6">
            Common questions about the UAE Golden Visa for property investors
          </p>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </section>

        {/* ───── disclaimer ───── */}
        <div className="mt-10 p-5 rounded-xl border border-app bg-app-elevated">
          <p className="text-xs text-secondary leading-relaxed">
            <strong className="text-tool-accent">Disclaimer:</strong> This tool provides
            general guidance based on publicly available information about UAE Golden Visa
            requirements as of {DATA_UPDATED}. Rules and fees may change. This is not legal
            advice. For an official assessment, consult the{" "}
            <a
              href="https://gdrfrsd.gov.ae"
              target="_blank"
              rel="noopener noreferrer"
              className="text-tool-accent hover:underline"
            >
              General Directorate of Residency and Foreigners Affairs (GDRFA)
            </a>{" "}
            or an authorized typing center in the UAE.
          </p>
        </div>

        <div className="mt-4 mb-2 text-center text-xs text-muted">
          Data last updated: {DATA_UPDATED}
        </div>
      </div>
    </div>
  );
}
