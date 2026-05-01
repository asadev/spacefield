"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import ToolRecommendations from "@/components/ToolRecommendations";
import { useCanvasTone } from "@/lib/useCanvasTone";
import { awardXP } from "@/lib/xp-actions";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ───── Types ───── */
interface Inputs {
  purchasePrice: string;
  monthlyRent: string;
  annualRentIncrease: string;
  occupancyRate: string;
  annualServiceCharge: string;
  serviceChargeInflation: string;
  annualMaintenance: string;
  insurance: string;
  managementFee: string;
  mortgageEnabled: boolean;
  loanAmount: string;
  interestRate: string;
  remainingTerm: string;
  monthlyPaymentManual: string;
  projectionYears: number;
  annualAppreciation: string;
  terminalCapRate: string;
}

interface YearData {
  year: number;
  grossRent: number;
  serviceCharge: number;
  maintenance: number;
  insurance: number;
  managementFee: number;
  mortgagePayment: number;
  totalExpenses: number;
  noi: number;
  cashFlow: number;
  propertyValue: number;
  equity: number;
  cumulativeCashFlow: number;
  cashOnCash: number;
  remainingMortgage: number;
}

interface Summary {
  totalNetCashFlow: number;
  avgCashOnCash: number;
  irr: number;
  terminalValue: number;
  totalReturn: number;
  equityMultiple: number;
}

type CadenceMode = "annual" | "monthly";

/* ───── Helpers ───── */
function num(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function fmtFull(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
}

function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  if (annualRate <= 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcRemainingBalance(principal: number, annualRate: number, totalYears: number, yearsPaid: number): number {
  if (principal <= 0 || totalYears <= 0) return 0;
  if (yearsPaid >= totalYears) return 0;
  if (annualRate <= 0) return principal * (1 - yearsPaid / totalYears);
  const r = annualRate / 100 / 12;
  const n = totalYears * 12;
  const p = yearsPaid * 12;
  const payment = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return principal * Math.pow(1 + r, p) - payment * ((Math.pow(1 + r, p) - 1) / r);
}

function calcIRR(cashFlows: number[]): number {
  let lo = -0.5, hi = 2.0;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    let npv = 0;
    for (let i = 0; i < cashFlows.length; i++) {
      npv += cashFlows[i] / Math.pow(1 + mid, i);
    }
    if (npv > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ───── Compact Input Field ───── */
function Field({
  label,
  suffix,
  k,
  placeholder,
  inputs,
  set,
}: {
  label: string;
  suffix?: string;
  k: keyof Inputs;
  placeholder?: string;
  inputs: Inputs;
  set: (key: keyof Inputs, value: string | boolean | number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="block text-[10px] font-medium text-muted uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={inputs[k] as string}
          onChange={(e) => set(k, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-app-elevated border border-app rounded-md px-2.5 py-1.5 text-sm font-mono tabular-nums text-app placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-tool-accent focus:border-tool-accent transition-all"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-faint pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/* ───── Page wrapper (Suspense for useSearchParams) ───── */
export default function CashFlowModelerPage() {
  return (
    <Suspense fallback={null}>
      <CashFlowModelerInner />
    </Suspense>
  );
}

/* ───── Main Component ───── */
function CashFlowModelerInner() {
  const searchParams = useSearchParams();
  const isFramed = searchParams?.get("frame") === "1";

  const [inputs, setInputs] = useState<Inputs>({
    purchasePrice: "2000000",
    monthlyRent: "12000",
    annualRentIncrease: "5",
    occupancyRate: "90",
    annualServiceCharge: "25000",
    serviceChargeInflation: "3",
    annualMaintenance: "1",
    insurance: "0",
    managementFee: "0",
    mortgageEnabled: false,
    loanAmount: "1500000",
    interestRate: "4.5",
    remainingTerm: "20",
    monthlyPaymentManual: "",
    projectionYears: 10,
    annualAppreciation: "5",
    terminalCapRate: "7",
  });

  const [cadence, setCadence] = useState<CadenceMode>("annual");
  const [activeYear, setActiveYear] = useState(1);
  const cashFlowChartRef = useRef<HTMLCanvasElement>(null);
  const equityChartRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();
  const xpAwarded = useRef(false);

  const set = useCallback((key: keyof Inputs, value: string | boolean | number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ───── Core Calculations ───── */
  const { yearData, summary } = useMemo(() => {
    const price = num(inputs.purchasePrice);
    const rent = num(inputs.monthlyRent);
    const rentGrowth = num(inputs.annualRentIncrease) / 100;
    const occupancy = num(inputs.occupancyRate) / 100;
    const sc = num(inputs.annualServiceCharge);
    const scInflation = num(inputs.serviceChargeInflation) / 100;
    const maintPct = num(inputs.annualMaintenance) / 100;
    const ins = num(inputs.insurance);
    const mgmtPct = num(inputs.managementFee) / 100;
    const appreciation = num(inputs.annualAppreciation) / 100;
    const termCapRate = num(inputs.terminalCapRate) / 100;
    const years = inputs.projectionYears;

    const loanAmt = inputs.mortgageEnabled ? num(inputs.loanAmount) : 0;
    const intRate = num(inputs.interestRate);
    const term = num(inputs.remainingTerm);
    const manualPayment = num(inputs.monthlyPaymentManual);
    const monthlyMortgage = inputs.mortgageEnabled
      ? manualPayment > 0
        ? manualPayment
        : calcMonthlyPayment(loanAmt, intRate, term)
      : 0;

    const initialEquity = price - loanAmt;
    const data: YearData[] = [];
    let cumCF = 0;

    for (let y = 1; y <= years; y++) {
      const currentRent = rent * Math.pow(1 + rentGrowth, y - 1);
      const grossRent = currentRent * 12 * occupancy;
      const currentSC = sc * Math.pow(1 + scInflation, y - 1);
      const propValue = price * Math.pow(1 + appreciation, y);
      const maint = propValue * maintPct;
      const mgmt = grossRent * mgmtPct;
      const yearsPaidOff = y;
      const mortgagePaid = yearsPaidOff > term ? 0 : monthlyMortgage * 12;
      const remaining = inputs.mortgageEnabled
        ? Math.max(0, calcRemainingBalance(loanAmt, intRate, term, y))
        : 0;

      const totalExp = currentSC + maint + ins + mgmt + mortgagePaid;
      const noi = grossRent - (currentSC + maint + ins + mgmt);
      const cf = noi - mortgagePaid;
      cumCF += cf;
      const eq = propValue - remaining;
      const coC = initialEquity > 0 ? (cf / initialEquity) * 100 : 0;

      data.push({
        year: y,
        grossRent,
        serviceCharge: currentSC,
        maintenance: maint,
        insurance: ins,
        managementFee: mgmt,
        mortgagePayment: mortgagePaid,
        totalExpenses: totalExp,
        noi,
        cashFlow: cf,
        propertyValue: propValue,
        equity: eq,
        cumulativeCashFlow: cumCF,
        cashOnCash: coC,
        remainingMortgage: remaining,
      });
    }

    const lastYear = data[data.length - 1];
    const terminalValue = lastYear ? lastYear.noi / (termCapRate || 0.07) : 0;
    const totalReturn = cumCF + terminalValue - price;
    const equityMultiple = initialEquity > 0 ? (cumCF + terminalValue) / initialEquity : 0;
    const avgCoC = data.length > 0 ? data.reduce((s, d) => s + d.cashOnCash, 0) / data.length : 0;

    const irrFlows = [-initialEquity];
    for (let i = 0; i < data.length; i++) {
      const flow = i === data.length - 1 ? data[i].cashFlow + terminalValue : data[i].cashFlow;
      irrFlows.push(flow);
    }
    const irr = data.length > 0 ? calcIRR(irrFlows) * 100 : 0;

    const summaryData: Summary = {
      totalNetCashFlow: cumCF,
      avgCashOnCash: avgCoC,
      irr,
      terminalValue,
      totalReturn,
      equityMultiple,
    };

    return { yearData: data, summary: summaryData };
  }, [inputs]);

  // Reset active year if outside range when projection shrinks
  useEffect(() => {
    if (activeYear > yearData.length) setActiveYear(yearData.length || 1);
  }, [yearData.length, activeYear]);

  // Award XP after first valid model
  useEffect(() => {
    if (yearData.length > 0 && !xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "cash-flow-modeler").catch(() => {});
    }
  }, [yearData.length]);

  const yearsPositive = useMemo(
    () => yearData.filter((d) => d.cashFlow >= 0).length,
    [yearData]
  );
  const avgAnnualCF = useMemo(
    () => (yearData.length > 0 ? summary.totalNetCashFlow / yearData.length : 0),
    [summary, yearData]
  );

  const initialEquityValue = useMemo(() => {
    const price = num(inputs.purchasePrice);
    const loan = inputs.mortgageEnabled ? num(inputs.loanAmount) : 0;
    return Math.max(0, price - loan);
  }, [inputs.purchasePrice, inputs.loanAmount, inputs.mortgageEnabled]);

  // Free cash flow yield = avg annual CF / initial equity
  const fcfYield = useMemo(() => {
    if (initialEquityValue <= 0) return 0;
    return (avgAnnualCF / initialEquityValue) * 100;
  }, [avgAnnualCF, initialEquityValue]);

  const heroFreeCashFlow = useMemo(() => {
    const yr = yearData[activeYear - 1];
    if (!yr) return 0;
    return cadence === "monthly" ? yr.cashFlow / 12 : yr.cashFlow;
  }, [yearData, activeYear, cadence]);

  const activeYearData = yearData[activeYear - 1];

  /* ───── Sensitivity ───── */
  const sensitivity = useMemo(() => {
    const calcCF = (occ: number, rg: number, ir: number) => {
      const price = num(inputs.purchasePrice);
      const rent = num(inputs.monthlyRent);
      const sc = num(inputs.annualServiceCharge);
      const scInf = num(inputs.serviceChargeInflation) / 100;
      const maintPct = num(inputs.annualMaintenance) / 100;
      const ins = num(inputs.insurance);
      const mgmtPct = num(inputs.managementFee) / 100;
      const appreciation = num(inputs.annualAppreciation) / 100;
      const years = inputs.projectionYears;
      const loanAmt = inputs.mortgageEnabled ? num(inputs.loanAmount) : 0;
      const term = num(inputs.remainingTerm);
      const manualPayment = num(inputs.monthlyPaymentManual);
      const mp = inputs.mortgageEnabled
        ? manualPayment > 0 ? manualPayment : calcMonthlyPayment(loanAmt, ir, term)
        : 0;

      let total = 0;
      for (let y = 1; y <= years; y++) {
        const curRent = rent * Math.pow(1 + rg / 100, y - 1);
        const gross = curRent * 12 * (occ / 100);
        const curSC = sc * Math.pow(1 + scInf, y - 1);
        const propVal = price * Math.pow(1 + appreciation, y);
        const maint = propVal * maintPct;
        const mgmt = gross * mgmtPct;
        const noi = gross - curSC - maint - ins - mgmt;
        const mortPay = y > term ? 0 : mp * 12;
        total += noi - mortPay;
      }
      return total;
    };

    const baseOcc = num(inputs.occupancyRate);
    const baseRG = num(inputs.annualRentIncrease);
    const baseIR = num(inputs.interestRate);

    return {
      vacancy: [85, 90, 95].map((o) => ({ label: `${o}%`, value: calcCF(o, baseRG, baseIR) })),
      rentGrowth: [3, 5, 7].map((r) => ({ label: `${r}%`, value: calcCF(baseOcc, r, baseIR) })),
      interest: inputs.mortgageEnabled
        ? [baseIR, baseIR + 1, baseIR + 2].map((i) => ({ label: `${i.toFixed(1)}%`, value: calcCF(baseOcc, baseRG, i) }))
        : null,
    };
  }, [inputs]);

  /* ───── Multi-year Cash Flow Line Chart (tool-accent line, soft fill) ───── */
  useEffect(() => {
    const canvas = cashFlowChartRef.current;
    if (!canvas || yearData.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 28, right: 16, bottom: 32, left: 64 };
    const cw = w - padding.left - padding.right;
    const ch = h - padding.top - padding.bottom;

    const minCF = Math.min(0, ...yearData.map((d) => d.cashFlow));
    const maxCF = Math.max(0, ...yearData.map((d) => d.cashFlow));
    const rangeCF = (maxCF - minCF) || 1;
    const zeroY = padding.top + ch - ((0 - minCF) / rangeCF) * ch;

    // Read accent from CSS so the chart follows the theme
    const accent =
      getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() || "#10b981";
    const accentSoft =
      getComputedStyle(canvas).getPropertyValue("--tool-accent-soft").trim() ||
      "rgba(16,185,129,0.14)";

    // Grid lines + Y-axis labels
    ctx.fillStyle = `rgba(${tone},0.45)`;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = minCF + (rangeCF / 4) * i;
      const y = padding.top + ch - (ch * (i / 4));
      ctx.fillText(fmt(val), padding.left - 8, y + 3);
      ctx.strokeStyle = `rgba(${tone},${val === 0 ? 0.15 : 0.06})`;
      ctx.setLineDash(val === 0 ? [] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const stepX = cw / Math.max(1, yearData.length - 1);

    // Soft accent area fill
    ctx.save();
    ctx.beginPath();
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - ((d.cashFlow - minCF) / rangeCF) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + cw, zeroY);
    ctx.lineTo(padding.left, zeroY);
    ctx.closePath();
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.restore();

    // Negative band — desaturated tint to differentiate
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, zeroY, cw, padding.top + ch - zeroY);
    ctx.clip();
    ctx.fillStyle = "rgba(239,68,68,0.10)";
    ctx.fillRect(padding.left, zeroY, cw, padding.top + ch - zeroY);
    ctx.restore();

    // Accent line
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = "round";
    ctx.beginPath();
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - ((d.cashFlow - minCF) / rangeCF) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots — accent for positive, red for negative; active year ringed
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - ((d.cashFlow - minCF) / rangeCF) * ch;
      const isActive = i === activeYear - 1;
      ctx.fillStyle = d.cashFlow >= 0 ? accent : "rgba(239,68,68,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // X-axis
    ctx.fillStyle = `rgba(${tone},0.5)`;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    yearData.forEach((d, i) => {
      if (yearData.length <= 15 || i % Math.ceil(yearData.length / 10) === 0 || i === yearData.length - 1) {
        const x = padding.left + stepX * i;
        ctx.fillText(`Y${d.year}`, x, h - padding.bottom + 18);
      }
    });
  }, [yearData, tone, activeYear]);

  /* ───── Equity Stack Chart ───── */
  useEffect(() => {
    const canvas = equityChartRef.current;
    if (!canvas || yearData.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 24, right: 16, bottom: 28, left: 56 };
    const cw = w - padding.left - padding.right;
    const ch = h - padding.top - padding.bottom;

    const accent =
      getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() || "#10b981";
    const accentSoft =
      getComputedStyle(canvas).getPropertyValue("--tool-accent-soft").trim() ||
      "rgba(16,185,129,0.14)";

    const maxWealth = Math.max(1, ...yearData.map((d) => d.equity + d.cumulativeCashFlow)) * 1.05;
    const stepX = cw / Math.max(1, yearData.length - 1);

    // Grid
    ctx.fillStyle = `rgba(${tone},0.45)`;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const val = (maxWealth / 3) * i;
      const y = padding.top + ch - (ch * (i / 3));
      ctx.fillText(fmt(val), padding.left - 6, y + 3);
      ctx.strokeStyle = `rgba(${tone},0.05)`;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Equity area
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + ch);
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - (d.equity / maxWealth) * ch;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + cw, padding.top + ch);
    ctx.closePath();
    ctx.fillStyle = accentSoft;
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - (d.equity / maxWealth) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Cumulative CF line (dashed)
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    yearData.forEach((d, i) => {
      const x = padding.left + stepX * i;
      const y = padding.top + ch - (d.cumulativeCashFlow / maxWealth) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // X-axis
    ctx.fillStyle = `rgba(${tone},0.5)`;
    ctx.textAlign = "center";
    yearData.forEach((d, i) => {
      if (yearData.length <= 15 || i % Math.ceil(yearData.length / 10) === 0 || i === yearData.length - 1) {
        const x = padding.left + stepX * i;
        ctx.fillText(`Y${d.year}`, x, h - padding.bottom + 16);
      }
    });
  }, [yearData, tone]);

  /* ───── Share ───── */
  const copyToClipboard = useCallback(() => {
    const text = [
      `Cash Flow Projection - ${inputs.projectionYears} Years`,
      `Purchase: AED ${fmtFull(num(inputs.purchasePrice))}`,
      `Monthly Rent: AED ${fmtFull(num(inputs.monthlyRent))}`,
      `---`,
      `Total Net Cash Flow: AED ${fmtFull(summary.totalNetCashFlow)}`,
      `Average Cash-on-Cash: ${pct(summary.avgCashOnCash)}`,
      `IRR: ${pct(summary.irr)}`,
      `Terminal Value: AED ${fmtFull(summary.terminalValue)}`,
      `Total Return: AED ${fmtFull(summary.totalReturn)}`,
      `Equity Multiple: ${summary.equityMultiple.toFixed(2)}x`,
      ``,
      `Generated at spacefield.co/tools/cash-flow-modeler`,
    ].join("\n");
    navigator.clipboard.writeText(text);
  }, [inputs, summary]);

  const shareWhatsApp = useCallback(() => {
    const text = encodeURIComponent(
      `Cash Flow Projection (${inputs.projectionYears}yr)\n` +
      `Property: AED ${fmt(num(inputs.purchasePrice))}\n` +
      `IRR: ${pct(summary.irr)} | CoC: ${pct(summary.avgCashOnCash)}\n` +
      `Total Return: AED ${fmt(summary.totalReturn)}\n\n` +
      `spacefield.co/tools/cash-flow-modeler`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [inputs, summary]);

  // Build a year selector — always show every year up to projectionYears
  const yearPills = yearData.map((d) => d.year);

  return (
    <AuthGate>
      <div
        data-tool-theme="investment"
        data-tool="cash-flow-modeler"
        className="min-h-screen bg-app text-app"
      >
        {/* ═════════ HERO BACKDROP ═════════ */}
        <div className="tool-hero border-b border-app">
          <div className={`mx-auto max-w-6xl ${isFramed ? "px-4 py-4" : "px-4 sm:px-6 py-6 sm:py-9"}`}>
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-tool-accent-soft ring-1 ring-tool-accent">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="h-5 w-5 text-tool-accent"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                    Cash Flow Modeler
                  </h1>
                  <p className="mt-0.5 text-xs sm:text-sm text-secondary">
                    Property income, expenses, and free cash flow over time.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md bg-tool-accent-soft text-tool-accent border border-tool-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-tool-accent" />
                  {inputs.projectionYears}-year horizon
                </span>
              </div>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 pt-6 space-y-6">
          {/* ═════════ FREE CASH FLOW HERO ═════════ */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="relative overflow-hidden rounded-2xl border border-tool-accent bg-tool-accent-soft p-6 sm:p-8"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, var(--tool-accent), transparent)",
              }}
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-tool-accent">
                    Free Cash Flow · Year {activeYear}
                  </p>
                  {/* Annual / Monthly toggle */}
                  <div className="inline-flex rounded-full border border-app bg-app-elevated p-0.5 text-[10px] font-mono">
                    {(["annual", "monthly"] as CadenceMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCadence(m)}
                        className={`px-2 py-0.5 rounded-full transition-colors ${
                          cadence === m
                            ? "bg-tool-accent text-white"
                            : "text-muted hover:text-app"
                        }`}
                      >
                        {m === "annual" ? "/yr" : "/mo"}
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${heroFreeCashFlow.toFixed(0)}-${cadence}-${activeYear}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="flex items-baseline gap-2 font-mono tabular-nums"
                  >
                    <span className="text-xs font-medium text-muted">AED</span>
                    <span
                      className={`text-4xl sm:text-6xl font-semibold tracking-tight ${
                        heroFreeCashFlow >= 0 ? "text-app" : "text-red-500 dark:text-red-400"
                      }`}
                    >
                      {fmtFull(heroFreeCashFlow)}
                    </span>
                    <span className="text-xs text-muted">
                      / {cadence === "monthly" ? "mo" : "yr"}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Yield chip */}
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-mono font-semibold tabular-nums border ${
                    fcfYield >= 0
                      ? "bg-tool-accent-soft text-tool-accent border-tool-accent"
                      : "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/40"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {pct(fcfYield)} avg yield on equity
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">
                  Initial equity · AED {fmt(initialEquityValue)}
                </span>
              </div>
            </div>

            {/* Active year breakdown */}
            {activeYearData && (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-tool-accent pt-4">
                {[
                  { label: "Gross Rent", v: activeYearData.grossRent },
                  { label: "NOI", v: activeYearData.noi },
                  { label: "Property Value", v: activeYearData.propertyValue },
                  { label: "Equity", v: activeYearData.equity },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                      {item.label}
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums truncate">
                      {fmt(cadence === "monthly" ? item.v / 12 : item.v)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          {/* ═════════ YEAR SELECTOR PILLS ═════════ */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted shrink-0 mr-1">
              Year
            </span>
            {yearPills.map((y) => {
              const active = y === activeYear;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setActiveYear(y)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-mono tabular-nums border transition-colors ${
                    active
                      ? "bg-tool-accent text-white border-tool-accent"
                      : "bg-app-elevated text-muted border-app hover:border-tool-accent hover:text-tool-accent"
                  }`}
                >
                  Y{y}
                </button>
              );
            })}
          </div>

          {/* ═════════ ASSUMPTIONS PANEL ═════════ */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="px-5 sm:px-6 py-4 border-b border-app flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">
                  Assumptions
                </p>
                <h2 className="text-sm font-semibold mt-0.5">Inputs</h2>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                <span>Horizon</span>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={inputs.projectionYears}
                  onChange={(e) => set("projectionYears", parseInt(e.target.value))}
                  className="w-32 accent-[color:var(--tool-accent)]"
                />
                <span className="text-tool-accent font-semibold tabular-nums w-12 text-right">
                  {inputs.projectionYears}y
                </span>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <Field label="Price" suffix="AED" k="purchasePrice" inputs={inputs} set={set} />
                <Field label="Monthly Rent" suffix="AED" k="monthlyRent" inputs={inputs} set={set} />
                <Field label="Occupancy" suffix="%" k="occupancyRate" inputs={inputs} set={set} />
                <Field label="Rent Growth" suffix="%" k="annualRentIncrease" inputs={inputs} set={set} />
                <Field label="Service Chg" suffix="AED" k="annualServiceCharge" inputs={inputs} set={set} />
                <Field label="Maintenance" suffix="%" k="annualMaintenance" inputs={inputs} set={set} />
                <Field label="Appreciation" suffix="%" k="annualAppreciation" inputs={inputs} set={set} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Mortgage</label>
                  <button
                    onClick={() => set("mortgageEnabled", !inputs.mortgageEnabled)}
                    className={`relative h-[30px] px-3 rounded-md border text-xs font-mono transition-all ${
                      inputs.mortgageEnabled
                        ? "bg-tool-accent text-white border-tool-accent"
                        : "bg-app-elevated border-app text-secondary hover:text-app"
                    }`}
                  >
                    {inputs.mortgageEnabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <AnimatePresence>
                  {inputs.mortgageEnabled && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-wrap gap-3 overflow-hidden"
                    >
                      <div className="w-28"><Field label="Loan" suffix="AED" k="loanAmount" inputs={inputs} set={set} /></div>
                      <div className="w-24"><Field label="Rate" suffix="%" k="interestRate" inputs={inputs} set={set} /></div>
                      <div className="w-20"><Field label="Term" suffix="yr" k="remainingTerm" inputs={inputs} set={set} /></div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="w-24"><Field label="Insurance" suffix="AED" k="insurance" inputs={inputs} set={set} /></div>
                <div className="w-20"><Field label="Mgmt %" suffix="%" k="managementFee" inputs={inputs} set={set} /></div>
                <div className="w-20"><Field label="SC Infl" suffix="%" k="serviceChargeInflation" inputs={inputs} set={set} /></div>
                <div className="w-20"><Field label="Exit Cap" suffix="%" k="terminalCapRate" inputs={inputs} set={set} /></div>
              </div>
            </div>
          </section>

          {/* ═════════ KPI TILES ═════════ */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { label: "Avg CF / yr", value: `${fmt(avgAnnualCF)}`, prefix: "AED", tone: avgAnnualCF >= 0 ? "pos" : "neg" },
              { label: "Total CF", value: `${fmt(summary.totalNetCashFlow)}`, prefix: "AED", tone: summary.totalNetCashFlow >= 0 ? "pos" : "neg" },
              { label: "Years +", value: `${yearsPositive} / ${yearData.length}`, tone: "neutral" },
              { label: "IRR", value: pct(summary.irr), tone: summary.irr >= 0 ? "pos" : "neg" },
              { label: "Avg CoC", value: pct(summary.avgCashOnCash), tone: "neutral" },
              { label: "Equity Mult.", value: `${summary.equityMultiple.toFixed(2)}x`, tone: summary.equityMultiple >= 1 ? "pos" : "neg" },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-app bg-app-elevated p-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  {t.label}
                </p>
                <p
                  className={`text-sm sm:text-base font-semibold font-mono tabular-nums ${
                    t.tone === "pos"
                      ? "text-tool-accent"
                      : t.tone === "neg"
                      ? "text-red-500 dark:text-red-400"
                      : "text-app"
                  }`}
                >
                  {t.prefix && <span className="text-[10px] text-muted mr-1">{t.prefix}</span>}
                  {t.value}
                </p>
              </div>
            ))}
          </section>

          {/* ═════════ MULTI-YEAR PROJECTION CHART ═════════ */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="px-5 sm:px-6 py-4 border-b border-app flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">Projection</p>
                <h2 className="text-sm font-semibold mt-0.5">Net Cash Flow · Year by Year</h2>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-tool-accent" /> Positive</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Negative</span>
              </div>
            </div>
            <div className="p-4">
              <canvas ref={cashFlowChartRef} className="w-full h-56 sm:h-64" />
            </div>
          </section>

          {/* ═════════ EQUITY CHART ═════════ */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="px-5 sm:px-6 py-4 border-b border-app flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs uppercase tracking-[0.18em] font-semibold text-muted">
                Equity & Cumulative Cash Flow
              </h3>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
                <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-tool-accent" /> Equity</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-tool-accent opacity-60" /> Cumulative CF</span>
              </div>
            </div>
            <div className="p-4">
              <canvas ref={equityChartRef} className="w-full h-44" />
            </div>
          </section>

          {/* ═════════ INCOME / EXPENSE LEDGER (active year) ═════════ */}
          {activeYearData && (
            <section className="rounded-xl border border-app bg-app-elevated">
              <div className="px-5 sm:px-6 py-4 border-b border-app flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">Ledger</p>
                  <h2 className="text-sm font-semibold mt-0.5">
                    Income & Expenses · Year {activeYear}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-faint">
                  {cadence === "monthly" ? "Per month" : "Per year"} · AED
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-app">
                {/* Income column */}
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-tool-accent mb-3">
                    Income
                  </p>
                  <ul className="font-mono text-sm tabular-nums space-y-2">
                    <li className="flex items-center justify-between">
                      <span className="text-secondary">Gross Rent</span>
                      <span className="text-app">{fmtFull(cadence === "monthly" ? activeYearData.grossRent / 12 : activeYearData.grossRent)}</span>
                    </li>
                  </ul>
                  <div className="mt-4 pt-3 border-t border-app flex items-center justify-between font-mono text-sm tabular-nums">
                    <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">
                      Total Income
                    </span>
                    <span className="font-semibold text-tool-accent">
                      {fmtFull(cadence === "monthly" ? activeYearData.grossRent / 12 : activeYearData.grossRent)}
                    </span>
                  </div>
                </div>

                {/* Expense column */}
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-red-500 dark:text-red-400 mb-3">
                    Expenses
                  </p>
                  <ul className="font-mono text-sm tabular-nums space-y-2">
                    {[
                      { label: "Service Charge", v: activeYearData.serviceCharge },
                      { label: "Maintenance", v: activeYearData.maintenance },
                      { label: "Insurance", v: activeYearData.insurance },
                      { label: "Management Fee", v: activeYearData.managementFee },
                      { label: "Mortgage", v: activeYearData.mortgagePayment },
                    ].map((row) => (
                      <li key={row.label} className="flex items-center justify-between">
                        <span className="text-secondary">{row.label}</span>
                        <span className="text-app">
                          {fmtFull(cadence === "monthly" ? row.v / 12 : row.v)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-3 border-t border-app flex items-center justify-between font-mono text-sm tabular-nums">
                    <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">
                      Total Expenses
                    </span>
                    <span className="font-semibold text-red-500 dark:text-red-400">
                      {fmtFull(cadence === "monthly" ? activeYearData.totalExpenses / 12 : activeYearData.totalExpenses)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net row spanning both columns */}
              <div className="px-5 py-4 border-t border-tool-accent bg-tool-accent-soft flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-tool-accent">
                  Net Cash Flow
                </span>
                <span
                  className={`font-mono text-lg font-semibold tabular-nums ${
                    activeYearData.cashFlow >= 0
                      ? "text-tool-accent"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {fmtFull(cadence === "monthly" ? activeYearData.cashFlow / 12 : activeYearData.cashFlow)}
                </span>
              </div>
            </section>
          )}

          {/* ═════════ YEAR-BY-YEAR TABLE ═════════ */}
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="px-5 sm:px-6 py-4 border-b border-app flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted">Model</p>
                <h2 className="text-sm font-semibold mt-0.5">Year-by-Year Breakdown</h2>
              </div>
              <span className="text-[10px] font-mono text-faint">{yearData.length} rows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead>
                  <tr className="bg-app text-secondary border-b border-app">
                    <th className="text-left py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Yr</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Gross Rent</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Svc Chg</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Maint.</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Mortgage</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">NOI</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Net CF</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Prop Value</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Equity</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">Cum. CF</th>
                    <th className="text-right py-2 px-3 font-semibold uppercase tracking-wider text-[10px]">CoC</th>
                  </tr>
                </thead>
                <tbody>
                  {yearData.map((d) => {
                    const active = d.year === activeYear;
                    return (
                      <tr
                        key={d.year}
                        onClick={() => setActiveYear(d.year)}
                        className={`border-b border-app cursor-pointer transition-colors ${
                          active ? "bg-tool-accent-soft" : "hover:bg-tool-accent-soft"
                        }`}
                      >
                        <td className={`py-1.5 px-3 font-semibold ${active ? "text-tool-accent" : "text-muted"}`}>
                          Y{d.year}
                        </td>
                        <td className="text-right py-1.5 px-3 text-app">{fmtFull(d.grossRent)}</td>
                        <td className="text-right py-1.5 px-3 text-secondary">{fmtFull(d.serviceCharge)}</td>
                        <td className="text-right py-1.5 px-3 text-secondary">{fmtFull(d.maintenance)}</td>
                        <td className="text-right py-1.5 px-3 text-secondary">{fmtFull(d.mortgagePayment)}</td>
                        <td className="text-right py-1.5 px-3 text-app">{fmtFull(d.noi)}</td>
                        <td
                          className={`text-right py-1.5 px-3 font-semibold ${
                            d.cashFlow >= 0
                              ? "text-tool-accent"
                              : "text-red-500 dark:text-red-400"
                          }`}
                        >
                          {fmtFull(d.cashFlow)}
                        </td>
                        <td className="text-right py-1.5 px-3 text-secondary">{fmtFull(d.propertyValue)}</td>
                        <td className="text-right py-1.5 px-3 text-secondary">{fmtFull(d.equity)}</td>
                        <td
                          className={`text-right py-1.5 px-3 ${
                            d.cumulativeCashFlow >= 0
                              ? "text-tool-accent"
                              : "text-red-500 dark:text-red-400"
                          }`}
                        >
                          {fmtFull(d.cumulativeCashFlow)}
                        </td>
                        <td className="text-right py-1.5 px-3 text-muted">{pct(d.cashOnCash)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-app border-t-2 border-tool-accent font-semibold">
                    <td className="py-2 px-3 uppercase tracking-wider text-[10px] text-secondary">Σ</td>
                    <td className="text-right py-2 px-3 text-app">{fmtFull(yearData.reduce((s, d) => s + d.grossRent, 0))}</td>
                    <td className="text-right py-2 px-3 text-secondary">{fmtFull(yearData.reduce((s, d) => s + d.serviceCharge, 0))}</td>
                    <td className="text-right py-2 px-3 text-secondary">{fmtFull(yearData.reduce((s, d) => s + d.maintenance, 0))}</td>
                    <td className="text-right py-2 px-3 text-secondary">{fmtFull(yearData.reduce((s, d) => s + d.mortgagePayment, 0))}</td>
                    <td className="text-right py-2 px-3 text-app">{fmtFull(yearData.reduce((s, d) => s + d.noi, 0))}</td>
                    <td className={`text-right py-2 px-3 ${summary.totalNetCashFlow >= 0 ? "text-tool-accent" : "text-red-500 dark:text-red-400"}`}>
                      {fmtFull(summary.totalNetCashFlow)}
                    </td>
                    <td className="text-right py-2 px-3 text-faint">—</td>
                    <td className="text-right py-2 px-3 text-faint">—</td>
                    <td className="text-right py-2 px-3 text-faint">—</td>
                    <td className="text-right py-2 px-3 text-secondary">{pct(summary.avgCashOnCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ═════════ SENSITIVITY ═════════ */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted mb-3">
              Sensitivity
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { title: "Occupancy", data: sensitivity.vacancy },
                { title: "Rent Growth", data: sensitivity.rentGrowth },
                ...(sensitivity.interest ? [{ title: "Interest Rate", data: sensitivity.interest }] : []),
              ].map((group) => (
                <div key={group.title} className="rounded-xl border border-app bg-app-elevated p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-2">{group.title}</p>
                  <table className="w-full text-xs font-mono tabular-nums">
                    <tbody>
                      {group.data.map((row) => (
                        <tr key={row.label} className="border-b border-app last:border-0">
                          <td className="py-1.5 text-secondary">{row.label}</td>
                          <td className={`text-right py-1.5 font-semibold ${row.value >= 0 ? "text-tool-accent" : "text-red-500 dark:text-red-400"}`}>
                            {fmtFull(row.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* ═════════ FOOTER ACTIONS ═════════ */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-app bg-app-elevated text-xs font-mono text-secondary hover:border-tool-accent hover:text-tool-accent transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
              Copy Summary
            </button>
            <button
              onClick={shareWhatsApp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tool-accent text-white text-xs font-mono font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Share WhatsApp
            </button>
          </div>

          {!isFramed && (
            <div className="pt-10">
              <ToolRecommendations slug="cash-flow-modeler" />
            </div>
          )}
        </main>
      </div>
    </AuthGate>
  );
}
