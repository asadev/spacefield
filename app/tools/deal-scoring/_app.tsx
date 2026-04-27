"use client";

/**
 * Deal Scoring Engine — native workspace app.
 *
 * This is the inside-the-Window variant of `/tools/deal-scoring`. The
 * stand-alone page (page.tsx) keeps existing for direct visits / SEO /
 * sharing. This file is mounted by the desktop's Window component when
 * the user opens the tool from the workspace.
 *
 * Differences vs page.tsx:
 *   - No <AuthGate> (workspace handles auth at the shell level).
 *   - No frame=1 / macOS chrome (Window provides it).
 *   - No PageHeader / "All Tools" back-link (workspace dock handles discovery).
 *   - No <ToolRecommendations> (dock provides discovery).
 *   - Cross-tool jumps go through props.openApp(slug, params).
 *   - Layout collapses to single column when width < 720.
 */

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import ExportButton from "@/components/ExportButton";
import type { NativeAppProps } from "@/app/tools/_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type Status = "ready" | "offplan";
type Tier = "tier1" | "tier2" | "other";
type Location = "prime" | "emerging" | "secondary";

interface Inputs {
  price: string;
  sqft: string;
  annualRent: string;
  areaAvgPsf: string;
  status: Status;
  developer: Tier;
  location: Location;
}

interface ScoreBreakdown {
  yieldScore: number;
  valuationScore: number;
  riskScore: number;
  total: number;
  label: "Undervalued" | "Fair" | "Overpriced";
  grossYield: number;
  pricePsf: number;
  priceVsAreaPct: number;
  insights: string[];
}

const DUBAI_AVG_YIELD = 6.2;

const AREA_PRESETS: { name: string; psf: number }[] = [
  { name: "Downtown Dubai", psf: 2800 },
  { name: "Dubai Marina", psf: 2200 },
  { name: "Palm Jumeirah", psf: 3500 },
  { name: "JBR", psf: 2400 },
  { name: "Business Bay", psf: 2000 },
  { name: "JVC", psf: 1100 },
  { name: "JLT", psf: 1400 },
  { name: "Dubai Hills Estate", psf: 2300 },
  { name: "Arabian Ranches", psf: 1500 },
  { name: "Dubai Creek Harbour", psf: 2100 },
  { name: "MBR City", psf: 1800 },
  { name: "DAMAC Hills", psf: 1200 },
  { name: "Dubai Silicon Oasis", psf: 900 },
  { name: "Sports City", psf: 850 },
  { name: "Motor City", psf: 1000 },
  { name: "Discovery Gardens", psf: 700 },
  { name: "International City", psf: 600 },
  { name: "Al Furjan", psf: 1300 },
  { name: "Town Square", psf: 950 },
  { name: "Mirdif", psf: 1100 },
  { name: "Jumeirah Village Triangle", psf: 1050 },
  { name: "Dubai South", psf: 800 },
  { name: "Arjan", psf: 1050 },
  { name: "Dubailand", psf: 900 },
  { name: "Al Barsha", psf: 1400 },
  { name: "Remraam", psf: 850 },
  { name: "Mudon", psf: 1200 },
  { name: "Tilal Al Ghaf", psf: 2000 },
  { name: "Emaar Beachfront", psf: 3200 },
  { name: "Dubai Harbour", psf: 3000 },
  { name: "Bluewaters", psf: 3400 },
  { name: "City Walk", psf: 2800 },
  { name: "La Mer", psf: 2600 },
  { name: "DIFC", psf: 3100 },
  { name: "Al Sufouh", psf: 1800 },
  { name: "Green Community", psf: 1100 },
  { name: "Sobha Hartland", psf: 2200 },
  { name: "Yas Island", psf: 1600 },
  { name: "Saadiyat Island", psf: 2100 },
  { name: "Mohammed Bin Rashid Al Maktoum City", psf: 1900 },
];

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function computeScore(i: Inputs): ScoreBreakdown | null {
  const price = Number(i.price);
  const sqft = Number(i.sqft);
  const rent = Number(i.annualRent);
  const areaAvg = Number(i.areaAvgPsf);
  if (!price || !sqft || !rent || !areaAvg) return null;

  const grossYield = (rent / price) * 100;
  const pricePsf = price / sqft;
  const priceVsAreaPct = ((areaAvg - pricePsf) / areaAvg) * 100;

  let yieldScore = 0;
  if (grossYield <= 3) yieldScore = 0;
  else if (grossYield <= 4) yieldScore = 5 + (grossYield - 3) * 5;
  else if (grossYield <= 6) yieldScore = 10 + (grossYield - 4) * 7.5;
  else if (grossYield <= 8) yieldScore = 25 + (grossYield - 6) * 7.5;
  else yieldScore = 40;
  yieldScore = Math.max(0, Math.min(40, yieldScore));

  let valuationScore = 20 + priceVsAreaPct;
  valuationScore = Math.max(0, Math.min(40, valuationScore));

  let risk = 20;
  if (i.status === "offplan") risk -= 6;
  if (i.developer === "tier2") risk -= 3;
  if (i.developer === "other") risk -= 6;
  if (i.location === "emerging") risk -= 3;
  if (i.location === "secondary") risk -= 6;
  risk = Math.max(0, Math.min(20, risk));

  const total = Math.round(yieldScore + valuationScore + risk);
  const label: ScoreBreakdown["label"] =
    total >= 70 ? "Undervalued" : total >= 40 ? "Fair" : "Overpriced";

  const insights: string[] = [];
  const yieldDelta = grossYield - DUBAI_AVG_YIELD;
  if (yieldDelta >= 1)
    insights.push(
      `Gross yield of ${grossYield.toFixed(1)}% is materially above the Dubai average (~${DUBAI_AVG_YIELD}%). Strong income profile.`
    );
  else if (yieldDelta >= -0.5)
    insights.push(
      `Gross yield of ${grossYield.toFixed(1)}% is in line with the Dubai average (~${DUBAI_AVG_YIELD}%).`
    );
  else
    insights.push(
      `Gross yield of ${grossYield.toFixed(1)}% is below the Dubai average (~${DUBAI_AVG_YIELD}%). Rental upside is limited unless appreciation carries the return.`
    );

  if (priceVsAreaPct >= 10)
    insights.push(
      `Price per sqft of AED ${Math.round(pricePsf).toLocaleString()} is ${priceVsAreaPct.toFixed(0)}% below the area average. Potentially a genuine discount — verify condition and floor/view.`
    );
  else if (priceVsAreaPct >= -5)
    insights.push(
      `Price per sqft of AED ${Math.round(pricePsf).toLocaleString()} is close to the area average. Fairly priced on fundamentals.`
    );
  else
    insights.push(
      `Price per sqft of AED ${Math.round(pricePsf).toLocaleString()} is ${Math.abs(priceVsAreaPct).toFixed(0)}% above the area average. Only worth it if view, floor, or upgrades justify the premium.`
    );

  const riskNotes: string[] = [];
  if (i.status === "offplan") riskNotes.push("off-plan delivery risk");
  if (i.developer === "tier2") riskNotes.push("mid-tier developer");
  if (i.developer === "other") riskNotes.push("unproven developer");
  if (i.location === "emerging") riskNotes.push("emerging area");
  if (i.location === "secondary") riskNotes.push("secondary area");
  if (riskNotes.length === 0)
    insights.push(
      "Risk profile is low — ready unit, top-tier developer, prime location. Exit liquidity should be strong."
    );
  else
    insights.push(
      `Risk factors: ${riskNotes.join(", ")}. Discount these into your offer or target a higher projected return to compensate.`
    );

  if (label === "Undervalued")
    insights.push(
      "Verdict: the numbers point to a genuine deal. Move quickly — but complete physical inspection and title checks before committing."
    );
  else if (label === "Fair")
    insights.push(
      "Verdict: fairly priced. Negotiate on furniture, service charge credit, or closing costs rather than headline price."
    );
  else
    insights.push(
      "Verdict: overpriced on fundamentals. Either walk away or anchor your offer 8–15% below asking with a short validity window."
    );

  return {
    yieldScore,
    valuationScore,
    riskScore: risk,
    total,
    label,
    grossYield,
    pricePsf,
    priceVsAreaPct,
    insights,
  };
}

interface NegotiationTier {
  title: string;
  strategy: string;
  tactics: string[];
}

function getNegotiationPlaybook(score: number): NegotiationTier {
  if (score >= 70) {
    return {
      title: "Strong Buy — Move Fast",
      strategy:
        "This deal won't last. Offer asking price or 1-2% below max.",
      tactics: [
        "Submit your offer within 24 hours with proof of funds attached.",
        "Offer a fast closing timeline (2-3 weeks) to beat competing offers.",
        "Don't haggle on minor inclusions — lock the deal on price first.",
        "If multiple bidders, consider a slight premium for a clean, unconditional offer.",
        "Get your mortgage pre-approval letter ready before making the call.",
      ],
    };
  }
  if (score >= 50) {
    return {
      title: "Negotiate — Room to Manoeuvre",
      strategy:
        "Room to negotiate. Target 5-8% below asking. Lead with comparable sales data.",
      tactics: [
        "Pull 3-5 recent comparable transactions from DLD and present them in your offer.",
        "Ask the agent how long the property has been listed — longer listing = more leverage.",
        "Request service charge history to identify hidden costs you can use as negotiation points.",
        "Offer a quick close in exchange for a price reduction — sellers value certainty.",
        "Propose splitting the agency commission or ask the seller to cover DLD fees.",
        "If the seller counters, hold firm for at least one round before moving up.",
      ],
    };
  }
  if (score >= 30) {
    return {
      title: "Heavy Discount Needed",
      strategy:
        "Significant discount needed. Anchor at 10-15% below asking. Be willing to walk.",
      tactics: [
        "Open at 12-15% below asking — the seller expects a counter, so anchor low.",
        "Present your ROI analysis showing why the asking price doesn't work at current yields.",
        "Ask about the seller's motivation — divorce, visa expiry, and debt distress create urgency.",
        "Set a walk-away number before you negotiate and don't cross it.",
        "Offer a longer closing timeline if the seller needs time — flexibility is a concession too.",
        "If the seller won't budge, move on. There's always another unit in Dubai.",
      ],
    };
  }
  return {
    title: "Hard Pass",
    strategy:
      "Hard pass unless seller drops 15%+. Your money works harder elsewhere.",
    tactics: [
      "Don't even submit an offer unless you can verify the seller is in distress or highly motivated.",
      "If you must offer, go in at 18-20% below asking with a 48-hour expiry.",
      "Compare the yield to a Dubai bank deposit or REITs — if those beat it, walk.",
      "Look at neighbouring towers or communities where the same budget gets a better deal.",
      "Consider this a data point, not an opportunity. Bookmark it and revisit in 3 months if it's still listed.",
    ],
  };
}

/* ───── Score Dial ───── */
function ScoreDial({ score, label, size = 260 }: { score: number; label: ScoreBreakdown["label"]; size?: number }) {
  const stroke = Math.max(8, Math.round(size * 0.054));
  const radius = (size / 2) - stroke;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 100;
  const offset = circumference * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = Math.round(size * 0.27);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ height: size, width: size, maxWidth: "100%" }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted/20"
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease }}
          className="text-tool-accent"
          style={{ filter: "drop-shadow(0 0 14px var(--tool-accent))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.5, ease }}
          className="font-semibold tracking-tight tabular-nums text-tool-accent"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
        >
          {score}
        </motion.div>
        <div className="mt-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted">
          {label} · out of 100
        </div>
      </div>
    </div>
  );
}

/* ───── Mini gauge ───── */
function MiniGauge({
  label,
  value,
  max,
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = 42;
  const circ = Math.PI * radius;
  const offset = circ * (1 - pct);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className="bg-app-elevated rounded-xl border border-app p-4 transition-colors"
    >
      <div className="flex items-center gap-3">
        <svg width="64" height="38" viewBox="0 0 100 55" className="flex-shrink-0">
          <path
            d="M 8 50 A 42 42 0 0 1 92 50"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            className="text-muted/20"
          />
          <motion.path
            d="M 8 50 A 42 42 0 0 1 92 50"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, delay: delay + 0.2, ease }}
            className="text-tool-accent"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            {label}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-tool-accent">
            {Math.round(value)}
            <span className="text-xs text-muted">
              /{max}
            </span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ───── Area Preset Dropdown ───── */
function AreaPresetDropdown({
  onSelect,
}: {
  onSelect: (psf: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return AREA_PRESETS;
    return AREA_PRESETS.filter((a) => fuzzyMatch(query.trim(), a.name));
  }, [query]);

  return (
    <div ref={ref} className="relative mb-3">
      <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        Quick Select — Dubai Area
      </label>
      <input
        type="text"
        placeholder="Search area (e.g. Marina, JVC, Palm)..."
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="w-full rounded-lg border border-app bg-app-elevated px-4 py-3 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 focus:ring-tool-accent"
      />
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-app bg-app-elevated shadow-xl"
          >
            {filtered.map((area) => (
              <button
                key={area.name}
                type="button"
                onClick={() => {
                  onSelect(area.psf);
                  setQuery(area.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-tool-accent-soft"
              >
                <span className="text-app">{area.name}</span>
                <span className="text-xs text-muted">
                  AED {area.psf.toLocaleString()}/sqft
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-app bg-app-elevated px-4 py-3 text-xs text-muted">
          No matching areas. Enter PSF manually below.
        </div>
      )}
    </div>
  );
}

export default function DealScoringApp(props: NativeAppProps) {
  const { width } = props;
  // Single column when the window is narrow — same threshold the prompt called for.
  const isMobile = width < 700;
  const isNarrow = width < 720 || isMobile;
  const isUltra = width < 500;
  const dialSize = isUltra ? 180 : isNarrow ? 220 : 260;

  const [inputs, setInputs] = useState<Inputs>({
    price: "",
    sqft: "",
    annualRent: "",
    areaAvgPsf: "",
    status: "ready",
    developer: "tier1",
    location: "prime",
  });
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const xpAwarded = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const update = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    if (showResults) setShowResults(false);
  };

  const result = useMemo(
    () => (showResults ? computeScore(inputs) : null),
    [inputs, showResults]
  );

  const playbook = useMemo(
    () => (result ? getNegotiationPlaybook(result.total) : null),
    [result]
  );

  const getShareText = useCallback(() => {
    if (!result) return "";
    const verdictMap: Record<string, string> = {
      Undervalued: "Strong Buy",
      Fair: "Hold",
      Overpriced: "Avoid",
    };
    const lines = [
      `Deal Score: ${result.total}/100`,
      `---`,
      `Asking Price: AED ${Number(inputs.price).toLocaleString()}`,
      `Score Breakdown:`,
      `- Yield Score: ${Math.round(result.yieldScore)}/40`,
      `- Valuation Score: ${Math.round(result.valuationScore)}/40`,
      `- Risk Score: ${Math.round(result.riskScore)}/20`,
      `Verdict: ${verdictMap[result.label] || result.label}`,
      `---`,
      `Score your deals at example.com/tools/deal-scoring`,
    ];
    return lines.join("\n");
  }, [result, inputs.price]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResults(true);
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "deal-scoring").catch(() => {});
    }
  };

  const fields: { key: keyof Inputs; label: string; placeholder: string }[] = [
    { key: "price", label: "Asking Price (AED)", placeholder: "e.g. 2500000" },
    { key: "sqft", label: "Built-up Area (sqft)", placeholder: "e.g. 1200" },
    {
      key: "annualRent",
      label: "Expected Annual Rent (AED)",
      placeholder: "e.g. 150000",
    },
    {
      key: "areaAvgPsf",
      label: "Area Avg Price (AED/sqft)",
      placeholder: "e.g. 2100",
    },
  ];

  const verdictMeta = (l: ScoreBreakdown["label"]) =>
    l === "Undervalued"
      ? {
          tag: "STEAL",
          copy: "Numbers back the deal. Move fast — but verify.",
        }
      : l === "Fair"
        ? {
            tag: "FAIR",
            copy: "Priced in line with fundamentals. Negotiate on extras.",
          }
        : {
            tag: "OVERPRICED",
            copy: "Numbers don't work. Anchor low or walk.",
          };

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="deal-scoring"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className={`${isMobile ? "px-4 py-4 pb-28" : "px-5 py-5 sm:px-6"}`}>
        <form
          onSubmit={handleSubmit}
          className={
            isNarrow
              ? "grid gap-5 grid-cols-1"
              : "grid gap-5 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
          }
        >
          {/* LEFT — INPUT PANEL */}
          <div className="space-y-5">
            <div className="bg-app-elevated rounded-xl border border-app p-5 transition-colors">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                  Listing Details
                </p>
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  ● input
                </span>
              </div>
              <div className="space-y-3">
                {fields.map((f) =>
                  f.key === "areaAvgPsf" ? (
                    <div key={f.key}>
                      <AreaPresetDropdown
                        onSelect={(psf) =>
                          update(
                            "areaAvgPsf",
                            String(psf) as Inputs[keyof Inputs]
                          )
                        }
                      />
                      <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                        {f.label}
                      </label>
                      <input
                        type="number"
                        required
                        placeholder={f.placeholder}
                        value={inputs[f.key] as string}
                        onChange={(e) =>
                          update(
                            f.key,
                            e.target.value as Inputs[keyof Inputs]
                          )
                        }
                        className="w-full rounded-lg border border-app bg-app px-4 py-3 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 focus:ring-tool-accent"
                      />
                    </div>
                  ) : (
                    <div key={f.key}>
                      <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                        {f.label}
                      </label>
                      <input
                        type="number"
                        required
                        placeholder={f.placeholder}
                        value={inputs[f.key] as string}
                        onChange={(e) =>
                          update(
                            f.key,
                            e.target.value as Inputs[keyof Inputs]
                          )
                        }
                        className="w-full rounded-lg border border-app bg-app px-4 py-3 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 focus:ring-tool-accent"
                      />
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="bg-app-elevated rounded-xl border border-app p-5 transition-colors">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                  Risk Profile
                </p>
                <span className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  ● modifiers
                </span>
              </div>
              <div className="space-y-4">
                <SegmentGroup
                  label="Property Status"
                  options={[
                    { value: "ready", label: "Ready" },
                    { value: "offplan", label: "Off-plan" },
                  ]}
                  value={inputs.status}
                  onChange={(v) => update("status", v as Status)}
                />
                <SegmentGroup
                  label="Developer Tier"
                  options={[
                    { value: "tier1", label: "Tier 1" },
                    { value: "tier2", label: "Tier 2" },
                    { value: "other", label: "Other" },
                  ]}
                  value={inputs.developer}
                  onChange={(v) => update("developer", v as Tier)}
                />
                <SegmentGroup
                  label="Location Tier"
                  options={[
                    { value: "prime", label: "Prime" },
                    { value: "emerging", label: "Emerging" },
                    { value: "secondary", label: "Secondary" },
                  ]}
                  value={inputs.location}
                  onChange={(v) => update("location", v as Location)}
                />
              </div>
            </div>

            <button
              type="submit"
              className={`group relative w-full overflow-hidden rounded-lg border border-tool-accent/40 bg-tool-accent text-[0.75rem] font-medium uppercase tracking-[0.2em] text-white shadow-lg transition-all duration-300 hover:opacity-95 hover:shadow-xl ${isMobile ? "fixed left-0 right-0 bottom-0 z-30 rounded-none border-0 px-7 py-4 pb-[max(env(safe-area-inset-bottom),16px)] min-h-[56px]" : "px-7 py-4"}`}
            >
              <span className="relative z-10">Run Score Analysis →</span>
            </button>
          </div>

          {/* RIGHT — DASHBOARD */}
          <div className="space-y-5">
            <AnimatePresence mode="wait">
              {showResults && result && playbook ? (
                <motion.div
                  key="results"
                  ref={resultsRef}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease }}
                  className="space-y-5"
                >
                  {/* Score dial card */}
                  <div className="bg-app-elevated relative overflow-hidden rounded-xl border border-app p-6 transition-colors">
                    <div className="pointer-events-none absolute inset-0 tool-hero opacity-60" />
                    <div className="relative">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                          Certified Verdict
                        </p>
                        <ExportButton
                          targetRef={resultsRef}
                          filename="deal-scoring-results"
                        />
                      </div>
                      <ScoreDial score={result.total} label={result.label} size={dialSize} />

                      {/* Verdict banner */}
                      {(() => {
                        const v = verdictMeta(result.label);
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7, duration: 0.4 }}
                            className="mt-2 rounded-lg border border-tool-accent/30 bg-tool-accent-soft p-4"
                          >
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-tool-accent animate-pulse" />
                              <span className="text-xs font-bold uppercase tracking-[0.25em] text-tool-accent">
                                {v.tag}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm font-medium text-tool-accent">
                              {v.copy}
                            </p>
                          </motion.div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Sub-scores — collapses by width, not viewport */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: isUltra
                        ? "1fr"
                        : "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <MiniGauge
                      label="Yield"
                      value={result.yieldScore}
                      max={40}
                      delay={0.1}
                    />
                    <MiniGauge
                      label="Valuation"
                      value={result.valuationScore}
                      max={40}
                      delay={0.2}
                    />
                    <MiniGauge
                      label="Risk Cover"
                      value={result.riskScore}
                      max={20}
                      delay={0.3}
                    />
                  </div>

                  {/* Key metrics — collapses by width, not viewport */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: isUltra
                        ? "1fr"
                        : "repeat(3, minmax(0, 1fr))",
                    }}
                  >
                    <MetricCell
                      label="Gross Yield"
                      value={`${result.grossYield.toFixed(2)}%`}
                      positive={result.grossYield >= DUBAI_AVG_YIELD}
                    />
                    <MetricCell
                      label="Price / sqft"
                      value={`AED ${Math.round(result.pricePsf).toLocaleString()}`}
                    />
                    <MetricCell
                      label="vs Area Avg"
                      value={`${Math.abs(result.priceVsAreaPct).toFixed(1)}% ${result.priceVsAreaPct >= 0 ? "below" : "above"}`}
                      positive={result.priceVsAreaPct >= 0}
                    />
                  </div>

                  {/* Analyst memo */}
                  <div className="bg-app-elevated rounded-xl border border-app p-5 transition-colors">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-1 w-6 bg-tool-accent" />
                      <p className="text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                        Analyst Memo
                      </p>
                    </div>
                    <ul className="space-y-3">
                      {result.insights.map((text, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.08 }}
                          className="flex gap-3 text-sm leading-relaxed text-secondary"
                        >
                          <span className="mt-2 block h-px w-4 flex-shrink-0 bg-tool-accent" />
                          {text}
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  {/* Playbook */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, ease }}
                    className="bg-app-elevated rounded-xl border border-app p-5 transition-colors"
                  >
                    <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                      Negotiation Strategy
                    </p>
                    <p className="mt-1 text-lg font-semibold text-app">
                      {playbook.title}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-secondary">
                      {playbook.strategy}
                    </p>
                    <p className="mt-4 mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                      Tactics
                    </p>
                    <ul className="space-y-2.5">
                      {playbook.tactics.map((tactic, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + i * 0.06 }}
                          className="flex gap-3 text-sm leading-relaxed text-secondary"
                        >
                          <span className="mt-2 block h-px w-4 flex-shrink-0 bg-tool-accent/50" />
                          {tactic}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>

                  {/* Share */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={copyResults}
                      className="rounded-lg border border-app bg-app-elevated px-4 py-2.5 text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-all hover:border-tool-accent hover:text-tool-accent"
                    >
                      {copied ? "Copied!" : "Copy Report"}
                    </button>
                    <button
                      type="button"
                      onClick={shareWhatsApp}
                      className="rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-4 py-2.5 text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-all hover:bg-tool-accent hover:text-white"
                    >
                      Share via WhatsApp
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-app-elevated flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-app p-6 text-center transition-colors"
                >
                  <div
                    className="relative mb-6 flex items-center justify-center"
                    style={{ height: isUltra ? 120 : 180, width: isUltra ? 120 : 180, maxWidth: "100%" }}
                  >
                    <svg
                      width={isUltra ? 120 : 180}
                      height={isUltra ? 120 : 180}
                      className="-rotate-90 opacity-40"
                    >
                      <circle
                        cx={isUltra ? 60 : 90}
                        cy={isUltra ? 60 : 90}
                        r={isUltra ? 50 : 75}
                        stroke="currentColor"
                        strokeWidth="10"
                        fill="none"
                        strokeDasharray="4 8"
                        className="text-tool-accent"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-5xl font-semibold tracking-tight text-muted">
                        —
                      </p>
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-muted">
                        awaiting input
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-app">
                    Feed the listing. Get the verdict.
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-muted">
                    Fill every field on the left, then run the analysis. The
                    dial fills, the memo writes itself.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="bg-app-elevated rounded-xl border border-app p-4 transition-colors"
    >
      <p className="text-[0.55rem] uppercase tracking-[0.25em] text-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 text-base font-semibold tabular-nums ${
          positive === undefined
            ? "text-app"
            : positive
              ? "text-tool-accent"
              : "text-secondary"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}

function SegmentGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </label>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`min-w-0 rounded-lg border px-2 py-2.5 text-[0.65rem] uppercase tracking-[0.12em] truncate transition-all ${
              value === o.value
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-app"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
