"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Investment Simulator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Inside-the-Window variant of `/tools/investment-simulator`. The standalone
   page (page.tsx) stays for direct visits / SEO / sharing. This file is
   mounted by the desktop's Window component when the user opens the tool
   from the workspace.

   Differences vs page.tsx:
     - No <AuthGate> (workspace handles auth at the shell level).
     - No frame=1 / Suspense+useSearchParams / macOS chrome (Window provides
       its own chrome and passes intent via NativeAppProps).
     - No PageHeader / back-links (workspace dock handles discovery).
     - No <ToolRecommendations> at the foot.
     - Cross-tool jumps (e.g. yield-heatmap, deal-scoring) use props.openApp().
     - Layout collapses based on the live window width, not the viewport.

   All historical-data simulation math, hooks, and feature surface are
   preserved verbatim.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  historicalData,
  bankDepositRates,
  DATA_UPDATED,
  type AreaHistoricalData,
} from "@/lib/investment-sim-data";
import { useCanvasTone } from "@/lib/useCanvasTone";
import { awardXP } from "@/lib/xp-actions";
import type { NativeAppProps } from "../_data/tools-list";

/* ─── Constants ─── */
const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const PROJECTION_END = 2030;
const LAST_ACTUAL_YEAR = 2026;

/* ─── Types ─── */
interface SimResult {
  area: AreaHistoricalData;
  purchaseYear: number;
  size: number;
  purchasePrice: number;
  currentValue: number;
  capitalAppreciation: number;
  rentalIncome: number;
  totalReturn: number;
  totalROI: number;
  bankReturn: number;
  bankTotal: number;
  propertyLine: { year: number; value: number; projected?: boolean }[];
  bankLine: { year: number; value: number; projected?: boolean }[];
  isMortgage: boolean;
  downPayment: number;
  totalMortgagePaid: number;
  totalInterestPaid: number;
  monthlyMortgagePayment: number;
  netReturnAfterMortgage: number;
  leveragedROI: number;
  totalExpensesDeducted: number;
  netRentalIncome: number;
  avgProjectedGrowth: number;
  projectedValue2030: number;
}

interface ScenarioBundle {
  best: SimResult;
  base: SimResult;
  worst: SimResult;
}

/* ─── Helpers ─── */
function fmtAED(n: number) {
  return `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toString();
}
function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function calcMortgagePayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function getAvgGrowthRate(area: AreaHistoricalData): number {
  const years = [2024, 2025, 2026];
  let totalGrowth = 0;
  let count = 0;
  for (const y of years) {
    if (area.pricePerSqft[y] && area.pricePerSqft[y - 1]) {
      totalGrowth += (area.pricePerSqft[y] - area.pricePerSqft[y - 1]) / area.pricePerSqft[y - 1];
      count++;
    }
  }
  return count > 0 ? totalGrowth / count : 0.04;
}

function getAvgRentGrowthRate(area: AreaHistoricalData): number {
  const years = [2024, 2025, 2026];
  let totalGrowth = 0;
  let count = 0;
  for (const y of years) {
    if (area.avgMonthlyRent1BR[y] && area.avgMonthlyRent1BR[y - 1]) {
      totalGrowth += (area.avgMonthlyRent1BR[y] - area.avgMonthlyRent1BR[y - 1]) / area.avgMonthlyRent1BR[y - 1];
      count++;
    }
  }
  return count > 0 ? totalGrowth / count : 0.03;
}

/* ─── Hex helper for canvas tool-accent reads ─── */
function useToolAccentRgb(): string {
  const [rgb, setRgb] = useState("16,185,129");
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const raw = cs.getPropertyValue("--tool-hue").trim() || "#10b981";
      const m = raw.match(/^#?([0-9a-f]{6})$/i);
      if (m) {
        const h = m[1];
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        setRgb(`${r},${g},${b}`);
      }
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-tool-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return rgb;
}

/* ─── Multi-Line Projection Chart (tool-accent area + lines) ─── */
function ProjectionChart({
  propertyLine,
  bankLine,
  propertyLine2,
  area1Name,
  area2Name,
}: {
  propertyLine: { year: number; value: number; projected?: boolean }[];
  bankLine: { year: number; value: number; projected?: boolean }[];
  propertyLine2?: { year: number; value: number; projected?: boolean }[];
  area1Name: string;
  area2Name?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const tone = useCanvasTone();
  const accent = useToolAccentRgb();
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    year: number;
    values: { label: string; value: number; color: string }[];
    projected: boolean;
  } | null>(null);

  const allLines = useCallback(() => {
    const lines: {
      data: { year: number; value: number; projected?: boolean }[];
      color: string;
      fill: boolean;
      label: string;
    }[] = [
      { data: propertyLine, color: `rgba(${accent},1)`, fill: true, label: area1Name },
      { data: bankLine, color: `rgba(${tone},0.45)`, fill: false, label: "Bank Deposit" },
    ];
    if (propertyLine2 && area2Name) {
      lines.push({
        data: propertyLine2,
        color: `rgba(${accent},0.55)`,
        fill: false,
        label: area2Name,
      });
    }
    return lines;
  }, [propertyLine, bankLine, propertyLine2, area1Name, area2Name, accent, tone]);

  const getLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const pad = { top: 30, right: 20, bottom: 40, left: 70 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const lines = allLines();
    const allValues = lines.flatMap((l) => l.data.map((p) => p.value));
    const minVal = Math.min(...allValues) * 0.9;
    const maxVal = Math.max(...allValues) * 1.1;
    const years = propertyLine.map((p) => p.year);
    const minYear = years[0];
    const maxYear = years[years.length - 1];

    const xScale = (year: number) =>
      pad.left + ((year - minYear) / (maxYear - minYear)) * chartW;
    const yScale = (val: number) =>
      pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

    return { W, H, pad, chartW, chartH, minVal, maxVal, minYear, maxYear, xScale, yScale, years, lines };
  }, [allLines, propertyLine]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const layout = getLayout();
    if (!layout) return;
    const { W, H, pad, chartH, minVal, maxVal, xScale, yScale, years, lines } = layout;

    ctx.clearRect(0, 0, W, H);

    // Grid (border-app tone)
    ctx.strokeStyle = `rgba(${tone},0.08)`;
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = minVal + ((maxVal - minVal) * i) / gridSteps;
      const y = yScale(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = `rgba(${tone},0.45)`;
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const label =
        val >= 1_000_000
          ? `${(val / 1_000_000).toFixed(1)}M`
          : `${(val / 1_000).toFixed(0)}K`;
      ctx.fillText(label, pad.left - 8, y);
    }

    // X labels
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const year of years) {
      const isProjected = year > LAST_ACTUAL_YEAR;
      ctx.fillStyle = isProjected ? `rgba(${tone},0.3)` : `rgba(${tone},0.5)`;
      const label = isProjected ? `${year}*` : year.toString();
      ctx.fillText(label, xScale(year), pad.top + chartH + 10);
    }

    // Projected zone (uses tool-accent-soft tint)
    if (years.some((y) => y > LAST_ACTUAL_YEAR)) {
      ctx.fillStyle = `rgba(${accent},0.04)`;
      const x1 = xScale(LAST_ACTUAL_YEAR);
      const x2 = xScale(years[years.length - 1]);
      ctx.fillRect(x1, pad.top, x2 - x1, chartH);

      ctx.fillStyle = `rgba(${tone},0.3)`;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Projected", (x1 + x2) / 2, pad.top + 12);
    }

    // Draw area fills + lines
    for (const line of lines) {
      const actualData = line.data.filter((p) => !p.projected);
      const projectedData = line.data.filter((p) => p.projected);
      const lastActual = actualData[actualData.length - 1];
      const projectedWithBridge = lastActual ? [lastActual, ...projectedData] : projectedData;
      const baselineY = pad.top + chartH;

      // Area fill (only the primary tool-accent line)
      if (line.fill && line.data.length > 1) {
        const rgbMatch = line.color.match(/rgba?\((\d+),(\d+),(\d+)/);
        if (rgbMatch) {
          const [, r, g, b] = rgbMatch;
          const gradient = ctx.createLinearGradient(0, pad.top, 0, baselineY);
          gradient.addColorStop(0, `rgba(${r},${g},${b},0.32)`);
          gradient.addColorStop(1, `rgba(${r},${g},${b},0.02)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          line.data.forEach((p, i) => {
            const x = xScale(p.year);
            const y = yScale(p.value);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          const lastPoint = line.data[line.data.length - 1];
          const firstPoint = line.data[0];
          ctx.lineTo(xScale(lastPoint.year), baselineY);
          ctx.lineTo(xScale(firstPoint.year), baselineY);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Solid line
      if (actualData.length > 1) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.fill ? 2.6 : 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.beginPath();
        actualData.forEach((p, i) => {
          const x = xScale(p.year);
          const y = yScale(p.value);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      // Dashed (projected)
      if (projectedWithBridge.length > 1) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.fill ? 2.2 : 1.6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        projectedWithBridge.forEach((p, i) => {
          const x = xScale(p.year);
          const y = yScale(p.value);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dots
      line.data.forEach((p) => {
        const x = xScale(p.year);
        const y = yScale(p.value);
        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(x, y, p.projected ? 2.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Legend
    const legendY = 12;
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.setLineDash([]);
    let legendX = pad.left;
    for (const line of lines) {
      ctx.fillStyle = line.color;
      ctx.fillRect(legendX, legendY - 4, 12, 3);
      ctx.fillStyle = `rgba(${tone},0.55)`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(line.label, legendX + 16, legendY);
      legendX += ctx.measureText(line.label).width + 36;
    }
  }, [getLayout, tone, accent]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const layout = getLayout();
      if (!layout) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let closestYear = layout.years[0];
      let closestDist = Infinity;
      for (const year of layout.years) {
        const dist = Math.abs(layout.xScale(year) - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closestYear = year;
        }
      }

      if (closestDist > 30) {
        setTooltip(null);
        return;
      }

      const values: { label: string; value: number; color: string }[] = [];
      let isProjected = false;
      for (const line of layout.lines) {
        const point = line.data.find((p) => p.year === closestYear);
        if (point) {
          values.push({ label: line.label, value: point.value, color: line.color });
          if (point.projected) isProjected = true;
        }
      }

      setTooltip({
        x: mouseX,
        y: mouseY,
        year: closestYear,
        values,
        projected: isProjected,
      });
    },
    [getLayout]
  );

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-[300px] md:h-[380px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-app bg-app-elevated px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, (containerWidth || 300) - 200),
            top: tooltip.y - 10,
          }}
        >
          <div className="text-muted mb-1 font-medium">
            {tooltip.year}
            {tooltip.projected ? " (Projected)" : ""}
          </div>
          {tooltip.values.map((v) => (
            <div key={v.label} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: v.color }}
              />
              <span className="text-secondary">{v.label}:</span>
              <span className="text-app font-semibold">{fmtAED(v.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Summary Card ─── */
function Card({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted mb-1 font-semibold">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          positive === undefined
            ? "text-app"
            : positive
              ? "text-emerald-500 dark:text-emerald-400"
              : "text-red-500 dark:text-red-400"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ─── Scenario Card (best / base / worst) ─── */
function ScenarioCard({
  label,
  value,
  delta,
  active,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  active?: boolean;
  tone: "best" | "base" | "worst";
}) {
  const pillTone =
    tone === "best"
      ? "bg-tool-accent-soft text-tool-accent border-tool-accent/30"
      : tone === "worst"
        ? "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/30"
        : "bg-app text-secondary border-app";
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        active ? "border-tool-accent/40 bg-tool-accent-soft" : "border-app bg-app-elevated"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted font-semibold">
          {label}
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 border ${pillTone}`}
        >
          {tone}
        </span>
      </div>
      <p className="text-xl font-bold text-app tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-secondary tabular-nums">{delta}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function InvestmentSimulatorApp(props: NativeAppProps) {
  const { width, initialParams, initialParamsKey, openApp } = props;

  /* Width-driven breakpoints — based on the live window inner width, not the
     viewport. */
  const isMobile = width < 700;
  const isUltra = width < 540 || isMobile;
  const isWide = width >= 900;

  const [selectedArea, setSelectedArea] = useState(historicalData[0].id);
  const [selectedArea2, setSelectedArea2] = useState("");
  const [purchaseYear, setPurchaseYear] = useState(2020);
  const [size, setSize] = useState(750);
  const [manualAmount, setManualAmount] = useState<string>("");

  // Mortgage
  const [mode, setMode] = useState<"cash" | "mortgage">("cash");
  const [ltv, setLtv] = useState("80");
  const [interestRate, setInterestRate] = useState("5");
  const [mortgageTerm, setMortgageTerm] = useState("25");

  // Expenses
  const [serviceChargePerSqft, setServiceChargePerSqft] = useState("18");
  const [vacancyRate, setVacancyRate] = useState("8");

  // Sub-view tab state
  const [view, setView] = useState<"chart" | "table" | "summary">("chart");

  const xpAwarded = useRef(false);

  /* Hydrate from initialParams when openApp() passes context. */
  useEffect(() => {
    if (!initialParams) return;
    if (typeof initialParams.area === "string") {
      const found = historicalData.find((a) => a.id === initialParams.area);
      if (found) setSelectedArea(found.id);
    }
    if (typeof initialParams.compareArea === "string") {
      const found = historicalData.find((a) => a.id === initialParams.compareArea);
      if (found) setSelectedArea2(found.id);
    }
    if (typeof initialParams.purchaseYear === "number") {
      setPurchaseYear(initialParams.purchaseYear);
    }
    if (typeof initialParams.size === "number") {
      setSize(initialParams.size);
    }
    if (typeof initialParams.manualAmount === "number") {
      setManualAmount(String(Math.round(initialParams.manualAmount)));
    } else if (typeof initialParams.manualAmount === "string") {
      setManualAmount(initialParams.manualAmount);
    }
    if (initialParams.mode === "cash" || initialParams.mode === "mortgage") {
      setMode(initialParams.mode);
    }
    if (typeof initialParams.ltv === "number") setLtv(String(initialParams.ltv));
    else if (typeof initialParams.ltv === "string") setLtv(initialParams.ltv);
    if (typeof initialParams.interestRate === "number") setInterestRate(String(initialParams.interestRate));
    else if (typeof initialParams.interestRate === "string") setInterestRate(initialParams.interestRate);
    if (typeof initialParams.mortgageTerm === "number") setMortgageTerm(String(initialParams.mortgageTerm));
    else if (typeof initialParams.mortgageTerm === "string") setMortgageTerm(initialParams.mortgageTerm);
    if (typeof initialParams.serviceChargePerSqft === "number") setServiceChargePerSqft(String(initialParams.serviceChargePerSqft));
    else if (typeof initialParams.serviceChargePerSqft === "string") setServiceChargePerSqft(initialParams.serviceChargePerSqft);
    if (typeof initialParams.vacancyRate === "number") setVacancyRate(String(initialParams.vacancyRate));
    else if (typeof initialParams.vacancyRate === "string") setVacancyRate(initialParams.vacancyRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const area = useMemo(
    () => historicalData.find((a) => a.id === selectedArea)!,
    [selectedArea]
  );
  const area2 = useMemo(
    () => (selectedArea2 ? historicalData.find((a) => a.id === selectedArea2) : null),
    [selectedArea2]
  );
  const autoPrice = useMemo(
    () => area.pricePerSqft[purchaseYear] * size,
    [area, purchaseYear, size]
  );
  const investmentAmount = useMemo(
    () => (manualAmount ? parseInt(manualAmount) || autoPrice : autoPrice),
    [manualAmount, autoPrice]
  );

  const simulateArea = useCallback(
    (targetArea: AreaHistoricalData, investment: number, growthOverride?: number): SimResult => {
      const purchasePrice = investment;
      const effectiveSize = purchasePrice / targetArea.pricePerSqft[purchaseYear];

      const isMortgage = mode === "mortgage";
      const ltvPct = isMortgage ? Number(ltv) / 100 : 0;
      const loanAmount = isMortgage ? purchasePrice * ltvPct : 0;
      const downPayment = isMortgage ? purchasePrice - loanAmount : purchasePrice;
      const monthlyMortgagePayment = isMortgage
        ? calcMortgagePayment(loanAmount, Number(interestRate), Number(mortgageTerm))
        : 0;

      const baseGrowth = getAvgGrowthRate(targetArea);
      const avgGrowth = growthOverride !== undefined ? growthOverride : baseGrowth;
      // rent growth is unaffected by override (capital scenario only)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _avgRentGrowth = getAvgRentGrowthRate(targetArea);

      const propertyLine: { year: number; value: number; projected?: boolean }[] = [];
      for (let y = purchaseYear; y <= LAST_ACTUAL_YEAR; y++) {
        propertyLine.push({
          year: y,
          value: targetArea.pricePerSqft[y] * effectiveSize,
        });
      }
      let lastPrice = targetArea.pricePerSqft[LAST_ACTUAL_YEAR];
      for (let y = LAST_ACTUAL_YEAR + 1; y <= PROJECTION_END; y++) {
        lastPrice = lastPrice * (1 + avgGrowth);
        propertyLine.push({
          year: y,
          value: lastPrice * effectiveSize,
          projected: true,
        });
      }

      const currentValue = propertyLine.find((p) => p.year === LAST_ACTUAL_YEAR)!.value;
      const projectedValue2030 = propertyLine[propertyLine.length - 1].value;
      const capitalAppreciation = currentValue - purchasePrice;

      const sizeRatio = effectiveSize / 750;
      const vacancy = Number(vacancyRate) / 100;
      const annualServiceCharge = Number(serviceChargePerSqft) * effectiveSize;
      let grossRentalIncome = 0;
      let totalExpensesDeducted = 0;

      for (let y = purchaseYear; y <= 2025; y++) {
        const annualRent = targetArea.avgMonthlyRent1BR[y] * 12 * sizeRatio;
        const vacancyLoss = annualRent * vacancy;
        grossRentalIncome += annualRent;
        totalExpensesDeducted += vacancyLoss + annualServiceCharge;
      }
      const netRentalIncome = grossRentalIncome - totalExpensesDeducted;

      const holdingYears = 2026 - purchaseYear;
      const totalMortgagePaid = monthlyMortgagePayment * 12 * holdingYears;
      const totalInterestPaid = isMortgage
        ? totalMortgagePaid - (loanAmount * holdingYears) / Number(mortgageTerm)
        : 0;

      const totalReturn = capitalAppreciation + netRentalIncome;
      const netReturnAfterMortgage =
        totalReturn -
        (isMortgage
          ? totalMortgagePaid - loanAmount * (holdingYears / Number(mortgageTerm))
          : 0);
      const totalROI = (totalReturn / purchasePrice) * 100;
      const leveragedROI = isMortgage
        ? (netReturnAfterMortgage / downPayment) * 100
        : totalROI;

      let bankValue = purchasePrice;
      const bankLine: { year: number; value: number; projected?: boolean }[] = [
        { year: purchaseYear, value: bankValue },
      ];
      for (let y = purchaseYear + 1; y <= LAST_ACTUAL_YEAR; y++) {
        bankValue *= 1 + bankDepositRates[y - 1] / 100;
        bankLine.push({ year: y, value: bankValue });
      }
      for (let y = LAST_ACTUAL_YEAR + 1; y <= PROJECTION_END; y++) {
        bankValue *= 1 + bankDepositRates[LAST_ACTUAL_YEAR] / 100;
        bankLine.push({ year: y, value: bankValue, projected: true });
      }
      const bankReturn = bankValue - purchasePrice;

      return {
        area: targetArea,
        purchaseYear,
        size: effectiveSize,
        purchasePrice,
        currentValue,
        capitalAppreciation,
        rentalIncome: grossRentalIncome,
        totalReturn,
        totalROI,
        bankReturn,
        bankTotal: bankValue,
        propertyLine,
        bankLine,
        isMortgage,
        downPayment,
        totalMortgagePaid,
        totalInterestPaid,
        monthlyMortgagePayment,
        netReturnAfterMortgage,
        leveragedROI,
        totalExpensesDeducted,
        netRentalIncome,
        avgProjectedGrowth: avgGrowth,
        projectedValue2030,
      };
    },
    [purchaseYear, mode, ltv, interestRate, mortgageTerm, serviceChargePerSqft, vacancyRate]
  );

  // Live result (recomputes on every input change)
  const result = useMemo(
    () => simulateArea(area, investmentAmount),
    [simulateArea, area, investmentAmount]
  );
  const result2 = useMemo(
    () => {
      if (!area2) return null;
      const autoPrice2 = area2.pricePerSqft[purchaseYear] * size;
      return simulateArea(area2, manualAmount ? investmentAmount : autoPrice2);
    },
    [area2, purchaseYear, size, manualAmount, investmentAmount, simulateArea]
  );

  // Best / Base / Worst scenario bundle (uses growth override)
  const scenarios: ScenarioBundle = useMemo(() => {
    const baseGrowth = result.avgProjectedGrowth;
    return {
      best: simulateArea(area, investmentAmount, baseGrowth + 0.03),
      base: result,
      worst: simulateArea(area, investmentAmount, Math.max(-0.05, baseGrowth - 0.03)),
    };
  }, [simulateArea, area, investmentAmount, result]);

  const purchaseYears = [2019, 2020, 2021, 2022, 2023, 2024];

  // Year-by-year ledger rows (uses primary result)
  const ledger = useMemo(() => {
    return result.propertyLine.map((p, i) => {
      const bank = result.bankLine[i];
      const propVsBank = p.value - bank.value;
      return {
        year: p.year,
        property: p.value,
        bank: bank.value,
        propVsBank,
        projected: p.projected,
      };
    });
  }, [result]);

  const insights = useMemo(() => {
    const r = result;
    const r2 = result2;
    const list: string[] = [];
    const rentalPct = r.purchasePrice > 0 ? (r.netRentalIncome / r.totalReturn) * 100 : 0;
    const appreciationPct = 100 - Math.abs(rentalPct);

    if (r.totalReturn > 0) {
      list.push(
        `Your total return of ${fmtAED(r.totalReturn)} breaks down to ${appreciationPct.toFixed(0)}% from capital appreciation and ${Math.abs(rentalPct).toFixed(0)}% from net rental income. ${appreciationPct > 70 ? "This is heavily appreciation-driven — rental yield could be improved." : "A healthy balance between rental income and capital gains."}`
      );
    } else {
      list.push(
        `This investment shows a negative total return. The market conditions during ${r.purchaseYear}-2026 were unfavorable for ${r.area.name}.`
      );
    }

    if (r.isMortgage) {
      const leverageBenefit = r.leveragedROI - r.totalROI;
      list.push(
        `Mortgage leverage ${leverageBenefit > 0 ? "amplifies" : "reduces"} your returns: ${fmtPct(r.leveragedROI)} ROI on equity vs ${fmtPct(r.totalROI)} on total price. Monthly payment of ${fmtAED(r.monthlyMortgagePayment)} with ${fmtAED(r.totalInterestPaid > 0 ? r.totalInterestPaid : 0)} total interest paid.`
      );
    }

    if (r.totalReturn > r.bankReturn) {
      const multiplier = r.bankReturn > 0 ? (r.totalReturn / r.bankReturn).toFixed(1) : "N/A";
      list.push(
        `Property outperformed a bank deposit by ${fmtAED(r.totalReturn - r.bankReturn)} — that is ${multiplier}x the return you would have earned from fixed deposits at UAE bank rates.`
      );
    } else {
      list.push(
        `A bank deposit would have earned ${fmtAED(r.bankReturn - r.totalReturn)} more than this property. For this specific period, the fixed deposit was the safer and more profitable choice.`
      );
    }

    list.push(
      `Based on the ${(r.avgProjectedGrowth * 100).toFixed(1)}% average annual growth from 2024-2026, the projected value by 2030 is ${fmtAED(r.projectedValue2030)}. ${r.avgProjectedGrowth > 0.05 ? "Strong growth trajectory, but watch for market corrections." : "Moderate growth — a stable hold."}`
    );

    if (r2) {
      const betterArea = r.totalROI > r2.totalROI ? r.area.name : r2.area.name;
      const diff = Math.abs(r.totalROI - r2.totalROI);
      list.push(
        `${betterArea} delivers ${diff.toFixed(1)}pp higher total ROI. ${r.area.name}: ${fmtPct(r.totalROI)} vs ${r2.area.name}: ${fmtPct(r2.totalROI)}.`
      );
    }

    return list;
  }, [result, result2]);

  // Award XP after first valid sim
  useEffect(() => {
    if (!xpAwarded.current && result.purchasePrice > 0) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "investment-simulator").catch(() => {});
    }
  }, [result.purchasePrice]);

  /* ─── Reusable input classes (foundation tokens, no dark: duals) ─── */
  const inputCls = isMobile
    ? "w-full rounded-lg border border-app bg-app px-3.5 min-h-[44px] text-base text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 placeholder:text-muted"
    : "w-full rounded-lg border border-app bg-app px-3.5 py-2.5 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 placeholder:text-muted";
  const labelCls = isMobile
    ? "mb-1.5 block text-xs uppercase tracking-[0.18em] text-muted font-semibold"
    : "mb-1.5 block text-[0.6rem] uppercase tracking-[0.18em] text-muted font-semibold";

  /* Width-driven layout templates */
  const formGridCols = isUltra
    ? "grid-cols-1"
    : "grid-cols-1 md:grid-cols-2";
  const scenarioGridCols = isUltra
    ? "grid-cols-1"
    : "grid-cols-1 sm:grid-cols-3";
  const summaryGridCols = isUltra
    ? "grid-cols-2"
    : isWide
      ? "grid-cols-3"
      : "grid-cols-2 md:grid-cols-3";
  const ctaGridCols = isUltra
    ? "grid-cols-1"
    : "grid-cols-1 md:grid-cols-2";
  const containerPad = isMobile
    ? "px-4 pt-4 pb-12"
    : isUltra
    ? "px-3 pt-4 pb-10"
    : "px-4 sm:px-6 pt-5 pb-12";

  return (
    <div
      data-tool-theme="investment"
      data-tool="investment-simulator"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <div className={`max-w-5xl mx-auto ${containerPad}`}>
        {/* Hero panel — headline ROI on tool-hero gradient */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className={`relative overflow-hidden rounded-2xl border border-tool-accent/30 bg-tool-accent-soft mb-6 ${
            isUltra ? "p-5" : "p-6 sm:p-8"
          }`}
        >
          <div aria-hidden className="absolute inset-0 tool-hero opacity-50 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-app/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent ring-1 ring-tool-accent/30">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent animate-pulse" />
                {result.isMortgage ? "Leveraged ROI" : "Total ROI"}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-secondary font-medium">
                Updated {DATA_UPDATED}
              </span>
            </div>
            <p
              className={`font-mono ${
                isUltra ? "text-4xl" : "text-5xl sm:text-6xl"
              } font-bold tabular-nums tracking-tight ${
                result.totalROI >= 0 ? "text-tool-accent" : "text-red-500 dark:text-red-400"
              }`}
            >
              {fmtPct(result.isMortgage ? result.leveragedROI : result.totalROI)}
            </p>
            <p className="text-sm text-secondary mt-2">
              {result.area.name}
              {result2 ? ` vs ${result2.area.name}` : ""}{" "}
              · Bought {result.purchaseYear} · Actual to 2026, projected to 2030
            </p>
            {result.isMortgage && (
              <p className="text-xs text-muted mt-1">
                Leveraged ROI on equity ({fmtAED(result.downPayment)} down payment)
              </p>
            )}
          </div>
        </motion.section>

        {/* Input Form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease }}
          className="rounded-2xl border border-app bg-app-elevated p-5 mb-6"
        >
          <div className={`grid ${formGridCols} gap-5`}>
            {/* Area */}
            <div>
              <label className={labelCls}>Area</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                {historicalData.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Compare */}
            <div>
              <label className={labelCls}>Compare With (Optional)</label>
              <select
                value={selectedArea2}
                onChange={(e) => setSelectedArea2(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                <option value="">None</option>
                {historicalData
                  .filter((a) => a.id !== selectedArea)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Purchase Year */}
            <div>
              <label className={labelCls}>Purchase Year</label>
              <select
                value={purchaseYear}
                onChange={(e) => setPurchaseYear(parseInt(e.target.value))}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                {purchaseYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Size — slider + number, tool-accent track */}
            <div>
              <label className={`${labelCls} flex items-center justify-between`}>
                <span>Property Size (sqft)</span>
                <span className="text-tool-accent normal-case tracking-normal font-bold">
                  {size}
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={300}
                  max={5000}
                  step={50}
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value))}
                  className="flex-1 accent-[var(--tool-accent)]"
                  style={{ accentColor: "var(--tool-accent)" }}
                />
                <input
                  type="number"
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value) || 750)}
                  className={`${inputCls} w-20 text-center`}
                />
              </div>
            </div>

            {/* Investment Amount */}
            <div>
              <label className={labelCls}>Investment Amount (AED)</label>
              <input
                type="text"
                value={manualAmount}
                onChange={(e) =>
                  setManualAmount(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder={autoPrice.toLocaleString("en-AE")}
                className={inputCls}
              />
              <p className="text-[10px] text-muted mt-1">
                Auto: {fmtAED(autoPrice)} ({area.pricePerSqft[purchaseYear]}/sqft × {size} sqft)
              </p>
            </div>

            {/* Mode */}
            <div>
              <label className={labelCls}>Investment Mode</label>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-app p-1 border border-app">
                {(["cash", "mortgage"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3 ${isMobile ? "min-h-[44px] text-xs" : "py-2 text-[0.7rem]"} uppercase tracking-[0.12em] font-semibold transition-all ${
                      mode === m
                        ? "bg-tool-accent text-white shadow-sm"
                        : "text-secondary hover:bg-surface-hover hover:text-app"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mortgage Details */}
          <AnimatePresence>
            {mode === "mortgage" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease }}
                className="mt-5 border-t border-app pt-5 overflow-hidden"
              >
                <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-3 font-semibold">
                  Mortgage Details
                </p>
                <div className={`grid ${isUltra ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"} gap-4`}>
                  <div>
                    <label className={labelCls}>LTV (%)</label>
                    <input
                      type="number"
                      value={ltv}
                      onChange={(e) => setLtv(e.target.value)}
                      placeholder="80"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="5"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Term (Years)</label>
                    <input
                      type="number"
                      value={mortgageTerm}
                      onChange={(e) => setMortgageTerm(e.target.value)}
                      placeholder="25"
                      className={inputCls}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expense Inputs */}
          <div className="mt-5 border-t border-app pt-5">
            <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-3 font-semibold">
              Expense Assumptions
            </p>
            <div className={`grid ${formGridCols} gap-4`}>
              <div>
                <label className={labelCls}>Service Charge (AED/sqft/yr)</label>
                <input
                  type="number"
                  value={serviceChargePerSqft}
                  onChange={(e) => setServiceChargePerSqft(e.target.value)}
                  placeholder="18"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Vacancy Rate (%)</label>
                <input
                  type="number"
                  value={vacancyRate}
                  onChange={(e) => setVacancyRate(e.target.value)}
                  placeholder="8"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Scenario row — best / base / worst */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease }}
          className={`grid ${scenarioGridCols} gap-3 mb-6`}
        >
          <ScenarioCard
            label="Best Case (+3pp growth)"
            tone="best"
            value={fmtAED(scenarios.best.projectedValue2030)}
            delta={`${fmtPct((scenarios.best.projectedValue2030 / result.purchasePrice - 1) * 100)} by 2030`}
          />
          <ScenarioCard
            label="Base Case (your inputs)"
            tone="base"
            active
            value={fmtAED(scenarios.base.projectedValue2030)}
            delta={`${fmtPct((scenarios.base.projectedValue2030 / result.purchasePrice - 1) * 100)} by 2030`}
          />
          <ScenarioCard
            label="Worst Case (-3pp growth)"
            tone="worst"
            value={fmtAED(scenarios.worst.projectedValue2030)}
            delta={`${fmtPct((scenarios.worst.projectedValue2030 / result.purchasePrice - 1) * 100)} by 2030`}
          />
        </motion.div>

        {/* Sub-view tabs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12, ease }}
          className={`flex items-center gap-1 mb-3 rounded-lg bg-app-elevated border border-app p-1 ${isMobile ? "w-full" : "w-fit"}`}
        >
          {(["chart", "table", "summary"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setView(t)}
              className={`rounded-md px-4 ${isMobile ? "min-h-[44px] flex-1 text-sm" : "py-1.5 text-xs"} uppercase tracking-[0.14em] font-semibold transition-all ${
                view === t
                  ? "bg-tool-accent text-white shadow-sm"
                  : "text-secondary hover:text-app"
              }`}
            >
              {t}
            </button>
          ))}
        </motion.div>

        {/* Sub-view content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease }}
            className="mb-6"
          >
            {view === "chart" && (
              <div className="rounded-2xl border border-app bg-app-elevated p-4 md:p-6">
                <h3 className="text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-4 font-semibold">
                  Value Over Time (Hover for details)
                </h3>
                <ProjectionChart
                  propertyLine={result.propertyLine}
                  bankLine={result.bankLine}
                  propertyLine2={result2?.propertyLine}
                  area1Name={result.area.name}
                  area2Name={result2?.area.name}
                />
              </div>
            )}

            {view === "table" && (
              <div className="rounded-2xl border border-app bg-app-elevated overflow-hidden">
                <div className="border-b border-app px-5 py-3">
                  <h3 className="text-[0.6rem] uppercase tracking-[0.22em] text-muted font-semibold">
                    Year-by-Year Ledger
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.18em] text-muted font-semibold bg-app">
                        <th className="px-4 py-2.5 text-left">Year</th>
                        <th className="px-4 py-2.5 text-right">Property Value</th>
                        <th className="px-4 py-2.5 text-right">Bank Equivalent</th>
                        <th className="px-4 py-2.5 text-right">Property − Bank</th>
                        <th className="px-4 py-2.5 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row, i) => (
                        <tr
                          key={row.year}
                          className={`border-t border-app text-app transition-colors hover:bg-surface-hover ${
                            i % 2 === 1 ? "bg-app" : ""
                          }`}
                        >
                          <td className="px-4 py-2.5 font-semibold">
                            {row.year}
                            {row.projected && (
                              <span className="ml-2 text-[9px] uppercase tracking-wider text-tool-accent">
                                proj
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {fmtAED(row.property)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                            {fmtAED(row.bank)}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                              row.propVsBank >= 0
                                ? "text-emerald-500 dark:text-emerald-400"
                                : "text-red-500 dark:text-red-400"
                            }`}
                          >
                            {row.propVsBank >= 0 ? "+" : ""}
                            {fmtAED(row.propVsBank)}
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-muted">
                            {row.projected ? "Modeled" : "Actual"}
                          </td>
                        </tr>
                      ))}
                      {/* Totals row in tool-accent-soft */}
                      <tr className="border-t border-tool-accent/30 bg-tool-accent-soft text-app">
                        <td className="px-4 py-3 font-bold uppercase text-[10px] tracking-[0.18em] text-tool-accent">
                          Total {LAST_ACTUAL_YEAR}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold">
                          {fmtAED(result.currentValue)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {fmtAED(result.bankTotal)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-tool-accent">
                          {fmtAED(result.currentValue - result.bankTotal)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-tool-accent font-semibold">
                          Today
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === "summary" && (
              <div className="space-y-4">
                {/* Result Cards - Area 1 */}
                <div>
                  {result2 && (
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-muted font-semibold">
                        {result.area.name}
                      </span>
                      <span className="h-px flex-1 bg-app" />
                    </div>
                  )}
                  <div className={`grid ${summaryGridCols} gap-3`}>
                    <Card label="Purchase Price" value={fmtAED(result.purchasePrice)} />
                    <Card
                      label="Current Value (2026)"
                      value={fmtAED(result.currentValue)}
                      positive={result.capitalAppreciation >= 0}
                    />
                    <Card
                      label="Capital Appreciation"
                      value={fmtAED(result.capitalAppreciation)}
                      positive={result.capitalAppreciation >= 0}
                    />
                    <Card
                      label="Net Rental Income"
                      value={fmtAED(result.netRentalIncome)}
                      positive={result.netRentalIncome >= 0}
                    />
                    <Card
                      label="Expenses Deducted"
                      value={fmtAED(result.totalExpensesDeducted)}
                      positive={false}
                    />
                    <Card
                      label="Bank Deposit Return"
                      value={fmtAED(result.bankReturn)}
                    />
                    {result.isMortgage && (
                      <>
                        <Card
                          label="Monthly Mortgage"
                          value={fmtAED(result.monthlyMortgagePayment)}
                        />
                        <Card
                          label="Total Mortgage Paid"
                          value={fmtAED(result.totalMortgagePaid)}
                        />
                        <Card
                          label="Down Payment"
                          value={fmtAED(result.downPayment)}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Result Cards - Area 2 */}
                {result2 && (
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-muted font-semibold">
                        {result2.area.name}
                      </span>
                      <span className="h-px flex-1 bg-app" />
                    </div>
                    <div className={`grid ${summaryGridCols} gap-3`}>
                      <Card label="Purchase Price" value={fmtAED(result2.purchasePrice)} />
                      <Card
                        label="Current Value (2026)"
                        value={fmtAED(result2.currentValue)}
                        positive={result2.capitalAppreciation >= 0}
                      />
                      <Card
                        label="Capital Appreciation"
                        value={fmtAED(result2.capitalAppreciation)}
                        positive={result2.capitalAppreciation >= 0}
                      />
                      <Card
                        label="Net Rental Income"
                        value={fmtAED(result2.netRentalIncome)}
                        positive={result2.netRentalIncome >= 0}
                      />
                      <Card
                        label="Total ROI"
                        value={fmtPct(
                          result2.isMortgage ? result2.leveragedROI : result2.totalROI
                        )}
                        positive={result2.totalROI >= 0}
                      />
                      <Card
                        label="Projected 2030 Value"
                        value={fmtAED(result2.projectedValue2030)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Verdict */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, ease }}
          className="rounded-2xl border border-app bg-app-elevated p-6 text-center mb-6"
        >
          <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-3 font-semibold">
            Verdict
          </div>
          {result.totalReturn > result.bankReturn ? (
            <p className="text-lg text-emerald-500 dark:text-emerald-400">
              Property outperformed bank deposit by{" "}
              <span className="font-bold tabular-nums">
                {fmtPct(
                  ((result.totalReturn - result.bankReturn) / result.purchasePrice) * 100
                )}
              </span>
            </p>
          ) : (
            <p className="text-lg text-red-500 dark:text-red-400">
              Bank deposit outperformed property by{" "}
              <span className="font-bold tabular-nums">
                {fmtPct(
                  ((result.bankReturn - result.totalReturn) / result.purchasePrice) * 100
                )}
              </span>
            </p>
          )}
          <p className="text-xs text-muted mt-3">
            Based on historical data updated {DATA_UPDATED}. Past performance does not
            guarantee future returns. Compact: {fmtCompact(result.currentValue)} now.
          </p>
        </motion.div>

        {/* Insights */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, ease }}
          className="rounded-2xl border border-app bg-app-elevated p-5 mb-6"
        >
          <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted mb-4 font-semibold">
            Investment Insights
          </p>
          <ul className="space-y-3">
            {insights.map((insight, i) => (
              <li key={i} className="flex gap-3 text-sm text-secondary">
                <span className="mt-1.5 block h-1 w-1 flex-shrink-0 rounded-full bg-tool-accent" />
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Cross-Tool CTAs — workspace-native: openApp() instead of <Link> */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ease }}
          className={`grid ${ctaGridCols} gap-3`}
        >
          <button
            type="button"
            onClick={() => openApp("yield-heatmap")}
            className="rounded-xl border border-app bg-app-elevated px-6 py-4 text-[0.72rem] uppercase tracking-[0.14em] font-semibold text-app text-center transition-all hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
          >
            Rental Yield Heatmap
          </button>
          <button
            type="button"
            onClick={() => openApp("deal-scoring")}
            className="rounded-xl border border-app bg-app-elevated px-6 py-4 text-[0.72rem] uppercase tracking-[0.14em] font-semibold text-app text-center transition-all hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
          >
            Deal Scoring Engine
          </button>
        </motion.div>
      </div>
    </div>
  );
}
