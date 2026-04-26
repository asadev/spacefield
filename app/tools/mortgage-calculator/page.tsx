"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import ToolRecommendations from "@/components/ToolRecommendations";
import { awardXP } from "@/lib/xp-actions";
import ExportButton from "@/components/ExportButton";
import { useCanvasTone } from "@/lib/useCanvasTone";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ───── Bank Data ───── */
interface BankRate {
  name: string;
  fixed1yr: number;
  fixed3yr: number;
  variable: string; // description
  variableSpread: number; // spread over EIBOR
  isIslamic: boolean;
}

const EIBOR = 4.25; // current 3-month EIBOR reference

const BANKS: BankRate[] = [
  { name: "FAB", fixed1yr: 3.75, fixed3yr: 4.29, variable: "EIBOR + 1.50%", variableSpread: 1.5, isIslamic: false },
  { name: "HSBC", fixed1yr: 3.85, fixed3yr: 4.35, variable: "EIBOR + 1.35%", variableSpread: 1.35, isIslamic: false },
  { name: "ADCB", fixed1yr: 3.89, fixed3yr: 4.39, variable: "EIBOR + 1.75%", variableSpread: 1.75, isIslamic: false },
  { name: "Standard Chartered", fixed1yr: 3.95, fixed3yr: 4.45, variable: "EIBOR + 1.50%", variableSpread: 1.5, isIslamic: false },
  { name: "Emirates NBD", fixed1yr: 3.99, fixed3yr: 4.49, variable: "EIBOR + 1.50%", variableSpread: 1.5, isIslamic: false },
  { name: "Dubai Islamic Bank", fixed1yr: 3.99, fixed3yr: 3.99, variable: "EIBOR + 1.50%", variableSpread: 1.5, isIslamic: true },
  { name: "Abu Dhabi Islamic Bank", fixed1yr: 4.09, fixed3yr: 4.09, variable: "EIBOR + 1.75%", variableSpread: 1.75, isIslamic: true },
  { name: "Emirates Islamic", fixed1yr: 4.15, fixed3yr: 4.15, variable: "EIBOR + 1.85%", variableSpread: 1.85, isIslamic: true },
  { name: "Mashreq", fixed1yr: 4.25, fixed3yr: 4.75, variable: "EIBOR + 1.85%", variableSpread: 1.85, isIslamic: false },
  { name: "RAK Bank", fixed1yr: 4.49, fixed3yr: 4.99, variable: "EIBOR + 2.00%", variableSpread: 2.0, isIslamic: false },
];

/* ───── LTV Rules (UAE Central Bank) ───── */
type ResidencyStatus = "national" | "expat" | "non-resident";
type PropertyPurpose = "first" | "second" | "offplan";

function getMaxLTV(
  residency: ResidencyStatus,
  purpose: PropertyPurpose,
  propertyValue: number
): number {
  if (residency === "national") {
    if (purpose === "offplan") return 70;
    if (purpose === "second") return 80;
    return 85; // first
  }
  if (residency === "expat") {
    if (purpose === "offplan") return 50;
    if (purpose === "second") return 70;
    return propertyValue >= 5_000_000 ? 75 : 80; // first
  }
  // non-resident
  if (purpose === "offplan") return 50;
  if (purpose === "second") return 60;
  return propertyValue >= 5_000_000 ? 65 : 75; // first
}

/* ───── Mortgage Math ───── */
function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  if (annualRate <= 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

interface AmortRow {
  year: number;
  openingBalance: number;
  principalPaid: number;
  interestPaid: number;
  closingBalance: number;
}

function buildAmortSchedule(principal: number, annualRate: number, years: number): AmortRow[] {
  const rows: AmortRow[] = [];
  let balance = principal;
  const monthlyRate = annualRate / 100 / 12;
  const monthly = calcMonthlyPayment(principal, annualRate, years);
  if (monthly <= 0) return rows;

  for (let yr = 1; yr <= years; yr++) {
    const opening = balance;
    let yearPrincipal = 0;
    let yearInterest = 0;
    for (let m = 0; m < 12; m++) {
      const interest = balance * monthlyRate;
      const princ = monthly - interest;
      yearInterest += interest;
      yearPrincipal += princ;
      balance = Math.max(0, balance - princ);
    }
    rows.push({
      year: yr,
      openingBalance: opening,
      principalPaid: yearPrincipal,
      interestPaid: yearInterest,
      closingBalance: balance,
    });
  }
  return rows;
}

/* ───── Format Helpers ───── */
const fmt = (n: number) => `AED ${Math.round(n).toLocaleString()}`;
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
};
const pct = (n: number) => `${n.toFixed(2)}%`;

/* ───── Stress Test Bar Chart (Canvas) ───── */
function StressChart({
  payments,
  labels,
}: {
  payments: number[];
  labels: string[];
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

      const maxVal = Math.max(...payments) * 1.15;
      const barCount = payments.length;
      const padding = { top: 20, right: 20, bottom: 40, left: 20 };
      const chartW = W - padding.left - padding.right;
      const chartH = H - padding.top - padding.bottom;
      const gap = 16;
      const barW = (chartW - gap * (barCount - 1)) / barCount;

      // Pull tool-accent from CSS for canvas drawing
      const accent =
        getComputedStyle(container).getPropertyValue("--tool-accent").trim() ||
        "#3b82f6";

      payments.forEach((val, i) => {
        const barH = (val / maxVal) * chartH;
        const x = padding.left + i * (barW + gap);
        const y = padding.top + chartH - barH;

        // Fade intensity by stress level
        const alpha = 0.35 + (i / Math.max(barCount - 1, 1)) * 0.55;
        ctx.fillStyle = accent;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 6);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Value on top
        ctx.fillStyle = `rgba(${tone},0.85)`;
        ctx.font = "11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(fmt(val), x + barW / 2, y - 6);

        // Label at bottom
        ctx.fillStyle = `rgba(${tone},0.5)`;
        ctx.font = "10px system-ui";
        ctx.fillText(labels[i], x + barW / 2, H - 10);
      });
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [payments, labels, tone]);

  return (
    <div ref={containerRef} className="h-52 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ───── Interest vs Principal Donut (Canvas) ───── */
function PrincipalInterestDonut({
  principal,
  interest,
}: {
  principal: number;
  interest: number;
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

      const cx = W / 2;
      const cy = H / 2;
      const radius = Math.min(W, H) / 2 - 14;
      const lineW = 16;

      const total = principal + interest;
      if (total <= 0) return;

      const principalFrac = principal / total;
      const startAngle = -Math.PI / 2;
      const principalEnd = startAngle + principalFrac * Math.PI * 2;

      const accent =
        getComputedStyle(container).getPropertyValue("--tool-accent").trim() ||
        "#3b82f6";
      const accentSoft =
        getComputedStyle(container)
          .getPropertyValue("--tool-accent-soft")
          .trim() || "rgba(59,130,246,0.18)";

      // Soft track (interest portion)
      ctx.beginPath();
      ctx.lineWidth = lineW;
      ctx.lineCap = "round";
      ctx.strokeStyle = accentSoft;
      ctx.arc(cx, cy, radius, principalEnd, startAngle + Math.PI * 2);
      ctx.stroke();

      // Principal arc
      ctx.beginPath();
      ctx.lineWidth = lineW;
      ctx.lineCap = "round";
      ctx.strokeStyle = accent;
      ctx.arc(cx, cy, radius, startAngle, principalEnd);
      ctx.stroke();

      // Center text
      ctx.fillStyle = `rgba(${tone},0.95)`;
      ctx.textAlign = "center";
      ctx.font = "600 18px system-ui";
      ctx.fillText(`${Math.round(principalFrac * 100)}%`, cx, cy + 2);
      ctx.fillStyle = `rgba(${tone},0.55)`;
      ctx.font = "10px system-ui";
      ctx.fillText("PRINCIPAL", cx, cy + 18);
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [principal, interest, tone]);

  return (
    <div ref={containerRef} className="h-44 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ───── Amortization Stacked Area Chart (Canvas) ───── */
function AmortChart({ schedule }: { schedule: AmortRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tone = useCanvasTone();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || schedule.length === 0) return;

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

      const padding = { top: 20, right: 20, bottom: 40, left: 60 };
      const chartW = W - padding.left - padding.right;
      const chartH = H - padding.top - padding.bottom;
      const n = schedule.length;
      const maxPayment = Math.max(...schedule.map((r) => r.principalPaid + r.interestPaid)) * 1.1;

      const xStep = chartW / Math.max(n - 1, 1);

      const accent =
        getComputedStyle(container).getPropertyValue("--tool-accent").trim() ||
        "#3b82f6";
      const accentSoft =
        getComputedStyle(container)
          .getPropertyValue("--tool-accent-soft")
          .trim() || "rgba(59,130,246,0.18)";

      // Grid lines
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(W - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = `rgba(${tone},0.35)`;
        ctx.font = "10px system-ui";
        ctx.textAlign = "right";
        const val = maxPayment - (maxPayment / 4) * i;
        ctx.fillText(`${Math.round(val / 1000)}k`, padding.left - 8, y + 4);
      }

      // Interest area (bottom layer) — soft accent
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartH);
      schedule.forEach((r, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - (r.interestPaid / maxPayment) * chartH;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(padding.left + (n - 1) * xStep, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = accentSoft;
      ctx.fill();

      // Principal area (stacked) — full accent at lower opacity
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartH);
      schedule.forEach((r, i) => {
        const x = padding.left + i * xStep;
        const y =
          padding.top + chartH - ((r.principalPaid + r.interestPaid) / maxPayment) * chartH;
        ctx.lineTo(x, y);
      });
      for (let i = n - 1; i >= 0; i--) {
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - (schedule[i].interestPaid / maxPayment) * chartH;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Principal line (bold accent)
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      schedule.forEach((r, i) => {
        const x = padding.left + i * xStep;
        const y =
          padding.top + chartH - ((r.principalPaid + r.interestPaid) / maxPayment) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Interest line (accent at lower opacity)
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      schedule.forEach((r, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + chartH - (r.interestPaid / maxPayment) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      // X-axis labels
      ctx.fillStyle = `rgba(${tone},0.4)`;
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      const labelEvery = n <= 10 ? 1 : n <= 20 ? 2 : 5;
      schedule.forEach((r, i) => {
        if (i % labelEvery === 0 || i === n - 1) {
          const x = padding.left + i * xStep;
          ctx.fillText(`Yr ${r.year}`, x, H - 10);
        }
      });

      // Legend
      const legendY = 12;
      ctx.font = "11px system-ui";
      ctx.fillStyle = accent;
      ctx.fillRect(W - padding.right - 160, legendY - 4, 10, 10);
      ctx.fillStyle = `rgba(${tone},0.6)`;
      ctx.textAlign = "left";
      ctx.fillText("Principal", W - padding.right - 146, legendY + 5);

      ctx.fillStyle = accentSoft;
      ctx.fillRect(W - padding.right - 76, legendY - 4, 10, 10);
      ctx.fillStyle = `rgba(${tone},0.6)`;
      ctx.fillText("Interest", W - padding.right - 62, legendY + 5);
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [schedule, tone]);

  return (
    <div ref={containerRef} className="h-64 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ───── Segmented Pill Row ───── */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-full border border-app bg-app-elevated p-0.5 text-xs"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors ${
              active
                ? "bg-tool-accent text-white shadow-sm"
                : "text-muted hover:text-app"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───── Slider with live readout ───── */
function BankingSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatter,
  ticks,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  formatter?: (n: number) => string;
  ticks?: { label: string; value?: number }[];
  suffix?: string;
}) {
  const pctFilled = ((value - min) / (max - min)) * 100;
  const display = formatter ? formatter(value) : value.toString();

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <label className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
          {label}
        </label>
        <span className="font-mono text-sm font-semibold tabular-nums text-app">
          {display}
          {suffix}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tool-slider relative w-full"
          style={{ ["--tool-slider-fill" as string]: `${pctFilled}%` }}
        />
      </div>
      {ticks && (
        <div className="mt-1.5 flex justify-between text-[0.6rem] font-mono tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t.label}>{t.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */
export default function MortgageCalculatorPage() {
  return (
    <Suspense fallback={null}>
      <MortgageCalculatorInner />
    </Suspense>
  );
}

function MortgageCalculatorInner() {
  const searchParams = useSearchParams();
  const isFramed = searchParams?.get("frame") === "1";

  /* ── Input State ── */
  const [propertyValue, setPropertyValue] = useState("2000000");
  const [residency, setResidency] = useState<ResidencyStatus>("expat");
  const [purpose, setPurpose] = useState<PropertyPurpose>("first");
  const [termYears, setTermYears] = useState(25);
  const [selectedBank, setSelectedBank] = useState("");
  const [manualRate, setManualRate] = useState("4.49");
  const [rateType, setRateType] = useState<"fixed1yr" | "fixed3yr" | "variable">("fixed3yr");
  const [referenceIncome, setReferenceIncome] = useState("");
  const [resultsView, setResultsView] = useState<"summary" | "chart" | "table">("summary");
  const [copied, setCopied] = useState(false);
  const xpAwarded = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  /* ── Derived Rate ── */
  const effectiveRate = useMemo(() => {
    if (selectedBank) {
      const bank = BANKS.find((b) => b.name === selectedBank);
      if (!bank) return Number(manualRate) || 4.49;
      if (rateType === "fixed1yr") return bank.fixed1yr;
      if (rateType === "fixed3yr") return bank.fixed3yr;
      return EIBOR + bank.variableSpread;
    }
    return Number(manualRate) || 4.49;
  }, [selectedBank, rateType, manualRate]);

  /* ── Core Calculations ── */
  const results = useMemo(() => {
    const pv = Number(propertyValue);
    if (!pv || pv <= 0) return null;

    const maxLTV = getMaxLTV(residency, purpose, pv);
    const loanAmount = pv * (maxLTV / 100);
    const downPayment = pv - loanAmount;
    const monthly = calcMonthlyPayment(loanAmount, effectiveRate, termYears);
    const totalPaid = monthly * termYears * 12;
    const totalInterest = totalPaid - loanAmount;

    // Stress test
    const stressPayments = [0, 1, 2, 3].map((bump) =>
      calcMonthlyPayment(loanAmount, effectiveRate + bump, termYears)
    );
    const stressLabels = [0, 1, 2, 3].map((bump) =>
      bump === 0 ? `${pct(effectiveRate)}` : `+${bump}% (${pct(effectiveRate + bump)})`
    );

    // Amortization
    const schedule = buildAmortSchedule(loanAmount, effectiveRate, termYears);

    // Bank comparison
    const bankComparison = BANKS.map((bank) => {
      const rate =
        rateType === "fixed1yr"
          ? bank.fixed1yr
          : rateType === "fixed3yr"
          ? bank.fixed3yr
          : EIBOR + bank.variableSpread;
      const mp = calcMonthlyPayment(loanAmount, rate, termYears);
      const tp = mp * termYears * 12;
      return { ...bank, rate, monthlyPayment: mp, totalPaid: tp, totalInterest: tp - loanAmount };
    }).sort((a, b) => a.monthlyPayment - b.monthlyPayment);

    const bestMonthly = bankComparison[0]?.monthlyPayment ?? 0;

    return {
      maxLTV,
      loanAmount,
      downPayment,
      monthly,
      totalPaid,
      totalInterest,
      effectiveRate,
      stressPayments,
      stressLabels,
      schedule,
      bankComparison,
      bestMonthly,
    };
  }, [propertyValue, residency, purpose, termYears, effectiveRate, rateType]);

  useEffect(() => {
    if (results && !xpAwarded.current) {
      xpAwarded.current = true;
      awardXP('tool_use', 'tool', 'mortgage-calculator').catch(() => {});
    }
  }, [results]);

  /* ── Income Warning ── */
  const incomeWarning = useMemo(() => {
    if (!results || !referenceIncome) return null;
    const income = Number(referenceIncome);
    if (!income) return null;
    const stressed = results.stressPayments[2]; // +2%
    if (stressed > income * 0.5)
      return `At +2% rate stress, your payment (${fmt(stressed)}) would exceed 50% of your stated income (${fmt(income)}). UAE banks typically cap debt-burden at 50%.`;
    return null;
  }, [results, referenceIncome]);

  /* ── Share ── */
  const buildShareText = useCallback(() => {
    if (!results) return "";
    const pv = Number(propertyValue);
    return [
      `UAE Mortgage Estimate`,
      `Property: ${fmt(pv)}`,
      `Down Payment: ${fmt(results.downPayment)} (${100 - results.maxLTV}%)`,
      `Loan: ${fmt(results.loanAmount)}`,
      `Rate: ${pct(results.effectiveRate)} | Term: ${termYears} years`,
      `Monthly Payment: ${fmt(results.monthly)}`,
      `Total Interest: ${fmt(results.totalInterest)}`,
      ``,
      `Calculate yours: https://example.com/tools/mortgage-calculator`,
    ].join("\n");
  }, [results, propertyValue, termYears]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(buildShareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildShareText]);

  const handleWhatsApp = useCallback(() => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildShareText())}`,
      "_blank"
    );
  }, [buildShareText]);

  /* ── Residency Labels ── */
  const residencyOptions: { value: ResidencyStatus; label: string }[] = [
    { value: "national", label: "UAE National" },
    { value: "expat", label: "Expat Resident" },
    { value: "non-resident", label: "Non-Resident" },
  ];
  const purposeOptions: { value: PropertyPurpose; label: string }[] = [
    { value: "first", label: "First Home" },
    { value: "second", label: "Second+" },
    { value: "offplan", label: "Off-Plan" },
  ];
  const rateTypeOptions: { value: "fixed1yr" | "fixed3yr" | "variable"; label: string }[] = [
    { value: "fixed1yr", label: "Fixed 1Y" },
    { value: "fixed3yr", label: "Fixed 3Y" },
    { value: "variable", label: "Variable" },
  ];
  const termOptions: { value: 15 | 20 | 25 | 30; label: string }[] = [
    { value: 15, label: "15Y" },
    { value: 20, label: "20Y" },
    { value: 25, label: "25Y" },
    { value: 30, label: "30Y" },
  ];
  const viewOptions: { value: "summary" | "chart" | "table"; label: string }[] = [
    { value: "summary", label: "Summary" },
    { value: "chart", label: "Chart" },
    { value: "table", label: "Table" },
  ];

  const pv = Number(propertyValue) || 0;

  return (
    <AuthGate>
      <div
        data-tool-theme="calculators"
        data-tool="mortgage-calculator"
        className="min-h-screen bg-app text-app"
      >
        {/* ═════════ STYLE ═════════ */}
        <style jsx global>{`
          [data-tool="mortgage-calculator"] .tool-slider {
            appearance: none;
            -webkit-appearance: none;
            width: 100%;
            height: 26px;
            background: transparent;
            cursor: pointer;
          }
          [data-tool="mortgage-calculator"] .tool-slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(
              to right,
              var(--tool-accent) 0%,
              var(--tool-accent) var(--tool-slider-fill, 0%),
              var(--tool-accent-soft) var(--tool-slider-fill, 0%),
              var(--tool-accent-soft) 100%
            );
          }
          [data-tool="mortgage-calculator"] .tool-slider::-moz-range-track {
            height: 6px;
            border-radius: 999px;
            background: var(--tool-accent-soft);
          }
          [data-tool="mortgage-calculator"] .tool-slider::-moz-range-progress {
            height: 6px;
            border-radius: 999px;
            background: var(--tool-accent);
          }
          [data-tool="mortgage-calculator"] .tool-slider::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 999px;
            background: var(--bg-app-elevated, #ffffff);
            border: 2px solid var(--tool-accent);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            margin-top: -9px;
            transition: transform 120ms ease, box-shadow 120ms ease;
          }
          [data-tool="mortgage-calculator"] .tool-slider:active::-webkit-slider-thumb,
          [data-tool="mortgage-calculator"] .tool-slider:focus-visible::-webkit-slider-thumb {
            transform: scale(1.08);
          }
          [data-tool="mortgage-calculator"] .tool-slider::-moz-range-thumb {
            width: 24px;
            height: 24px;
            border-radius: 999px;
            background: var(--bg-app-elevated, #ffffff);
            border: 2px solid var(--tool-accent);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            cursor: pointer;
          }
          [data-tool="mortgage-calculator"] .tool-slider:focus-visible {
            outline: none;
          }
          [data-tool="mortgage-calculator"] .mc-pulse {
            animation: mc-pulse 2.2s ease-in-out infinite;
          }
          @keyframes mc-pulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.25); opacity: 0.4; }
          }
        `}</style>

        {/* ═════════ HERO HEADER ═════════ */}
        {!isFramed && (
          <header className="tool-hero relative overflow-hidden border-b border-app">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-tool-accent-soft ring-1 ring-tool-accent">
                  <span
                    className="mc-pulse absolute h-2 w-2 rounded-full bg-tool-accent"
                    aria-hidden
                  />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6 text-tool-accent"
                  >
                    <path d="M3 10.5 12 4l9 6.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 10v9h14v-9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 19v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-tool-accent">
                    Calculator
                  </p>
                  <h1 className="font-tool-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    Mortgage Calculator
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-secondary">
                    UAE bank rates, Central Bank LTV caps, stress tests, and full amortisation — in real time.
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.7rem] tabular-nums text-muted sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" aria-hidden />
                  EIBOR 3M · {pct(EIBOR)}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* ═════════ FRAMED MINI HEADER ═════════ */}
        {isFramed && (
          <div className="tool-hero border-b border-app px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" aria-hidden />
              <span>Calculator</span>
              <span className="text-muted">·</span>
              <span className="text-tool-accent">Mortgage</span>
              <span className="ml-auto font-mono tabular-nums">EIBOR {pct(EIBOR)}</span>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
          {/* ═════════ DESKTOP: TWO-COLUMN / MOBILE: STACK ═════════ */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* ───── LEFT: INPUT PANEL ───── */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="rounded-2xl border border-app bg-app-elevated p-5 sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-tool-heading text-sm font-semibold tracking-tight">Loan Configuration</h2>
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                  Inputs
                </span>
              </div>

              <div className="space-y-5">
                {/* Property Value */}
                <div>
                  <div className="mb-2 flex items-end justify-between">
                    <label className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                      Property Value (AED)
                    </label>
                    {pv > 0 && (
                      <span className="font-mono text-xs tabular-nums text-muted">
                        {pv >= 5_000_000 ? "Above 5M tier" : "Below 5M tier"}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs font-medium text-muted">
                      AED
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={propertyValue}
                      onChange={(e) =>
                        setPropertyValue(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="2,000,000"
                      className="w-full rounded-xl border border-app bg-app px-3 py-3 pl-14 font-mono text-base font-semibold tabular-nums tracking-tight text-app placeholder-muted transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/30"
                    />
                  </div>
                  {/* Quick-pick property values */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[1_000_000, 2_000_000, 3_500_000, 5_000_000, 8_000_000].map((v) => (
                      <button
                        key={v}
                        onClick={() => setPropertyValue(String(v))}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[0.65rem] tabular-nums transition-colors ${
                          pv === v
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app text-muted hover:text-app"
                        }`}
                      >
                        {fmtCompact(v)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Residency */}
                <div>
                  <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Residency Status
                  </label>
                  <Segmented
                    value={residency}
                    onChange={setResidency}
                    options={residencyOptions}
                    ariaLabel="Residency status"
                  />
                </div>

                {/* Purpose */}
                <div>
                  <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Property Purpose
                  </label>
                  <Segmented
                    value={purpose}
                    onChange={setPurpose}
                    options={purposeOptions}
                    ariaLabel="Property purpose"
                  />
                </div>

                {/* Loan Term — segmented pill row (15/20/25/30) */}
                <div>
                  <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Loan Term
                  </label>
                  <Segmented
                    value={String(termYears) as "15" | "20" | "25" | "30"}
                    onChange={(v) => setTermYears(Number(v))}
                    options={termOptions.map((t) => ({
                      value: String(t.value) as "15" | "20" | "25" | "30",
                      label: t.label,
                    }))}
                    ariaLabel="Loan term"
                  />
                </div>

                {/* Bank */}
                <div>
                  <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Lender
                  </label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full rounded-xl border border-app bg-app px-3 py-2.5 text-sm text-app transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/30"
                  >
                    <option value="">Manual Rate</option>
                    {BANKS.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                        {b.isIslamic ? " (Islamic)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rate Type / Manual Rate */}
                {selectedBank ? (
                  <div>
                    <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                      Rate Structure
                    </label>
                    <Segmented
                      value={rateType}
                      onChange={setRateType}
                      options={rateTypeOptions}
                      ariaLabel="Rate type"
                    />
                    <p className="mt-2 font-mono text-[0.7rem] tabular-nums text-muted">
                      Effective rate · <span className="text-tool-accent">{pct(effectiveRate)}</span>
                      {rateType === "variable" ? ` (EIBOR ${pct(EIBOR)} + spread)` : ""}
                    </p>
                  </div>
                ) : (
                  <BankingSlider
                    label="Interest Rate"
                    value={Number(manualRate) || 4.49}
                    min={2}
                    max={8}
                    step={0.05}
                    onChange={(v) => setManualRate(v.toFixed(2))}
                    formatter={(n) => n.toFixed(2)}
                    suffix="%"
                    ticks={[
                      { label: "2%" },
                      { label: "4%" },
                      { label: "6%" },
                      { label: "8%" },
                    ]}
                  />
                )}

                {/* Monthly Income (optional) */}
                <div>
                  <label className="mb-2 block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Monthly Income (optional · for DBR check)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs font-medium text-muted">
                      AED
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={referenceIncome}
                      onChange={(e) =>
                        setReferenceIncome(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="35,000"
                      className="w-full rounded-xl border border-app bg-app px-3 py-2.5 pl-14 font-mono text-sm tabular-nums text-app placeholder-muted transition-colors focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/30"
                    />
                  </div>
                </div>
              </div>
            </motion.section>

            {/* ───── RIGHT: LIVE RESULT + INTERNAL TABS ───── */}
            <div ref={resultsRef} className="space-y-4">
              {/* Headline result card — bg-tool-accent-soft */}
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.05, ease }}
                className="relative overflow-hidden rounded-2xl border border-tool-accent bg-tool-accent-soft p-6 sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-tool-accent">
                    Monthly Payment
                  </p>
                  {results && (
                    <span className="font-mono text-[0.65rem] tabular-nums text-muted">
                      {pct(effectiveRate)} · {termYears}Y
                    </span>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {results ? (
                    <motion.div
                      key={`${results.monthly.toFixed(0)}-${termYears}-${effectiveRate}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-1 flex items-baseline gap-2 tabular-nums"
                    >
                      <span className="font-mono text-xs font-medium text-muted">AED</span>
                      <span className="font-tool-heading text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
                        {Math.round(results.monthly).toLocaleString()}
                      </span>
                      <span className="font-mono text-xs text-muted">/ mo</span>
                    </motion.div>
                  ) : (
                    <div className="mt-1 font-tool-heading text-5xl font-semibold text-muted sm:text-6xl">
                      AED —
                    </div>
                  )}
                </AnimatePresence>

                {/* Small stats grid */}
                {results && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: "Loan",
                        value: fmtCompact(results.loanAmount),
                        sub: `${results.maxLTV}% LTV`,
                      },
                      {
                        label: "Down",
                        value: fmtCompact(results.downPayment),
                        sub: `${100 - results.maxLTV}%`,
                      },
                      {
                        label: "Total Int.",
                        value: fmtCompact(results.totalInterest),
                        sub: `${((results.totalInterest / results.loanAmount) * 100).toFixed(0)}%`,
                      },
                      {
                        label: "Total Paid",
                        value: fmtCompact(results.totalPaid),
                        sub: `${termYears}Y`,
                      },
                    ].map((s) => (
                      <div key={s.label} className="min-w-0">
                        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                          {s.label}
                        </p>
                        <p className="mt-0.5 truncate font-tool-heading text-base font-semibold tabular-nums">
                          {s.value}
                        </p>
                        <p className="truncate font-mono text-[0.65rem] tabular-nums text-muted">
                          {s.sub}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {results && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-app pt-4">
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                      UAE CB LTV · {residencyOptions.find((o) => o.value === residency)?.label} ·{" "}
                      {purposeOptions.find((o) => o.value === purpose)?.label}
                    </span>
                    <ExportButton
                      targetRef={resultsRef}
                      filename="mortgage-calculator-results"
                    />
                  </div>
                )}
              </motion.section>

              {/* ───── Internal sub-view tabs (Summary / Chart / Table) ───── */}
              {results && (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.1, ease }}
                  className="rounded-2xl border border-app bg-app-elevated p-5"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-tool-heading text-sm font-semibold tracking-tight">
                        Loan Breakdown
                      </h3>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                        Principal vs interest · {termYears} years
                      </p>
                    </div>

                    {/* Tab buttons */}
                    <div role="tablist" className="inline-flex rounded-full border border-app bg-app p-0.5 text-xs">
                      {viewOptions.map((o) => {
                        const active = o.value === resultsView;
                        return (
                          <button
                            key={o.value}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setResultsView(o.value)}
                            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                              active
                                ? "bg-tool-accent text-white shadow-sm"
                                : "text-muted hover:text-app"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {/* SUMMARY VIEW — donut + key splits */}
                    {resultsView === "summary" && (
                      <motion.div
                        key="summary"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
                      >
                        <div className="w-full sm:w-44">
                          <PrincipalInterestDonut
                            principal={results.loanAmount}
                            interest={results.totalInterest}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-app bg-app p-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-tool-accent" aria-hidden />
                              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                                Principal
                              </p>
                            </div>
                            <p className="mt-1 font-tool-heading text-lg font-semibold tabular-nums">
                              {fmt(results.loanAmount)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-app bg-app p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full bg-tool-accent-soft ring-1 ring-tool-accent"
                                aria-hidden
                              />
                              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                                Interest
                              </p>
                            </div>
                            <p className="mt-1 font-tool-heading text-lg font-semibold tabular-nums">
                              {fmt(results.totalInterest)}
                            </p>
                          </div>
                          <div className="col-span-2 rounded-xl border border-app bg-app p-3">
                            <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                              Total of {termYears * 12} payments
                            </p>
                            <p className="mt-1 font-tool-heading text-xl font-semibold tabular-nums">
                              {fmt(results.totalPaid)}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* CHART VIEW */}
                    {resultsView === "chart" && (
                      <motion.div
                        key="chart"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="mb-3 flex items-center gap-2 text-[0.65rem]">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-app px-2 py-1 font-mono text-muted">
                            <span className="h-2 w-2 rounded-full bg-tool-accent" aria-hidden />
                            Principal
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-app px-2 py-1 font-mono text-muted">
                            <span
                              className="h-2 w-2 rounded-full bg-tool-accent-soft ring-1 ring-tool-accent"
                              aria-hidden
                            />
                            Interest
                          </span>
                        </div>
                        <AmortChart schedule={results.schedule} />
                      </motion.div>
                    )}

                    {/* TABLE VIEW — striped rows */}
                    {resultsView === "table" && (
                      <motion.div
                        key="table"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-x-auto rounded-xl border border-app"
                      >
                        <table className="w-full font-mono text-xs tabular-nums">
                          <thead>
                            <tr className="border-b border-app bg-app-elevated text-left text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                              <th className="px-3 py-2">Yr</th>
                              <th className="px-3 py-2 text-right">Opening</th>
                              <th className="px-3 py-2 text-right">Principal</th>
                              <th className="px-3 py-2 text-right">Interest</th>
                              <th className="px-3 py-2 text-right">Closing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.schedule.map((row, idx) => (
                              <tr
                                key={row.year}
                                className={`border-b border-app last:border-b-0 ${
                                  idx % 2 === 0 ? "bg-app" : "bg-app-elevated"
                                }`}
                              >
                                <td className="px-3 py-1.5 text-muted">{row.year}</td>
                                <td className="px-3 py-1.5 text-right">
                                  {fmt(row.openingBalance)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-tool-accent">
                                  {fmt(row.principalPaid)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-secondary">
                                  {fmt(row.interestPaid)}
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  {fmt(row.closingBalance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>
              )}
            </div>
          </div>

          {/* ═════════ BELOW-THE-FOLD: STRESS + BANK COMP + LTV ═════════ */}
          <AnimatePresence mode="wait">
            {results && (
              <motion.div
                key="below"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease }}
                className="mt-6 space-y-6"
              >
                {/* Stress test */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.1, ease }}
                  className="rounded-2xl border border-app bg-app-elevated p-5 sm:p-6"
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-tool-heading text-sm font-semibold tracking-tight">
                        Rate Stress Test
                      </h3>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                        Monthly payment at +0 / +1 / +2 / +3 pts
                      </p>
                    </div>
                    <span className="font-mono text-[0.65rem] text-muted">
                      Base · {pct(effectiveRate)}
                    </span>
                  </div>

                  <StressChart payments={results.stressPayments} labels={results.stressLabels} />

                  {incomeWarning && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-4 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-500"
                    >
                      {incomeWarning}
                    </motion.div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {results.stressPayments.map((p, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-app bg-app px-3 py-2.5 text-center"
                      >
                        <p className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          {results.stressLabels[i]}
                        </p>
                        <p className="mt-0.5 font-tool-heading text-sm font-semibold tabular-nums">
                          {fmt(p)}
                        </p>
                        {i > 0 && (
                          <p className="font-mono text-[0.6rem] tabular-nums text-muted">
                            +{fmt(p - results.stressPayments[0])}/mo
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.section>

                {/* Bank comparison — striped rows */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.15, ease }}
                  className="rounded-2xl border border-app bg-app-elevated p-5 sm:p-6"
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-tool-heading text-sm font-semibold tracking-tight">
                        Bank Comparison
                      </h3>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                        {rateType === "fixed1yr"
                          ? "Fixed 1 Year"
                          : rateType === "fixed3yr"
                          ? "Fixed 3 Years"
                          : "Variable"}{" "}
                        · {BANKS.length} UAE banks · {fmt(results.loanAmount)} / {termYears}Y
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-app">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-app bg-app-elevated text-left font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          <th className="px-3 py-2">Bank</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Monthly</th>
                          <th className="px-3 py-2 text-right">Total Interest</th>
                          <th className="px-3 py-2 text-right">Total Paid</th>
                          <th className="px-3 py-2 text-right">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.bankComparison.map((bank, idx) => {
                          const isBest = bank.monthlyPayment === results.bestMonthly;
                          return (
                            <tr
                              key={bank.name}
                              className={`border-b border-app last:border-b-0 font-mono tabular-nums transition-colors ${
                                isBest
                                  ? "bg-tool-accent-soft"
                                  : idx % 2 === 0
                                  ? "bg-app"
                                  : "bg-app-elevated"
                              }`}
                            >
                              <td className="px-3 py-2 font-sans font-medium">
                                <span className="inline-flex items-center gap-2">
                                  {bank.name}
                                  {isBest && (
                                    <span className="rounded-full bg-tool-accent px-1.5 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-wider text-white">
                                      Best
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">{pct(bank.rate)}</td>
                              <td
                                className={`px-3 py-2 text-right font-semibold ${
                                  isBest ? "text-tool-accent" : ""
                                }`}
                              >
                                {fmt(bank.monthlyPayment)}
                              </td>
                              <td className="px-3 py-2 text-right text-muted">
                                {fmt(bank.totalInterest)}
                              </td>
                              <td className="px-3 py-2 text-right text-muted">
                                {fmt(bank.totalPaid)}
                              </td>
                              <td className="px-3 py-2 text-right font-sans text-[0.65rem] text-muted">
                                {bank.isIslamic ? "Islamic" : "Conv."}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {results.bankComparison.length >= 2 && (
                    <p className="mt-3 font-mono text-[0.7rem] tabular-nums text-muted">
                      Spread cheapest → most expensive:{" "}
                      <span className="text-app">
                        {fmt(
                          results.bankComparison[results.bankComparison.length - 1]
                            .monthlyPayment - results.bankComparison[0].monthlyPayment
                        )}
                        /mo
                      </span>{" "}
                      ·{" "}
                      <span className="text-app">
                        {fmt(
                          results.bankComparison[results.bankComparison.length - 1].totalPaid -
                            results.bankComparison[0].totalPaid
                        )}
                      </span>{" "}
                      over {termYears}Y
                    </p>
                  )}
                </motion.section>

                {/* LTV reference */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.2, ease }}
                  className="rounded-2xl border border-app bg-app-elevated p-5 sm:p-6"
                >
                  <div className="mb-3">
                    <h3 className="font-tool-heading text-sm font-semibold tracking-tight">
                      UAE Central Bank LTV Limits
                    </h3>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                      Regulatory maximum loan-to-value by buyer profile
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-app">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-app bg-app-elevated text-left font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          <th className="px-3 py-2">Buyer</th>
                          <th className="px-3 py-2 text-right">First &lt;5M</th>
                          <th className="px-3 py-2 text-right">First ≥5M</th>
                          <th className="px-3 py-2 text-right">Second+</th>
                          <th className="px-3 py-2 text-right">Off-Plan</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono tabular-nums">
                        {[
                          { buyer: "UAE National", k: "national", vals: ["85%", "85%", "80%", "70%"] },
                          { buyer: "Expat Resident", k: "expat", vals: ["80%", "75%", "70%", "50%"] },
                          { buyer: "Non-Resident", k: "non-resident", vals: ["75%", "65%", "60%", "50%"] },
                        ].map((row, idx) => {
                          const active = row.k === residency;
                          return (
                            <tr
                              key={row.k}
                              className={`border-b border-app last:border-b-0 ${
                                active
                                  ? "bg-tool-accent-soft"
                                  : idx % 2 === 0
                                  ? "bg-app"
                                  : "bg-app-elevated"
                              }`}
                            >
                              <td
                                className={`px-3 py-2 font-sans font-medium ${
                                  active ? "text-tool-accent" : ""
                                }`}
                              >
                                {row.buyer}
                              </td>
                              {row.vals.map((v, i) => (
                                <td key={i} className="px-3 py-2 text-right">
                                  {v}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.section>

                {/* Share */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.25, ease }}
                  className="flex flex-wrap gap-3"
                >
                  <button
                    onClick={handleCopy}
                    className="rounded-full border border-app bg-app-elevated px-5 py-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    {copied ? "Copied ✓" : "Copy Summary"}
                  </button>
                  <button
                    onClick={handleWhatsApp}
                    className="rounded-full bg-tool-accent px-5 py-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
                  >
                    Share via WhatsApp
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tool recommendations */}
          <div className="mt-16">
            <ToolRecommendations slug="mortgage-calculator" />
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
