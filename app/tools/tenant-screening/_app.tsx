"use client";

/* Tenant Screening Score — native window app.
 *
 * Same data and feature set as the route page but stripped of all the
 * marketing chrome: no AuthGate, no PageHeader, no frame=1 detection, no
 * macOS-style page wrapper, no back-links, no ToolRecommendations. Pure
 * tool surface, sized to the window's width/height.
 *
 * Layout adapts off `width` (desktop window inner width):
 *   ≥ 1100 → 3-col input strip + 2-col cards
 *   ≥ 820  → 2-col cards
 *   <  820 → single column everywhere
 *
 * All colors come from foundation tokens — bg-app, bg-app-elevated,
 * border-app, text-app/secondary/muted, tool-accent variants. The
 * data-tool-theme="research" attribute scopes the amber accent.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NativeAppProps } from "../_data/tools-list";
import {
  AREA_RENTAL_DATA,
  SCORING_WEIGHTS,
  type AreaRentalProfile,
} from "@/lib/tenant-screening-data";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type PropertyType = "Studio" | "1BR" | "2BR" | "3BR";
type SortKey = "score" | "area" | "demandScore" | "vacancyRate" | "riskLevel";
type Verdict = "Approve" | "Review" | "Decline";

/* ───── tone read off the window's resolved theme ───── */
function toneFor(resolved: "dark" | "light"): string {
  return resolved === "light" ? "15,23,42" : "255,255,255";
}

/* ───── Score Calculation ───── */
function calculateScreeningScore(area: AreaRentalProfile): number {
  const demandNorm = area.demandScore;
  const vacancyNorm = Math.max(0, 100 - area.vacancyRate * 10);
  const leaseSpeedNorm = Math.max(0, 100 - (area.avgDaysToLease / 30) * 100);
  const growthNorm = Math.min(100, area.yoyRentChange * 5);
  const retentionNorm = area.renewalRate;
  const riskNorm =
    area.riskLevel === "low" ? 100 : area.riskLevel === "medium" ? 50 : 10;

  const score =
    demandNorm * SCORING_WEIGHTS.demandScore +
    vacancyNorm * SCORING_WEIGHTS.vacancyRate +
    leaseSpeedNorm * SCORING_WEIGHTS.daysToLease +
    growthNorm * SCORING_WEIGHTS.yoyRentChange +
    retentionNorm * SCORING_WEIGHTS.renewalRate +
    riskNorm * SCORING_WEIGHTS.riskLevel;

  return Math.round(Math.min(100, Math.max(0, score)));
}

function getScoreFactors(area: AreaRentalProfile) {
  return {
    demand: area.demandScore,
    vacancy: Math.max(0, 100 - area.vacancyRate * 10),
    leasingSpeed: Math.max(0, 100 - (area.avgDaysToLease / 30) * 100),
    rentGrowth: Math.min(100, area.yoyRentChange * 5),
    retention: area.renewalRate,
  };
}

function getRentForType(area: AreaRentalProfile, type: PropertyType): number {
  switch (type) {
    case "Studio":
      return area.avgRentStudio;
    case "1BR":
      return area.avgRent1BR;
    case "2BR":
      return area.avgRent2BR;
    case "3BR":
      return area.avgRent3BR;
  }
}

function formatAED(n: number): string {
  return `AED ${n.toLocaleString()}`;
}

function getVerdict(score: number): { verdict: Verdict; copy: string } {
  if (score >= 70)
    return {
      verdict: "Approve",
      copy: "Strong area signals. Lease confidently — vacancy risk is low and renewal odds are high.",
    };
  if (score >= 45)
    return {
      verdict: "Review",
      copy: "Mixed signals. Tighten reference checks and consider a guarantor before signing.",
    };
  return {
    verdict: "Decline",
    copy: "Weak fundamentals. Either pivot to a different unit, drop asking rent, or pass.",
  };
}

/* ───── Demand Dial (canvas) — keeps amber accent ───── */
function DemandDial({ score, tone }: { score: number; tone: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 88;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const range = endAngle - startAngle;

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = `rgba(${tone},0.10)`;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.stroke();

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const a = startAngle + (i / 10) * range;
      const x1 = cx + Math.cos(a) * (radius - 22);
      const y1 = cy + Math.sin(a) * (radius - 22);
      const x2 = cx + Math.cos(a) * (radius - 16);
      const y2 = cy + Math.sin(a) * (radius - 16);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${tone},0.25)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Progress arc
    const scoreAngle = startAngle + (score / 100) * range;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "rgba(251, 191, 36, 1)");
    grad.addColorStop(1, "rgba(245, 158, 11, 1)");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, scoreAngle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.stroke();

    // Needle
    const needleAngle = scoreAngle;
    const nx = cx + Math.cos(needleAngle) * (radius - 4);
    const ny = cy + Math.sin(needleAngle) * (radius - 4);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hub
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245, 158, 11, 1)";
    ctx.fill();
    ctx.strokeStyle = `rgba(${tone},0.2)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [score, tone]);

  return <canvas ref={canvasRef} />;
}

/* ───── Stacked Score Breakdown bars ───── */
function CategoryBar({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: number;
}) {
  const widthPct = Math.max(0, Math.min(100, value));
  const intensity = value >= 75 ? 100 : value >= 50 ? 70 : value >= 25 ? 45 : 25;
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_44px] items-center gap-3">
      <div>
        <div className="text-xs font-medium text-app">{label}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
          weight · {Math.round(weight * 100)}%
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-app overflow-hidden border border-app">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 0.8, ease }}
          className="h-full rounded-full bg-tool-accent"
          style={{ opacity: intensity / 100 }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-app text-right">
        {Math.round(value)}
      </span>
    </div>
  );
}

/* ═════════════════════════════ MAIN APP ═════════════════════════════ */
export default function TenantScreeningApp({
  width,
  resolved,
}: NativeAppProps) {
  const tone = toneFor(resolved);

  const [selectedArea, setSelectedArea] = useState<string>(
    AREA_RENTAL_DATA[0]?.area || ""
  );
  const [propertyType, setPropertyType] = useState<PropertyType>("1BR");
  const [currentRent, setCurrentRent] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docChecked, setDocChecked] = useState<Record<string, boolean>>({});

  /* ───── Width-driven layout ───── */
  const isMobile = width < 700;
  const compact = width < 720 || isMobile;
  const inputCols =
    width >= 900 ? "md:grid-cols-[1.4fr_2fr_1.2fr]" : "md:grid-cols-1";
  const verdictCols =
    width >= 1000
      ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
      : "lg:grid-cols-1";
  const docRefCols =
    width >= 1000
      ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
      : "lg:grid-cols-1";
  const dataProfileCols = width >= 900 ? "lg:grid-cols-2" : "lg:grid-cols-1";

  const areaData = useMemo(
    () => AREA_RENTAL_DATA.find((a) => a.area === selectedArea),
    [selectedArea]
  );

  const screeningScore = useMemo(
    () => (areaData ? calculateScreeningScore(areaData) : 0),
    [areaData]
  );

  const factors = useMemo(
    () => (areaData ? getScoreFactors(areaData) : null),
    [areaData]
  );

  const verdictMeta = useMemo(() => getVerdict(screeningScore), [screeningScore]);

  const rankedAreas = useMemo(() => {
    const scored = AREA_RENTAL_DATA.map((a) => ({
      ...a,
      score: calculateScreeningScore(a),
    }));
    scored.sort((a, b) => {
      switch (sortKey) {
        case "score":
          return sortAsc ? a.score - b.score : b.score - a.score;
        case "area":
          return sortAsc
            ? a.area.localeCompare(b.area)
            : b.area.localeCompare(a.area);
        case "demandScore":
          return sortAsc
            ? a.demandScore - b.demandScore
            : b.demandScore - a.demandScore;
        case "vacancyRate":
          return sortAsc
            ? a.vacancyRate - b.vacancyRate
            : b.vacancyRate - a.vacancyRate;
        case "riskLevel": {
          const riskOrder = { low: 1, medium: 2, high: 3 };
          return sortAsc
            ? riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
            : riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
        }
        default:
          return 0;
      }
    });
    return scored;
  }, [sortKey, sortAsc]);

  const topByDemand = useMemo(
    () =>
      [...AREA_RENTAL_DATA]
        .map((a) => ({ ...a, score: calculateScreeningScore(a) }))
        .sort((a, b) => b.demandScore - a.demandScore)
        .slice(0, 5),
    []
  );

  const pricingAnalysis = useMemo(() => {
    if (!areaData || !currentRent) return null;
    const rent = parseInt(currentRent.replace(/,/g, ""), 10);
    if (isNaN(rent)) return null;
    const marketRent = getRentForType(areaData, propertyType);
    const diff = ((rent - marketRent) / marketRent) * 100;
    const position: "below" | "at" | "above" =
      diff < -5 ? "below" : diff > 5 ? "above" : "at";
    const suggestedLow = Math.round(marketRent * 0.95);
    const suggestedHigh = Math.round(marketRent * 1.05);
    const baseVacancy = areaData.avgDaysToLease;
    const estimatedVacancy =
      position === "below"
        ? Math.max(7, baseVacancy - 5)
        : position === "above"
        ? Math.round(baseVacancy * (1 + Math.abs(diff) / 50))
        : baseVacancy;

    return {
      rent,
      marketRent,
      diff,
      position,
      suggestedLow,
      suggestedHigh,
      baseVacancy,
      estimatedVacancy,
    };
  }, [areaData, currentRent, propertyType]);

  const suggestedRange = useMemo(() => {
    if (!areaData) return null;
    const market = getRentForType(areaData, propertyType);
    return {
      low: Math.round(market * 0.95),
      mid: market,
      high: Math.round(market * 1.05),
    };
  }, [areaData, propertyType]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortAsc(!sortAsc);
      } else {
        setSortKey(key);
        setSortAsc(false);
      }
    },
    [sortKey, sortAsc]
  );

  const generateReport = useCallback(() => {
    if (!areaData) return "";
    const f = getScoreFactors(areaData);
    const v = getVerdict(screeningScore);
    let report = `TENANT SCREENING REPORT — ${areaData.area}\n`;
    report += `${"=".repeat(50)}\n\n`;
    report += `Verdict: ${v.verdict.toUpperCase()}\n`;
    report += `Overall Score: ${screeningScore}/100\n`;
    report += `Risk Level: ${areaData.riskLevel.toUpperCase()}\n`;
    report += `Segment: ${areaData.segment}\n\n`;
    report += `SCORE BREAKDOWN:\n`;
    report += `  Demand: ${f.demand}/100\n`;
    report += `  Occupancy: ${f.vacancy}/100\n`;
    report += `  Leasing Speed: ${f.leasingSpeed}/100\n`;
    report += `  Rent Growth: ${f.rentGrowth}/100\n`;
    report += `  Retention: ${f.retention}/100\n\n`;
    report += `RENTAL DATA:\n`;
    report += `  Studio: ${formatAED(areaData.avgRentStudio)}/yr\n`;
    report += `  1BR: ${formatAED(areaData.avgRent1BR)}/yr\n`;
    report += `  2BR: ${formatAED(areaData.avgRent2BR)}/yr\n`;
    report += `  3BR: ${formatAED(areaData.avgRent3BR)}/yr\n`;
    report += `  YoY Change: ${areaData.yoyRentChange > 0 ? "+" : ""}${
      areaData.yoyRentChange
    }%\n`;
    report += `  Avg Days to Lease: ${areaData.avgDaysToLease}\n\n`;
    report += `DEMOGRAPHICS:\n`;
    report += `  ${areaData.tenantDemographic}\n`;
    report += `  Top Nationalities: ${areaData.topNationalities.join(", ")}\n`;
    report += `  Renewal Rate: ${areaData.renewalRate}%\n\n`;
    report += `INSIGHTS:\n`;
    areaData.insights.forEach((i) => (report += `  - ${i}\n`));
    report += `\n— Generated via spacefield.co/tools/tenant-screening`;
    return report;
  }, [areaData, screeningScore]);

  const copyReport = useCallback(() => {
    const report = generateReport();
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generateReport]);

  const shareWhatsApp = useCallback(() => {
    const report = generateReport();
    const url = `https://wa.me/?text=${encodeURIComponent(report)}`;
    window.open(url, "_blank");
  }, [generateReport]);

  // Verdict accent ramp
  const verdictTone = (v: Verdict) =>
    v === "Approve"
      ? {
          chip: "bg-tool-accent text-white border-tool-accent",
          banner: "border-tool-accent/40 bg-tool-accent-soft",
          text: "text-tool-accent",
          dot: "bg-tool-accent",
        }
      : v === "Review"
      ? {
          chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
          banner: "border-amber-500/40 bg-amber-500/10",
          text: "text-amber-600 dark:text-amber-300",
          dot: "bg-amber-500",
        }
      : {
          chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40",
          banner: "border-rose-500/40 bg-rose-500/10",
          text: "text-rose-600 dark:text-rose-300",
          dot: "bg-rose-500",
        };

  const riskChipClass = (level: string) => {
    switch (level) {
      case "low":
        return "bg-tool-accent-soft text-tool-accent border-tool-accent/30";
      case "medium":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30";
      case "high":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30";
      default:
        return "";
    }
  };

  const documentChecklist = [
    { key: "passport", label: "Passport copy + UAE residence visa" },
    { key: "emirates", label: "Emirates ID (front and back)" },
    { key: "salary", label: "Salary certificate or trade licence" },
    { key: "bank", label: "3 months bank statements" },
    { key: "noc", label: "NOC from current landlord (if applicable)" },
    { key: "post", label: "Post-dated cheques (rent + security deposit)" },
  ];

  const referenceContacts = [
    {
      role: "Current Employer / HR",
      purpose: "Verify employment, tenure, salary band.",
    },
    {
      role: "Previous Landlord",
      purpose: "Confirm payment history and conduct.",
    },
    {
      role: "Bank Reference",
      purpose: "Cross-check account standing and balance.",
    },
  ];

  const toggleDoc = (key: string) =>
    setDocChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const v = verdictMeta;
  const tn = verdictTone(v.verdict);

  return (
    <div
      data-tool-theme="research"
      data-tool="tenant-screening"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      {/* In-tool header */}
      <div className="tool-hero border-b border-app">
        <div className={`px-4 sm:px-5 ${compact ? "py-4" : "py-5"}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-tool-accent/30 bg-tool-accent-soft">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-tool-accent"
                  >
                    <path
                      d="M3 11l9-8 9 8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 21v-6h6v6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1
                  className={`font-semibold tracking-tight text-app ${
                    compact ? "text-xl" : "text-2xl"
                  }`}
                >
                  Tenant Screening
                </h1>
              </div>
              <p className="mt-1.5 max-w-xl text-xs text-secondary sm:text-sm">
                Demand scoring across {AREA_RENTAL_DATA.length} areas. Vacancy
                risk, optimal rent band, and a verdict you can defend.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              Area Bureau · Live
            </div>
          </div>
        </div>
      </div>

      <section className={isMobile ? "px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" : "px-4 py-4 sm:px-5 sm:py-5"}>
        <div className="space-y-4">
          {/* ───── Input strip ───── */}
          <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
            <div className={`grid grid-cols-1 gap-4 ${inputCols}`}>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                  Area
                </label>
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className={`w-full rounded-lg border border-app bg-app px-3 ${isMobile ? "min-h-[44px] text-base" : "py-2.5 text-sm"} text-app transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/20`}
                >
                  <option value="">Select an area</option>
                  {AREA_RENTAL_DATA.map((a) => (
                    <option key={a.area} value={a.area}>
                      {a.area}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                  Property Type
                </label>
                <div className="flex gap-1 rounded-lg border border-app bg-app p-1">
                  {(["Studio", "1BR", "2BR", "3BR"] as PropertyType[]).map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPropertyType(t)}
                        className={`flex-1 rounded-md px-2 ${isMobile ? "min-h-[44px] text-sm" : "py-1.5 text-xs"} font-medium transition-colors ${
                          propertyType === t
                            ? "bg-tool-accent text-white shadow-sm"
                            : "text-secondary hover:text-app"
                        }`}
                      >
                        {t}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                  Asking Rent (AED/yr)
                </label>
                <input
                  type="text"
                  value={currentRent}
                  onChange={(e) =>
                    setCurrentRent(e.target.value.replace(/[^0-9,]/g, ""))
                  }
                  placeholder="e.g. 85,000"
                  className={`w-full rounded-lg border border-app bg-app px-3 ${isMobile ? "min-h-[44px] text-base" : "py-2.5 text-sm"} text-app placeholder:text-muted transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/20`}
                />
              </div>
            </div>
          </div>

          {/* ───── Body ───── */}
          <AnimatePresence mode="wait">
            {areaData && factors ? (
              <motion.div
                key={selectedArea}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease }}
                className="space-y-4"
              >
                {/* ───── Verdict Hero ───── */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className={`relative overflow-hidden rounded-2xl border ${tn.banner} p-5 sm:p-7`}
                >
                  <div
                    aria-hidden
                    className="tool-hero pointer-events-none absolute inset-0 opacity-50"
                  />
                  <div
                    className={`relative grid grid-cols-1 items-center gap-6 ${verdictCols}`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 inline-flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${tn.dot} animate-pulse`}
                        />
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${tn.text}`}
                        >
                          Verdict
                        </span>
                      </div>
                      <div
                        className={`text-5xl font-bold tracking-tight ${tn.text} ${
                          compact ? "" : "sm:text-6xl"
                        }`}
                      >
                        {v.verdict}
                      </div>
                      <p className="mt-3 max-w-sm text-sm leading-relaxed text-secondary">
                        {v.copy}
                      </p>
                    </div>

                    <div className="relative flex flex-col items-center">
                      <DemandDial score={screeningScore} tone={tone} />
                      <div className="pointer-events-none absolute top-[72px] text-center">
                        <div className="text-5xl font-bold leading-none tabular-nums text-tool-accent">
                          {screeningScore}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted">
                          out of 100
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
                        <span className="text-muted">{areaData.area}</span>
                        <span className="text-muted">·</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${riskChipClass(
                            areaData.riskLevel
                          )}`}
                        >
                          {areaData.riskLevel} risk
                        </span>
                        <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary">
                          {areaData.segment}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* ───── Score Breakdown ───── */}
                <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted">
                      Score Breakdown · Bureau Signals
                    </p>
                    <span className="text-[0.55rem] font-medium uppercase tracking-[0.2em] text-tool-accent">
                      ● 5 categories
                    </span>
                  </div>
                  <div className="space-y-3">
                    <CategoryBar
                      label="Demand"
                      value={factors.demand}
                      weight={SCORING_WEIGHTS.demandScore}
                    />
                    <CategoryBar
                      label="Occupancy"
                      value={factors.vacancy}
                      weight={SCORING_WEIGHTS.vacancyRate}
                    />
                    <CategoryBar
                      label="Leasing Speed"
                      value={factors.leasingSpeed}
                      weight={SCORING_WEIGHTS.daysToLease}
                    />
                    <CategoryBar
                      label="Rent Growth"
                      value={factors.rentGrowth}
                      weight={SCORING_WEIGHTS.yoyRentChange}
                    />
                    <CategoryBar
                      label="Retention"
                      value={factors.retention}
                      weight={SCORING_WEIGHTS.renewalRate}
                    />
                  </div>

                  {/* Suggested rent band */}
                  {suggestedRange && (
                    <div className="mt-5 border-t border-app pt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                          Suggested Rent · {propertyType}
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-tool-accent">
                          {formatAED(suggestedRange.low)} –{" "}
                          {formatAED(suggestedRange.high)}
                        </span>
                      </div>
                      <div className="relative h-8 overflow-hidden rounded-md border border-app bg-app">
                        <div className="absolute inset-0 bg-gradient-to-r from-tool-accent/15 via-tool-accent-soft to-tool-accent/30" />
                        <div className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-tool-accent" />
                        <div className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wider text-tool-accent">
                          Market {formatAED(suggestedRange.mid)}
                        </div>
                        {pricingAnalysis &&
                          (() => {
                            const pct = Math.max(
                              0,
                              Math.min(
                                100,
                                50 + (pricingAnalysis.diff / 20) * 50
                              )
                            );
                            return (
                              <div
                                className="absolute bottom-0 top-0 w-0.5 bg-app"
                                style={{
                                  left: `${pct}%`,
                                  backgroundColor: "currentColor",
                                }}
                              >
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-app">
                                  you
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted">
                        <span>fill fast</span>
                        <span>competitive</span>
                        <span>vacancy risk</span>
                      </div>
                      {pricingAnalysis && (
                        <div className="mt-3 text-xs text-secondary">
                          Likely{" "}
                          <span className="font-semibold tabular-nums text-app">
                            ~{pricingAnalysis.estimatedVacancy} days
                          </span>{" "}
                          vacancy at {formatAED(pricingAnalysis.rent)}.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ───── Document checklist + Reference contacts ───── */}
                <div className={`grid grid-cols-1 gap-4 ${docRefCols}`}>
                  <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted">
                        Document Checklist
                      </p>
                      <span className="text-[0.55rem] font-medium uppercase tracking-[0.2em] text-tool-accent">
                        ● {Object.values(docChecked).filter(Boolean).length}/
                        {documentChecklist.length} collected
                      </span>
                    </div>
                    <div className="space-y-2">
                      {documentChecklist.map((doc) => {
                        const checked = !!docChecked[doc.key];
                        return (
                          <button
                            key={doc.key}
                            type="button"
                            onClick={() => toggleDoc(doc.key)}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              checked
                                ? "border-tool-accent/40 bg-tool-accent-soft"
                                : "border-app bg-app hover:bg-app-elevated"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                                checked
                                  ? "border-tool-accent bg-tool-accent"
                                  : "border-app bg-app"
                              }`}
                            >
                              {checked && (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-white"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                            <span
                              className={`text-sm ${
                                checked ? "text-app" : "text-secondary"
                              }`}
                            >
                              {doc.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted">
                        Reference Contacts
                      </p>
                      <span className="text-[0.55rem] font-medium uppercase tracking-[0.2em] text-tool-accent">
                        ● 3 to verify
                      </span>
                    </div>
                    <div className="space-y-2">
                      {referenceContacts.map((ref) => (
                        <div
                          key={ref.role}
                          className="rounded-lg border border-app bg-app p-3 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tool-accent" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-app">
                                {ref.role}
                              </div>
                              <div className="mt-0.5 text-xs leading-relaxed text-muted">
                                {ref.purpose}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-app pt-4 text-xs">
                      <span className="text-muted">Renewal Rate (area avg)</span>
                      <span className="font-semibold tabular-nums text-tool-accent">
                        {areaData.renewalRate}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* ───── Top 5 by demand ───── */}
                <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                  <div className="flex items-center justify-between border-b border-app px-4 py-3 sm:px-5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted">
                      Top 5 · by Demand
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted">
                      tap a row to inspect
                    </div>
                  </div>
                  <div className="divide-y divide-app/50">
                    {topByDemand.map((a, idx) => {
                      const isSel = a.area === selectedArea;
                      const rent = getRentForType(a, propertyType);
                      return (
                        <button
                          key={a.area}
                          onClick={() => setSelectedArea(a.area)}
                          className={`grid w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${
                            compact
                              ? "grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)]"
                              : "grid-cols-[24px_minmax(0,1.3fr)_minmax(0,2fr)_90px_minmax(0,1fr)]"
                          } ${isSel ? "bg-tool-accent-soft" : "hover:bg-app"}`}
                        >
                          <span className="font-mono text-[10px] tabular-nums text-muted">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`truncate text-sm font-medium ${
                              isSel ? "text-tool-accent" : "text-app"
                            }`}
                          >
                            {a.area}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 w-full overflow-hidden rounded-full border border-app bg-app">
                              <div
                                className="h-full rounded-full bg-tool-accent"
                                style={{
                                  width: `${a.demandScore}%`,
                                  opacity: isSel ? 1 : 0.7,
                                }}
                              />
                            </div>
                            <span className="w-6 text-right text-xs font-semibold tabular-nums text-secondary">
                              {a.demandScore}
                            </span>
                          </div>
                          {!compact && (
                            <>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider ${riskChipClass(
                                  a.riskLevel
                                )}`}
                              >
                                {a.riskLevel}
                              </span>
                              <span className="text-right text-xs tabular-nums text-secondary">
                                {formatAED(rent)}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ───── Rental data + tenant profile ───── */}
                <div className={`grid grid-cols-1 gap-4 ${dataProfileCols}`}>
                  <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                    <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.25em] text-muted">
                      Rental Data · {areaData.area}
                    </div>
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {(["Studio", "1BR", "2BR", "3BR"] as PropertyType[]).map(
                        (t) => (
                          <div
                            key={t}
                            className={`rounded-lg border p-3 transition-colors ${
                              propertyType === t
                                ? "border-tool-accent/40 bg-tool-accent-soft"
                                : "border-app bg-app"
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wider text-muted">
                              {t}
                            </div>
                            <div className="text-sm font-semibold tabular-nums text-app">
                              {formatAED(getRentForType(areaData, t))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-app py-2">
                      <span className="text-xs text-muted">YoY Rent Change</span>
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          areaData.yoyRentChange > 0
                            ? "text-tool-accent"
                            : "text-rose-500"
                        }`}
                      >
                        {areaData.yoyRentChange > 0 ? "+" : ""}
                        {areaData.yoyRentChange}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-app py-2">
                      <span className="text-xs text-muted">Avg Days to Lease</span>
                      <span className="text-xs font-semibold tabular-nums text-app">
                        {areaData.avgDaysToLease}d
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-app py-2">
                      <span className="text-xs text-muted">Vacancy Rate</span>
                      <span className="text-xs font-semibold tabular-nums text-app">
                        {areaData.vacancyRate}%
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                    <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.25em] text-muted">
                      Tenant Profile
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                          Typical
                        </div>
                        <div className="text-app">
                          {areaData.tenantDemographic}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
                          Top Nationalities
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {areaData.topNationalities.map((n) => (
                            <span
                              key={n}
                              className="rounded-md border border-app bg-app px-2 py-0.5 text-[11px] text-secondary"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
                          Insights
                        </div>
                        <ul className="space-y-1.5">
                          {areaData.insights.map((insight, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-xs leading-relaxed text-secondary"
                            >
                              <span className="mt-0.5 text-tool-accent">›</span>
                              <span>{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ───── Full ledger ───── */}
                <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                  <div className="flex items-center justify-between border-b border-app px-4 py-3 sm:px-5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted">
                      Full Area Ledger
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted">
                      {rankedAreas.length} rows
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-app bg-app">
                          {[
                            { key: "area" as SortKey, label: "Area" },
                            { key: "score" as SortKey, label: "Score" },
                            { key: "demandScore" as SortKey, label: "Demand" },
                            { key: "vacancyRate" as SortKey, label: "Vacancy" },
                            { key: "riskLevel" as SortKey, label: "Risk" },
                          ].map((col) => (
                            <th
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              className="cursor-pointer px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-muted transition-colors hover:text-tool-accent"
                            >
                              {col.label}
                              {sortKey === col.key && (
                                <span className="ml-1 text-tool-accent">
                                  {sortAsc ? "↑" : "↓"}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rankedAreas.map((area) => (
                          <tr
                            key={area.area}
                            onClick={() => setSelectedArea(area.area)}
                            className={`cursor-pointer border-b border-app/60 transition-colors ${
                              area.area === selectedArea
                                ? "bg-tool-accent-soft"
                                : "hover:bg-app"
                            }`}
                          >
                            <td className="px-4 py-2.5 font-medium text-app">
                              {area.area}
                            </td>
                            <td className="px-4 py-2.5 font-semibold tabular-nums text-tool-accent">
                              {area.score}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-secondary">
                              {area.demandScore}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-secondary">
                              {area.vacancyRate}%
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${riskChipClass(
                                  area.riskLevel
                                )}`}
                              >
                                {area.riskLevel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ───── Decision row ───── */}
                <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted">
                        Decision
                      </div>
                      <div className="mt-0.5 text-sm text-secondary">
                        Lock the verdict and export the bureau report.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-tool-accent bg-tool-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
                      >
                        Approve Tenant
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border border-app bg-app-elevated px-4 ${isMobile ? "min-h-[44px] w-full text-xs" : "py-2 text-xs"} font-semibold uppercase tracking-[0.15em] text-app transition-colors hover:bg-app`}
                      >
                        Reject
                      </button>
                      <span className="mx-1 hidden w-px self-stretch bg-app sm:block" />
                      <button
                        type="button"
                        onClick={copyReport}
                        className={`rounded-lg border border-app bg-app-elevated px-4 ${isMobile ? "min-h-[44px] w-full text-xs" : "py-2 text-xs"} font-semibold uppercase tracking-[0.15em] text-app transition-colors hover:bg-app`}
                      >
                        {copied ? "Copied" : "Copy Report"}
                      </button>
                      <button
                        type="button"
                        onClick={shareWhatsApp}
                        className={`rounded-lg border border-app bg-app-elevated px-4 ${isMobile ? "min-h-[44px] w-full text-xs" : "py-2 text-xs"} font-semibold uppercase tracking-[0.15em] text-app transition-colors hover:bg-app`}
                      >
                        Share via WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-16 text-center"
              >
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-tool-accent/30 bg-tool-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-tool-accent">
                  Awaiting input
                </div>
                <p className="text-sm text-muted">
                  Select an area above to pull its bureau report.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
