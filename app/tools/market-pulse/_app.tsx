"use client";

/**
 * Market Pulse Dashboard — native workspace app.
 *
 * The inside-the-Window variant of `/tools/market-pulse`. The stand-alone
 * page (page.tsx) keeps existing for direct visits / SEO / sharing. This file
 * is mounted by the desktop's Window component when the user opens the tool
 * from the workspace.
 *
 * Differences vs page.tsx:
 *   - No <AuthGate> (workspace handles auth at the shell level).
 *   - No frame=1 / macOS chrome (Window provides it).
 *   - No PageHeader / "All Tools" back-link (workspace dock handles discovery).
 *   - No <ToolRecommendations> (dock provides discovery).
 *   - Width-driven layout: collapses grid columns when width is narrow.
 *
 * All data references (`MONTHLY_VOLUMES`, `AREA_DATA`, `SUPPLY_PIPELINE`,
 * `MARKET_SUMMARY`, `PRICE_INDEX`) and trend math (temperature score,
 * sparkline values, sort/filter logic) are preserved verbatim from page.tsx.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MONTHLY_VOLUMES,
  AREA_DATA,
  SUPPLY_PIPELINE,
  MARKET_SUMMARY,
  PRICE_INDEX,
} from "@/lib/market-pulse-data";
import type { AreaTransaction } from "@/lib/market-pulse-data";
import { useCanvasTone } from "@/lib/useCanvasTone";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type VolumeMode = "total" | "readyOffplan" | "mortgageCash";
type SortKey = "area" | "avgPrice" | "avgPriceChange" | "transactions" | "rentalYield";
type SortDir = "asc" | "desc";
type SegmentFilter = "all" | "luxury" | "mid" | "affordable";
type PeriodKey = "1M" | "3M" | "6M" | "1Y";
type SectionKey = "overview" | "areas" | "supply";

// ============================================================
// Sparkline chip (SVG, lightweight)
// ============================================================
function Sparkline({
  values,
  positive,
  width = 72,
  height = 24,
}: {
  values: number[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = positive ? "var(--tool-accent)" : "#f43f5e";
  const fillId = `sg-${positive ? "p" : "n"}`;
  const fillStop = positive ? "var(--tool-accent-soft)" : "rgba(244,63,94,0.18)";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillStop} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill={`url(#${fillId})`}
        stroke="none"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================
// Canvas chart hook
// ============================================================
function useCanvasSetup(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      draw(ctx, rect.width, rect.height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef, draw]);
}

// ============================================================
// Market temperature dial (composite of YoY indicators)
// ============================================================
type Verdict = {
  key: "hot" | "warm" | "cool" | "cold";
  label: string;
  blurb: string;
};

function verdictFor(score: number): Verdict {
  if (score >= 75) return { key: "hot", label: "Hot", blurb: "Demand outrunning supply" };
  if (score >= 55) return { key: "warm", label: "Warm", blurb: "Healthy expansion" };
  if (score >= 35) return { key: "cool", label: "Cool", blurb: "Slowing momentum" };
  return { key: "cold", label: "Cold", blurb: "Buyer's market" };
}

function MarketTemperatureDial({ score }: { score: number }) {
  // Animate the needle in
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(score));
    return () => cancelAnimationFrame(id);
  }, [score]);

  const verdict = verdictFor(score);
  // Arc geometry — 240deg sweep starting 240deg, ending 60deg
  const cx = 120;
  const cy = 120;
  const r = 88;
  const startA = (210 * Math.PI) / 180;
  const endA = ((210 + 240) * Math.PI) / 180;
  const polar = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

  const segments = 60;
  const ticks = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const a = startA + (endA - startA) * t;
    const inner = polar(a);
    const outerR = r + (i % 5 === 0 ? 9 : 5);
    const outer = [cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR] as const;
    const filled = t * 100 <= progress;
    return { inner, outer, filled, key: i, major: i % 5 === 0 };
  });

  const needleA = startA + ((endA - startA) * progress) / 100;
  const [nx, ny] = polar(needleA);

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      <svg viewBox="0 0 240 200" className="w-full max-w-[320px]">
        {/* track ticks */}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.inner[0]}
            y1={t.inner[1]}
            x2={t.outer[0]}
            y2={t.outer[1]}
            stroke={t.filled ? "var(--tool-accent)" : "var(--border)"}
            strokeOpacity={t.filled ? 1 : t.major ? 0.55 : 0.3}
            strokeWidth={t.major ? 1.6 : 1}
            strokeLinecap="round"
          />
        ))}
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="var(--tool-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="var(--tool-accent)" />
        <circle cx={cx} cy={cy} r="3" fill="var(--bg)" />
        {/* end labels */}
        <text x={polar(startA)[0] - 6} y={polar(startA)[1] + 22} fontSize="10" fill="var(--text-muted)" textAnchor="end" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">cold</text>
        <text x={polar(endA)[0] + 6} y={polar(endA)[1] + 22} fontSize="10" fill="var(--text-muted)" textAnchor="start" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">hot</text>
      </svg>

      {/* readout */}
      <div className="-mt-10 flex flex-col items-center gap-2">
        <div className="text-4xl font-semibold tabular-nums text-app">
          {Math.round(progress)}
          <span className="text-base text-muted ml-1 font-mono">/100</span>
        </div>
        <span
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-tool-accent-soft text-tool-accent border border-tool-accent/30"
        >
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-tool-accent animate-ping opacity-60" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-tool-accent" />
          </span>
          {verdict.label}
        </span>
        <p className="text-xs text-secondary font-mono">{verdict.blurb}</p>
      </div>
    </div>
  );
}

// ============================================================
// Top header — name, live chip, period selector, section nav
// ============================================================
function ToolHeader({
  period,
  setPeriod,
  section,
  setSection,
  isNarrow,
  isMobile,
}: {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  section: SectionKey;
  setSection: (s: SectionKey) => void;
  isNarrow: boolean;
  isMobile: boolean;
}) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const sections: { key: SectionKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "areas", label: "Areas" },
    { key: "supply", label: "Supply" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex gap-4 ${isNarrow ? "flex-col" : "flex-row items-center justify-between"}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-tool-accent-soft border border-tool-accent/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-tool-accent" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={`font-semibold text-app tracking-tight ${isNarrow ? "text-2xl" : "text-2xl md:text-3xl"}`}>
                Market Pulse
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-tool-accent-soft text-tool-accent border border-tool-accent/30">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-tool-accent animate-ping opacity-60" />
                  <span className="relative rounded-full w-1.5 h-1.5 bg-tool-accent" />
                </span>
                Live
              </span>
            </div>
            <p className="text-xs text-muted font-mono mt-1 tabular-nums">
              Dubai · Q1 2026 · <span className="text-tool-accent">{clock}</span>
            </p>
          </div>
        </div>

        {/* Time-period segmented pill */}
        <div className={`inline-flex items-center p-0.5 rounded-full bg-app-elevated border border-app ${isMobile ? "self-stretch" : "self-start"}`}>
          {(["1M", "3M", "6M", "1Y"] as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 ${isMobile ? "min-h-[44px] flex-1 text-sm" : "py-1.5 text-xs"} font-mono rounded-full transition-colors ${
                period === p
                  ? "bg-tool-accent text-white shadow"
                  : "text-secondary hover:text-app"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Section nav button group */}
      <div className={`inline-flex items-center gap-1 p-1 rounded-xl bg-app-elevated border border-app ${isMobile ? "self-stretch" : "flex-wrap self-start"}`}>
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3.5 ${isMobile ? "min-h-[44px] flex-1 text-sm" : "py-1.5 text-xs"} font-medium rounded-lg transition-colors ${
              section === s.key
                ? "bg-tool-accent-soft text-tool-accent border border-tool-accent/30"
                : "text-secondary hover:text-app border border-transparent"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Indicator tile — KPI grid with sparkline + delta arrow
// ============================================================
function IndicatorTile({
  label,
  value,
  change,
  positive,
  spark,
  delay,
}: {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  spark: number[];
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      className="group rounded-xl bg-app-elevated border border-app p-4 hover:border-tool-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] text-muted uppercase tracking-[0.12em] font-mono leading-tight">
          {label}
        </p>
        <Sparkline values={spark} positive={positive} width={56} height={20} />
      </div>
      <p className="text-xl md:text-2xl font-semibold text-app font-mono tabular-nums mt-2 leading-tight">
        {value}
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <span
          className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium tabular-nums ${
            positive ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            {positive ? (
              <path d="M5 1.5L8.5 7H1.5L5 1.5Z" fill="currentColor" />
            ) : (
              <path d="M5 8.5L1.5 3H8.5L5 8.5Z" fill="currentColor" />
            )}
          </svg>
          {change}
        </span>
      </div>
    </motion.div>
  );
}

function IndicatorGrid({ width }: { width: number }) {
  // synthetic sparkline values per KPI so it feels alive without changing data
  const sparks = useMemo(
    () => [
      [22, 25, 24, 27, 30, 29, 33, 35, 38, 42, 44, 48],
      [100, 104, 109, 115, 122, 128, 135, 141, 148, 154, 161, 168],
      [12, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24],
      [80, 78, 82, 79, 83, 81, 85, 87, 86, 90, 92, 94],
      [50, 52, 51, 54, 56, 55, 58, 60, 62, 61, 64, 66],
      [30, 32, 31, 34, 33, 36, 38, 37, 40, 42, 41, 44],
    ],
    [],
  );

  // Width-driven columns: 6 cols on wide, 3 on mid, 2 on narrow
  const cols = width >= 1100 ? "grid-cols-6" : width >= 720 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className={`grid ${cols} gap-3`}>
      {MARKET_SUMMARY.map((kpi, i) => (
        <IndicatorTile
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          change={kpi.change}
          positive={kpi.positive}
          spark={sparks[i % sparks.length]}
          delay={i * 0.04}
        />
      ))}
    </div>
  );
}

// ============================================================
// Trend card — bg-app-elevated with tool-accent accent stripe + sparkline
// ============================================================
function TrendCard({
  title,
  value,
  delta,
  positive,
  spark,
  caption,
  delay = 0,
}: {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
  spark: number[];
  caption: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease }}
      className="relative overflow-hidden rounded-xl bg-app-elevated border border-app p-5"
    >
      {/* accent stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-tool-accent-soft">
        <div className="absolute left-0 top-2 bottom-2 w-full bg-tool-accent rounded-r" />
      </div>
      <div className="pl-3">
        <p className="text-[10px] text-muted uppercase tracking-[0.14em] font-mono">{title}</p>
        <div className="flex items-end justify-between gap-3 mt-2">
          <p className="text-2xl font-semibold text-app font-mono tabular-nums leading-none">
            {value}
          </p>
          <Sparkline values={spark} positive={positive} width={84} height={28} />
        </div>
        <div className="flex items-center justify-between mt-3">
          <span
            className={`text-xs font-mono font-medium tabular-nums ${
              positive ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
            }`}
          >
            {positive ? "▲" : "▼"} {delta}
          </span>
          <span className="text-[11px] text-muted font-mono">{caption}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Section panel shell (no window chrome)
// ============================================================
function Panel({
  title,
  subtitle,
  children,
  right,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className="rounded-2xl bg-app-elevated border border-app overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-base font-semibold text-app tracking-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted font-mono mt-0.5">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </motion.section>
  );
}

// ============================================================
// Legend chip
// ============================================================
function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-app border border-app text-[10px] font-mono text-secondary">
      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ============================================================
// Transaction Volume Chart
// ============================================================
function TransactionVolumeChart() {
  const [mode, setMode] = useState<VolumeMode>("total");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { top: 30, right: 20, bottom: 50, left: 60 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const data = MONTHLY_VOLUMES;
      const barCount = data.length;
      const barGap = 2;

      let maxVal = 0;
      data.forEach((d) => {
        if (mode === "total") maxVal = Math.max(maxVal, d.totalTransactions);
        else if (mode === "readyOffplan") maxVal = Math.max(maxVal, d.ready + d.offplan);
        else maxVal = Math.max(maxVal, d.mortgage + d.cash);
      });
      maxVal = Math.ceil(maxVal / 5000) * 5000;

      // Gridlines
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + chartH - (chartH * i) / 5;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${tone},0.45)`;
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "right";
        ctx.fillText(((maxVal * i) / 5 / 1000).toFixed(0) + "K", pad.left - 8, y + 4);
      }

      const barW = (chartW - barGap * barCount) / barCount;

      data.forEach((d, idx) => {
        const x = pad.left + idx * (barW + barGap);

        if (mode === "total") {
          const h1 = (d.totalTransactions / maxVal) * chartH;
          ctx.fillStyle = "#8b5cf6";
          ctx.fillRect(x, pad.top + chartH - h1, barW, h1);
        } else if (mode === "readyOffplan") {
          const h1 = (d.ready / maxVal) * chartH;
          const h2 = (d.offplan / maxVal) * chartH;
          ctx.fillStyle = "#06b6d4";
          ctx.fillRect(x, pad.top + chartH - h1 - h2, barW, h1);
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(x, pad.top + chartH - h2, barW, h2);
        } else {
          const h1 = (d.mortgage / maxVal) * chartH;
          const h2 = (d.cash / maxVal) * chartH;
          ctx.fillStyle = "#10b981";
          ctx.fillRect(x, pad.top + chartH - h1 - h2, barW, h1);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(x, pad.top + chartH - h2, barW, h2);
        }

        // X labels (every 3 months)
        if (idx % 3 === 0) {
          ctx.fillStyle = `rgba(${tone},0.45)`;
          ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${d.month} ${String(d.year).slice(2)}`, x + barW / 2, pad.top + chartH + 18);
        }
      });
    },
    [mode, tone],
  );

  useCanvasSetup(canvasRef, draw);

  const modeSwitcher = (
    <div className="flex gap-1 p-0.5 rounded-lg bg-app border border-app">
      {(
        [
          ["total", "Total"],
          ["readyOffplan", "Ready/Off-Plan"],
          ["mortgageCash", "Mortgage/Cash"],
        ] as [VolumeMode, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setMode(key)}
          className={`px-2.5 min-h-[32px] sm:min-h-0 py-1 text-[11px] sm:text-[10px] font-mono rounded transition-colors ${
            mode === key
              ? "bg-tool-accent-soft text-tool-accent"
              : "text-muted hover:text-app"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Panel
      title="Transaction Volume"
      subtitle="monthly · units"
      delay={0.1}
      right={modeSwitcher}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {mode === "total" && <LegendChip color="#8b5cf6" label="Transactions" />}
        {mode === "readyOffplan" && (
          <>
            <LegendChip color="#06b6d4" label="Ready" />
            <LegendChip color="#f59e0b" label="Off-Plan" />
          </>
        )}
        {mode === "mortgageCash" && (
          <>
            <LegendChip color="#10b981" label="Mortgage" />
            <LegendChip color="#ef4444" label="Cash" />
          </>
        )}
      </div>
      <div className="h-[300px] w-full rounded-lg bg-app border border-app p-1">
        <canvas ref={canvasRef} className="block" />
      </div>
    </Panel>
  );
}

// ============================================================
// Price Index Chart
// ============================================================
function PriceIndexChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentIndex = PRICE_INDEX[PRICE_INDEX.length - 1].index;
  const tone = useCanvasTone();

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { top: 30, right: 20, bottom: 50, left: 55 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const data = PRICE_INDEX;
      const minVal = 90;
      const maxVal = 240;

      // Gridlines
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const val = minVal + ((maxVal - minVal) * i) / 5;
        const y = pad.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${tone},0.45)`;
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "right";
        ctx.fillText(val.toFixed(0), pad.left - 8, y + 4);
      }

      // Line + gradient fill
      const points: [number, number][] = data.map((d, i) => {
        const x = pad.left + (i / (data.length - 1)) * chartW;
        const y = pad.top + chartH - ((d.index - minVal) / (maxVal - minVal)) * chartH;
        return [x, y];
      });

      // Gradient fill
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      grad.addColorStop(0, "rgba(139,92,246,0.3)");
      grad.addColorStop(1, "rgba(139,92,246,0)");
      ctx.beginPath();
      ctx.moveTo(points[0][0], pad.top + chartH);
      points.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(points[points.length - 1][0], pad.top + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();

      // End dot
      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = "#8b5cf6";
      ctx.fill();
      ctx.strokeStyle = `rgb(${tone})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // X labels
      data.forEach((d, i) => {
        if (i % 4 === 0) {
          const x = pad.left + (i / (data.length - 1)) * chartW;
          ctx.fillStyle = `rgba(${tone},0.45)`;
          ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
          ctx.textAlign = "center";
          ctx.fillText(d.quarter, x, pad.top + chartH + 18);
        }
      });
    },
    [tone],
  );

  useCanvasSetup(canvasRef, draw);

  const right = (
    <div className="text-right font-mono tabular-nums">
      <p className="text-2xl font-semibold text-tool-accent leading-none">{currentIndex}</p>
      <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-1">
        +{currentIndex - 100}% vs Q1-2020
      </p>
    </div>
  );

  return (
    <Panel title="Price Index" subtitle="base 100 = Q1 2020" delay={0.15} right={right}>
      <div className="flex gap-2 mb-3">
        <LegendChip color="#8b5cf6" label="DXB Composite Index" />
      </div>
      <div className="h-[280px] w-full rounded-lg bg-app border border-app p-1">
        <canvas ref={canvasRef} className="block" />
      </div>
    </Panel>
  );
}

// ============================================================
// Area Performance Table helpers
// ============================================================
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  return (
    <span className="ml-1 text-muted">
      {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

function AreaPerformanceTable() {
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("avgPriceChange");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let data = [...AREA_DATA];
    if (segmentFilter !== "all") data = data.filter((d) => d.segment === segmentFilter);
    data.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "area") return mul * a.area.localeCompare(b.area);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return data;
  }, [segmentFilter, sortKey, sortDir]);

  const segmentBadge = (s: AreaTransaction["segment"]) => {
    const colors = {
      luxury: "bg-tool-accent-soft text-tool-accent border border-tool-accent/30",
      mid: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30",
      affordable:
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30",
    };
    const labels = { luxury: "Luxury", mid: "Mid", affordable: "Affordable" };
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${colors[s]}`}>
        {labels[s]}
      </span>
    );
  };

  const filterSwitcher = (
    <div className="flex gap-1 p-0.5 rounded-lg bg-app border border-app">
      {(
        [
          ["all", "All"],
          ["luxury", "Luxury"],
          ["mid", "Mid"],
          ["affordable", "Affordable"],
        ] as [SegmentFilter, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setSegmentFilter(key)}
          className={`px-2.5 py-1 text-[10px] font-mono rounded transition-colors ${
            segmentFilter === key
              ? "bg-tool-accent-soft text-tool-accent"
              : "text-muted hover:text-app"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Panel
      title="Area Performance"
      subtitle={`${filtered.length} rows`}
      delay={0.2}
      right={filterSwitcher}
    >
      <div className="overflow-x-auto rounded-lg border border-app">
        <table className="w-full text-sm">
          <thead className="bg-app">
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-muted">
              <th
                className="py-2 px-3 cursor-pointer select-none"
                onClick={() => handleSort("area")}
              >
                Area<SortIcon col="area" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="py-2 px-3 cursor-pointer select-none text-right"
                onClick={() => handleSort("avgPrice")}
              >
                Avg/sqft<SortIcon col="avgPrice" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="py-2 px-3 cursor-pointer select-none text-right"
                onClick={() => handleSort("avgPriceChange")}
              >
                Δ<SortIcon col="avgPriceChange" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="py-2 px-3 cursor-pointer select-none text-right"
                onClick={() => handleSort("transactions")}
              >
                Txns<SortIcon col="transactions" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="py-2 px-3 cursor-pointer select-none text-right"
                onClick={() => handleSort("rentalYield")}
              >
                Yield<SortIcon col="rentalYield" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="py-2 px-3 text-right">Segment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((area, i) => (
              <motion.tr
                key={area.area}
                layout
                className={`border-t border-app cursor-pointer hover:bg-tool-accent-soft transition-colors ${
                  i % 2 === 0 ? "bg-app/40" : ""
                }`}
                onClick={() =>
                  setExpandedArea(expandedArea === area.area ? null : area.area)
                }
              >
                <td className="py-2 px-3 text-app font-medium">{area.area}</td>
                <td className="py-2 px-3 text-secondary font-mono tabular-nums text-right">
                  {area.avgPrice.toLocaleString()}
                </td>
                <td
                  className={`py-2 px-3 font-mono tabular-nums text-right ${
                    area.avgPriceChange >= 0
                      ? "text-emerald-500 dark:text-emerald-400"
                      : "text-rose-500 dark:text-rose-400"
                  }`}
                >
                  {area.avgPriceChange >= 0 ? "+" : ""}
                  {area.avgPriceChange}%
                </td>
                <td className="py-2 px-3 text-secondary font-mono tabular-nums text-right">
                  {area.transactions.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-secondary font-mono tabular-nums text-right">
                  {area.rentalYield}%
                </td>
                <td className="py-2 px-3 text-right">{segmentBadge(area.segment)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {expandedArea &&
          (() => {
            const area = AREA_DATA.find((a) => a.area === expandedArea);
            if (!area) return null;
            return (
              <motion.div
                key={expandedArea}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease }}
                className="overflow-hidden mt-3 p-4 rounded-lg border border-tool-accent/30 bg-tool-accent-soft"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted">
                      Avg Rent (1BR/yr)
                    </p>
                    <p className="text-app font-mono tabular-nums font-medium mt-1">
                      AED {area.avgRent.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted">
                      Txn Change (YoY)
                    </p>
                    <p
                      className={`font-mono tabular-nums font-medium mt-1 ${
                        area.transactionsChange >= 0
                          ? "text-emerald-500 dark:text-emerald-400"
                          : "text-rose-500 dark:text-rose-400"
                      }`}
                    >
                      {area.transactionsChange >= 0 ? "+" : ""}
                      {area.transactionsChange}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted">
                      Top Project
                    </p>
                    <p className="text-app font-medium mt-1">{area.topProject}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted">
                      Rental Yield
                    </p>
                    <p className="text-app font-mono tabular-nums font-medium mt-1">
                      {area.rentalYield}%
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </Panel>
  );
}

// ============================================================
// Top performers
// ============================================================
function TopPerformersColumn({
  title,
  items,
  metric,
  format,
}: {
  title: string;
  items: AreaTransaction[];
  metric: keyof AreaTransaction;
  format: (v: number) => string;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2 px-1">
        {title}
      </h4>
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <motion.div
            key={item.area}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.04, ease }}
            className="group flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-tool-accent-soft transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono text-tool-accent bg-tool-accent-soft">
                {i + 1}
              </span>
              <span className="text-sm text-app truncate">{item.area}</span>
            </div>
            <span className="text-xs font-mono tabular-nums font-medium text-emerald-500 dark:text-emerald-400 shrink-0">
              {format(item[metric] as number)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TopPerformers({ width }: { width: number }) {
  const byPriceGrowth = useMemo(
    () => [...AREA_DATA].sort((a, b) => b.avgPriceChange - a.avgPriceChange).slice(0, 5),
    [],
  );
  const byVolume = useMemo(
    () => [...AREA_DATA].sort((a, b) => b.transactions - a.transactions).slice(0, 5),
    [],
  );
  const byYield = useMemo(
    () => [...AREA_DATA].sort((a, b) => b.rentalYield - a.rentalYield).slice(0, 5),
    [],
  );

  const cols = width >= 720 ? "grid-cols-3" : "grid-cols-1";

  return (
    <Panel title="Top Performers" subtitle="leaders across metrics" delay={0.25}>
      <div className={`grid ${cols} gap-4`}>
        <TopPerformersColumn
          title="Price Growth (YoY)"
          items={byPriceGrowth}
          metric="avgPriceChange"
          format={(v) => `+${v}%`}
        />
        <TopPerformersColumn
          title="Transaction Volume"
          items={byVolume}
          metric="transactions"
          format={(v) => v.toLocaleString()}
        />
        <TopPerformersColumn
          title="Rental Yield"
          items={byYield}
          metric="rentalYield"
          format={(v) => `${v}%`}
        />
      </div>
    </Panel>
  );
}

// ============================================================
// Supply Pipeline Chart
// ============================================================
function SupplyPipelineChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { top: 30, right: 20, bottom: 50, left: 60 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const data = SUPPLY_PIPELINE;
      const maxVal = 80000;

      // Gridlines
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${tone},0.45)`;
        ctx.font = "11px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "right";
        ctx.fillText(((maxVal * i) / 4 / 1000).toFixed(0) + "K", pad.left - 8, y + 4);
      }

      const groupW = chartW / data.length;
      const barW = groupW * 0.3;

      data.forEach((d, idx) => {
        const x = pad.left + idx * groupW + groupW * 0.15;

        // Expected
        const h1 = (d.expectedUnits / maxVal) * chartH;
        ctx.fillStyle = "#6366f1";
        ctx.fillRect(x, pad.top + chartH - h1, barW, h1);

        // Delivered
        const h2 = (d.delivered / maxVal) * chartH;
        ctx.fillStyle = "#10b981";
        ctx.fillRect(x + barW + 4, pad.top + chartH - h2, barW, h2);

        // Year label
        ctx.fillStyle = `rgba(${tone},0.5)`;
        ctx.font = "12px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(d.year), x + barW + 2, pad.top + chartH + 20);
      });
    },
    [tone],
  );

  useCanvasSetup(canvasRef, draw);

  const legend = (
    <div className="flex gap-2">
      <LegendChip color="#6366f1" label="Expected" />
      <LegendChip color="#10b981" label="Delivered" />
    </div>
  );

  return (
    <Panel title="Supply Pipeline" subtitle="units · annual" delay={0.3} right={legend}>
      <div className="h-[260px] w-full rounded-lg bg-app border border-app p-1">
        <canvas ref={canvasRef} className="block" />
      </div>
    </Panel>
  );
}

// ============================================================
// Share / export
// ============================================================
function ShareExport() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const summary = MARKET_SUMMARY.map((k) => `${k.label}: ${k.value} (${k.change})`).join("\n");
    const text = `Dubai Market Pulse - Q1 2026\n\n${summary}\n\nFull dashboard: https://example.com/tools/market-pulse`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(
      "Check out the Dubai Real Estate Market Pulse dashboard:\nhttps://example.com/tools/market-pulse",
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35, ease }}
      className="flex flex-wrap items-center gap-2"
    >
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-tool-accent/30 bg-tool-accent-soft text-tool-accent hover:bg-tool-accent hover:text-white text-xs font-mono transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
          />
        </svg>
        {copied ? "copied" : "copy summary"}
      </button>
      <button
        onClick={handleWhatsApp}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-app bg-app-elevated text-secondary hover:text-app hover:border-app-strong text-xs font-mono transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        share
      </button>
    </motion.div>
  );
}

// ============================================================
// Native App
// ============================================================
export default function MarketPulseApp(props: NativeAppProps) {
  const { width } = props;
  const [period, setPeriod] = useState<PeriodKey>("3M");
  const [section, setSection] = useState<SectionKey>("overview");

  // Width-driven layout breakpoints — match the inner content (no max-w-7xl).
  const isMobile = width < 700;
  const isNarrow = width < 720 || isMobile;
  const isWide = width >= 1100;

  // Compose a temperature score from MARKET_SUMMARY momentum.
  // Positive KPIs add, negatives subtract; clamp 0..100.
  const temperatureScore = useMemo(() => {
    const sumMomentum = MARKET_SUMMARY.reduce((acc, k) => {
      const num = parseFloat(k.change.replace(/[^0-9.\-]/g, "")) || 0;
      return acc + (k.positive ? num : -num);
    }, 0);
    // Calibrated so a typical mid-cycle reads ~60
    const score = 50 + sumMomentum * 0.7;
    return Math.max(0, Math.min(100, score));
  }, []);

  // Live tick — re-render every minute so the temperature can drift if data changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Trend data for the headline cards
  const trendCards = useMemo(
    () => [
      {
        title: "Transaction Volume",
        value: MARKET_SUMMARY[0].value,
        delta: MARKET_SUMMARY[0].change,
        positive: MARKET_SUMMARY[0].positive,
        spark: [22, 25, 24, 27, 30, 29, 33, 35, 38, 42, 44, 48],
        caption: "vs prior period",
      },
      {
        title: "Avg Price / sqft",
        value: MARKET_SUMMARY[2].value,
        delta: MARKET_SUMMARY[2].change,
        positive: MARKET_SUMMARY[2].positive,
        spark: [12, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24],
        caption: "rolling 12m",
      },
      {
        title: "Rental Yield",
        value: MARKET_SUMMARY[4].value,
        delta: MARKET_SUMMARY[4].change,
        positive: MARKET_SUMMARY[4].positive,
        spark: [50, 52, 51, 54, 56, 55, 58, 60, 62, 61, 64, 66],
        caption: "city-wide avg",
      },
    ],
    [],
  );

  // Width-driven grid templates
  const heroCols = isWide ? "grid-cols-3" : "grid-cols-1";
  const trendCols = isWide ? "sm:grid-cols-3" : isNarrow ? "grid-cols-1" : "sm:grid-cols-3";
  const sectionCols = width >= 900 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="market-pulse"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      {/* Hero band — uses foundation tool-hero gradient */}
      <div className="tool-hero relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            color: "var(--tool-accent)",
          }}
        />
        <div className={`relative ${isMobile ? "px-4 pt-4 pb-4" : "px-4 sm:px-6 pt-6 pb-5"}`}>
          <ToolHeader
            period={period}
            setPeriod={setPeriod}
            section={section}
            setSection={setSection}
            isNarrow={isNarrow}
            isMobile={isMobile}
          />
        </div>
      </div>

      <section className={`${isMobile ? "px-4 pb-12 pt-4 space-y-5" : "px-4 sm:px-6 pb-10 space-y-6 pt-6"}`}>
        {/* Temperature + headline trend cards */}
        <div className={`grid ${heroCols} gap-4`}>
          <Panel title="Market Temperature" subtitle={`composite · ${period}`} delay={0.05}>
            <MarketTemperatureDial score={temperatureScore} />
          </Panel>
          <div className={`${isWide ? "col-span-2" : ""} grid grid-cols-1 ${trendCols} gap-4`}>
            {trendCards.map((c, i) => (
              <TrendCard
                key={c.title}
                title={c.title}
                value={c.value}
                delta={c.delta}
                positive={c.positive}
                spark={c.spark}
                caption={c.caption}
                delay={0.08 + i * 0.05}
              />
            ))}
          </div>
        </div>

        {/* Indicator grid */}
        <Panel title="Indicators" subtitle="all KPIs · live" delay={0.15}>
          <IndicatorGrid width={width} />
        </Panel>

        {/* Sectioned content */}
        {section === "overview" && (
          <div className={`grid ${sectionCols} gap-5`}>
            <TransactionVolumeChart />
            <PriceIndexChart />
          </div>
        )}

        {section === "areas" && (
          <>
            <AreaPerformanceTable />
            <TopPerformers width={width} />
          </>
        )}

        {section === "supply" && (
          <div className={`grid ${sectionCols} gap-5`}>
            <SupplyPipelineChart />
            <TopPerformers width={width} />
          </div>
        )}

        {/* Share/Export */}
        <ShareExport />
      </section>
    </div>
  );
}
