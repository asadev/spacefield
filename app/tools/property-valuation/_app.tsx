"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   AI Property Valuation — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Mounted directly inside the workspace Window — no iframe, no AuthGate,
   no PageHeader, no frame=1 params, no macOS chrome, no back-links, no
   ToolRecommendations. Receives NativeAppProps from the desktop shell.

   Width-driven layout:
     - <  680px → single column (results stack vertically)
     - >= 680px → tighter, results grid uses two columns where it makes sense

   The valuation algorithm and comparable lookup are preserved verbatim from
   page.tsx; only chrome was removed and `useCanvasTone()` was swapped for
   the `resolved` prop so canvas drawing matches the workspace theme.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import {
  AREA_BENCHMARKS,
  PROPERTY_TYPES,
  VIEWS,
  CONDITIONS,
  FLOOR_CATEGORIES,
  VIEW_ADJUSTMENTS,
  CONDITION_ADJUSTMENTS,
  AGE_ADJUSTMENTS,
  type AreaBenchmark,
  type PropertyType,
} from "@/lib/valuation-data";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

function formatAED(value: number): string {
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  return `AED ${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function getBasePriceKey(propertyType: PropertyType): keyof AreaBenchmark {
  const map: Record<PropertyType, keyof AreaBenchmark> = {
    Studio: "pricePerSqftStudio",
    "1BR": "pricePerSqft1BR",
    "2BR": "pricePerSqft2BR",
    "3BR": "pricePerSqft3BR",
    Villa: "pricePerSqftVilla",
  };
  return map[propertyType];
}

function getAgeAdjustment(age: number): number {
  for (const bracket of AGE_ADJUSTMENTS) {
    if (age <= bracket.maxAge) return bracket.adjustment;
  }
  return -10;
}

interface ValuationResult {
  estimatedValue: number;
  lowEstimate: number;
  highEstimate: number;
  pricePerSqft: number;
  confidence: "High" | "Medium" | "Low";
  adjustments: { label: string; percent: number; aedImpact: number }[];
  basePricePerSqft: number;
  finalPricePerSqft: number;
  verdict: "Undervalued" | "Fair Value" | "Overpriced" | null;
  askingDiffAED: number;
  askingDiffPercent: number;
  area: AreaBenchmark;
}

type Tab = "inputs" | "result" | "comps";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium">
      {children}
    </label>
  );
}

const FIELD_CLASSES =
  "w-full bg-app border border-app rounded-lg px-3.5 py-3 text-[15px] font-medium text-app " +
  "focus:outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 " +
  "transition-colors placeholder:text-muted";

export default function PropertyValuationApp(props: NativeAppProps) {
  const { width, resolved } = props;
  // Width-driven layout — collapses charts grid + tightens hero spacing.
  const isNarrow = width < 680;
  const tone = resolved === "light" ? "15,23,42" : "255,255,255";

  const [selectedArea, setSelectedArea] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("2BR");
  const [size, setSize] = useState("");
  const [buildingAge, setBuildingAge] = useState(5);
  const [floorLevel, setFloorLevel] = useState<string>(FLOOR_CATEGORIES[1].label);
  const [viewType, setViewType] = useState<string>(VIEWS[0]);
  const [condition, setCondition] = useState<string>(CONDITIONS[1]);
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [askingPrice, setAskingPrice] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("inputs");
  const xpAwarded = useRef(false);

  const gaugeCanvasRef = useRef<HTMLCanvasElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);

  const areaData = useMemo(
    () => AREA_BENCHMARKS.find((a) => a.area === selectedArea),
    [selectedArea]
  );

  const premiumFactors = useMemo(
    () => (areaData ? areaData.premiumFactors : []),
    [areaData]
  );

  useEffect(() => {
    setSelectedFactors([]);
  }, [selectedArea]);

  const toggleFactor = useCallback((factor: string) => {
    setSelectedFactors((prev) =>
      prev.includes(factor)
        ? prev.filter((f) => f !== factor)
        : [...prev, factor]
    );
  }, []);

  const valuation = useMemo((): ValuationResult | null => {
    if (!areaData || !size || Number(size) <= 0) return null;

    const baseKey = getBasePriceKey(propertyType);
    const basePricePerSqft = areaData[baseKey] as number;
    if (basePricePerSqft <= 0) return null;

    const adjustments: { label: string; percent: number; aedImpact: number }[] = [];
    let totalAdjPercent = 0;

    const floorData = FLOOR_CATEGORIES.find((f) => f.label === floorLevel);
    const floorAdj = floorData ? floorData.adjustment : 0;
    if (floorAdj !== 0) {
      adjustments.push({ label: "Floor level", percent: floorAdj, aedImpact: 0 });
      totalAdjPercent += floorAdj;
    }

    const viewAdj = VIEW_ADJUSTMENTS[viewType] || 0;
    if (viewAdj !== 0) {
      adjustments.push({ label: "View type", percent: viewAdj, aedImpact: 0 });
      totalAdjPercent += viewAdj;
    }

    const condAdj = CONDITION_ADJUSTMENTS[condition] || 0;
    if (condAdj !== 0) {
      adjustments.push({ label: "Condition", percent: condAdj, aedImpact: 0 });
      totalAdjPercent += condAdj;
    }

    const ageAdj = getAgeAdjustment(buildingAge);
    const avgAgeAdj = getAgeAdjustment(areaData.avgAge);
    const relativeAgeAdj = ageAdj - avgAgeAdj;
    if (relativeAgeAdj !== 0) {
      adjustments.push({ label: "Building age (vs area avg)", percent: relativeAgeAdj, aedImpact: 0 });
      totalAdjPercent += relativeAgeAdj;
    }

    const factorAdj = selectedFactors.reduce((sum, f) => {
      const pf = areaData.premiumFactors.find((p) => p.factor === f);
      return sum + (pf ? pf.impact : 0);
    }, 0);
    if (factorAdj !== 0) {
      adjustments.push({ label: "Premium features", percent: factorAdj, aedImpact: 0 });
      totalAdjPercent += factorAdj;
    }

    const finalPricePerSqft = basePricePerSqft * (1 + totalAdjPercent / 100);
    const sqft = Number(size);
    const estimatedValue = finalPricePerSqft * sqft;

    adjustments.forEach((adj) => {
      adj.aedImpact = (adj.percent / 100) * basePricePerSqft * sqft;
    });

    const highVolume = areaData.transactionVolume >= 200;
    const marginPercent = highVolume ? 8 : 12;
    const lowEstimate = estimatedValue * (1 - marginPercent / 100);
    const highEstimate = estimatedValue * (1 + marginPercent / 100);

    const confidence: "High" | "Medium" | "Low" =
      areaData.transactionVolume >= 300
        ? "High"
        : areaData.transactionVolume >= 150
        ? "Medium"
        : "Low";

    let verdict: ValuationResult["verdict"] = null;
    let askingDiffAED = 0;
    let askingDiffPercent = 0;

    if (askingPrice && Number(askingPrice) > 0) {
      const asking = Number(askingPrice);
      askingDiffAED = asking - estimatedValue;
      askingDiffPercent = (askingDiffAED / estimatedValue) * 100;

      if (askingDiffPercent < -5) verdict = "Undervalued";
      else if (askingDiffPercent > 8) verdict = "Overpriced";
      else verdict = "Fair Value";
    }

    return {
      estimatedValue,
      lowEstimate,
      highEstimate,
      pricePerSqft: finalPricePerSqft,
      confidence,
      adjustments,
      basePricePerSqft,
      finalPricePerSqft,
      verdict,
      askingDiffAED,
      askingDiffPercent,
      area: areaData,
    };
  }, [areaData, size, propertyType, floorLevel, viewType, condition, buildingAge, selectedFactors, askingPrice]);

  const handleCalculate = useCallback(() => {
    if (valuation) {
      setShowResults(true);
      setActiveTab("result");
      if (!xpAwarded.current) {
        xpAwarded.current = true;
        awardXP("tool_use", "tool", "property-valuation").catch(() => {});
      }
    }
  }, [valuation]);

  // Gauge chart
  useEffect(() => {
    if (!showResults || !valuation || !gaugeCanvasRef.current) return;
    const canvas = gaugeCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 320;
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h - 30;
    const radius = 110;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = `rgba(${tone},0.1)`;
    ctx.lineWidth = 20;
    ctx.stroke();

    const segments = [
      { end: 0.33, color: "#22c55e" },
      { end: 0.66, color: "#eab308" },
      { end: 1, color: "#ef4444" },
    ];
    segments.forEach((seg, i) => {
      const sA = startAngle + (i === 0 ? 0 : segments[i - 1].end) * Math.PI;
      const eA = startAngle + seg.end * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, sA, eA);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 20;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    const { lowEstimate, highEstimate, estimatedValue } = valuation;
    const rangeMin = lowEstimate * 0.85;
    const rangeMax = highEstimate * 1.15;
    const value = askingPrice && Number(askingPrice) > 0 ? Number(askingPrice) : estimatedValue;
    const normalized = Math.max(0, Math.min(1, (value - rangeMin) / (rangeMax - rangeMin)));
    const needleAngle = startAngle + normalized * Math.PI;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 15), cy + Math.sin(needleAngle) * (radius - 15));
    ctx.strokeStyle = `rgb(${tone})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = `rgb(${tone})`;
    ctx.fill();

    ctx.fillStyle = `rgba(${tone},0.6)`;
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(formatAED(rangeMin), 20, cy + 20);
    ctx.textAlign = "right";
    ctx.fillText(formatAED(rangeMax), w - 20, cy + 20);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgb(${tone})`;
    ctx.font = "bold 13px system-ui";
    ctx.fillText(formatAED(value), cx, cy - radius - 10);
  }, [showResults, valuation, askingPrice, tone, activeTab]);

  // Bar chart
  useEffect(() => {
    if (!showResults || !valuation || !barCanvasRef.current || !areaData) return;
    const canvas = barCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 320;
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const prices = [
      { label: "Studio", value: areaData.pricePerSqftStudio },
      { label: "1BR", value: areaData.pricePerSqft1BR },
      { label: "2BR", value: areaData.pricePerSqft2BR },
      { label: "3BR", value: areaData.pricePerSqft3BR },
      { label: "Villa", value: areaData.pricePerSqftVilla },
    ].filter((p) => p.value > 0);

    const maxVal = Math.max(...prices.map((p) => p.value));
    const padding = { top: 20, bottom: 35, left: 15, right: 15 };
    const barWidth = (w - padding.left - padding.right) / prices.length - 8;
    const chartHeight = h - padding.top - padding.bottom;

    prices.forEach((p, i) => {
      const x = padding.left + i * ((w - padding.left - padding.right) / prices.length) + 4;
      const barH = (p.value / maxVal) * chartHeight;
      const y = padding.top + chartHeight - barH;
      const isSelected = p.label === propertyType;

      ctx.fillStyle = isSelected ? "#8b5cf6" : `rgba(${tone},0.15)`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = isSelected ? `rgb(${tone})` : `rgba(${tone},0.6)`;
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${p.value}`, x + barWidth / 2, y - 6);

      ctx.fillStyle = `rgba(${tone},0.6)`;
      ctx.font = "10px system-ui";
      ctx.fillText(p.label, x + barWidth / 2, h - 12);
    });

    ctx.fillStyle = `rgba(${tone},0.4)`;
    ctx.font = "9px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("AED/sqft", 5, 12);
  }, [showResults, valuation, areaData, propertyType, tone, activeTab]);

  const copyToClipboard = useCallback(() => {
    if (!valuation) return;
    const text = [
      `AI Property Valuation - ${selectedArea}`,
      `Property: ${propertyType} | ${size} sqft`,
      `Estimated Value: AED ${formatNumber(Math.round(valuation.estimatedValue))}`,
      `Range: AED ${formatNumber(Math.round(valuation.lowEstimate))} - AED ${formatNumber(Math.round(valuation.highEstimate))}`,
      `Price/sqft: AED ${Math.round(valuation.finalPricePerSqft)}`,
      `Confidence: ${valuation.confidence}`,
      valuation.verdict ? `Asking Price Verdict: ${valuation.verdict}` : "",
      ``,
      `Generated at example.com/tools/property-valuation`,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text);
  }, [valuation, selectedArea, propertyType, size]);

  const shareWhatsApp = useCallback(() => {
    if (!valuation) return;
    const text = encodeURIComponent(
      `Property Valuation: ${propertyType} in ${selectedArea}\nEstimated: AED ${formatNumber(Math.round(valuation.estimatedValue))}\nRange: AED ${formatNumber(Math.round(valuation.lowEstimate))} - AED ${formatNumber(Math.round(valuation.highEstimate))}\n\nFull tool: https://example.com/tools/property-valuation`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [valuation, selectedArea, propertyType]);

  const confidencePct = areaData ? Math.min(100, (areaData.transactionVolume / 500) * 100) : 0;

  const verdictChipClass = !valuation?.verdict
    ? ""
    : valuation.verdict === "Undervalued"
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
    : valuation.verdict === "Fair Value"
    ? "bg-tool-accent-soft text-tool-accent border-tool-accent/40"
    : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";

  return (
    <div
      data-tool-theme="research"
      data-tool="property-valuation"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className="max-w-3xl mx-auto">
        {/* Hero — estimated value */}
        <section className={isNarrow ? "px-4 pt-4" : "px-6 pt-5"}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
            className={`relative bg-tool-accent-soft border border-tool-accent/30 rounded-2xl overflow-hidden ${
              isNarrow ? "p-5" : "p-6 sm:p-8"
            }`}
          >
            <div aria-hidden className="absolute inset-0 tool-hero opacity-50 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                  Estimated Value
                </span>
                {valuation?.verdict && (
                  <span className={`text-[11px] px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold border ${verdictChipClass}`}>
                    {valuation.verdict}
                  </span>
                )}
              </div>
              <p className={`font-mono font-bold text-app tabular-nums tracking-tight ${
                isNarrow ? "text-3xl" : "text-4xl sm:text-5xl"
              }`}>
                {valuation
                  ? `AED ${formatNumber(Math.round(valuation.estimatedValue))}`
                  : "AED — — —"}
              </p>
              {valuation && (
                <p className="text-sm text-secondary mt-2 font-mono tabular-nums">
                  {formatAED(valuation.lowEstimate)}
                  <span className="mx-2 text-tool-accent">—</span>
                  {formatAED(valuation.highEstimate)}
                </p>
              )}
              {!valuation && (
                <p className="text-sm text-muted mt-2">
                  Pick an area and enter size to estimate.
                </p>
              )}

              {/* Confidence band */}
              <div className="mt-6">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-medium">
                    Market Liquidity
                  </span>
                  <span className="text-[12px] font-mono font-semibold text-tool-accent">
                    {valuation?.confidence ?? "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-app overflow-hidden border border-app">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${confidencePct}%` }}
                    transition={{ duration: 0.6, ease }}
                    className="h-full rounded-full bg-gradient-to-r from-tool-accent-soft via-tool-accent to-tool-accent"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>Illiquid</span>
                  <span>Deep market</span>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Tab bar — local state, not links */}
        <nav className={isNarrow ? "px-4 pt-4" : "px-6 pt-5"}>
          <div className="flex gap-1 bg-app-elevated rounded-xl p-1 border border-app">
            {([
              { id: "inputs" as const, label: "Inputs", disabled: false },
              { id: "result" as const, label: "Result", disabled: !showResults },
              { id: "comps" as const, label: "Comparables", disabled: !showResults },
            ]).map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => !t.disabled && setActiveTab(t.id)}
                  disabled={t.disabled}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    active
                      ? "bg-tool-accent text-white shadow-sm"
                      : t.disabled
                      ? "text-muted cursor-not-allowed"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Body */}
        <section className={`pb-8 ${isNarrow ? "px-4 pt-4" : "px-6 pt-5"}`}>
          <AnimatePresence mode="wait">
            {activeTab === "inputs" && (
              <motion.div
                key="inputs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease }}
                className="bg-app-elevated border border-app rounded-2xl overflow-hidden"
              >
                {/* Section: Subject */}
                <div className={isNarrow ? "p-5" : "p-5 sm:p-6"}>
                  <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted font-semibold mb-4">
                    Subject Property
                  </h2>
                  <div className={`grid gap-4 ${isNarrow ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                    <div className="space-y-1.5">
                      <FieldLabel>Area</FieldLabel>
                      <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} className={FIELD_CLASSES}>
                        <option value="">Select area</option>
                        {AREA_BENCHMARKS.map((a) => <option key={a.area} value={a.area}>{a.area}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Property Type</FieldLabel>
                      <select value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)} className={FIELD_CLASSES}>
                        {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Size · sqft</FieldLabel>
                      <input
                        type="number"
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        placeholder="1,200"
                        className={FIELD_CLASSES + " font-mono tabular-nums"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Asking Price · optional</FieldLabel>
                      <input
                        type="number"
                        value={askingPrice}
                        onChange={(e) => setAskingPrice(e.target.value)}
                        placeholder="2,500,000"
                        className={FIELD_CLASSES + " font-mono tabular-nums"}
                      />
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-app" />

                {/* Section: Building */}
                <div className={isNarrow ? "p-5" : "p-5 sm:p-6"}>
                  <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted font-semibold mb-4">
                    Building
                  </h2>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <FieldLabel>Building Age</FieldLabel>
                        <span className="font-mono text-sm text-tool-accent tabular-nums font-semibold">
                          {buildingAge} yrs
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={25}
                        value={buildingAge}
                        onChange={(e) => setBuildingAge(Number(e.target.value))}
                        className="w-full"
                        style={{ accentColor: "var(--tool-accent)" }}
                      />
                      <div className="flex justify-between text-[10px] text-muted font-mono">
                        <span>NEW</span><span>10Y</span><span>20Y</span><span>25Y+</span>
                      </div>
                    </div>

                    <div className={`grid gap-4 ${isNarrow ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
                      {([
                        { label: "Floor", value: floorLevel, setter: setFloorLevel, opts: FLOOR_CATEGORIES.map((f) => f.label) },
                        { label: "View", value: viewType, setter: setViewType, opts: VIEWS },
                        { label: "Condition", value: condition, setter: setCondition, opts: CONDITIONS },
                      ] as const).map((f) => (
                        <div key={f.label} className="space-y-1.5">
                          <FieldLabel>{f.label}</FieldLabel>
                          <select value={f.value} onChange={(e) => f.setter(e.target.value)} className={FIELD_CLASSES}>
                            {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                {premiumFactors.length > 0 && <div className="h-px bg-app" />}

                {/* Section: Premium features */}
                {premiumFactors.length > 0 && (
                  <div className={isNarrow ? "p-5" : "p-5 sm:p-6"}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted font-semibold">
                        Premium Features
                      </h2>
                      <span className="text-[11px] text-muted font-mono">
                        {selectedFactors.length}/{premiumFactors.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {premiumFactors.map((pf) => {
                        const active = selectedFactors.includes(pf.factor);
                        return (
                          <button
                            key={pf.factor}
                            onClick={() => toggleFactor(pf.factor)}
                            className={`px-3 py-2 rounded-full text-sm border transition-all font-medium ${
                              active
                                ? "bg-tool-accent text-white border-tool-accent shadow-sm"
                                : "bg-app border-app text-secondary hover:border-tool-accent hover:text-app"
                            }`}
                          >
                            <span>{pf.factor}</span>
                            <span className={`ml-1.5 font-mono text-[11px] ${active ? "text-white/80" : "text-tool-accent"}`}>
                              +{pf.impact}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Run footer */}
                <div className="h-px bg-app" />
                <div className={`flex items-center justify-between gap-3 flex-wrap ${
                  isNarrow ? "p-5" : "p-5 sm:p-6"
                }`}>
                  <p className="text-[12px] text-muted">
                    {valuation ? "Ready to run." : "Pick area + size to enable."}
                  </p>
                  <button
                    onClick={handleCalculate}
                    disabled={!valuation}
                    className="px-6 py-3 rounded-xl text-sm font-semibold bg-tool-accent text-white hover:brightness-110 disabled:bg-app disabled:text-muted disabled:border disabled:border-app disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Run Valuation
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === "result" && showResults && valuation && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease }}
                className="space-y-4"
              >
                {/* Asking price verdict */}
                {valuation.verdict && (() => {
                  const diffColor = valuation.askingDiffPercent >= 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400";
                  const pos = Math.max(2, Math.min(98, ((Number(askingPrice) - valuation.lowEstimate * 0.9) / (valuation.highEstimate * 1.1 - valuation.lowEstimate * 0.9)) * 100));
                  return (
                    <div className={`bg-app-elevated border border-app rounded-2xl ${
                      isNarrow ? "p-5" : "p-5 sm:p-6"
                    }`}>
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">
                          Asking Price vs Estimate
                        </span>
                        <span className={`text-[11px] px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold border ${verdictChipClass}`}>
                          {valuation.verdict}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3 flex-wrap mb-4">
                        <span className="font-mono text-2xl font-bold text-app tabular-nums">
                          {valuation.askingDiffAED >= 0 ? "+" : "−"}AED {formatNumber(Math.abs(Math.round(valuation.askingDiffAED)))}
                        </span>
                        <span className={`font-mono text-sm ${diffColor}`}>
                          ({valuation.askingDiffPercent >= 0 ? "+" : ""}{valuation.askingDiffPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="relative h-2 bg-app rounded-full overflow-hidden border border-app">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/40 via-tool-accent-soft to-red-500/40 rounded-full" />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-app-elevated rounded-full shadow-md border-2 border-tool-accent"
                          style={{ left: `${pos}%`, transform: `translate(-50%, -50%)` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted mt-1.5">
                        <span>Below market</span><span>Fair</span><span>Above market</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Charts */}
                <div className={`grid gap-4 ${isNarrow ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                  <div className="bg-app-elevated border border-app rounded-2xl p-5">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold mb-4">
                      Position in Range
                    </p>
                    <div className="flex justify-center">
                      <canvas ref={gaugeCanvasRef} />
                    </div>
                  </div>
                  <div className="bg-app-elevated border border-app rounded-2xl p-5">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold mb-4">
                      Type Mix · {selectedArea}
                    </p>
                    <div className="flex justify-center">
                      <canvas ref={barCanvasRef} />
                    </div>
                  </div>
                </div>

                {/* Adjustment ledger */}
                <div className="bg-app-elevated border border-app rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-app flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">
                      Adjustment Ledger
                    </span>
                    <span className="text-[11px] text-muted font-mono">
                      {valuation.adjustments.length} lines
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between py-2.5 border-b border-app text-sm">
                      <span className="text-secondary text-xs">
                        Base · {selectedArea} / {propertyType}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-app">
                        AED {formatNumber(valuation.basePricePerSqft)}/sqft
                      </span>
                    </div>
                    {valuation.adjustments.map((adj, i) => {
                      const pos = adj.percent >= 0;
                      return (
                        <div
                          key={adj.label}
                          className="grid grid-cols-[1fr_auto_auto_80px] items-center gap-3 py-2.5 border-b border-app text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[11px] text-muted tabular-nums">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="text-app truncate">{adj.label}</span>
                          </div>
                          <span className={`font-mono text-xs font-semibold tabular-nums ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {pos ? "+" : ""}{adj.percent.toFixed(1)}%
                          </span>
                          <span className="font-mono text-xs text-secondary tabular-nums w-24 text-right">
                            {adj.aedImpact >= 0 ? "+" : "−"}{formatAED(Math.abs(adj.aedImpact))}
                          </span>
                          <div className="h-1.5 bg-app rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pos ? "bg-emerald-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(100, Math.abs(adj.percent) * 5)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-4 mt-1 text-sm">
                      <span className="text-xs uppercase tracking-wider text-tool-accent font-semibold">
                        Final price/sqft
                      </span>
                      <span className="font-mono text-lg font-bold text-tool-accent tabular-nums">
                        AED {Math.round(valuation.finalPricePerSqft)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Export */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "Copy summary", onClick: copyToClipboard },
                    { label: "Share to WhatsApp", onClick: shareWhatsApp },
                  ].map((b) => (
                    <button
                      key={b.label}
                      onClick={b.onClick}
                      className="px-4 py-2.5 bg-app-elevated border border-app rounded-xl text-sm font-medium text-secondary hover:text-tool-accent hover:border-tool-accent transition-colors"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "comps" && showResults && valuation && (
              <motion.div
                key="comps"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease }}
                className="space-y-4"
              >
                {/* Per-stat grid */}
                <div className={`bg-app-elevated border border-app rounded-2xl ${
                  isNarrow ? "p-5" : "p-5 sm:p-6"
                }`}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold mb-5">
                    Market Comparables · {selectedArea}
                  </p>
                  <div className={`grid gap-4 ${isNarrow ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                    {[
                      { label: "Avg price/sqft", value: `AED ${valuation.basePricePerSqft}`, sub: propertyType },
                      { label: "YoY appreciation", value: `+${valuation.area.yoyAppreciation}%`, sub: "Trailing 12mo", accent: true },
                      { label: "Monthly txns", value: String(valuation.area.transactionVolume), sub: "Liquidity signal" },
                      { label: "Avg service", value: `AED ${valuation.area.avgServiceCharge}`, sub: "Per sqft / yr" },
                    ].map((s) => (
                      <div key={s.label} className="border-l-2 border-tool-accent pl-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted mb-1 font-medium">
                          {s.label}
                        </p>
                        <p className={`font-mono text-lg font-bold tabular-nums ${s.accent ? "text-emerald-600 dark:text-emerald-400" : "text-app"}`}>
                          {s.value}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-secondary mt-5 pt-4 border-t border-app leading-relaxed">
                    <span className="text-tool-accent font-semibold">{selectedArea}</span> averaged{" "}
                    <span className="font-semibold text-app">{valuation.area.yoyAppreciation}%</span> annual appreciation with{" "}
                    <span className="font-semibold text-app">
                      {valuation.area.transactionVolume >= 300
                        ? "high"
                        : valuation.area.transactionVolume >= 150
                        ? "moderate"
                        : "limited"}
                    </span>{" "}
                    transaction liquidity. Average building age in the area is{" "}
                    <span className="font-semibold text-app">{valuation.area.avgAge} years</span>.
                  </p>
                </div>

                {/* Comparable rows table */}
                <div className="bg-app-elevated border border-app rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-app">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">
                      Type · Price/sqft Comparison
                    </span>
                  </div>
                  <div className="divide-y divide-app">
                    {[
                      { label: "Studio", value: valuation.area.pricePerSqftStudio },
                      { label: "1BR", value: valuation.area.pricePerSqft1BR },
                      { label: "2BR", value: valuation.area.pricePerSqft2BR },
                      { label: "3BR", value: valuation.area.pricePerSqft3BR },
                      { label: "Villa", value: valuation.area.pricePerSqftVilla },
                    ]
                      .filter((p) => p.value > 0)
                      .map((p) => {
                        const selected = p.label === propertyType;
                        return (
                          <div
                            key={p.label}
                            className={`flex items-center justify-between px-5 py-3.5 transition-all ${
                              selected
                                ? "bg-tool-accent-soft ring-1 ring-inset ring-tool-accent"
                                : "hover:ring-1 hover:ring-inset hover:ring-tool-accent/40"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-semibold ${selected ? "text-tool-accent" : "text-app"}`}>
                                {p.label}
                              </span>
                              {selected && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-tool-accent text-white uppercase tracking-wider font-semibold">
                                  Subject
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-sm font-bold tabular-nums text-app">
                              AED {formatNumber(p.value)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
