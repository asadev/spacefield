"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Affordability Calculator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome. Uses props.width to switch layout below 700px.
   All math, hooks and state are preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCanvasTone } from "@/lib/useCanvasTone";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface Inputs {
  monthlyIncome: string;
  monthlyDebts: string;
  downPayment: string;
  interestRate: string;
  termYears: string;
  ltv: string; // max LTV allowed (%)
}

interface ScenarioOutput {
  label: string;
  dbr: number;
  maxMonthlyPayment: number;
  maxLoanAmount: number;
  maxPropertyPrice: number;
  monthlyPaymentAtMax: number;
  requiredDownPayment: number;
}

interface Output {
  base: ScenarioOutput;
  conservative: ScenarioOutput;
  stressed: ScenarioOutput;
  verdict: "very-safe" | "comfortable" | "stretched" | "over-budget";
  insights: string[];
}

function loanFromPayment(monthlyPayment: number, annualRate: number, years: number): number {
  if (monthlyPayment <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyPayment * n;
  return (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
}

function paymentFromLoan(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function computeScenario(
  i: Inputs,
  dbrPct: number,
  rateOverride?: number
): ScenarioOutput | null {
  const income = Number(i.monthlyIncome);
  const debts = Number(i.monthlyDebts) || 0;
  const down = Number(i.downPayment);
  const years = Number(i.termYears);
  const ltv = Number(i.ltv) / 100;
  const rate = rateOverride ?? Number(i.interestRate);

  if (!income || !down || !years || !ltv) return null;

  const maxMonthlyPayment = Math.max(0, income * (dbrPct / 100) - debts);
  const loanFromIncome = loanFromPayment(maxMonthlyPayment, rate, years);
  const maxPriceFromDown = ltv >= 1 ? Infinity : down / (1 - ltv);
  const maxLoanFromDown = maxPriceFromDown - down;

  const maxLoanAmount = Math.min(loanFromIncome, maxLoanFromDown);
  const maxPropertyPrice = maxLoanAmount + down;
  const monthlyPaymentAtMax = paymentFromLoan(maxLoanAmount, rate, years);
  const requiredDownPayment = maxPropertyPrice * (1 - ltv);

  return {
    label: "",
    dbr: dbrPct,
    maxMonthlyPayment,
    maxLoanAmount,
    maxPropertyPrice,
    monthlyPaymentAtMax,
    requiredDownPayment,
  };
}

function compute(i: Inputs): Output | null {
  const base = computeScenario(i, 50);
  const conservative = computeScenario(i, 35);
  const stressed = computeScenario(i, 50, (Number(i.interestRate) || 0) + 2);
  if (!base || !conservative || !stressed) return null;
  base.label = "Max (50% DBR)";
  conservative.label = "Conservative (35% DBR)";
  stressed.label = "Stress-tested (+2% rate)";

  const income = Number(i.monthlyIncome);
  const debts = Number(i.monthlyDebts) || 0;
  const ratio = income === 0 ? 1 : (debts + base.monthlyPaymentAtMax) / income;

  let verdict: Output["verdict"];
  if (base.maxPropertyPrice <= 0) verdict = "over-budget";
  else if (ratio <= 0.35) verdict = "very-safe";
  else if (ratio <= 0.45) verdict = "comfortable";
  else verdict = "stretched";

  const insights: string[] = [];
  const fmt = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

  insights.push(
    `At UAE's 50% debt-burden cap, you can target a property up to ${fmt(base.maxPropertyPrice)} with a monthly payment of ${fmt(base.monthlyPaymentAtMax)}.`
  );
  insights.push(
    `A conservative budget at 35% DBR is ${fmt(conservative.maxPropertyPrice)} — this gives you ${fmt(base.monthlyPaymentAtMax - conservative.monthlyPaymentAtMax)}/mo of breathing room for rates, repairs, and life.`
  );
  const stressDelta = base.maxPropertyPrice - stressed.maxPropertyPrice;
  insights.push(
    `If rates rise 2%, your max drops by ${fmt(stressDelta)} (${((stressDelta / base.maxPropertyPrice) * 100).toFixed(0)}%). Lock-in or fixed periods matter.`
  );

  if (verdict === "very-safe")
    insights.push("Your debt profile is very safe. You can buy at max without stress — or go conservative and build a cash cushion.");
  else if (verdict === "comfortable")
    insights.push("This is a comfortable stretch. You can afford the max, but reserve at least 6 months of payments in cash for service charges, voids, and surprises.");
  else if (verdict === "stretched")
    insights.push("You'd be maxing out the 50% DBR. Any dip in income or rate increase will hurt. Target the conservative number instead.");
  else
    insights.push("Your existing debts consume most of your income headroom. Clear credit-card balances and personal loans before applying for a mortgage.");

  return { base, conservative, stressed, verdict, insights };
}

interface AcquisitionCost {
  propertyPrice: number;
  dldFee: number;
  agencyCommission: number;
  trusteeFee: number;
  adminFee: number;
  mortgageRegistration: number;
  total: number;
}

function computeAcquisitionCosts(propertyPrice: number, loanAmount: number): AcquisitionCost {
  const dldFee = propertyPrice * 0.04;
  const agencyCommission = propertyPrice * 0.02;
  const trusteeFee = 4200;
  const adminFee = 580;
  const mortgageRegistration = loanAmount > 0 ? loanAmount * 0.0025 + 290 : 0;
  const total = propertyPrice + dldFee + agencyCommission + trusteeFee + adminFee + mortgageRegistration;
  return { propertyPrice, dldFee, agencyCommission, trusteeFee, adminFee, mortgageRegistration, total };
}

interface AreaRec {
  area: string;
  types: string;
}

function getAreaRecommendations(conservativeMax: number): AreaRec[] {
  if (conservativeMax < 800_000) {
    return [
      { area: "International City", types: "Studio / 1BR apartment" },
      { area: "Dubai Silicon Oasis", types: "Studio apartment" },
      { area: "Discovery Gardens", types: "1BR apartment" },
    ];
  }
  if (conservativeMax < 1_500_000) {
    return [
      { area: "JVC (Jumeirah Village Circle)", types: "1-2BR apartment" },
      { area: "Town Square", types: "1-2BR apartment" },
      { area: "Dubai South", types: "1-2BR apartment" },
      { area: "Arjan", types: "1BR apartment" },
    ];
  }
  if (conservativeMax < 2_500_000) {
    return [
      { area: "Dubai Hills Estate", types: "1-2BR apartment" },
      { area: "JLT (Jumeirah Lake Towers)", types: "2BR apartment" },
      { area: "Business Bay", types: "1-2BR apartment" },
      { area: "Al Furjan", types: "2-3BR townhouse" },
    ];
  }
  if (conservativeMax < 5_000_000) {
    return [
      { area: "Dubai Marina", types: "2-3BR apartment" },
      { area: "Downtown Dubai", types: "1-2BR apartment" },
      { area: "Dubai Creek Harbour", types: "2-3BR apartment" },
      { area: "MBR City", types: "3BR villa" },
    ];
  }
  if (conservativeMax < 10_000_000) {
    return [
      { area: "Palm Jumeirah", types: "2-3BR apartment" },
      { area: "Dubai Hills Estate", types: "4BR villa" },
      { area: "Emirates Hills", types: "Villa" },
      { area: "Bluewaters", types: "3BR apartment" },
    ];
  }
  return [
    { area: "Palm Jumeirah", types: "Penthouse / Villa" },
    { area: "Emirates Hills", types: "Luxury villa" },
    { area: "District One", types: "Mansion / Villa" },
    { area: "Jumeirah Bay Island", types: "Ultra-luxury villa" },
  ];
}

function PaymentDonutChart({
  principal,
  interest,
  fees,
}: {
  principal: number;
  interest: number;
  fees: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tone = useCanvasTone();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const segments = [
        { label: "Principal", value: Math.max(0, principal), color: "rgba(59,130,246,0.85)" },
        { label: "Interest", value: Math.max(0, interest), color: "rgba(147,197,253,0.75)" },
        { label: "Fees", value: Math.max(0, fees), color: "rgba(191,219,254,0.6)" },
      ].filter((s) => s.value > 0);

      const total = segments.reduce((sum, s) => sum + s.value, 0);
      if (total === 0) return;

      const cx = W / 2;
      const cy = H / 2 - 18;
      const outerR = Math.min(cx, cy) - 10;
      const innerR = outerR * 0.62;

      let startAngle = -Math.PI / 2;
      segments.forEach((seg) => {
        const sliceAngle = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        startAngle += sliceAngle;
      });

      ctx.fillStyle = `rgba(${tone},0.55)`;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Monthly", cx, cy - 8);
      ctx.fillStyle = `rgba(${tone},0.95)`;
      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      const totalStr = total >= 1_000_000
        ? `${(total / 1_000_000).toFixed(2)}M`
        : `${(total / 1_000).toFixed(0)}K`;
      ctx.fillText(`AED ${totalStr}`, cx, cy + 8);

      const legendY = H - 18;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      let legendX = 10;
      segments.forEach((seg) => {
        ctx.fillStyle = seg.color;
        ctx.fillRect(legendX, legendY - 4, 10, 10);
        ctx.fillStyle = `rgba(${tone},0.55)`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const pct = ((seg.value / total) * 100).toFixed(0);
        const text = `${seg.label} (${pct}%)`;
        ctx.fillText(text, legendX + 14, legendY + 1);
        legendX += ctx.measureText(text).width + 24;
      });
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [principal, interest, fees, tone]);

  return (
    <div ref={containerRef} className="w-full h-[220px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ─── Slider ─── */
function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  hint?: string;
}) {
  const num = Number(value) || 0;
  const pct = ((num - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
          {label}
        </label>
        <span className="font-mono text-[0.9rem] font-semibold text-tool-accent tabular-nums">
          {format(num)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={num}
        onChange={(e) => onChange(e.target.value)}
        className="tool-range mt-2 w-full"
        style={{ ["--pct" as string]: `${Math.min(100, Math.max(0, pct))}%` } as React.CSSProperties}
      />
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-app bg-app px-3 py-2 text-sm font-mono tabular-nums text-app outline-none transition focus:border-tool-accent focus:ring-2 ring-tool-accent"
      />
      {hint && <p className="mt-1 text-[0.65rem] text-muted">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function AffordabilityApp(props: NativeAppProps) {
  const { width, initialParams, initialParamsKey, openApp } = props;

  /* Below 700px → single column, else two-col split */
  const isMobile = width < 700;
  const isWide = width >= 700;
  const isUltra = width < 500;

  const [inputs, setInputs] = useState<Inputs>({
    monthlyIncome: "40000",
    monthlyDebts: "2000",
    downPayment: "400000",
    interestRate: "4.5",
    termYears: "25",
    ltv: "80",
  });
  const [showResults, setShowResults] = useState(false);
  const [residency, setResidency] = useState<"expat" | "national">("expat");
  const [view, setView] = useState<"basic" | "advanced">("basic");

  /* Hydrate from initialParams when openApp() passes context. */
  useEffect(() => {
    if (!initialParams) return;
    setInputs((prev) => {
      const next = { ...prev };
      if (typeof initialParams.monthlyIncome === "number") next.monthlyIncome = String(Math.round(initialParams.monthlyIncome));
      if (typeof initialParams.monthlyDebts === "number") next.monthlyDebts = String(Math.round(initialParams.monthlyDebts));
      if (typeof initialParams.downPayment === "number") next.downPayment = String(Math.round(initialParams.downPayment));
      if (typeof initialParams.interestRate === "number") next.interestRate = initialParams.interestRate.toFixed(2);
      if (typeof initialParams.termYears === "number") next.termYears = String(initialParams.termYears);
      if (typeof initialParams.ltv === "number") next.ltv = String(initialParams.ltv);
      return next;
    });
    if (initialParams.residency === "expat" || initialParams.residency === "national") {
      setResidency(initialParams.residency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const update = (key: keyof Inputs, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    if (showResults) setShowResults(false);
  };

  const setResidencyMode = (mode: "expat" | "national") => {
    setResidency(mode);
    setInputs((prev) => ({ ...prev, ltv: mode === "national" ? "85" : "80" }));
    if (showResults) setShowResults(false);
  };

  const result = useMemo(
    () => (showResults ? compute(inputs) : null),
    [inputs, showResults]
  );

  const acquisitionCosts = useMemo(() => {
    if (!result) return null;
    return computeAcquisitionCosts(
      result.conservative.maxPropertyPrice,
      result.conservative.maxLoanAmount
    );
  }, [result]);

  const areaRecs = useMemo(() => {
    if (!result) return [];
    return getAreaRecommendations(result.conservative.maxPropertyPrice);
  }, [result]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResults(true);
  };

  const fmt = (n: number) => `AED ${Math.round(n).toLocaleString()}`;
  const fmtShort = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
    return fmt(n);
  };

  const verdictMeta: Record<
    NonNullable<Output["verdict"]>,
    { label: string; dot: string }
  > = {
    "very-safe": { label: "APPROVED · VERY SAFE", dot: "bg-emerald-500" },
    comfortable: { label: "APPROVED · COMFORTABLE", dot: "bg-blue-500" },
    stretched: { label: "APPROVED WITH CAUTION", dot: "bg-amber-500" },
    "over-budget": { label: "PRE-QUALIFIED — REVIEW DEBTS", dot: "bg-red-500" },
  };

  const income = Number(inputs.monthlyIncome) || 0;
  const debts = Number(inputs.monthlyDebts) || 0;
  const rateN = Number(inputs.interestRate) || 0;
  const yearsN = Number(inputs.termYears) || 0;

  // Chart values
  const monthlyPayment = result?.base.monthlyPaymentAtMax || 0;
  const n = yearsN * 12;
  const totalPaid = monthlyPayment * n;
  const loanAmt = result?.base.maxLoanAmount || 0;
  const monthlyInterest = loanAmt > 0 && n > 0 ? (totalPaid - loanAmt) / n : 0;
  const monthlyPrincipal = monthlyPayment - monthlyInterest;
  const dtiRatio = income > 0 && result ? (debts + monthlyPayment) / income : 0;
  const dtiPct = Math.min(100, Math.max(0, dtiRatio * 100));

  // Constraint detection
  const loanFromIncome = result ? loanFromPayment(result.base.maxMonthlyPayment, rateN, yearsN) : 0;
  const ltvN = Number(inputs.ltv) / 100;
  const down = Number(inputs.downPayment) || 0;
  const maxLoanFromDown = ltvN >= 1 ? Infinity : down / (1 - ltvN) - down;
  const bindingConstraint: "dbr" | "ltv" | null = result
    ? loanFromIncome <= maxLoanFromDown ? "dbr" : "ltv"
    : null;

  return (
    <div
      data-tool-theme="calculators"
      data-tool="affordability"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <style jsx global>{`
        [data-tool="affordability"] .tool-range {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(
            to right,
            var(--tool-accent) 0%,
            var(--tool-accent) var(--pct, 0%),
            var(--border) var(--pct, 0%),
            var(--border) 100%
          );
          outline: none;
        }
        [data-tool="affordability"] .tool-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--tool-accent);
          border: 3px solid var(--bg-elevated);
          box-shadow: 0 0 0 1px var(--tool-accent), 0 4px 10px rgba(59, 130, 246, 0.3);
          cursor: pointer;
        }
        [data-tool="affordability"] .tool-range::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--tool-accent);
          border: 3px solid var(--bg-elevated);
          box-shadow: 0 0 0 1px var(--tool-accent);
          cursor: pointer;
        }
        [data-tool="affordability"] .hero-number {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.04em;
        }
        [data-tool="affordability"] .dti-fill {
          transition: width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
      `}</style>

      <div className={`${isMobile ? "px-4 pb-12 pt-4" : "px-4 pb-8 pt-5 sm:px-6"}`}>
        {/* Tabs (basic / advanced) */}
        <div className="mb-5 flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-app bg-app-elevated p-1">
            {(["basic", "advanced"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-4 py-1.5 text-xs font-medium capitalize transition-all ${
                  view === v
                    ? "bg-tool-accent text-white shadow-sm"
                    : "text-secondary hover:text-app"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {!isUltra && (
            <div className="ml-auto text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              Affordability · UAE Central Bank
            </div>
          )}
        </div>

        {/* App-shell card */}
        <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
          {/* Body */}
          <div
            className={isWide ? "grid gap-0" : "flex flex-col"}
            style={
              isWide
                ? { gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)" }
                : undefined
            }
          >
            {/* LEFT: Inputs */}
            <form
              onSubmit={handleSubmit}
              className={`p-6 ${isWide ? "border-r border-app" : "border-b border-app"}`}
            >
              <div className="mb-5">
                <p className="text-[0.62rem] uppercase tracking-[0.22em] text-muted">
                  Applicant Profile
                </p>
                <h2 className="mt-1 text-lg font-semibold text-app">
                  Tell us about your finances
                </h2>
              </div>

              {/* Residency Toggle */}
              <div className="mb-5">
                <label className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                  Residency
                </label>
                <div
                  className="grid gap-1 rounded-lg border border-app bg-app p-1"
                  style={{ gridTemplateColumns: "1fr 1fr" }}
                >
                  {(["expat", "national"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResidencyMode(r)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        residency === r
                          ? "bg-tool-accent text-white shadow-sm"
                          : "text-secondary hover:text-app"
                      }`}
                    >
                      {r === "expat" ? "Expat (80% LTV)" : "UAE National (85% LTV)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <Slider
                  label="Gross Monthly Income"
                  value={inputs.monthlyIncome}
                  onChange={(v) => update("monthlyIncome", v)}
                  min={5000}
                  max={500000}
                  step={1000}
                  format={(n) => fmtShort(n)}
                />
                <Slider
                  label="Existing Monthly Debts"
                  value={inputs.monthlyDebts}
                  onChange={(v) => update("monthlyDebts", v)}
                  min={0}
                  max={50000}
                  step={500}
                  format={(n) => fmtShort(n)}
                  hint="Credit cards, personal loans, car finance"
                />
                <Slider
                  label="Cash Down Payment"
                  value={inputs.downPayment}
                  onChange={(v) => update("downPayment", v)}
                  min={50000}
                  max={10000000}
                  step={10000}
                  format={(n) => fmtShort(n)}
                />

                {view === "advanced" && (
                  <>
                    <div className="h-px bg-[var(--border)]" />
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: "1fr 1fr" }}
                    >
                      <div>
                        <label className="mb-1.5 block text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                          Rate (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={inputs.interestRate}
                          onChange={(e) => update("interestRate", e.target.value)}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm font-mono tabular-nums text-app outline-none transition focus:border-tool-accent focus:ring-2 ring-tool-accent"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                          Term (yrs)
                        </label>
                        <input
                          type="number"
                          value={inputs.termYears}
                          onChange={(e) => update("termYears", e.target.value)}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm font-mono tabular-nums text-app outline-none transition focus:border-tool-accent focus:ring-2 ring-tool-accent"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-app bg-tool-accent-soft p-3 text-[0.7rem] leading-relaxed text-secondary">
                  <span className="font-semibold text-tool-accent">UAE Central Bank rules:</span>{" "}
                  LTV capped at 80% (expats) / 85% (nationals) on first home under AED 5M. DBR maxed at 50% of gross income.
                </div>

                <button
                  type="submit"
                  className="group w-full rounded-xl bg-tool-accent px-6 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-xl hover:brightness-110 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-tool-accent"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    Run Pre-Qualification
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </button>
              </div>
            </form>

            {/* RIGHT: The reveal */}
            <div className="relative bg-app">
              <AnimatePresence mode="wait">
                {!showResults || !result ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex min-h-[480px] items-center justify-center p-10"
                  >
                    <div className="text-center">
                      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-tool-accent-soft">
                        <svg className="h-8 w-8 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2l9 7v11a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2V9l9-7z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-app">
                        Ready when you are
                      </p>
                      <p className="mt-1 text-xs text-secondary">
                        Fill in your finances and hit Run Pre-Qualification.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="reveal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {/* Hero — "you can afford" */}
                    <div className="tool-hero relative overflow-hidden p-8">
                      <div className="relative">
                        <motion.p
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[0.65rem] uppercase tracking-[0.28em] text-tool-accent"
                        >
                          Pre-Qualification Estimate
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="mt-3 text-sm text-secondary"
                        >
                          You can afford up to
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.15, duration: 0.5, ease }}
                          className={`hero-number mt-1 font-bold text-tool-accent ${
                            isUltra ? "text-4xl" : isWide ? "text-6xl" : "text-5xl"
                          }`}
                        >
                          {fmtShort(result.base.maxPropertyPrice)}
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="mt-2 text-sm text-secondary"
                        >
                          Max property price · Monthly{" "}
                          <span className="font-mono font-semibold text-app tabular-nums">
                            {fmt(result.base.monthlyPaymentAtMax)}
                          </span>
                        </motion.p>

                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.35 }}
                          className="mt-5 inline-flex items-center gap-2 rounded-full border border-app bg-app-elevated px-3 py-1.5"
                        >
                          <span className={`h-2 w-2 rounded-full ${verdictMeta[result.verdict].dot}`} />
                          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-app">
                            {verdictMeta[result.verdict].label}
                          </span>
                        </motion.div>

                        {/* Constraint chips */}
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="mt-6 grid gap-2"
                          style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
                        >
                          <ConstraintChip
                            label="LTV"
                            value={`${inputs.ltv}%`}
                            active={bindingConstraint === "ltv"}
                          />
                          <ConstraintChip
                            label="DBR"
                            value={`${Math.min(50, Math.round(dtiRatio * 100))}% / 50%`}
                            active={bindingConstraint === "dbr"}
                          />
                          <ConstraintChip
                            label="Stress +2%"
                            value={fmtShort(result.stressed.maxPropertyPrice)}
                            active={false}
                          />
                        </motion.div>

                        {/* DTI ratio bar */}
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.45 }}
                          className="mt-6"
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                              Debt-to-Income (cap 50%)
                            </span>
                            <span className="font-mono text-sm font-semibold text-tool-accent tabular-nums">
                              {dtiPct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-tool-accent-soft">
                            <div
                              className="dti-fill h-full rounded-full bg-tool-accent"
                              style={{ width: `${Math.min(100, dtiPct * 2)}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[0.55rem] uppercase tracking-wider text-muted">
                            <span>0%</span>
                            <span>25%</span>
                            <span className="text-tool-accent">50% cap</span>
                          </div>
                        </motion.div>
                      </div>
                    </div>

                    {/* Cap explainer */}
                    {bindingConstraint === "dbr" && dtiRatio >= 0.49 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="border-b border-app bg-tool-accent-soft px-6 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent">
                            <span className="text-xs font-bold text-white">!</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-app">
                              You're capped by the 50% DBR rule
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-secondary">
                              Add <span className="font-mono font-semibold text-tool-accent">AED 1,000</span> more monthly income and your max price increases by{" "}
                              <span className="font-mono font-semibold text-tool-accent">
                                {fmtShort(loanFromPayment(1000, rateN, yearsN))}
                              </span>
                              . Clearing <span className="font-semibold text-app">{fmt(debts)}</span> of existing debts unlocks{" "}
                              <span className="font-mono font-semibold text-tool-accent">
                                {fmtShort(loanFromPayment(debts, rateN, yearsN))}
                              </span>{" "}
                              of extra budget.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {bindingConstraint === "ltv" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="border-b border-app bg-tool-accent-soft px-6 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent">
                            <span className="text-xs font-bold text-white">$</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-app">
                              You're capped by your down payment
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-secondary">
                              Your income supports more, but LTV at {inputs.ltv}% limits the loan. Each extra{" "}
                              <span className="font-mono font-semibold text-tool-accent">AED 100K</span> of cash down raises max price by{" "}
                              <span className="font-mono font-semibold text-tool-accent">
                                {fmtShort(100_000 / (1 - ltvN))}
                              </span>.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Scenario strip */}
                    <div
                      className="grid border-t border-app bg-app"
                      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
                    >
                      {[result.base, result.conservative, result.stressed].map((scenario, idx) => (
                        <motion.div
                          key={scenario.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.45 + idx * 0.05 }}
                          className={`relative p-4 text-center ${idx > 0 ? "border-l border-app" : ""} ${
                            idx === 0 ? "bg-tool-accent-soft" : ""
                          }`}
                        >
                          <p className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                            {scenario.label}
                          </p>
                          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-app">
                            {fmtShort(scenario.maxPropertyPrice)}
                          </p>
                          <p className="mt-0.5 text-[0.65rem] text-secondary">
                            {fmt(scenario.monthlyPaymentAtMax)}/mo
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Below-the-fold: full report */}
        <AnimatePresence mode="wait">
          {showResults && result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease }}
              className="mt-6 space-y-6"
            >
              {/* Summary metrics */}
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: isUltra
                    ? "repeat(2, minmax(0, 1fr))"
                    : isWide
                    ? "repeat(4, minmax(0, 1fr))"
                    : "repeat(2, minmax(0, 1fr))",
                }}
              >
                {[
                  { label: "Max Monthly", value: fmt(result.base.maxMonthlyPayment) },
                  { label: "Max Loan", value: fmtShort(result.base.maxLoanAmount) },
                  { label: "Required Down", value: fmtShort(result.base.requiredDownPayment) },
                  {
                    label: "Safety Margin",
                    value: `${((result.conservative.maxPropertyPrice / Math.max(1, result.base.maxPropertyPrice)) * 100).toFixed(0)}%`,
                  },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-app bg-app-elevated p-4"
                  >
                    <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                      {card.label}
                    </p>
                    <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-app">
                      {card.value}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Charts row */}
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: isWide
                    ? "repeat(2, minmax(0, 1fr))"
                    : "minmax(0, 1fr)",
                }}
              >
                <div className="rounded-xl border border-app bg-app-elevated p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[0.62rem] uppercase tracking-[0.22em] text-secondary">
                      Monthly Payment Split
                    </p>
                    <p className="text-[0.65rem] text-muted">Principal / Interest</p>
                  </div>
                  <PaymentDonutChart
                    principal={Math.max(0, monthlyPrincipal)}
                    interest={Math.max(0, monthlyInterest)}
                    fees={0}
                  />
                </div>
                <div className="rounded-xl border border-app bg-app-elevated p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[0.62rem] uppercase tracking-[0.22em] text-secondary">
                      Income Composition
                    </p>
                    <p className="text-[0.65rem] text-muted">CB cap: 50%</p>
                  </div>
                  <IncomeBars
                    income={income}
                    debts={debts}
                    mortgage={monthlyPayment}
                  />
                </div>
              </div>

              {/* Acquisition costs */}
              {acquisitionCosts && (
                <div className="rounded-xl border border-app bg-app-elevated p-6">
                  <div className="mb-4 flex items-baseline justify-between">
                    <div>
                      <p className="text-[0.62rem] uppercase tracking-[0.22em] text-secondary">
                        Full Acquisition Cost
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Based on conservative target of {fmtShort(result.conservative.maxPropertyPrice)}
                      </p>
                    </div>
                    <p className="font-mono text-xl font-bold tabular-nums text-tool-accent">
                      {fmt(acquisitionCosts.total)}
                    </p>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {[
                      { label: "Property Price", value: acquisitionCosts.propertyPrice },
                      { label: "DLD Fee (4%)", value: acquisitionCosts.dldFee },
                      { label: "Agency Commission (2%)", value: acquisitionCosts.agencyCommission },
                      { label: "Trustee Fee (AED 4,000 + VAT)", value: acquisitionCosts.trusteeFee },
                      { label: "Admin Fee", value: acquisitionCosts.adminFee },
                      ...(acquisitionCosts.mortgageRegistration > 0
                        ? [{ label: "Mortgage Registration (0.25% + AED 290)", value: acquisitionCosts.mortgageRegistration }]
                        : []),
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="text-secondary">{row.label}</span>
                        <span className="font-mono tabular-nums text-app">{fmt(row.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Areas */}
              {areaRecs.length > 0 && (
                <div className="rounded-xl border border-app bg-app-elevated p-6">
                  <p className="text-[0.62rem] uppercase tracking-[0.22em] text-secondary">
                    Where to Look
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Areas matching {fmtShort(result.conservative.maxPropertyPrice)} budget
                  </p>
                  <div
                    className="mt-4 grid gap-2"
                    style={{
                      gridTemplateColumns: isWide
                        ? "repeat(2, minmax(0, 1fr))"
                        : "minmax(0, 1fr)",
                    }}
                  >
                    {areaRecs.map((rec, i) => (
                      <motion.div
                        key={rec.area}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 rounded-xl border border-app bg-app p-3"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-tool-accent-soft">
                          <svg className="h-4 w-4 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-app">{rec.area}</p>
                          <p className="truncate text-[0.7rem] text-secondary">{rec.types}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Insights — banker's note */}
              <div className="relative rounded-xl border border-app bg-app-elevated p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent-soft">
                    <svg className="h-5 w-5 text-tool-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-[0.22em] text-muted">
                      Underwriter's Notes
                    </p>
                    <p className="text-sm font-semibold text-app">
                      What your profile tells us
                    </p>
                  </div>
                </div>
                <ol className="space-y-3">
                  {result.insights.map((text, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex gap-3 text-sm leading-relaxed"
                    >
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-tool-accent-soft font-mono text-[0.65rem] font-bold text-tool-accent">
                        {i + 1}
                      </span>
                      <span className="text-secondary">{text}</span>
                    </motion.li>
                  ))}
                </ol>
              </div>

              {/* Cross-tool CTAs */}
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: isWide
                    ? "repeat(2, minmax(0, 1fr))"
                    : "minmax(0, 1fr)",
                }}
              >
                <button
                  type="button"
                  onClick={() => openApp("deal-scoring")}
                  className="group flex items-center justify-between rounded-xl border border-app bg-app-elevated p-5 text-left transition-all hover:-translate-y-0.5 hover:border-tool-accent hover:shadow-lg focus:outline-none focus:ring-2 ring-tool-accent"
                >
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">Next Step</p>
                    <p className="mt-1 text-sm font-medium text-app">Score a specific property</p>
                  </div>
                  <span className="text-tool-accent transition-transform group-hover:translate-x-1">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => openApp("service-charge-comparison")}
                  className="group flex items-center justify-between rounded-xl border border-app bg-app-elevated p-5 text-left transition-all hover:-translate-y-0.5 hover:border-tool-accent hover:shadow-lg focus:outline-none focus:ring-2 ring-tool-accent"
                >
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">Next Step</p>
                    <p className="mt-1 text-sm font-medium text-app">Check area service charges</p>
                  </div>
                  <span className="text-tool-accent transition-transform group-hover:translate-x-1">→</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ConstraintChip({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-left transition ${
        active
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-muted">
          {label}
        </span>
        {active && (
          <span className="rounded-sm bg-tool-accent px-1 text-[0.5rem] font-bold uppercase tracking-wider text-white">
            Binding
          </span>
        )}
      </div>
      <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${active ? "text-tool-accent" : "text-app"}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── Income composition stacked bar ─── */
function IncomeBars({
  income,
  debts,
  mortgage,
}: {
  income: number;
  debts: number;
  mortgage: number;
}) {
  const free = Math.max(0, income - debts - mortgage);
  const total = Math.max(1, income);
  const segments = [
    { label: "Mortgage", value: mortgage, color: "var(--tool-accent)" },
    { label: "Existing debt", value: debts, color: "color-mix(in srgb, var(--tool-accent) 50%, transparent)" },
    { label: "Free income", value: free, color: "color-mix(in srgb, var(--tool-accent) 18%, transparent)" },
  ];

  return (
    <div className="flex h-[170px] flex-col justify-between">
      <div>
        <div className="flex h-9 w-full overflow-hidden rounded-lg bg-app">
          {segments.map((seg) => {
            const pct = (seg.value / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={seg.label}
                style={{ width: `${pct}%`, background: seg.color }}
                className="h-full transition-all"
                title={`${seg.label}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[0.65rem] text-muted">
          Of <span className="font-mono tabular-nums text-app">AED {Math.round(income).toLocaleString()}</span>/mo gross income
        </p>
      </div>

      <ul className="space-y-1.5 text-xs">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seg.color }} />
            <span className="text-secondary">{seg.label}</span>
            <span className="ml-auto font-mono tabular-nums text-app">
              {((seg.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
