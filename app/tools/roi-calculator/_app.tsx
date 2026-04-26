"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   ROI Calculator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome, no useSearchParams/frame=1 logic. Width-driven layout switches
   the input/results split below 900px. All ROI / cap-rate / cash-on-cash /
   IRR math is preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportButton from "@/components/ExportButton";
import { awardXP } from "@/lib/xp-actions";
import { useCanvasTone } from "@/lib/useCanvasTone";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface ScenarioInput {
  id: string;
  label: string;
  purchasePrice: string;
  monthlyRent: string;
  annualAppreciation: string;
  serviceCharge: string;
  maintenanceCost: string;
  occupancyRate: string;
  reraIncrease: string;
  mode: "cash" | "mortgage";
  ltv: string;
  interestRate: string;
  mortgageTerm: string;
}

interface YearData {
  year: number;
  cumulativeRental: number;
  cumulativeExpenses: number;
  propertyValue: number;
  netWorth: number;
  annualRent: number;
  annualCashFlow: number;
}

interface ScenarioResult {
  label: string;
  monthlyCashFlow: number;
  annualNetIncome: number;
  grossYield: number;
  netYield: number;
  capRate: number;
  cashOnCash: number;
  irr: number;
  totalROI: number;
  breakEvenYears: number | null;
  monthlyMortgage: number;
  downPayment: number;
  totalInvestment: number;
  timeline: YearData[];
  endValue: number;
}

let scenarioIdCounter = 0;

function createScenario(label: string): ScenarioInput {
  return {
    id: `sc-${++scenarioIdCounter}`,
    label,
    purchasePrice: "",
    monthlyRent: "",
    annualAppreciation: "5",
    serviceCharge: "",
    maintenanceCost: "",
    occupancyRate: "90",
    reraIncrease: "0",
    mode: "cash",
    ltv: "80",
    interestRate: "5",
    mortgageTerm: "25",
  };
}

function calcMortgagePayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** IRR via Newton-Raphson on a cash-flow series (CF[0] = -investment). */
function calcIRR(cashFlows: number[]): number {
  if (cashFlows.length < 2) return 0;
  let rate = 0.1;
  for (let i = 0; i < 80; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) dnpv -= (t * cashFlows[t]) / (denom * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const next = rate - npv / dnpv;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) {
      rate = next;
      break;
    }
    rate = next;
    if (rate < -0.999) rate = -0.999;
  }
  return rate * 100;
}

function computeScenario(s: ScenarioInput, horizonYears: number): ScenarioResult | null {
  const price = Number(s.purchasePrice);
  const rent = Number(s.monthlyRent);
  if (!price || !rent) return null;

  const appreciation = Number(s.annualAppreciation) / 100;
  const service = Number(s.serviceCharge) || 0;
  const maintenance = Number(s.maintenanceCost) || 0;
  const occupancy = Number(s.occupancyRate) / 100;
  const reraInc = Number(s.reraIncrease) / 100;

  const isMortgage = s.mode === "mortgage";
  const ltv = isMortgage ? Number(s.ltv) / 100 : 0;
  const loanAmount = isMortgage ? price * ltv : 0;
  const downPayment = isMortgage ? price - loanAmount : price;
  const monthlyMortgage = isMortgage
    ? calcMortgagePayment(loanAmount, Number(s.interestRate), Number(s.mortgageTerm))
    : 0;

  const annualMortgage = monthlyMortgage * 12;
  const effectiveRent = rent * 12 * occupancy;
  const annualExpenses = service + maintenance + annualMortgage;
  const annualNet = effectiveRent - annualExpenses;
  const monthlyCashFlow = annualNet / 12;
  const grossYield = (effectiveRent / price) * 100;
  const netYield = (annualNet / price) * 100;
  const capRate = ((effectiveRent - service - maintenance) / price) * 100;
  const cashOnCash = downPayment > 0 ? (annualNet / downPayment) * 100 : 0;

  const timeline: YearData[] = [];
  let cumRental = 0;
  let cumExpenses = 0;
  let currentRent = effectiveRent;

  for (let y = 1; y <= horizonYears; y++) {
    if (y > 1) currentRent *= 1 + reraInc;
    const yearCashFlow = currentRent - annualExpenses;
    cumRental += currentRent;
    cumExpenses += annualExpenses;
    const propValue = price * Math.pow(1 + appreciation, y);
    const equity = propValue - loanAmount;
    const netWorth = equity + cumRental - cumExpenses - downPayment;
    timeline.push({
      year: y,
      cumulativeRental: cumRental,
      cumulativeExpenses: cumExpenses,
      propertyValue: propValue,
      netWorth,
      annualRent: currentRent,
      annualCashFlow: yearCashFlow,
    });
  }

  let breakEvenYears: number | null = null;
  for (const yd of timeline) {
    if (yd.netWorth >= 0) {
      breakEvenYears = yd.year;
      break;
    }
  }

  const last = timeline[timeline.length - 1];
  const endValue = last ? last.propertyValue : price;
  const totalReturn = last
    ? last.cumulativeRental - last.cumulativeExpenses + (last.propertyValue - price)
    : 0;
  const totalROI = downPayment > 0 ? (totalReturn / downPayment) * 100 : 0;

  // IRR cash-flow series: -downPayment at t=0, annualCashFlow each year, plus exit (sale - loan) at terminal year
  const cfs: number[] = [-downPayment];
  timeline.forEach((yd, idx) => {
    let cf = yd.annualCashFlow;
    if (idx === timeline.length - 1) cf += yd.propertyValue - loanAmount;
    cfs.push(cf);
  });
  const irr = calcIRR(cfs);

  return {
    label: s.label,
    monthlyCashFlow,
    annualNetIncome: annualNet,
    grossYield,
    netYield,
    capRate,
    cashOnCash,
    irr,
    totalROI,
    breakEvenYears,
    monthlyMortgage,
    downPayment,
    totalInvestment: downPayment,
    timeline,
    endValue,
  };
}

const HORIZON_OPTIONS = [3, 5, 7, 10];

/* ───── Scenario form ───── */
function ScenarioForm({
  scenario,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: {
  scenario: ScenarioInput;
  index: number;
  canRemove: boolean;
  onUpdate: (id: string, field: keyof ScenarioInput, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const propertyFields = [
    { key: "purchasePrice" as const, label: "Purchase Price", unit: "AED", placeholder: "2,000,000", required: true },
    { key: "monthlyRent" as const, label: "Monthly Rent", unit: "AED", placeholder: "10,000", required: true },
    { key: "annualAppreciation" as const, label: "Appreciation", unit: "% / yr", placeholder: "5" },
    { key: "occupancyRate" as const, label: "Occupancy", unit: "%", placeholder: "90" },
    { key: "reraIncrease" as const, label: "RERA Increase", unit: "% / yr", placeholder: "3" },
  ];

  const costFields = [
    { key: "serviceCharge" as const, label: "Service Charge", unit: "AED / yr", placeholder: "15,000" },
    { key: "maintenanceCost" as const, label: "Maintenance", unit: "AED / yr", placeholder: "5,000" },
  ];

  const mortgageFields = [
    { key: "ltv" as const, label: "LTV", unit: "%", placeholder: "80" },
    { key: "interestRate" as const, label: "Interest", unit: "% / yr", placeholder: "5" },
    { key: "mortgageTerm" as const, label: "Term", unit: "years", placeholder: "25" },
  ];

  const LineItem = ({
    label,
    unit,
    value,
    placeholder,
    required,
    onChange,
  }: {
    label: string;
    unit: string;
    value: string;
    placeholder?: string;
    required?: boolean;
    onChange: (v: string) => void;
  }) => (
    <div className="flex items-center border-b border-app py-2.5 last:border-b-0">
      <label className="flex-1 text-[0.78rem] text-secondary">
        {label}
        {required && <span className="text-tool-accent"> *</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-app bg-app px-2 py-1 text-right font-mono text-[0.82rem] tabular-nums text-app outline-none transition-colors placeholder:text-muted focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
        />
        <span className="w-14 text-[0.62rem] uppercase tracking-[0.12em] text-muted">
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, ease }}
      className="overflow-hidden rounded-xl border border-app bg-app-elevated"
    >
      <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-tool-accent" />
          <input
            type="text"
            value={scenario.label}
            onChange={(e) => onUpdate(scenario.id, "label", e.target.value)}
            className="bg-transparent text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-tool-accent outline-none placeholder:text-muted"
            placeholder="Scenario name"
          />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(scenario.id)}
            className="text-[0.6rem] uppercase tracking-[0.2em] text-muted transition-colors hover:text-tool-accent"
          >
            Remove
          </button>
        )}
      </div>

      <div className="space-y-5 p-4">
        {/* Mode toggle - pill row */}
        <div>
          <p className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Investment Mode
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-app bg-app p-1">
            {(["cash", "mortgage"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdate(scenario.id, "mode", mode)}
                className={`rounded-md px-3 py-1.5 text-[0.68rem] font-medium uppercase tracking-[0.14em] transition-all duration-200 ${
                  scenario.mode === mode
                    ? "bg-tool-accent text-white shadow-sm"
                    : "text-secondary hover:text-tool-accent"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
              Property
            </p>
            <span className="text-[0.58rem] uppercase tracking-[0.18em] text-muted">
              Item / Value / Unit
            </span>
          </div>
          <div>
            {propertyFields.map((f) => (
              <LineItem
                key={f.key}
                label={f.label}
                unit={f.unit}
                value={scenario[f.key]}
                placeholder={f.placeholder}
                required={f.required}
                onChange={(v) => onUpdate(scenario.id, f.key, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
            Annual Costs
          </p>
          <div>
            {costFields.map((f) => (
              <LineItem
                key={f.key}
                label={f.label}
                unit={f.unit}
                value={scenario[f.key]}
                placeholder={f.placeholder}
                onChange={(v) => onUpdate(scenario.id, f.key, v)}
              />
            ))}
          </div>
        </div>

        <AnimatePresence>
          {scenario.mode === "mortgage" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                Mortgage
              </p>
              <div>
                {mortgageFields.map((f) => (
                  <LineItem
                    key={f.key}
                    label={f.label}
                    unit={f.unit}
                    value={scenario[f.key]}
                    placeholder={f.placeholder}
                    onChange={(v) => onUpdate(scenario.id, f.key, v)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ───── Capital comparison bar chart ───── */
function ROIBarChart({
  purchasePrice,
  totalInvestment,
  endValue,
}: {
  purchasePrice: number;
  totalInvestment: number;
  endValue: number;
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

      const pad = { top: 20, right: 20, bottom: 50, left: 20 };
      const chartW = W - pad.left - pad.right;
      const chartH = H - pad.top - pad.bottom;

      const accent =
        getComputedStyle(container).getPropertyValue("--tool-accent").trim() ||
        "#3b82f6";

      const bars = [
        { label: "Purchase", value: purchasePrice, alpha: 0.55 },
        { label: "Invested", value: totalInvestment, alpha: 0.75 },
        { label: "End Value", value: endValue, alpha: 0.95 },
      ];

      const maxVal = Math.max(...bars.map((b) => b.value)) * 1.15;
      const barWidth = Math.min(chartW / bars.length - 24, 80);
      const totalBarsWidth = bars.length * barWidth + (bars.length - 1) * 24;
      const startX = pad.left + (chartW - totalBarsWidth) / 2;

      ctx.strokeStyle = `rgba(${tone},0.08)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
      }

      bars.forEach((bar, i) => {
        const x = startX + i * (barWidth + 24);
        const barH = maxVal > 0 ? (bar.value / maxVal) * chartH : 0;
        const y = pad.top + chartH - barH;

        ctx.fillStyle = accent;
        ctx.globalAlpha = bar.alpha;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = `rgba(${tone},0.9)`;
        ctx.font = "bold 11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const valStr = bar.value >= 1_000_000
          ? `${(bar.value / 1_000_000).toFixed(1)}M`
          : `${(bar.value / 1_000).toFixed(0)}K`;
        ctx.fillText(valStr, x + barWidth / 2, y - 6);

        ctx.fillStyle = `rgba(${tone},0.55)`;
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(bar.label, x + barWidth / 2, pad.top + chartH + 8);
      });
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [purchasePrice, totalInvestment, endValue, tone]);

  return (
    <div ref={containerRef} className="h-[200px] w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

/** Verdict chip — uses tool-accent variants. */
function VerdictChip({ roi }: { roi: number }) {
  let label: string;
  let cls: string;
  if (roi >= 50) {
    label = "Excellent";
    cls = "bg-tool-accent text-white";
  } else if (roi >= 20) {
    label = "Good";
    cls = "bg-tool-accent-soft text-tool-accent border border-tool-accent/40";
  } else if (roi >= 0) {
    label = "Fair";
    cls = "bg-app-elevated text-secondary border border-app";
  } else {
    label = "Poor";
    cls = "bg-app-elevated text-rose-500 border border-rose-500/40";
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${roi >= 0 ? "bg-current" : "bg-rose-500"}`} />
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function ROICalculatorApp(props: NativeAppProps) {
  const { width, initialParams, initialParamsKey } = props;

  /* Below 900px → stack inputs above results. */
  const isWide = width >= 900;

  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    createScenario("Scenario A"),
  ]);
  const [horizonYears, setHorizonYears] = useState(5);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const xpAwarded = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  /* Hydrate from initialParams when openApp() passes a property context. */
  useEffect(() => {
    if (!initialParams) return;
    setScenarios((prev) => {
      const first = prev[0];
      if (!first) return prev;
      const next = { ...first };
      if (typeof initialParams.purchasePrice === "number") {
        next.purchasePrice = String(Math.round(initialParams.purchasePrice));
      } else if (typeof initialParams.purchasePrice === "string") {
        next.purchasePrice = initialParams.purchasePrice.replace(/[^0-9]/g, "");
      }
      if (typeof initialParams.monthlyRent === "number") {
        next.monthlyRent = String(Math.round(initialParams.monthlyRent));
      } else if (typeof initialParams.monthlyRent === "string") {
        next.monthlyRent = initialParams.monthlyRent.replace(/[^0-9]/g, "");
      }
      if (initialParams.mode === "cash" || initialParams.mode === "mortgage") {
        next.mode = initialParams.mode;
      }
      return [next, ...prev.slice(1)];
    });
    setShowResults(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const updateScenario = useCallback(
    (id: string, field: keyof ScenarioInput, value: string) => {
      setScenarios((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
      );
      if (showResults) setShowResults(false);
    },
    [showResults]
  );

  const removeScenario = useCallback(
    (id: string) => {
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      if (showResults) setShowResults(false);
    },
    [showResults]
  );

  const addScenario = () => {
    if (scenarios.length >= 2) return;
    setScenarios((prev) => [...prev, createScenario("Scenario B")]);
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResults(true);
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "roi-calculator").catch(() => {});
    }
  };

  const results = useMemo(() => {
    if (!showResults) return [];
    return scenarios.map((s) => computeScenario(s, horizonYears)).filter(Boolean) as ScenarioResult[];
  }, [scenarios, horizonYears, showResults]);

  // Default active scenario to first when results land
  useEffect(() => {
    if (results.length > 0 && !activeScenarioId) {
      setActiveScenarioId(scenarios[0]?.id ?? null);
    }
  }, [results.length, activeScenarioId, scenarios]);

  const activeIndex = Math.max(
    0,
    scenarios.findIndex((s) => s.id === activeScenarioId)
  );
  const activeResult = results[activeIndex] ?? results[0];
  const activeScenario = scenarios[activeIndex] ?? scenarios[0];

  const fmt = (n: number) => `${Math.round(n).toLocaleString()}`;
  const fmtShort = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${Math.round(n).toLocaleString()}`;
  };

  return (
    <div
      data-tool-theme="calculators"
      data-tool="roi-calculator"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <div className="px-4 pb-10 pt-5 sm:px-6">
        <form onSubmit={handleCalculate}>
          <div
            className={isWide ? "grid gap-6" : "flex flex-col gap-5"}
            style={
              isWide
                ? { gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }
                : undefined
            }
          >
            {/* LEFT: inputs */}
            <div className="space-y-5">
              <div
                className={`grid gap-4 ${
                  scenarios.length > 1 && isWide
                    ? "md:grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {scenarios.map((sc, i) => (
                  <ScenarioForm
                    key={sc.id}
                    scenario={sc}
                    index={i}
                    canRemove={scenarios.length > 1}
                    onUpdate={updateScenario}
                    onRemove={removeScenario}
                  />
                ))}
              </div>

              {/* Horizon pill row + actions */}
              <div className="rounded-xl border border-app bg-app-elevated p-4">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                    Holding Period
                  </label>
                  <span className="font-mono text-[0.72rem] tabular-nums text-secondary">
                    {horizonYears} yrs
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-app bg-app p-1">
                  {HORIZON_OPTIONS.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setHorizonYears(y);
                        if (showResults) setShowResults(false);
                      }}
                      className={`rounded-md px-3 py-1.5 text-[0.7rem] font-medium tabular-nums transition-all duration-200 ${
                        horizonYears === y
                          ? "bg-tool-accent text-white shadow-sm"
                          : "text-secondary hover:text-tool-accent"
                      }`}
                    >
                      {y} yr
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {scenarios.length < 2 && (
                    <button
                      type="button"
                      onClick={addScenario}
                      className="flex-1 rounded-md border border-dashed border-app bg-app-elevated px-4 py-2.5 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-tool-accent transition-all duration-200 hover:bg-tool-accent-soft"
                    >
                      + Add Scenario
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 rounded-md bg-tool-accent px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white shadow-sm transition-all duration-200 hover:brightness-110"
                  >
                    Calculate ROI →
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: results */}
            <div className={isWide ? "self-start lg:sticky lg:top-6" : ""}>
              {!showResults || results.length === 0 || !activeResult ? (
                <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                  <div className="border-b border-app bg-tool-accent-soft px-4 py-2.5">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                      Results — Pending
                    </p>
                  </div>
                  <div className="p-10 text-center">
                    <div className="font-mono text-[0.7rem] leading-relaxed text-muted tabular-nums">
                      <div>— — — — — — — — — — —</div>
                      <div className="my-4 text-secondary">
                        Enter the numbers.<br />
                        Hit calculate.
                      </div>
                      <div>— — — — — — — — — — —</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={resultsRef} className="space-y-4">
                  {/* Scenario tabs (state buttons, not Link) */}
                  {results.length > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-app bg-app-elevated p-1">
                        {results.map((r, ri) => (
                          <button
                            key={ri}
                            type="button"
                            onClick={() => setActiveScenarioId(scenarios[ri].id)}
                            className={`rounded-md px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.14em] transition-all duration-200 ${
                              activeIndex === ri
                                ? "bg-tool-accent text-white shadow-sm"
                                : "text-secondary hover:text-tool-accent"
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <ExportButton targetRef={resultsRef} filename="roi-calculator-results" />
                    </div>
                  )}
                  {results.length === 1 && (
                    <div className="flex justify-end">
                      <ExportButton targetRef={resultsRef} filename="roi-calculator-results" />
                    </div>
                  )}

                  {/* HERO ROI card */}
                  <motion.div
                    key={activeResult.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease }}
                    className="overflow-hidden rounded-xl border border-app bg-app-elevated"
                  >
                    <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-tool-accent" />
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                          {activeResult.label} · {horizonYears}-yr ROI
                        </p>
                      </div>
                      <VerdictChip roi={activeResult.totalROI} />
                    </div>

                    <div className="px-6 py-7 text-center">
                      <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-muted">
                        Total Return on Investment
                      </p>
                      <p
                        className={`font-mono font-bold leading-none tracking-tight tabular-nums ${
                          activeResult.totalROI >= 0 ? "text-tool-accent" : "text-rose-500"
                        }`}
                        style={{ fontSize: "clamp(3.5rem, 9vw, 5.5rem)" }}
                      >
                        {activeResult.totalROI >= 0 ? "+" : ""}
                        {activeResult.totalROI.toFixed(1)}
                        <span className="text-3xl">%</span>
                      </p>
                      <div className="mt-5 flex items-center justify-center gap-6 text-[0.7rem]">
                        <div>
                          <p className="text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-muted">Down Payment</p>
                          <p className="mt-0.5 font-mono text-secondary tabular-nums">
                            AED {fmt(activeResult.downPayment)}
                          </p>
                        </div>
                        <span className="h-6 w-px bg-app" />
                        <div>
                          <p className="text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-muted">End Value</p>
                          <p className="mt-0.5 font-mono text-secondary tabular-nums">
                            AED {fmtShort(activeResult.endValue)}
                          </p>
                        </div>
                        {activeResult.breakEvenYears !== null && (
                          <>
                            <span className="h-6 w-px bg-app" />
                            <div>
                              <p className="text-[0.55rem] font-semibold uppercase tracking-[0.15em] text-muted">Payback</p>
                              <p className="mt-0.5 font-mono text-secondary tabular-nums">
                                {activeResult.breakEvenYears} yr
                                {activeResult.breakEvenYears > 1 ? "s" : ""}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Sub-cards: cap rate / cash-on-cash / IRR */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Cap Rate", val: activeResult.capRate, hint: "Net op income / price" },
                      { label: "Cash-on-Cash", val: activeResult.cashOnCash, hint: "Annual cash / down" },
                      { label: "IRR", val: activeResult.irr, hint: `Annualised over ${horizonYears}yr` },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="rounded-xl border border-app bg-app-elevated p-3 text-center"
                      >
                        <p className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
                          {m.label}
                        </p>
                        <p className="mt-1.5 font-mono text-2xl font-bold text-tool-accent tabular-nums">
                          {m.val.toFixed(2)}
                          <span className="text-base text-muted">%</span>
                        </p>
                        <p className="mt-1.5 text-[0.55rem] leading-tight text-muted">
                          {m.hint}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Income / expenses / net summary */}
                  <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                    <div className="border-b border-app bg-tool-accent-soft px-4 py-2.5">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                        Annual Cash Flow
                      </p>
                    </div>
                    {(() => {
                      const sc = activeScenario;
                      const service = Number(sc.serviceCharge) || 0;
                      const maintenance = Number(sc.maintenanceCost) || 0;
                      const annualMortgage = activeResult.monthlyMortgage * 12;
                      const grossAnnualRent = Number(sc.monthlyRent) * 12 || 0;
                      const vacancyLoss = grossAnnualRent * (1 - Number(sc.occupancyRate) / 100);
                      const effectiveRent = grossAnnualRent - vacancyLoss;
                      const totalExpenses = service + maintenance + annualMortgage;
                      return (
                        <div className="space-y-1 p-5 text-[0.78rem]">
                          <div className="flex justify-between">
                            <span className="text-secondary">Gross rental</span>
                            <span className="font-mono text-app tabular-nums">{fmt(grossAnnualRent)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="pl-3 text-muted">
                              − Vacancy ({(100 - Number(sc.occupancyRate)).toFixed(0)}%)
                            </span>
                            <span className="font-mono text-rose-500 tabular-nums">
                              ({fmt(vacancyLoss)})
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-app pt-2 font-semibold">
                            <span className="text-app">Effective rent</span>
                            <span className="font-mono text-tool-accent tabular-nums">{fmt(effectiveRent)}</span>
                          </div>
                          <div className="space-y-1 pt-3">
                            <div className="flex justify-between">
                              <span className="text-secondary">Service charge</span>
                              <span className="font-mono text-rose-500 tabular-nums">({fmt(service)})</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-secondary">Maintenance</span>
                              <span className="font-mono text-rose-500 tabular-nums">({fmt(maintenance)})</span>
                            </div>
                            {annualMortgage > 0 && (
                              <div className="flex justify-between">
                                <span className="text-secondary">
                                  Mortgage ({fmt(activeResult.monthlyMortgage)}/mo)
                                </span>
                                <span className="font-mono text-rose-500 tabular-nums">({fmt(annualMortgage)})</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-app pt-2 font-semibold">
                              <span className="text-app">Total expenses</span>
                              <span className="font-mono text-rose-500 tabular-nums">({fmt(totalExpenses)})</span>
                            </div>
                          </div>
                          <div className="mt-3 rounded-lg bg-tool-accent-soft px-3 py-2.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-tool-accent">
                                Net annual income
                              </span>
                              <span
                                className={`font-mono text-base font-bold tabular-nums ${
                                  activeResult.annualNetIncome >= 0 ? "text-tool-accent" : "text-rose-500"
                                }`}
                              >
                                {activeResult.annualNetIncome >= 0 ? "" : "("}
                                {fmt(Math.abs(activeResult.annualNetIncome))}
                                {activeResult.annualNetIncome < 0 ? ")" : ""}
                              </span>
                            </div>
                            <div className="mt-1.5 flex justify-between border-t border-tool-accent/20 pt-1.5 text-[0.7rem]">
                              <span className="text-secondary">Monthly cash flow</span>
                              <span
                                className={`font-mono font-semibold tabular-nums ${
                                  activeResult.monthlyCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"
                                }`}
                              >
                                {activeResult.monthlyCashFlow >= 0 ? "+" : ""}
                                {fmt(activeResult.monthlyCashFlow)} / mo
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Year-by-year ledger - striped table */}
                  <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                    <div className="border-b border-app bg-tool-accent-soft px-4 py-2.5">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                        Year-by-Year
                      </p>
                    </div>
                    <div className="grid grid-cols-4 border-b border-app text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-muted">
                      <div className="p-2.5">Year</div>
                      <div className="p-2.5 text-right">Cum Rent</div>
                      <div className="p-2.5 text-right">Value</div>
                      <div className="p-2.5 text-right">Net</div>
                    </div>
                    {activeResult.timeline.map((yd, yi) => (
                      <div
                        key={yd.year}
                        className={`grid grid-cols-4 font-mono text-[0.72rem] tabular-nums transition-colors hover:ring-1 hover:ring-tool-accent hover:ring-inset ${
                          yi % 2 === 0 ? "bg-app" : "bg-app-elevated"
                        }`}
                      >
                        <div className="p-2.5 text-secondary">Y{yd.year}</div>
                        <div className="p-2.5 text-right text-secondary">
                          {fmtShort(yd.cumulativeRental)}
                        </div>
                        <div className="p-2.5 text-right text-secondary">
                          {fmtShort(yd.propertyValue)}
                        </div>
                        <div
                          className={`p-2.5 text-right font-semibold ${
                            yd.netWorth >= 0 ? "text-tool-accent" : "text-rose-500"
                          }`}
                        >
                          {yd.netWorth >= 0 ? "+" : ""}
                          {fmtShort(yd.netWorth)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bar chart */}
                  {(() => {
                    const sc = activeScenario;
                    const price = Number(sc.purchasePrice) || 0;
                    const service = Number(sc.serviceCharge) || 0;
                    const maintenance = Number(sc.maintenanceCost) || 0;
                    const annualMortgage = activeResult.monthlyMortgage * 12;
                    return (
                      <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                        <div className="border-b border-app bg-tool-accent-soft px-4 py-2.5">
                          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                            Capital Comparison
                          </p>
                        </div>
                        <div className="p-4">
                          <ROIBarChart
                            purchasePrice={price}
                            totalInvestment={
                              activeResult.totalInvestment +
                              (service + maintenance) * horizonYears +
                              (annualMortgage > 0 ? annualMortgage * horizonYears : 0)
                            }
                            endValue={activeResult.endValue}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cross-tool CTAs - openApp() instead of window.location */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, ease }}
                    className="grid grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        props.openApp("deal-scoring", {
                          purchasePrice: Number(activeScenario.purchasePrice) || undefined,
                          monthlyRent: Number(activeScenario.monthlyRent) || undefined,
                        })
                      }
                      className="rounded-lg border border-app bg-app-elevated px-4 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tool-accent transition-all duration-200 hover:bg-tool-accent-soft"
                    >
                      Score This Deal →
                    </button>
                    <button
                      type="button"
                      onClick={() => props.openApp("yield-heatmap")}
                      className="rounded-lg border border-app bg-app-elevated px-4 py-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tool-accent transition-all duration-200 hover:bg-tool-accent-soft"
                    >
                      Yield Heatmap →
                    </button>
                  </motion.div>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
