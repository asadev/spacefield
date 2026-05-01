"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ToolRecommendations from "@/components/ToolRecommendations";
import { awardXP } from "@/lib/xp-actions";
import { useCanvasTone } from "@/lib/useCanvasTone";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── helpers ─────────────────────────────────────────────── */

function calcMortgagePayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmtAED(n: number): string {
  return `AED ${Math.round(n).toLocaleString()}`;
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}

/* ── types ───────────────────────────────────────────────── */

interface YearRow {
  year: number;
  rentCostCumulative: number;
  buyCostCumulative: number;
  rentNetWealth: number;
  buyNetWealth: number;
  propertyValue: number;
  equity: number;
  investmentValue: number;
}

type Residency = "uae-national" | "resident" | "non-resident";

/* ── canvas accent reader ────────────────────────────────── */

function useToolAccentRGB(): string {
  const [rgb, setRgb] = useState("59,130,246");
  useEffect(() => {
    const read = () => {
      const root = document.querySelector('[data-tool-theme="calculators"]') as HTMLElement | null;
      if (!root) return;
      const v = getComputedStyle(root).getPropertyValue("--tool-accent").trim();
      if (!v) return;
      // hex like #3b82f6
      if (v.startsWith("#")) {
        const r = parseInt(v.slice(1, 3), 16);
        const g = parseInt(v.slice(3, 5), 16);
        const b = parseInt(v.slice(5, 7), 16);
        setRgb(`${r},${g},${b}`);
      }
    };
    read();
  }, []);
  return rgb;
}

/* ── input field ─────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  note,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  note?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.62rem] font-medium uppercase tracking-[0.2em] text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={placeholder}
          className="rvb-input w-full px-3 py-2.5 font-mono text-sm tabular-nums"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted">
            {suffix}
          </span>
        )}
      </div>
      {note && <p className="mt-1 font-mono text-[0.6rem] tabular-nums text-muted">{note}</p>}
    </div>
  );
}

/* ── crossover line chart (Canvas) ───────────────────────── */

function CrossoverChart({ data, breakeven }: { data: YearRow[]; breakeven: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tone = useCanvasTone();
  const accent = useToolAccentRGB();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || data.length === 0) return;

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

      const pad = { top: 24, right: 20, bottom: 36, left: 56 };
      const cW = W - pad.left - pad.right;
      const cH = H - pad.top - pad.bottom;

      const allVals = data.flatMap((d) => [d.rentNetWealth, d.buyNetWealth]);
      const minV = Math.min(0, ...allVals);
      const maxV = Math.max(...allVals) * 1.1 || 1;
      const range = maxV - minV || 1;

      const xScale = (i: number) => pad.left + (i / Math.max(data.length - 1, 1)) * cW;
      const yScale = (v: number) => pad.top + cH - ((v - minV) / range) * cH;

      // grid
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();

        const val = maxV - (i / 4) * range;
        ctx.fillStyle = `rgba(${tone},0.4)`;
        ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtCompact(val), pad.left - 8, y);
      }

      // zero line
      if (minV < 0) {
        const y0 = yScale(0);
        ctx.strokeStyle = `rgba(${tone},0.18)`;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, y0);
        ctx.lineTo(W - pad.right, y0);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // x labels
      ctx.fillStyle = `rgba(${tone},0.4)`;
      ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const step = data.length <= 12 ? 1 : Math.ceil(data.length / 8);
      data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
          ctx.fillText(`Y${d.year}`, xScale(i), pad.top + cH + 8);
        }
      });

      // crossover band
      if (breakeven && breakeven >= 1 && breakeven <= data.length) {
        const cx = xScale(breakeven - 1);
        ctx.fillStyle = `rgba(${accent},0.08)`;
        ctx.fillRect(cx - 16, pad.top, 32, cH);
        ctx.strokeStyle = `rgba(${accent},0.35)`;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, pad.top);
        ctx.lineTo(cx, pad.top + cH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // rent line — dashed muted
      ctx.strokeStyle = `rgba(${tone},0.55)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = xScale(i);
        const y = yScale(d.rentNetWealth);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // buy line — solid tool-accent
      ctx.strokeStyle = `rgba(${accent},0.95)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = xScale(i);
        const y = yScale(d.buyNetWealth);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // crossover dot
      if (breakeven && breakeven >= 1 && breakeven <= data.length) {
        const cx = xScale(breakeven - 1);
        const cy = yScale(data[breakeven - 1].buyNetWealth);
        ctx.fillStyle = `rgba(${accent},1)`;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [data, tone, accent, breakeven]);

  return (
    <div ref={containerRef} className="h-72 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */

export default function RentVsBuyPage() {
  return (
    <Suspense fallback={null}>
      <RentVsBuyInner />
    </Suspense>
  );
}

function RentVsBuyInner() {
  const searchParams = useSearchParams();
  const isFramed = searchParams?.get("frame") === "1";

  /* ── renting inputs ──────────────────────────────────── */
  const [monthlyRent, setMonthlyRent] = useState("8000");
  const [annualRentIncrease, setAnnualRentIncrease] = useState("5");
  const [renterInsurance, setRenterInsurance] = useState("0");

  /* ── buying inputs ───────────────────────────────────── */
  const [purchasePrice, setPurchasePrice] = useState("1500000");
  const [downPaymentPct, setDownPaymentPct] = useState("20");
  const [mortgageRate, setMortgageRate] = useState("4.5");
  const [mortgageTerm, setMortgageTerm] = useState("25");
  const [appreciation, setAppreciation] = useState("5");
  const [serviceCharge, setServiceCharge] = useState("15000");
  const [annualMaintenance, setAnnualMaintenance] = useState("");
  const [residency, setResidency] = useState<Residency>("resident");

  /* ── general inputs ──────────────────────────────────── */
  const [horizon, setHorizon] = useState(10);
  const [altReturn, setAltReturn] = useState("7");

  /* ── UI state ────────────────────────────────────────── */
  const [copied, setCopied] = useState(false);
  const [expandedTable, setExpandedTable] = useState(false);
  const xpAwarded = useRef(false);

  /* ── derived ─────────────────────────────────────────── */
  const price = Number(purchasePrice) || 0;
  const dpPct = Number(downPaymentPct) / 100 || 0.2;
  const downPaymentAmt = price * dpPct;
  const loanAmount = price - downPaymentAmt;
  const dldFee = price * 0.04;
  const agentCommission = price * 0.02;
  const transactionCosts = dldFee + agentCommission;
  const maintenanceAmt = Number(annualMaintenance) || price * 0.01;

  /* suggest down payment based on residency */
  useEffect(() => {
    if (residency === "uae-national") setDownPaymentPct("15");
    else if (residency === "resident") setDownPaymentPct("20");
    else setDownPaymentPct("30");
  }, [residency]);

  /* ── year-by-year calculation (NPV-aware) ────────────── */
  const { timeline, breakeven, verdict } = useMemo(() => {
    const rent = Number(monthlyRent) || 0;
    const rentInc = Number(annualRentIncrease) / 100;
    const insurance = Number(renterInsurance) || 0;
    const svcCharge = Number(serviceCharge) || 0;
    const appRate = Number(appreciation) / 100;
    const altRate = Number(altReturn) / 100;
    const monthlyMortgage = calcMortgagePayment(loanAmount, Number(mortgageRate), Number(mortgageTerm));

    if (!rent || !price) {
      return { timeline: [] as YearRow[], breakeven: null as number | null, verdict: "" };
    }

    const rows: YearRow[] = [];
    let cumRentCost = 0;
    let cumBuyCost = transactionCosts;
    let currentRent = rent * 12;
    let investmentPool = downPaymentAmt + transactionCosts;
    let mortgageBalance = loanAmount;

    for (let y = 1; y <= horizon; y++) {
      if (y > 1) currentRent *= 1 + rentInc;

      const yearRentCost = currentRent + insurance;
      cumRentCost += yearRentCost;

      const yearMortgageCost = monthlyMortgage * 12;
      const yearBuyCost = yearMortgageCost + svcCharge + maintenanceAmt;
      cumBuyCost += yearBuyCost;

      // NPV-style: opportunity cost grows the alt investment pool annually
      investmentPool *= 1 + altRate;

      const propValue = price * Math.pow(1 + appRate, y);

      const annualInterest = mortgageBalance * (Number(mortgageRate) / 100);
      const annualPrincipal = Math.max(0, yearMortgageCost - annualInterest);
      mortgageBalance = Math.max(0, mortgageBalance - annualPrincipal);
      const equity = propValue - mortgageBalance;

      const buyNetW = equity - cumBuyCost;
      const rentNetW = investmentPool - cumRentCost;

      rows.push({
        year: y,
        rentCostCumulative: cumRentCost,
        buyCostCumulative: cumBuyCost,
        rentNetWealth: rentNetW,
        buyNetWealth: buyNetW,
        propertyValue: propValue,
        equity,
        investmentValue: investmentPool,
      });
    }

    let be: number | null = null;
    for (const row of rows) {
      if (row.buyNetWealth >= row.rentNetWealth) {
        be = row.year;
        break;
      }
    }

    const last = rows[rows.length - 1];
    const diff = last ? Math.abs(last.buyNetWealth - last.rentNetWealth) : 0;
    const equalish = diff < (last ? Math.max(last.rentCostCumulative, last.buyCostCumulative) * 0.02 : 0);

    let v = "";
    if (equalish) v = "Equal";
    else if (be !== null && be <= horizon) v = "Buy";
    else v = "Rent";

    return { timeline: rows, breakeven: be, verdict: v };
  }, [
    monthlyRent, annualRentIncrease, renterInsurance, purchasePrice,
    downPaymentAmt, loanAmount, mortgageRate, mortgageTerm, appreciation,
    serviceCharge, maintenanceAmt, transactionCosts, altReturn, horizon, price,
  ]);

  const lastRow = timeline[timeline.length - 1];
  const goldenVisaEligible = price >= 2_000_000;
  const buyingWins = verdict === "Buy";
  const hasResult = timeline.length > 0;

  /* ── XP award ─────────────────────────────────────────── */
  useEffect(() => {
    if (hasResult && !xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "rent-vs-buy").catch(() => {});
    }
  }, [hasResult]);

  /* ── insights ────────────────────────────────────────── */
  const insights = useMemo(() => {
    const list: string[] = [];
    if (price > 0) {
      list.push(
        "No income tax in the UAE means your mortgage interest is not deductible — but your rental savings also grow tax-free."
      );
    }
    if (Number(annualRentIncrease) > 0) {
      list.push(
        `RERA caps rent increases based on the Rental Index. Your assumed ${annualRentIncrease}% annual increase should be checked against the RERA calculator for your area.`
      );
    }
    if (goldenVisaEligible) {
      list.push(
        `At ${fmtAED(price)}, this property qualifies for a 10-year UAE Golden Visa — a significant non-financial benefit.`
      );
    }
    if (Number(serviceCharge) > 0 && price > 0) {
      const sqftEstimate = price / 1200;
      const perSqft = Number(serviceCharge) / sqftEstimate;
      if (perSqft > 25) {
        list.push(
          `Estimated service charge of AED ${Math.round(perSqft)}/sqft is above the Dubai median of AED 15-25/sqft.`
        );
      } else if (perSqft < 15) {
        list.push(
          `Estimated service charge of AED ${Math.round(perSqft)}/sqft is below the Dubai median of AED 15-25/sqft.`
        );
      }
    }
    list.push(
      "In Dubai, roughly 60% of residents rent. You are not alone if renting wins for your situation."
    );
    return list;
  }, [price, annualRentIncrease, goldenVisaEligible, serviceCharge]);

  /* ── share ───────────────────────────────────────────── */
  const getShareText = useCallback(() => {
    if (!lastRow) return "";
    const lines = [
      "Rent vs Buy Analysis — spacefield.co/tools/rent-vs-buy",
      "",
      `Verdict: ${verdict}${breakeven ? ` (crossover Y${breakeven})` : ""}`,
      "",
      `Property: ${fmtAED(price)}`,
      `Monthly Rent: ${fmtAED(Number(monthlyRent))}`,
      `Horizon: ${horizon} years`,
      "",
      `Rent Net Wealth (Y${horizon}): ${fmtAED(lastRow.rentNetWealth)}`,
      `Buy Net Wealth (Y${horizon}): ${fmtAED(lastRow.buyNetWealth)}`,
      `Difference: ${fmtAED(Math.abs(lastRow.buyNetWealth - lastRow.rentNetWealth))} in favor of ${lastRow.buyNetWealth > lastRow.rentNetWealth ? "buying" : "renting"}`,
      "",
      "Calculate yours at spacefield.co/tools/rent-vs-buy",
    ];
    return lines.join("\n");
  }, [lastRow, verdict, breakeven, price, monthlyRent, horizon]);

  const copyResult = useCallback(() => {
    navigator.clipboard.writeText(getShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getShareText]);

  const shareWhatsApp = useCallback(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(getShareText())}`, "_blank");
  }, [getShareText]);

  /* ── verdict copy ────────────────────────────────────── */
  const verdictDetail = lastRow
    ? buyingWins
      ? `Buying builds ${fmtAED(lastRow.buyNetWealth - lastRow.rentNetWealth)} more wealth over ${horizon} years.`
      : verdict === "Equal"
        ? `Both paths land within ~2% over ${horizon} years. The non-financial factors decide it.`
        : `Renting preserves ${fmtAED(lastRow.rentNetWealth - lastRow.buyNetWealth)} more wealth over ${horizon} years.`
    : "";

  const horizonPct = ((horizon - 1) / 29) * 100;

  return (
    <AuthGate>
      <div
        data-tool-theme="calculators"
        data-tool="rent-vs-buy"
        className="min-h-screen bg-app text-primary"
      >
        {/* ═════════ STYLE — slider + input ═════════ */}
        <style jsx global>{`
          [data-tool="rent-vs-buy"] .rvb-slider {
            appearance: none;
            -webkit-appearance: none;
            width: 100%;
            height: 24px;
            background: transparent;
            cursor: pointer;
          }
          [data-tool="rent-vs-buy"] .rvb-slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(
              to right,
              var(--tool-accent, #3b82f6) 0%,
              var(--tool-accent, #3b82f6) var(--rvb-slider-fill, 0%),
              rgba(128, 128, 128, 0.18) var(--rvb-slider-fill, 0%),
              rgba(128, 128, 128, 0.18) 100%
            );
          }
          [data-tool="rent-vs-buy"] .rvb-slider::-moz-range-track {
            height: 6px;
            border-radius: 999px;
            background: rgba(128, 128, 128, 0.18);
          }
          [data-tool="rent-vs-buy"] .rvb-slider::-moz-range-progress {
            height: 6px;
            border-radius: 999px;
            background: var(--tool-accent, #3b82f6);
          }
          [data-tool="rent-vs-buy"] .rvb-slider::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: #ffffff;
            border: 2px solid var(--tool-accent, #3b82f6);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18),
              0 0 0 4px rgba(59, 130, 246, 0.08);
            margin-top: -8px;
            transition: transform 120ms ease, box-shadow 120ms ease;
          }
          [data-tool="rent-vs-buy"] .rvb-slider:active::-webkit-slider-thumb,
          [data-tool="rent-vs-buy"] .rvb-slider:focus-visible::-webkit-slider-thumb {
            transform: scale(1.08);
          }
          [data-tool="rent-vs-buy"] .rvb-slider::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: #ffffff;
            border: 2px solid var(--tool-accent, #3b82f6);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            cursor: pointer;
          }
          [data-tool="rent-vs-buy"] .rvb-slider:focus-visible {
            outline: none;
          }
          [data-tool="rent-vs-buy"] .rvb-input {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: inherit;
            border-radius: 10px;
            transition: border-color 120ms ease, box-shadow 120ms ease;
          }
          [data-tool="rent-vs-buy"] .rvb-input:focus {
            outline: none;
            border-color: var(--tool-accent);
            box-shadow: 0 0 0 3px var(--tool-accent-soft);
          }
          [data-tool="rent-vs-buy"] .rvb-card {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 16px;
          }
          [data-tool="rent-vs-buy"] .rvb-pulse {
            animation: rvb-pulse 2.2s ease-in-out infinite;
          }
          @keyframes rvb-pulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.25); opacity: 0.4; }
          }
        `}</style>

        {/* ═════════ HERO HEADER ═════════ */}
        {!isFramed && (
          <header className="tool-hero relative overflow-hidden border-b border-app">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
              <div className="mb-3 flex items-center gap-3">
                <Link
                  href="/tools"
                  className="text-[0.65rem] uppercase tracking-[0.2em] text-muted hover:text-primary"
                >
                  ← Tools
                </Link>
                <span className="text-faint">/</span>
                <span className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Calculator
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-tool-accent-soft ring-1 ring-tool-accent">
                  <span
                    className="rvb-pulse absolute h-2 w-2 rounded-full bg-tool-accent"
                    aria-hidden
                  />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6 text-tool-accent"
                  >
                    <path d="M3 12 12 4l9 8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 11v9h6v-6h2v6h6v-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Rent <span className="text-muted">vs</span>{" "}
                    <span className="text-tool-accent">Buy</span>
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm text-muted">
                    UAE-calibrated crossover analysis: NPV, alt-return opportunity cost, RERA, DLD &amp; Golden Visa.
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-app bg-tool-surface px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" aria-hidden />
                  RERA · DLD · Golden Visa
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
              <span className="text-faint">·</span>
              <span className="text-tool-accent">Rent vs Buy</span>
              {breakeven && (
                <span className="ml-auto font-mono tabular-nums">Crossover Y{breakeven}</span>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
          {/* ═════════ VERDICT HERO ═════════ */}
          <AnimatePresence>
            {hasResult && lastRow && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease }}
                className="rvb-card relative mb-6 overflow-hidden p-6 sm:p-7"
                style={{
                  background:
                    buyingWins
                      ? "linear-gradient(135deg, var(--tool-accent-soft), transparent 70%), var(--bg-elevated)"
                      : "var(--bg-elevated)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, var(--tool-accent), transparent)",
                  }}
                />

                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-muted">
                      Verdict · {horizon}-year horizon
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                      <h2 className="text-5xl font-semibold tracking-tight text-tool-accent sm:text-6xl">
                        {verdict}
                      </h2>
                      {breakeven !== null && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent bg-tool-accent-soft px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
                          <span className="h-1 w-1 rounded-full bg-tool-accent" aria-hidden />
                          Crossover · Y{breakeven}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 max-w-xl text-sm text-secondary">{verdictDetail}</p>
                    {goldenVisaEligible && (
                      <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                        <span className="h-1 w-1 rounded-full bg-tool-accent" aria-hidden />
                        Golden Visa eligible (10-year)
                      </p>
                    )}
                  </div>
                </div>

                {/* Twin big-number cards */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div
                    className={`rounded-2xl border p-5 transition-colors ${
                      !buyingWins && verdict !== "Equal"
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app"
                    }`}
                  >
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted">
                      Rent · Net Wealth Y{horizon}
                    </p>
                    <p
                      className={`mt-2 font-mono text-3xl font-semibold tabular-nums sm:text-4xl ${
                        !buyingWins && verdict !== "Equal" ? "text-tool-accent" : "text-primary"
                      }`}
                    >
                      {fmtAED(lastRow.rentNetWealth)}
                    </p>
                    <p className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                      Cum cost {fmtCompact(lastRow.rentCostCumulative)} · pool {fmtCompact(lastRow.investmentValue)}
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border p-5 transition-colors ${
                      buyingWins
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app"
                    }`}
                  >
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted">
                      Buy · Net Wealth Y{horizon}
                    </p>
                    <p
                      className={`mt-2 font-mono text-3xl font-semibold tabular-nums sm:text-4xl ${
                        buyingWins ? "text-tool-accent" : "text-primary"
                      }`}
                    >
                      {fmtAED(lastRow.buyNetWealth)}
                    </p>
                    <p className="mt-1 font-mono text-[0.65rem] tabular-nums text-muted">
                      Equity {fmtCompact(lastRow.equity)} · cum cost {fmtCompact(lastRow.buyCostCumulative)}
                    </p>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ═════════ HORIZON + ALT RETURN ═════════ */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease }}
            className="rvb-card mb-6 p-5 sm:p-6"
          >
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div>
                <div className="mb-2 flex items-end justify-between">
                  <label className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Investment Horizon
                  </label>
                  <span className="font-mono text-sm font-semibold tabular-nums text-tool-accent">
                    {horizon} <span className="text-muted">yrs</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="rvb-slider w-full"
                  style={{ ["--rvb-slider-fill" as string]: `${horizonPct}%` }}
                />
                <div className="mt-1.5 flex justify-between font-mono text-[0.6rem] tabular-nums text-muted">
                  <span>1y</span>
                  <span>10y</span>
                  <span>20y</span>
                  <span>30y</span>
                </div>
              </div>
              <Field
                label="Alternative Investment Return"
                value={altReturn}
                onChange={setAltReturn}
                suffix="%"
                placeholder="7"
                note="Annual return if down payment is invested instead"
              />
            </div>
          </motion.section>

          {/* ═════════ INPUT GRID — RENT + BUY ═════════ */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Rent */}
            <motion.section
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, ease }}
              className="rvb-card p-5 sm:p-6"
            >
              <div className="mb-5 flex items-baseline justify-between border-b border-app pb-4">
                <h3 className="text-base font-semibold tracking-tight">Rent</h3>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted">
                  flexibility · liquidity
                </span>
              </div>
              <div className="space-y-4">
                <Field
                  label="Monthly Rent (AED)"
                  value={monthlyRent}
                  onChange={setMonthlyRent}
                  placeholder="8000"
                />
                <Field
                  label="Annual Rent Increase"
                  value={annualRentIncrease}
                  onChange={setAnnualRentIncrease}
                  placeholder="5"
                  suffix="%"
                  note="RERA caps increases via the Rental Index"
                />
                <Field
                  label="Renter's Insurance (AED/yr)"
                  value={renterInsurance}
                  onChange={setRenterInsurance}
                  placeholder="0"
                />
              </div>
            </motion.section>

            {/* Buy */}
            <motion.section
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.05, ease }}
              className="rvb-card p-5 sm:p-6"
            >
              <div className="mb-5 flex items-baseline justify-between border-b border-app pb-4">
                <h3 className="text-base font-semibold tracking-tight">Buy</h3>
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted">
                  equity · appreciation
                </span>
              </div>

              <div className="space-y-4">
                <Field
                  label="Purchase Price (AED)"
                  value={purchasePrice}
                  onChange={setPurchasePrice}
                  placeholder="1500000"
                />

                <div>
                  <label className="mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.2em] text-muted">
                    Residency Status
                  </label>
                  <div
                    role="tablist"
                    className="inline-flex w-full rounded-full border border-app bg-tool-surface p-0.5 text-xs"
                  >
                    {([
                      { key: "uae-national" as Residency, label: "National" },
                      { key: "resident" as Residency, label: "Resident" },
                      { key: "non-resident" as Residency, label: "Non-Res" },
                    ] as const).map((opt) => {
                      const active = residency === opt.key;
                      return (
                        <button
                          key={opt.key}
                          role="tab"
                          aria-selected={active}
                          type="button"
                          onClick={() => setResidency(opt.key)}
                          className={`relative flex-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors ${
                            active
                              ? "bg-tool-accent text-white shadow-sm"
                              : "text-muted hover:text-primary"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-app pt-4">
                  <Field
                    label="Down Payment"
                    value={downPaymentPct}
                    onChange={setDownPaymentPct}
                    suffix="%"
                    note={fmtAED(downPaymentAmt)}
                  />
                  <Field
                    label="Mortgage Rate"
                    value={mortgageRate}
                    onChange={setMortgageRate}
                    suffix="%"
                    placeholder="4.5"
                  />
                  <Field
                    label="Term (years)"
                    value={mortgageTerm}
                    onChange={setMortgageTerm}
                    placeholder="25"
                  />
                  <Field
                    label="Appreciation"
                    value={appreciation}
                    onChange={setAppreciation}
                    suffix="%"
                    placeholder="5"
                  />
                  <Field
                    label="Service Charge/yr"
                    value={serviceCharge}
                    onChange={setServiceCharge}
                    placeholder="15000"
                  />
                  <Field
                    label="Maintenance/yr"
                    value={annualMaintenance}
                    onChange={setAnnualMaintenance}
                    placeholder={`${fmtAED(price * 0.01)}`}
                    note="1% of value if blank"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-app pt-4">
                  <div>
                    <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                      DLD Fee · 4%
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium tabular-nums">
                      {fmtAED(dldFee)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                      Agent · 2%
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium tabular-nums">
                      {fmtAED(agentCommission)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          {/* ═════════ RESULTS ═════════ */}
          <AnimatePresence>
            {hasResult && lastRow && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease }}
                className="mt-6 space-y-6"
              >
                {/* Crossover chart */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease }}
                  className="rvb-card p-5 sm:p-6"
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">
                        Crossover · Net Wealth Over Time
                      </h3>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                        Where buy overtakes rent
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[0.65rem]">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-tool-surface px-2 py-1 font-mono text-muted">
                        <span
                          className="h-0.5 w-3 rounded-full bg-tool-accent"
                          aria-hidden
                        />
                        Buy
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-tool-surface px-2 py-1 font-mono text-muted">
                        <svg width="12" height="2" aria-hidden>
                          <line
                            x1="0"
                            y1="1"
                            x2="12"
                            y2="1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeDasharray="3,2"
                            opacity="0.55"
                          />
                        </svg>
                        Rent
                      </span>
                    </div>
                  </div>
                  <CrossoverChart data={timeline} breakeven={breakeven} />
                </motion.section>

                {/* Year-by-year table */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.05, ease }}
                  className="rvb-card p-5 sm:p-6"
                >
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">
                        Year-by-Year Breakdown
                      </h3>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                        Cost, wealth, and equity per year
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedTable(!expandedTable)}
                      className="rounded-full border border-app bg-tool-surface px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      {expandedTable ? "Collapse" : `Show all ${timeline.length}`}
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-app">
                    <table className="w-full font-mono text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-app bg-tool-surface text-left text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          <th className="px-3 py-2">Yr</th>
                          <th className="px-3 py-2 text-right">Rent Cost</th>
                          <th className="px-3 py-2 text-right">Buy Cost</th>
                          <th className="px-3 py-2 text-right">Rent Wealth</th>
                          <th className="px-3 py-2 text-right">Buy Wealth</th>
                          <th className="px-3 py-2 text-right">Prop Value</th>
                          <th className="px-3 py-2 text-right">Equity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(expandedTable ? timeline : timeline.slice(0, 5)).map((row) => {
                          const isCrossover = breakeven === row.year;
                          return (
                            <tr
                              key={row.year}
                              className={`border-b border-app/60 last:border-b-0 transition-colors ${
                                isCrossover ? "bg-tool-accent-soft" : "hover:bg-tool-surface"
                              }`}
                            >
                              <td className={`px-3 py-1.5 ${isCrossover ? "text-tool-accent font-semibold" : "text-muted"}`}>
                                {row.year}
                                {isCrossover && (
                                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right">{fmtCompact(row.rentCostCumulative)}</td>
                              <td className="px-3 py-1.5 text-right">{fmtCompact(row.buyCostCumulative)}</td>
                              <td
                                className={`px-3 py-1.5 text-right ${row.rentNetWealth >= row.buyNetWealth ? "font-semibold text-primary" : "text-muted"}`}
                              >
                                {fmtCompact(row.rentNetWealth)}
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right ${row.buyNetWealth >= row.rentNetWealth ? "font-semibold text-tool-accent" : "text-muted"}`}
                              >
                                {fmtCompact(row.buyNetWealth)}
                              </td>
                              <td className="px-3 py-1.5 text-right text-muted">{fmtCompact(row.propertyValue)}</td>
                              <td className="px-3 py-1.5 text-right text-muted">{fmtCompact(row.equity)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!expandedTable && timeline.length > 5 && (
                    <p className="mt-2 text-center font-mono text-[0.6rem] tabular-nums text-muted">
                      Showing 5 of {timeline.length} years
                    </p>
                  )}
                </motion.section>

                {/* Insights */}
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.1, ease }}
                  className="rvb-card p-5 sm:p-6"
                >
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold tracking-tight">
                      UAE-Specific Insights
                    </h3>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                      Tax, RERA, service charges, demographics
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {insights.map((insight, i) => (
                      <li key={i} className="flex gap-3 text-sm text-secondary">
                        <span
                          className="mt-2 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tool-accent"
                          aria-hidden
                        />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </motion.section>

                {/* Share */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.15, ease }}
                  className="flex flex-wrap gap-3"
                >
                  <button
                    type="button"
                    onClick={copyResult}
                    className="rounded-full border border-app bg-tool-surface px-5 py-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    {copied ? "Copied ✓" : "Copy summary"}
                  </button>
                  <button
                    type="button"
                    onClick={shareWhatsApp}
                    className="rounded-full bg-tool-accent px-5 py-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
                  >
                    Share via WhatsApp
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tool recommendations */}
          {!isFramed && (
            <div className="mt-16">
              <ToolRecommendations slug="rent-vs-buy" />
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
