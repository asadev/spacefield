"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   AI Investment Advisor — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome, no frame=1 query handling. Width-driven layout, foundation tokens.
   All wizard logic, scoring, strategy generation and results rendering are
   preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ───── Types ───── */
type InvestmentGoal = "rental" | "growth" | "balanced" | "golden-visa" | "personal";
type RiskTolerance = "conservative" | "moderate" | "aggressive";
type Timeline = "short" | "medium" | "long";
type PropertyStatus = "ready" | "offplan" | "either";
type PropertyType = "apt" | "villa" | "either";
type Management = "managed" | "self" | "either";

interface Answers {
  goal: InvestmentGoal | null;
  budget: number;
  isMortgage: boolean;
  downPaymentPct: number;
  risk: RiskTolerance | null;
  timeline: Timeline | null;
  propertyStatus: PropertyStatus;
  propertyType: PropertyType;
  management: Management;
}

interface AreaProfile {
  area: string;
  segment: string;
  avgYield: number;
  appreciation: number;
  minBudget: number;
  riskLevel: "low" | "medium" | "high";
  offplan: boolean;
  ready: boolean;
  types: string[];
  goldenVisa: boolean;
}

interface ScoredArea extends AreaProfile {
  score: number;
  reasons: string[];
  allocation: number;
}

/* ───── Area Data ───── */
const AREA_PROFILES: AreaProfile[] = [
  { area: "Downtown Dubai", segment: "luxury", avgYield: 5.8, appreciation: 9.8, minBudget: 1500000, riskLevel: "low", offplan: true, ready: true, types: ["apt"], goldenVisa: true },
  { area: "Dubai Marina", segment: "luxury", avgYield: 6.5, appreciation: 8.2, minBudget: 1200000, riskLevel: "low", offplan: true, ready: true, types: ["apt"], goldenVisa: true },
  { area: "Palm Jumeirah", segment: "luxury", avgYield: 5.2, appreciation: 12.3, minBudget: 2500000, riskLevel: "low", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: true },
  { area: "Business Bay", segment: "mid-luxury", avgYield: 6.8, appreciation: 11.5, minBudget: 800000, riskLevel: "low", offplan: true, ready: true, types: ["apt"], goldenVisa: false },
  { area: "Dubai Hills Estate", segment: "mid-luxury", avgYield: 5.9, appreciation: 15.8, minBudget: 1200000, riskLevel: "low", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: true },
  { area: "JVC", segment: "mid", avgYield: 8.2, appreciation: 18.5, minBudget: 500000, riskLevel: "medium", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: false },
  { area: "Arjan", segment: "affordable", avgYield: 8.8, appreciation: 20.1, minBudget: 450000, riskLevel: "medium", offplan: true, ready: true, types: ["apt"], goldenVisa: false },
  { area: "JLT", segment: "mid", avgYield: 7.1, appreciation: 10.8, minBudget: 700000, riskLevel: "low", offplan: false, ready: true, types: ["apt"], goldenVisa: false },
  { area: "Creek Harbour", segment: "mid-luxury", avgYield: 5.5, appreciation: 16.2, minBudget: 1400000, riskLevel: "low", offplan: true, ready: true, types: ["apt"], goldenVisa: true },
  { area: "Dubai South", segment: "affordable", avgYield: 8.5, appreciation: 19.5, minBudget: 400000, riskLevel: "high", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: false },
  { area: "Town Square", segment: "affordable", avgYield: 8.0, appreciation: 16.8, minBudget: 450000, riskLevel: "low", offplan: false, ready: true, types: ["apt"], goldenVisa: false },
  { area: "International City", segment: "affordable", avgYield: 9.5, appreciation: 22.3, minBudget: 280000, riskLevel: "medium", offplan: true, ready: true, types: ["apt"], goldenVisa: false },
  { area: "Sports City", segment: "mid", avgYield: 7.9, appreciation: 12.3, minBudget: 500000, riskLevel: "medium", offplan: false, ready: true, types: ["apt", "villa"], goldenVisa: false },
  { area: "Al Furjan", segment: "mid", avgYield: 7.5, appreciation: 14.2, minBudget: 600000, riskLevel: "medium", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: false },
  { area: "MBR City", segment: "luxury", avgYield: 5.5, appreciation: 14.0, minBudget: 1800000, riskLevel: "low", offplan: true, ready: true, types: ["apt", "villa"], goldenVisa: true },
  { area: "DIFC", segment: "luxury", avgYield: 5.0, appreciation: 14.1, minBudget: 2000000, riskLevel: "medium", offplan: true, ready: true, types: ["apt"], goldenVisa: true },
];

/* ───── Donut Chart (Canvas) ───── */
function DonutChart({ data, size = 220 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 10;
    const innerRadius = radius * 0.6;
    const total = data.reduce((s, d) => s + d.value, 0);
    let startAngle = -Math.PI / 2;

    data.forEach((slice) => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += sliceAngle;
    });
  }, [data, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="mx-auto"
    />
  );
}

/* ───── Scoring Engine ───── */
function scoreAreas(answers: Answers): ScoredArea[] {
  const effectiveBudget = answers.isMortgage
    ? answers.budget / (answers.downPaymentPct / 100)
    : answers.budget;

  let filtered = AREA_PROFILES.filter((a) => a.minBudget <= effectiveBudget);

  if (answers.propertyStatus === "ready") filtered = filtered.filter((a) => a.ready);
  if (answers.propertyStatus === "offplan") filtered = filtered.filter((a) => a.offplan);

  if (answers.propertyType === "apt") filtered = filtered.filter((a) => a.types.includes("apt"));
  if (answers.propertyType === "villa") filtered = filtered.filter((a) => a.types.includes("villa"));

  if (answers.goal === "golden-visa") {
    filtered = filtered.filter((a) => a.goldenVisa && effectiveBudget >= 2000000);
  }

  if (answers.risk === "conservative") filtered = filtered.filter((a) => a.riskLevel === "low");
  if (answers.risk === "moderate") filtered = filtered.filter((a) => a.riskLevel !== "high");

  const maxYield = Math.max(...filtered.map((a) => a.avgYield), 1);
  const maxAppreciation = Math.max(...filtered.map((a) => a.appreciation), 1);

  const scored = filtered.map((area) => {
    const yieldNorm = area.avgYield / maxYield;
    const appreciationNorm = area.appreciation / maxAppreciation;
    const riskScore = area.riskLevel === "low" ? 1 : area.riskLevel === "medium" ? 0.6 : 0.3;

    let wYield = 0.4, wAppreciation = 0.4, wRisk = 0.2;

    if (answers.goal === "rental") { wYield = 0.6; wAppreciation = 0.2; wRisk = 0.2; }
    if (answers.goal === "growth") { wYield = 0.2; wAppreciation = 0.6; wRisk = 0.2; }
    if (answers.goal === "golden-visa") { wYield = 0.3; wAppreciation = 0.3; wRisk = 0.4; }
    if (answers.goal === "personal") { wYield = 0.2; wAppreciation = 0.4; wRisk = 0.4; }

    if (answers.timeline === "short") { wAppreciation += 0.1; wYield -= 0.1; }
    if (answers.timeline === "long") { wYield += 0.1; wAppreciation -= 0.1; }

    const score = Math.round((yieldNorm * wYield + appreciationNorm * wAppreciation + riskScore * wRisk) * 100);

    const reasons: string[] = [];
    if (area.avgYield >= 7) reasons.push(`Strong rental yield at ${area.avgYield}%`);
    if (area.appreciation >= 15) reasons.push(`High capital appreciation of ${area.appreciation}%`);
    if (area.riskLevel === "low") reasons.push("Established, low-risk area");
    if (area.goldenVisa) reasons.push("Golden Visa eligible");
    if (area.types.includes("villa") && area.types.includes("apt")) reasons.push("Diverse property options available");
    if (reasons.length === 0) reasons.push("Solid overall investment profile");

    return { ...area, score, reasons, allocation: 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  if (top.length > 0) {
    const totalScore = top.reduce((s, a) => s + a.score, 0);
    top.forEach((a) => { a.allocation = Math.round((a.score / totalScore) * 100); });
  }

  return top;
}

/* ───── Strategy Generator ───── */
function generateStrategy(answers: Answers, areas: ScoredArea[]): string[] {
  const paragraphs: string[] = [];
  const goalLabels: Record<InvestmentGoal, string> = {
    rental: "rental income",
    growth: "capital appreciation",
    balanced: "a balanced approach",
    "golden-visa": "Golden Visa qualification",
    personal: "personal use with investment upside",
  };

  const budgetFormatted = `AED ${(answers.budget / 1000000).toFixed(1)}M`;

  paragraphs.push(
    `Based on your ${budgetFormatted} budget and focus on ${goalLabels[answers.goal!]}, your optimal strategy centers on ${areas[0]?.area || "key areas"} and similar communities. ${answers.isMortgage ? `With mortgage financing (${answers.downPaymentPct}% down), your purchasing power extends significantly, allowing access to higher-value properties.` : "Purchasing with cash gives you stronger negotiating leverage and avoids interest costs."}`
  );

  if (answers.timeline === "short") {
    paragraphs.push(
      "With a short-term horizon, prioritize off-plan properties in early launch phases where you can capture developer discounts of 10-20%. Focus on areas with active infrastructure development that will drive near-term price increases. Consider flipping at handover or within 1-2 years of completion."
    );
  } else if (answers.timeline === "medium") {
    paragraphs.push(
      "Your medium-term timeline allows you to benefit from both rental income during your hold period and capital appreciation as areas mature. Consider a mix of ready properties for immediate rental income and off-plan for growth. Reinvest rental income to build equity faster."
    );
  } else {
    paragraphs.push(
      "A long-term buy-and-hold strategy means you should prioritize areas with strong tenant demand and rental yields. Focus on ready properties with immediate rental income, in communities with proven occupancy rates above 85%. The compounding effect of rental reinvestment over 7+ years is significant."
    );
  }

  if (answers.risk === "aggressive") {
    paragraphs.push(
      "Your aggressive risk tolerance opens up high-growth emerging areas like Dubai South and Arjan where appreciation potential exceeds 18% annually. These areas carry higher volatility but reward patient investors. Diversify across 2-3 emerging communities rather than concentrating in one."
    );
  } else if (answers.risk === "conservative") {
    paragraphs.push(
      "Sticking with established, low-risk areas means lower volatility and more predictable returns. Areas like Dubai Marina, Downtown, and Business Bay have deep liquidity pools, making exits easier. You trade some upside for peace of mind and consistent rental demand."
    );
  }

  return paragraphs;
}

/* ───── Investor Profile Label ───── */
function getInvestorLabel(answers: Answers): string {
  const riskLabels = { conservative: "Conservative", moderate: "Balanced", aggressive: "Aggressive" };
  const goalLabels = { rental: "Yield Seeker", growth: "Growth Investor", balanced: "Diversified Investor", "golden-visa": "Visa-Focused Buyer", personal: "Lifestyle Investor" };
  return `${riskLabels[answers.risk!]} ${goalLabels[answers.goal!]}`;
}

/* ───── In-Tool Header ───── */
function AdvisorHeader({ step, total, showResults }: { step: number; total: number; showResults: boolean }) {
  const stepLabels = ["Goal", "Budget", "Risk", "Timeline", "Preferences"];
  const currentLabel = showResults ? "Summary" : stepLabels[step];
  const displayStep = showResults ? total : step + 1;

  return (
    <div className="tool-hero rounded-2xl border border-app bg-app-elevated px-5 sm:px-8 py-5 sm:py-6 mb-6 relative overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            Investment Advisor
          </h1>
          <div className="h-0.5 w-10 bg-tool-accent mt-2 rounded-full" />
          <p className="text-sm text-secondary mt-3 max-w-xl">
            Five questions. A clear portfolio plan with shortlisted areas, sized to your budget and risk.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">Current step</div>
          <div className="text-app font-medium text-sm mt-0.5">
            {currentLabel} <span className="text-muted">· {displayStep} of {total}</span>
          </div>
        </div>
      </div>

      {/* Step progress strip */}
      <div className="mt-5 flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const active = showResults ? true : i <= step;
          return (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                active ? "bg-tool-accent" : "bg-app-elevated"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ───── Big Answer Card ───── */
function AnswerCard({
  selected,
  onClick,
  title,
  desc,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full text-left p-5 sm:p-6 rounded-xl border transition-all duration-200 ${
        selected
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated hover:border-tool-accent"
      }`}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold shrink-0 transition-colors ${
              selected ? "bg-tool-accent text-white" : "bg-app text-secondary"
            }`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-base ${selected ? "text-app" : "text-app"}`}>
            {title}
          </div>
          {desc && (
            <div className="text-sm text-secondary mt-1 leading-relaxed">{desc}</div>
          )}
        </div>
        <div
          className={`w-5 h-5 rounded-full border-2 shrink-0 mt-1 transition-all ${
            selected ? "border-tool-accent bg-tool-accent" : "border-app"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="w-full h-full p-0.5 text-white">
              <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

/* ───── Segmented Pill ───── */
function SegmentedPill({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-app border border-app">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              active
                ? "bg-tool-accent text-white shadow-sm"
                : "text-secondary hover:text-app"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function InvestmentAdvisorApp(props: NativeAppProps) {
  const { width, openApp } = props;

  // Layout knobs driven by window width
  const isMobile = width < 700;
  const isNarrow = width < 640 || isMobile;
  const isUltra = width < 460;
  const donutSize = isUltra ? 160 : isNarrow ? 190 : 220;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showResults, setShowResults] = useState(false);
  const xpAwarded = useRef(false);
  const [answers, setAnswers] = useState<Answers>({
    goal: null,
    budget: 2000000,
    isMortgage: false,
    downPaymentPct: 25,
    risk: null,
    timeline: null,
    propertyStatus: "either",
    propertyType: "either",
    management: "either",
  });

  const totalSteps = 5;

  const goNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      setShowResults(true);
      if (!xpAwarded.current) {
        xpAwarded.current = true;
        awardXP("tool_use", "tool", "investment-advisor").catch(() => {});
      }
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (showResults) {
      setShowResults(false);
    } else {
      setDirection(-1);
      setStep((s) => Math.max(0, s - 1));
    }
  }, [showResults]);

  const resetAll = useCallback(() => {
    setStep(0);
    setDirection(-1);
    setShowResults(false);
    setAnswers({ goal: null, budget: 2000000, isMortgage: false, downPaymentPct: 25, risk: null, timeline: null, propertyStatus: "either", propertyType: "either", management: "either" });
  }, []);

  const canProceed = useMemo(() => {
    if (step === 0) return answers.goal !== null;
    if (step === 1) return answers.budget >= 500000;
    if (step === 2) return answers.risk !== null;
    if (step === 3) return answers.timeline !== null;
    if (step === 4) return true;
    return true;
  }, [step, answers]);

  const results = useMemo(() => {
    if (!showResults) return [];
    return scoreAreas(answers);
  }, [showResults, answers]);

  const strategy = useMemo(() => {
    if (!showResults || results.length === 0) return [];
    return generateStrategy(answers, results);
  }, [showResults, results, answers]);

  const affordableCount = useMemo(() => {
    const eff = answers.isMortgage ? answers.budget / (answers.downPaymentPct / 100) : answers.budget;
    return AREA_PROFILES.filter((a) => a.minBudget <= eff).length;
  }, [answers.budget, answers.isMortgage, answers.downPaymentPct]);

  const donutData = useMemo(() => {
    const colors = ["var(--tool-accent)", "var(--tool-accent)", "var(--tool-accent)"];
    const opacities = [1, 0.7, 0.45];
    return results.map((r, i) => ({
      label: r.area,
      value: r.allocation,
      color: i < 3 ? `color-mix(in srgb, ${colors[i]} ${opacities[i] * 100}%, transparent)` : "rgba(120,120,120,0.3)",
    }));
  }, [results]);

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  /* ───── Step Renderers ───── */
  const renderGoalStep = () => {
    const goals: { key: InvestmentGoal; title: string; desc: string; icon: string }[] = [
      { key: "rental", title: "Rental Income", desc: "Maximize monthly cash flow with high-yield properties", icon: "$" },
      { key: "growth", title: "Capital Growth", desc: "Focus on areas with highest appreciation potential", icon: "↗" },
      { key: "balanced", title: "Balanced", desc: "Equal weight on yield and capital appreciation", icon: "≡" },
      { key: "golden-visa", title: "Golden Visa", desc: "Qualify for UAE residency through property investment", icon: "★" },
      { key: "personal", title: "Personal Use + Investment", desc: "Live in it or use it, with investment upside", icon: "⌂" },
    ];
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-tool-accent font-semibold mb-2">
            Step 1 · Objective
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            What is your primary investment goal?
          </h2>
          <p className="text-secondary mt-2">
            This shapes how we weigh yield, growth, and risk across your shortlist.
          </p>
        </header>
        <div className="grid gap-3">
          {goals.map((g) => (
            <AnswerCard
              key={g.key}
              selected={answers.goal === g.key}
              onClick={() => setAnswers((a) => ({ ...a, goal: g.key }))}
              title={g.title}
              desc={g.desc}
              icon={g.icon}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderBudgetStep = () => (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-tool-accent font-semibold mb-2">
          Step 2 · Capital
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
          What is your investment budget?
        </h2>
        <p className="text-secondary mt-2">
          Slide to your working capital. We&apos;ll widen or narrow the shortlist in real time.
        </p>
      </header>

      <div className="relative rounded-2xl border border-app bg-tool-accent-soft p-6 sm:p-8 text-center overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-tool-accent" />
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted mb-2">Budget</div>
        <div className="text-4xl sm:text-6xl font-bold text-app tracking-tight tabular-nums">
          AED {(answers.budget / 1000000).toFixed(answers.budget < 1000000 ? 2 : 1)}<span className="text-muted text-3xl sm:text-4xl">M</span>
        </div>
        <p className="text-sm mt-2">
          <span className="text-tool-accent font-medium">{affordableCount}</span>
          <span className="text-secondary"> areas match this budget</span>
        </p>
      </div>

      <div className="space-y-2">
        <input
          type="range"
          min={500000}
          max={25000000}
          step={100000}
          value={answers.budget}
          onChange={(e) => setAnswers((a) => ({ ...a, budget: Number(e.target.value) }))}
          className="w-full"
          style={{ accentColor: "var(--tool-accent)" }}
        />
        <div className="flex justify-between text-xs text-muted">
          <span>AED 500K</span>
          <span>AED 25M</span>
        </div>
      </div>

      <div className="rounded-xl border border-app bg-app-elevated p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-app font-medium">Purchase type</span>
          <div className="min-w-[200px]">
            <SegmentedPill
              value={answers.isMortgage ? "mortgage" : "cash"}
              onChange={(v) => setAnswers((a) => ({ ...a, isMortgage: v === "mortgage" }))}
              options={[
                { key: "cash", label: "Cash" },
                { key: "mortgage", label: "Mortgage" },
              ]}
            />
          </div>
        </div>
        {answers.isMortgage && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2 pt-2 border-t border-app">
            <div className="flex justify-between items-center">
              <label className="text-sm text-secondary">Down payment</label>
              <span className="text-sm text-app font-medium tabular-nums">{answers.downPaymentPct}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={answers.downPaymentPct}
              onChange={(e) => setAnswers((a) => ({ ...a, downPaymentPct: Number(e.target.value) }))}
              className="w-full"
              style={{ accentColor: "var(--tool-accent)" }}
            />
            <p className="text-xs text-muted">
              Effective purchasing power:{" "}
              <span className="text-secondary tabular-nums">
                AED {Math.round(answers.budget / (answers.downPaymentPct / 100)).toLocaleString()}
              </span>
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );

  const renderRiskStep = () => {
    const risks: { key: RiskTolerance; title: string; desc: string; icon: string }[] = [
      { key: "conservative", title: "Conservative", desc: "Proven areas like Marina, Downtown, JLT -- lower yield but stable and liquid", icon: "◐" },
      { key: "moderate", title: "Balanced", desc: "Mix of established and emerging -- Business Bay, Dubai Hills, Al Furjan", icon: "◑" },
      { key: "aggressive", title: "Aggressive", desc: "High-growth emerging areas -- Dubai South, Arjan, JVC -- higher risk/reward", icon: "●" },
    ];

    // Risk meter position
    const riskValue = answers.risk === "conservative" ? 20 : answers.risk === "moderate" ? 55 : answers.risk === "aggressive" ? 90 : 0;

    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-tool-accent font-semibold mb-2">
            Step 3 · Risk
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            What is your risk tolerance?
          </h2>
          <p className="text-secondary mt-2">
            Filters areas by volatility profile. Be honest — a bad match here hurts the rest.
          </p>
        </header>

        {/* Profile selector segmented pill */}
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-muted font-medium">Risk meter</span>
            <span className="text-xs text-tool-accent font-semibold">
              {answers.risk ? answers.risk.charAt(0).toUpperCase() + answers.risk.slice(1) : "Not set"}
            </span>
          </div>
          {/* Risk meter gradient bar */}
          <div className="relative h-2 rounded-full overflow-hidden bg-app">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${riskValue}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, var(--tool-accent) 40%, transparent), var(--tool-accent))`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted mt-2 uppercase tracking-wider">
            <span>Stable</span>
            <span>Balanced</span>
            <span>Volatile</span>
          </div>
        </div>

        <div className="grid gap-3">
          {risks.map((r) => (
            <AnswerCard
              key={r.key}
              selected={answers.risk === r.key}
              onClick={() => setAnswers((a) => ({ ...a, risk: r.key }))}
              title={r.title}
              desc={r.desc}
              icon={r.icon}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderTimelineStep = () => {
    const timelines: { key: Timeline; title: string; desc: string; icon: string }[] = [
      { key: "short", title: "Short-term", desc: "1–3 years · Flip at completion or short hold for quick gains", icon: "1" },
      { key: "medium", title: "Medium-term", desc: "3–7 years · Build equity through rental income and appreciation", icon: "2" },
      { key: "long", title: "Long-term", desc: "7+ years · Buy and hold, compound returns over time", icon: "3" },
    ];
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-tool-accent font-semibold mb-2">
            Step 4 · Horizon
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            What is your investment timeline?
          </h2>
          <p className="text-secondary mt-2">
            Your horizon shifts the weight between yield and appreciation.
          </p>
        </header>
        <div className="grid gap-3">
          {timelines.map((t) => (
            <AnswerCard
              key={t.key}
              selected={answers.timeline === t.key}
              onClick={() => setAnswers((a) => ({ ...a, timeline: t.key }))}
              title={t.title}
              desc={t.desc}
              icon={t.icon}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderPreferencesStep = () => {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-tool-accent font-semibold mb-2">
            Step 5 · Fine-tune
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-app tracking-tight">
            A few preferences to refine the shortlist.
          </h2>
          <p className="text-secondary mt-2">
            Leave anything on &quot;Either&quot; if you&apos;re flexible.
          </p>
        </header>

        <div className="space-y-5 rounded-xl border border-app bg-app-elevated p-5">
          <div>
            <label className="text-sm text-secondary mb-2 block font-medium">Property status</label>
            <SegmentedPill
              value={answers.propertyStatus}
              onChange={(v) => setAnswers((a) => ({ ...a, propertyStatus: v as PropertyStatus }))}
              options={[
                { key: "ready", label: "Ready" },
                { key: "offplan", label: "Off-plan" },
                { key: "either", label: "Either" },
              ]}
            />
          </div>
          <div>
            <label className="text-sm text-secondary mb-2 block font-medium">Property type</label>
            <SegmentedPill
              value={answers.propertyType}
              onChange={(v) => setAnswers((a) => ({ ...a, propertyType: v as PropertyType }))}
              options={[
                { key: "apt", label: "Apartment" },
                { key: "villa", label: "Villa" },
                { key: "either", label: "Either" },
              ]}
            />
          </div>
          <div>
            <label className="text-sm text-secondary mb-2 block font-medium">Management style</label>
            <SegmentedPill
              value={answers.management}
              onChange={(v) => setAnswers((a) => ({ ...a, management: v as Management }))}
              options={[
                { key: "managed", label: "Managed" },
                { key: "self", label: "Self-managed" },
                { key: "either", label: "Either" },
              ]}
            />
          </div>
        </div>
      </div>
    );
  };

  const stepRenderers = [renderGoalStep, renderBudgetStep, renderRiskStep, renderTimelineStep, renderPreferencesStep];

  /* ───── Returns Projection Chart ───── */
  const ReturnsChart = ({ effectiveBudget, avgAppreciation }: { effectiveBudget: number; avgAppreciation: number }) => {
    const years = [0, 1, 2, 3, 4, 5];
    const points = years.map((y) => ({
      year: y,
      value: effectiveBudget * Math.pow(1 + avgAppreciation / 100, y),
    }));
    const maxV = Math.max(...points.map((p) => p.value));
    const minV = Math.min(...points.map((p) => p.value));
    const range = maxV - minV || 1;

    const w = 100;
    const h = 40;
    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - minV) / range) * h;
      return { x, y };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
    const fillPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
          <defs>
            <linearGradient id="returnFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tool-accent)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--tool-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill="url(#returnFill)" />
          <path d={linePath} stroke="var(--tool-accent)" strokeWidth="0.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="0.8" fill="var(--tool-accent)" />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-muted mt-1 px-1">
          {years.map((y) => (
            <span key={y}>Y{y}</span>
          ))}
        </div>
      </div>
    );
  };

  /* ───── Results ───── */
  const renderResults = () => {
    if (results.length === 0) {
      return (
        <div className="text-center py-16 rounded-xl border border-app bg-app-elevated">
          <p className="text-secondary">No matching areas found with your criteria. Try adjusting your budget or risk tolerance.</p>
          <button
            onClick={resetAll}
            className="mt-5 px-5 py-2.5 rounded-full bg-tool-accent text-white text-sm font-medium"
          >
            Start Over
          </button>
        </div>
      );
    }

    const effectiveBudget = answers.isMortgage ? answers.budget / (answers.downPaymentPct / 100) : answers.budget;
    const avgYield = results.reduce((s, r) => s + r.avgYield * (r.allocation / 100), 0);
    const avgAppreciation = results.reduce((s, r) => s + r.appreciation * (r.allocation / 100), 0);
    const monthlyIncome = Math.round((effectiveBudget * (avgYield / 100)) / 12);
    const fiveYearValue = Math.round(effectiveBudget * Math.pow(1 + avgAppreciation / 100, 5));

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="space-y-6">
        {/* Investor Profile Card */}
        <div className="relative rounded-2xl border border-app bg-app-elevated p-6 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-tool-accent" />
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-1">Your profile</p>
              <h3 className="text-xl font-semibold text-app">{getInvestorLabel(answers)}</h3>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-tool-accent text-white">
              Plan Ready
            </span>
          </div>
          <div className={`grid gap-4 text-sm ${isNarrow ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
            <div><span className="text-muted text-xs uppercase tracking-wider">Budget</span><p className="text-app font-medium mt-1 tabular-nums">AED {answers.budget.toLocaleString()}</p></div>
            <div><span className="text-muted text-xs uppercase tracking-wider">Goal</span><p className="text-app font-medium mt-1 capitalize">{answers.goal?.replace("-", " ")}</p></div>
            <div><span className="text-muted text-xs uppercase tracking-wider">Risk</span><p className="text-app font-medium mt-1 capitalize">{answers.risk}</p></div>
            <div><span className="text-muted text-xs uppercase tracking-wider">Timeline</span><p className="text-app font-medium mt-1">{answers.timeline === "short" ? "1–3 years" : answers.timeline === "medium" ? "3–7 years" : "7+ years"}</p></div>
          </div>
        </div>

        {/* Quick Numbers */}
        <div className="rounded-2xl border border-app bg-app-elevated p-6">
          <h3 className="text-sm uppercase tracking-wider text-muted font-semibold mb-5">Projected outcome</h3>
          <div className={`grid gap-4 ${isNarrow ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-app tabular-nums">{avgYield.toFixed(1)}%</p>
              <span className="text-xs text-muted">Expected annual yield</span>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-app tabular-nums">AED {(fiveYearValue / 1000000).toFixed(1)}M</p>
              <span className="text-xs text-muted">5-year value estimate</span>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold text-app tabular-nums">AED {monthlyIncome.toLocaleString()}</p>
              <span className="text-xs text-muted">Est. monthly income</span>
            </div>
            <div>
              <p
                className={`text-2xl md:text-3xl font-bold tabular-nums ${
                  effectiveBudget >= 2000000 && results.some((r) => r.goldenVisa) ? "text-tool-accent" : "text-muted"
                }`}
              >
                {effectiveBudget >= 2000000 && results.some((r) => r.goldenVisa) ? "Eligible" : "No"}
              </p>
              <span className="text-xs text-muted">Golden Visa</span>
            </div>
          </div>
        </div>

        {/* 5-Year Returns Projection Chart */}
        <div className="rounded-2xl border border-app bg-app-elevated p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm uppercase tracking-wider text-muted font-semibold">5-year projection</h3>
            <span className="text-xs text-tool-accent font-medium">+{avgAppreciation.toFixed(1)}% / yr</span>
          </div>
          <ReturnsChart effectiveBudget={effectiveBudget} avgAppreciation={avgAppreciation} />
        </div>

        {/* Top 3 Recommended Areas */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-lg font-semibold text-app">Recommended shortlist</h3>
            <span className="text-xs text-muted">Top {results.length} of {AREA_PROFILES.length}</span>
          </div>
          <div className="grid gap-4">
            {results.map((area, i) => (
              <motion.div
                key={area.area}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4, ease }}
                className="relative rounded-2xl border border-app bg-app-elevated hover:border-tool-accent transition-colors p-5 sm:p-6 overflow-hidden"
              >
                {/* Accent stripe */}
                <div className="absolute inset-y-0 left-0 w-1 bg-tool-accent-soft">
                  <div className="absolute inset-y-0 left-0 w-full bg-tool-accent" style={{ height: `${area.score}%` }} />
                </div>

                <div className="flex items-start justify-between gap-4 mb-4 pl-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-tool-accent text-white font-bold text-lg shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-app">{area.area}</h4>
                      <span className="text-xs text-muted capitalize">{area.segment} · {area.allocation}% allocation</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {/* Verdict pill */}
                    <span className="inline-block px-3 py-1 rounded-full bg-tool-accent text-white text-xs font-bold tabular-nums">
                      {area.score} match
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-muted mt-1">score</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4 pl-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-tool-accent-soft text-tool-accent">
                    {area.avgYield}% yield
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-tool-accent-soft text-tool-accent">
                    {area.appreciation}% growth
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border border-app ${
                      area.riskLevel === "low"
                        ? "bg-app text-secondary"
                        : area.riskLevel === "medium"
                        ? "bg-app text-secondary"
                        : "bg-app text-secondary"
                    }`}
                  >
                    {area.riskLevel} risk
                  </span>
                  {area.goldenVisa && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-app text-secondary border border-app">
                      Golden Visa
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-app text-secondary border border-app">
                    From AED {(area.minBudget / 1000000).toFixed(1)}M
                  </span>
                </div>

                <ul className="space-y-1.5 pl-3">
                  {area.reasons.map((r, ri) => (
                    <li key={ri} className="text-sm text-secondary flex items-start gap-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full shrink-0 bg-tool-accent" />
                      {r}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Strategy Summary */}
        <div className="rounded-2xl border border-app bg-app-elevated p-6">
          <h3 className="text-lg font-semibold text-app mb-4">Your investment strategy</h3>
          <div className="space-y-3">
            {strategy.map((p, i) => (
              <p key={i} className="text-sm text-secondary leading-relaxed">{p}</p>
            ))}
          </div>
        </div>

        {/* Portfolio Allocation Donut */}
        <div className="rounded-2xl border border-app bg-app-elevated p-6">
          <h3 className="text-lg font-semibold text-app mb-5">Suggested portfolio allocation</h3>
          <div className={`flex items-center gap-8 ${isNarrow ? "flex-col" : "flex-col md:flex-row"}`}>
            <DonutChart data={donutData} size={donutSize} />
            <div className="space-y-3 flex-1 w-full">
              {donutData.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-secondary flex-1 truncate">{d.label}</span>
                  <span className="text-sm text-app font-semibold tabular-nums">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cross-tool CTAs — open inside workspace via openApp() */}
        <div className="rounded-2xl border border-app bg-app-elevated p-6">
          <h3 className="text-lg font-semibold text-app mb-4">Explore further</h3>
          <div className={`grid gap-4 ${isNarrow ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            {results.slice(0, 2).map((area) => (
              <div key={area.area} className="space-y-2">
                <p className="text-sm text-muted font-semibold">{area.area}</p>
                <button
                  type="button"
                  onClick={() => openApp("yield-heatmap", { area: area.area })}
                  className="block text-left text-sm text-tool-accent hover:underline transition-colors"
                >
                  Check yield in {area.area} →
                </button>
                <button
                  type="button"
                  onClick={() => openApp("deal-scoring", { area: area.area })}
                  className="block text-left text-sm text-tool-accent hover:underline transition-colors"
                >
                  Score a deal in {area.area} →
                </button>
                <button
                  type="button"
                  onClick={() => openApp("neighborhood-report", { area: area.area })}
                  className="block text-left text-sm text-tool-accent hover:underline transition-colors"
                >
                  See {area.area} neighborhood report →
                </button>
              </div>
            ))}
            <div className="space-y-2">
              <p className="text-sm text-muted font-semibold">More tools</p>
              <button
                type="button"
                onClick={() => openApp("mortgage-calculator")}
                className="block text-left text-sm text-tool-accent hover:underline transition-colors"
              >
                Calculate your mortgage →
              </button>
              <button
                type="button"
                onClick={() => openApp("area-comparison")}
                className="block text-left text-sm text-tool-accent hover:underline transition-colors"
              >
                Compare areas side by side →
              </button>
              <button
                type="button"
                onClick={() => openApp("golden-visa-checker")}
                className="block text-left text-sm text-tool-accent hover:underline transition-colors"
              >
                Check Golden Visa eligibility →
              </button>
            </div>
          </div>
        </div>

        {/* Start Over */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setShowResults(false)}
            className="px-5 py-2.5 rounded-full border border-app bg-app-elevated text-secondary hover:text-app hover:border-tool-accent text-sm font-medium transition-all"
          >
            Edit answers
          </button>
          <button
            onClick={resetAll}
            className="px-5 py-2.5 rounded-full bg-tool-accent text-white text-sm font-medium transition-all hover:opacity-90"
          >
            Start over
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div
      data-tool-theme="investment"
      data-tool="investment-advisor"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <section
        className={`mx-auto ${isMobile ? "px-4 pt-4 pb-32" : isNarrow ? "px-3 pt-4 pb-16" : "px-5 pt-5 pb-20"}`}
        style={{ maxWidth: isNarrow ? "100%" : 760 }}
      >
        <AdvisorHeader step={step} total={totalSteps} showResults={showResults} />

        {!showResults ? (
          <div className="space-y-6">
            {/* Wizard Content */}
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease }}
                  className={`rounded-2xl border border-app bg-app-elevated ${isMobile ? "p-4" : "p-5 sm:p-8"}`}
                >
                  {stepRenderers[step]()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation pills */}
            <div
              className={
                isMobile
                  ? "fixed left-0 right-0 bottom-0 z-30 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-app-elevated/90 backdrop-blur border-t border-app flex items-center justify-between gap-3"
                  : "flex items-center justify-between gap-3 sticky bottom-3 z-10"
              }
            >
              <button
                onClick={goBack}
                disabled={step === 0}
                className={`${isMobile ? "min-h-[44px] px-5" : "px-5 py-2.5"} rounded-full border border-app bg-app-elevated text-secondary hover:text-app hover:border-tool-accent text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                ← Back
              </button>

              {!isUltra && !isMobile && (
                <div className="text-xs text-muted tabular-nums">
                  {step + 1} / {totalSteps}
                </div>
              )}

              <button
                onClick={goNext}
                disabled={!canProceed}
                className={`${isMobile ? "min-h-[44px] px-6 flex-1 max-w-[60%]" : "px-6 py-2.5"} rounded-full bg-tool-accent text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 shadow-lg`}
              >
                {step === totalSteps - 1 ? "Get recommendations →" : "Next →"}
              </button>
            </div>
          </div>
        ) : (
          renderResults()
        )}
      </section>
    </div>
  );
}
