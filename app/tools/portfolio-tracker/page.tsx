"use client";
import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import ToolRecommendations from "@/components/ToolRecommendations";
import { useCanvasTone } from "@/lib/useCanvasTone";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const DUBAI_AREAS = [
  "Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Business Bay", "JVC", "JLT",
  "Dubai Hills Estate", "Creek Harbour", "Al Furjan", "Arjan", "Sports City",
  "Motor City", "Town Square", "Dubai Silicon Oasis", "Mirdif", "International City",
  "Discovery Gardens", "Dubai South", "Dubailand", "DIFC", "Bluewaters Island",
  "Emirates Hills", "MBR City", "Arabian Ranches",
];

const PROPERTY_TYPES = ["Studio", "1BR", "2BR", "3BR", "Villa", "Commercial"];
const STATUS_OPTIONS = ["Rented", "Vacant", "Personal Use", "Under Construction"];

interface Property {
  id: string;
  name: string;
  area: string;
  type: string;
  purchasePrice: number;
  purchaseDate: string;
  currentValue: number;
  monthlyRental: number;
  annualServiceCharge: number;
  annualMaintenance: number;
  hasMortgage: boolean;
  monthlyMortgage: number;
  outstandingBalance: number;
  status: string;
}

const STORAGE_KEY = "portfolio-tracker-properties";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatAED(value: number): string {
  return "AED " + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPercent(value: number): string {
  return value.toFixed(2) + "%";
}

function isProperty(value: unknown): value is Property {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Property>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.area === "string" &&
    typeof p.type === "string" &&
    typeof p.purchasePrice === "number" &&
    typeof p.currentValue === "number" &&
    typeof p.monthlyRental === "number" &&
    typeof p.annualServiceCharge === "number" &&
    typeof p.annualMaintenance === "number" &&
    typeof p.hasMortgage === "boolean" &&
    typeof p.monthlyMortgage === "number" &&
    typeof p.outstandingBalance === "number" &&
    typeof p.status === "string"
  );
}

type SortKey = "name" | "area" | "type" | "purchasePrice" | "currentValue" | "gainLoss" | "monthlyIncome" | "monthlyExpense" | "netCashFlow" | "yield";
type SortDir = "asc" | "desc";

const STATUS_TONE: Record<string, string> = {
  "Rented": "tool",
  "Vacant": "amber",
  "Personal Use": "neutral",
  "Under Construction": "blue",
};

export default function PortfolioTrackerPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioTrackerInner />
    </Suspense>
  );
}

function PortfolioTrackerInner() {
  const searchParams = useSearchParams();
  const isFramed = searchParams?.get("frame") === "1";

  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocationView, setAllocationView] = useState<"area" | "type" | "status">("area");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [importMessage, setImportMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const donutCanvasRef = useRef<HTMLCanvasElement>(null);
  const performanceCanvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  // Form state
  const emptyForm: Omit<Property, "id"> = {
    name: "", area: DUBAI_AREAS[0], type: PROPERTY_TYPES[0],
    purchasePrice: 0, purchaseDate: "2024-01", currentValue: 0,
    monthlyRental: 0, annualServiceCharge: 0, annualMaintenance: 0,
    hasMortgage: false, monthlyMortgage: 0, outstandingBalance: 0,
    status: STATUS_OPTIONS[0],
  };
  const [form, setForm] = useState<Omit<Property, "id">>(emptyForm);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setProperties(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
  }, [properties]);

  const handleSubmit = useCallback(() => {
    if (!form.name || form.purchasePrice <= 0) return;
    if (editingId) {
      setProperties((prev) => prev.map((p) => p.id === editingId ? { ...form, id: editingId } : p));
      setEditingId(null);
    } else {
      setProperties((prev) => [...prev, { ...form, id: generateId() }]);
    }
    setForm(emptyForm);
    setShowForm(false);
  }, [form, editingId]);

  const handleEdit = useCallback((property: Property) => {
    const { id, ...rest } = property;
    setForm(rest);
    setEditingId(id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(properties, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [properties]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(data)) {
            setImportMessage({
              kind: "err",
              text: "Import file must contain an array of properties.",
            });
            return;
          }
          const valid = data.filter(isProperty);
          if (valid.length === 0) {
            setImportMessage({
              kind: "err",
              text: `0 properties imported. ${data.length} rows were not valid.`,
            });
            return;
          }
          setProperties(valid);
          setImportMessage({
            kind: "ok",
            text: `${valid.length} properties imported${
              valid.length === data.length ? "" : `, ${data.length - valid.length} skipped`
            }.`,
          });
        } catch (err) {
          setImportMessage({
            kind: "err",
            text: err instanceof Error ? err.message : "Invalid JSON file.",
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const metrics = useMemo(() => {
    const totalValue = properties.reduce((s, p) => s + p.currentValue, 0);
    const totalInvested = properties.reduce((s, p) => s + p.purchasePrice, 0);
    const totalOutstanding = properties.reduce((s, p) => s + (p.hasMortgage ? p.outstandingBalance : 0), 0);
    const totalEquity = totalValue - totalOutstanding;
    const unrealizedGain = totalValue - totalInvested;
    const unrealizedPct = totalInvested > 0 ? (unrealizedGain / totalInvested) * 100 : 0;
    const totalMonthlyRental = properties.reduce((s, p) => s + p.monthlyRental, 0);
    const totalMonthlyServiceCharge = properties.reduce((s, p) => s + p.annualServiceCharge / 12, 0);
    const totalMonthlyMaintenance = properties.reduce((s, p) => s + p.annualMaintenance / 12, 0);
    const totalMonthlyMortgage = properties.reduce((s, p) => s + (p.hasMortgage ? p.monthlyMortgage : 0), 0);
    const totalMonthlyExpenses = totalMonthlyServiceCharge + totalMonthlyMaintenance + totalMonthlyMortgage;
    const netMonthlyCashFlow = totalMonthlyRental - totalMonthlyExpenses;
    const portfolioYield = totalInvested > 0 ? ((totalMonthlyRental * 12) / totalInvested) * 100 : 0;

    let bestPerformer: { name: string; yield: number } | null = null;
    properties.forEach((p) => {
      const y = p.purchasePrice > 0 ? (p.monthlyRental * 12) / p.purchasePrice * 100 : 0;
      if (!bestPerformer || y > bestPerformer.yield) bestPerformer = { name: p.name, yield: y };
    });

    return {
      totalValue, totalInvested, totalEquity, unrealizedGain, unrealizedPct,
      totalMonthlyRental, totalMonthlyExpenses, netMonthlyCashFlow,
      portfolioYield, count: properties.length,
      totalMonthlyServiceCharge, totalMonthlyMaintenance, totalMonthlyMortgage,
      bestPerformer,
    };
  }, [properties]);

  const allocationData = useMemo(() => {
    const groupBy = (key: "area" | "type" | "status") => {
      const map: Record<string, number> = {};
      properties.forEach((p) => {
        const k = p[key];
        map[k] = (map[k] || 0) + p.currentValue;
      });
      return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    return groupBy(allocationView);
  }, [properties, allocationView]);

  // Donut: tool-accent with stepped opacity for segment depth
  useEffect(() => {
    const canvas = donutCanvasRef.current;
    if (!canvas || allocationData.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const total = allocationData.reduce((s, d) => s + d.value, 0);
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 120;
    const innerR = 78;
    let startAngle = -Math.PI / 2;

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${tone},0.08)`;
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();

    // Segments — alpha steps from 1.0 down for stacking depth
    allocationData.forEach((item, i) => {
      const sliceAngle = (item.value / total) * Math.PI * 2;
      const alpha = Math.max(0.35, 1 - i * 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center label
    ctx.fillStyle = `rgb(${tone})`;
    ctx.font = "600 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(properties.length.toString(), cx, cy - 8);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = `rgba(${tone},0.55)`;
    ctx.fillText(properties.length === 1 ? "PROPERTY" : "PROPERTIES", cx, cy + 12);
  }, [allocationData, properties.length, tone]);

  // Performance line chart: cumulative equity over property purchase order
  useEffect(() => {
    const canvas = performanceCanvasRef.current;
    if (!canvas || properties.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 600;
    const h = 240;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Sort by purchase date and accumulate
    const sorted = [...properties].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
    const padding = { top: 28, right: 24, bottom: 36, left: 24 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    let cumValue = 0;
    let cumCost = 0;
    const valuePoints: { x: number; y: number; v: number }[] = [];
    const costPoints: { x: number; y: number; v: number }[] = [];
    sorted.forEach((p, i) => {
      cumValue += p.currentValue;
      cumCost += p.purchasePrice;
      const x = padding.left + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW);
      valuePoints.push({ x, y: 0, v: cumValue });
      costPoints.push({ x, y: 0, v: cumCost });
    });
    const maxV = Math.max(...valuePoints.map((p) => p.v), ...costPoints.map((p) => p.v), 1);
    valuePoints.forEach((p) => { p.y = padding.top + chartH - (p.v / maxV) * chartH; });
    costPoints.forEach((p) => { p.y = padding.top + chartH - (p.v / maxV) * chartH; });

    // Grid lines (border-app feel)
    ctx.strokeStyle = `rgba(${tone},0.07)`;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Axis label
    ctx.fillStyle = `rgba(${tone},0.45)`;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText("CUMULATIVE VALUE vs COST", padding.left, 16);
    ctx.textAlign = "right";
    ctx.fillText(formatAED(maxV), w - padding.right, 16);

    // Cost line (muted)
    if (costPoints.length > 1) {
      ctx.strokeStyle = `rgba(${tone},0.25)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      costPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Value area fill
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, "rgba(16, 185, 129, 0.22)");
    grad.addColorStop(1, "rgba(16, 185, 129, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(valuePoints[0].x, padding.top + chartH);
    valuePoints.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(valuePoints[valuePoints.length - 1].x, padding.top + chartH);
    ctx.closePath();
    ctx.fill();

    // Value line
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    valuePoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Points
    valuePoints.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();
      ctx.strokeStyle = `rgba(${tone},0.4)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // X-axis date labels (first/last)
    if (sorted.length > 0) {
      ctx.fillStyle = `rgba(${tone},0.5)`;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillText(sorted[0].purchaseDate, padding.left, h - 14);
      if (sorted.length > 1) {
        ctx.textAlign = "right";
        ctx.fillText(sorted[sorted.length - 1].purchaseDate, w - padding.right, h - 14);
      }
    }
  }, [properties, metrics, tone]);

  const sortedProperties = useMemo(() => {
    const getVal = (p: Property): number | string => {
      switch (sortKey) {
        case "name": return p.name;
        case "area": return p.area;
        case "type": return p.type;
        case "purchasePrice": return p.purchasePrice;
        case "currentValue": return p.currentValue;
        case "gainLoss": return p.currentValue - p.purchasePrice;
        case "monthlyIncome": return p.monthlyRental;
        case "monthlyExpense": return (p.annualServiceCharge / 12) + (p.annualMaintenance / 12) + (p.hasMortgage ? p.monthlyMortgage : 0);
        case "netCashFlow": return p.monthlyRental - (p.annualServiceCharge / 12) - (p.annualMaintenance / 12) - (p.hasMortgage ? p.monthlyMortgage : 0);
        case "yield": return p.purchasePrice > 0 ? (p.monthlyRental * 12) / p.purchasePrice * 100 : 0;
        default: return p.name;
      }
    };
    return [...properties].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [properties, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);

  const bp = metrics.bestPerformer as { name: string; yield: number } | null;
  const equityPositive = metrics.unrealizedGain >= 0;

  const openForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  return (
    <AuthGate>
      <div
        data-tool-theme="investment"
        data-tool="portfolio-tracker"
        className="min-h-screen bg-app text-app relative overflow-hidden"
      >
        {/* Ambient hero wash — investment emerald gradient */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-[420px] tool-hero opacity-50 pointer-events-none" />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[420px] pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <section className={`relative z-10 mx-auto px-4 sm:px-6 ${isFramed ? "pt-4 pb-10 max-w-[1200px]" : "pt-10 pb-24 max-w-[1300px]"}`}>
          {/* ── Hero summary ── */}
          <header className="mb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-tool-accent">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tool-accent opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-tool-accent" />
                    </span>
                    Investment · Live
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">/ portfolio</span>
                </div>

                <div className="flex items-baseline gap-4 flex-wrap">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1">Total Equity</p>
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight font-mono tabular-nums text-app">
                      {formatAED(metrics.totalEquity)}
                    </h1>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-medium ring-1 ${
                      equityPositive
                        ? "bg-tool-accent-soft text-tool-accent ring-tool-accent/30"
                        : "bg-red-500/10 text-red-500 ring-red-500/30"
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      {equityPositive ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      )}
                    </svg>
                    {equityPositive ? "+" : ""}{formatAED(metrics.unrealizedGain)} ({metrics.unrealizedPct.toFixed(1)}%)
                  </span>
                </div>
                <p className="mt-2 text-sm text-secondary">
                  {metrics.count} {metrics.count === 1 ? "property" : "properties"} · {formatAED(metrics.totalValue)} portfolio value
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {importMessage && (
                  <span
                    role="status"
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] ${
                      importMessage.kind === "ok"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    {importMessage.text}
                  </span>
                )}
                <button
                  onClick={handleImport}
                  className="rounded-lg border border-app bg-app-elevated px-3.5 py-2 text-xs font-medium text-secondary transition hover:border-tool-accent hover:text-app"
                >
                  Import
                </button>
                <button
                  onClick={handleExport}
                  className="rounded-lg border border-app bg-app-elevated px-3.5 py-2 text-xs font-medium text-secondary transition hover:border-tool-accent hover:text-app"
                >
                  Export
                </button>
                <button
                  onClick={openForm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                >
                  <span className="text-base leading-none">+</span>
                  Add Property
                </button>
              </div>
            </div>
          </header>

          {/* ── Stat tiles ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            {[
              {
                label: "Annual Cash Flow",
                value: formatAED(metrics.netMonthlyCashFlow * 12),
                sub: formatAED(metrics.netMonthlyCashFlow) + "/mo",
                positive: metrics.netMonthlyCashFlow >= 0,
              },
              {
                label: "Blended Yield",
                value: formatPercent(metrics.portfolioYield),
                sub: "gross on cost",
                positive: metrics.portfolioYield > 0,
              },
              {
                label: "Best Performer",
                value: bp ? formatPercent(bp.yield) : "—",
                sub: bp ? bp.name : "no properties",
                positive: true,
              },
              {
                label: "Monthly Income",
                value: formatAED(metrics.totalMonthlyRental),
                sub: formatAED(Math.round(metrics.totalMonthlyExpenses)) + " expenses",
                positive: true,
              },
            ].map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease }}
                className="relative overflow-hidden rounded-xl border border-app bg-app-elevated p-4"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tool-accent/40 to-transparent" />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted font-mono">{k.label}</p>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-mono font-medium ${
                      k.positive ? "bg-tool-accent-soft text-tool-accent" : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {k.positive ? "↑" : "↓"}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-app font-mono tabular-nums">
                  {k.value}
                </p>
                <p className="mt-0.5 text-xs text-muted font-mono">{k.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {properties.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease }}
              className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-3"
            >
              {/* Allocation donut card */}
              <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-app">Allocation</h2>
                    <p className="text-[10px] text-muted font-mono uppercase tracking-wider mt-0.5">
                      By {allocationView}
                    </p>
                  </div>
                  <div className="flex gap-0.5 rounded-lg bg-app p-0.5 border border-app">
                    {(["area", "type", "status"] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setAllocationView(view)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition ${
                          allocationView === view
                            ? "bg-tool-accent-soft text-tool-accent"
                            : "text-muted hover:text-secondary"
                        }`}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <canvas ref={donutCanvasRef} className="shrink-0" />
                </div>

                <div className="mt-4 space-y-1.5 max-h-44 overflow-y-auto">
                  {allocationData.slice(0, 6).map((item, i) => {
                    const alpha = Math.max(0.35, 1 - i * 0.12);
                    return (
                      <div key={item.label} className="flex items-center gap-2 text-xs">
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                        />
                        <span className="truncate text-secondary">{item.label}</span>
                        <span className="ml-auto font-mono tabular-nums text-muted">
                          {((item.value / totalAlloc) * 100).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                  {allocationData.length > 6 && (
                    <p className="text-[10px] text-muted font-mono pt-1">
                      + {allocationData.length - 6} more
                    </p>
                  )}
                </div>
              </div>

              {/* Performance chart card */}
              <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated p-5 lg:col-span-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-app">Performance</h2>
                    <p className="text-[10px] text-muted font-mono uppercase tracking-wider mt-0.5">
                      Cumulative value over time
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-3 bg-tool-accent" />
                      Value
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0 w-3 border-t border-dashed border-app-strong" />
                      Cost
                    </span>
                  </div>
                </div>
                <div className="flex justify-center overflow-x-auto">
                  <canvas ref={performanceCanvasRef} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Properties grid (cards) ── */}
          {properties.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease }}
              className="mt-4"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <h2 className="text-sm font-semibold text-app">Holdings</h2>
                  <p className="text-[10px] text-muted font-mono uppercase tracking-wider mt-0.5">
                    {properties.length} {properties.length === 1 ? "position" : "positions"}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted">
                  <span>Sort:</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="bg-app-elevated border border-app rounded px-1.5 py-0.5 text-[10px] text-secondary focus:outline-none focus:border-tool-accent"
                  >
                    <option value="name">Name</option>
                    <option value="currentValue">Value</option>
                    <option value="gainLoss">Gain</option>
                    <option value="netCashFlow">Net CF</option>
                    <option value="yield">Yield</option>
                  </select>
                  <button
                    onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                    className="rounded border border-app bg-app-elevated px-1.5 py-0.5 text-tool-accent hover:border-tool-accent transition"
                  >
                    {sortDir === "asc" ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedProperties.map((p) => {
                  const expense = (p.annualServiceCharge / 12) + (p.annualMaintenance / 12) + (p.hasMortgage ? p.monthlyMortgage : 0);
                  const netCF = p.monthlyRental - expense;
                  const gain = p.currentValue - p.purchasePrice;
                  const gainPct = p.purchasePrice > 0 ? (gain / p.purchasePrice) * 100 : 0;
                  const yieldPct = p.purchasePrice > 0 ? (p.monthlyRental * 12) / p.purchasePrice * 100 : 0;
                  const statusTone = STATUS_TONE[p.status] || "neutral";

                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group relative overflow-hidden rounded-xl border border-app bg-app-elevated p-4 transition hover:ring-2 hover:ring-tool-accent hover:border-tool-accent"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-app truncate">{p.name}</h3>
                          <p className="text-[11px] text-muted truncate">{p.area} · {p.type}</p>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono font-medium uppercase tracking-wider ring-1 ${
                            statusTone === "tool"
                              ? "bg-tool-accent-soft text-tool-accent ring-tool-accent/30"
                              : statusTone === "amber"
                              ? "bg-amber-500/10 text-amber-500 ring-amber-500/30"
                              : statusTone === "blue"
                              ? "bg-blue-500/10 text-blue-500 ring-blue-500/30"
                              : "bg-app text-muted ring-app"
                          }`}
                        >
                          <span className={`h-1 w-1 rounded-full ${
                            statusTone === "tool" ? "bg-tool-accent" :
                            statusTone === "amber" ? "bg-amber-500" :
                            statusTone === "blue" ? "bg-blue-500" : "bg-current"
                          }`} />
                          {p.status}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xl font-semibold text-app font-mono tabular-nums">
                          {formatAED(p.currentValue)}
                        </span>
                        <span className={`text-xs font-mono tabular-nums font-medium ${gain >= 0 ? "text-tool-accent" : "text-red-500"}`}>
                          {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3 pt-2 border-t border-app">
                        <div>
                          <p className="text-[9px] text-muted font-mono uppercase tracking-wider mb-0.5">Net CF</p>
                          <p className={`text-xs font-semibold font-mono tabular-nums ${netCF >= 0 ? "text-tool-accent" : "text-red-500"}`}>
                            {formatAED(Math.round(netCF))}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted font-mono uppercase tracking-wider mb-0.5">Yield</p>
                          <p className="text-xs font-semibold text-secondary font-mono tabular-nums">
                            {formatPercent(yieldPct)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted font-mono uppercase tracking-wider mb-0.5">Cost</p>
                          <p className="text-xs font-semibold text-secondary font-mono tabular-nums">
                            {formatAED(p.purchasePrice)}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => handleEdit(p)}
                          className="flex-1 rounded-md bg-tool-accent-soft px-2 py-1 text-[10px] font-medium text-tool-accent hover:opacity-80 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="flex-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-500/20 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Holdings table fallback (sortable) — desktop */}
              <div className="mt-4 hidden lg:block overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-app bg-app">
                        {([
                          ["name", "Property"], ["area", "Area"], ["type", "Type"],
                          ["purchasePrice", "Cost"], ["currentValue", "Value"],
                          ["gainLoss", "Gain"], ["monthlyIncome", "Income"],
                          ["monthlyExpense", "Expenses"], ["netCashFlow", "Net CF"],
                          ["yield", "Yield"],
                        ] as [SortKey, string][]).map(([key, label]) => (
                          <th
                            key={key}
                            onClick={() => handleSort(key)}
                            className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold uppercase tracking-wider cursor-pointer whitespace-nowrap select-none text-muted hover:text-tool-accent transition"
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {sortKey === key && (
                                <span className="text-tool-accent">{sortDir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </span>
                          </th>
                        ))}
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProperties.map((p) => {
                        const expense = (p.annualServiceCharge / 12) + (p.annualMaintenance / 12) + (p.hasMortgage ? p.monthlyMortgage : 0);
                        const netCF = p.monthlyRental - expense;
                        const gain = p.currentValue - p.purchasePrice;
                        const yieldPct = p.purchasePrice > 0 ? (p.monthlyRental * 12) / p.purchasePrice * 100 : 0;
                        return (
                          <tr key={p.id} className="group border-b border-app last:border-b-0 transition hover:bg-tool-accent-soft">
                            <td className="px-3 py-2.5 font-medium text-app whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                                {p.name}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-secondary whitespace-nowrap">{p.area}</td>
                            <td className="px-3 py-2.5 text-secondary">{p.type}</td>
                            <td className="px-3 py-2.5 text-secondary font-mono tabular-nums whitespace-nowrap">{formatAED(p.purchasePrice)}</td>
                            <td className="px-3 py-2.5 font-medium text-app font-mono tabular-nums whitespace-nowrap">{formatAED(p.currentValue)}</td>
                            <td className={`px-3 py-2.5 font-mono tabular-nums whitespace-nowrap ${gain >= 0 ? "text-tool-accent" : "text-red-500"}`}>{gain >= 0 ? "+" : ""}{formatAED(gain)}</td>
                            <td className="px-3 py-2.5 text-secondary font-mono tabular-nums whitespace-nowrap">{formatAED(p.monthlyRental)}</td>
                            <td className="px-3 py-2.5 text-secondary font-mono tabular-nums whitespace-nowrap">{formatAED(Math.round(expense))}</td>
                            <td className={`px-3 py-2.5 font-mono tabular-nums whitespace-nowrap font-medium ${netCF >= 0 ? "text-tool-accent" : "text-red-500"}`}>{formatAED(Math.round(netCF))}</td>
                            <td className="px-3 py-2.5 font-mono tabular-nums text-secondary">{formatPercent(yieldPct)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
                                <button onClick={() => handleEdit(p)} className="text-xs text-tool-accent hover:underline">Edit</button>
                                <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-tool-accent-soft font-semibold">
                        <td className="px-3 py-2.5 text-app">Total</td>
                        <td />
                        <td />
                        <td className="px-3 py-2.5 text-app font-mono tabular-nums whitespace-nowrap">{formatAED(metrics.totalInvested)}</td>
                        <td className="px-3 py-2.5 text-app font-mono tabular-nums whitespace-nowrap">{formatAED(metrics.totalValue)}</td>
                        <td className={`px-3 py-2.5 font-mono tabular-nums whitespace-nowrap ${metrics.unrealizedGain >= 0 ? "text-tool-accent" : "text-red-500"}`}>{formatAED(metrics.unrealizedGain)}</td>
                        <td className="px-3 py-2.5 text-app font-mono tabular-nums whitespace-nowrap">{formatAED(metrics.totalMonthlyRental)}</td>
                        <td className="px-3 py-2.5 text-app font-mono tabular-nums whitespace-nowrap">{formatAED(Math.round(metrics.totalMonthlyExpenses))}</td>
                        <td className={`px-3 py-2.5 font-mono tabular-nums whitespace-nowrap ${metrics.netMonthlyCashFlow >= 0 ? "text-tool-accent" : "text-red-500"}`}>{formatAED(Math.round(metrics.netMonthlyCashFlow))}</td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-app">{formatPercent(metrics.portfolioYield)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Empty state ── */}
          {properties.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4, ease }}
              className="mt-6"
            >
              <div className="rounded-xl border border-dashed border-tool-accent/40 bg-tool-accent-soft p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tool-accent/20">
                  <svg className="h-6 w-6 text-tool-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4M4 10v10a1 1 0 001 1h14a1 1 0 001-1V10" />
                  </svg>
                </div>
                <p className="mt-3 text-lg font-semibold text-app">Your portfolio is empty.</p>
                <p className="mt-1 text-sm text-secondary">
                  Add your first property to start tracking yield, equity, and cash flow.
                </p>
                <button
                  onClick={openForm}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-tool-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                >
                  + Add First Property
                </button>
              </div>
            </motion.div>
          )}

          {/* Tool Recommendations — only when not framed */}
          {!isFramed && (
            <div className="mt-12">
              <ToolRecommendations slug="portfolio-tracker" />
            </div>
          )}
        </section>

        {/* ── Form drawer (slides in from bottom-right, never navigates) ── */}
        <AnimatePresence>
          {showForm && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={closeForm}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              />
              <motion.aside
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{ duration: 0.3, ease }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-app-elevated border-l border-app shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-app bg-app-elevated/95 backdrop-blur px-5 py-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-tool-accent">
                      {editingId ? "Edit" : "New"}
                    </p>
                    <h3 className="text-lg font-semibold text-app">
                      {editingId ? "Edit Property" : "Add Property"}
                    </h3>
                  </div>
                  <button
                    onClick={closeForm}
                    className="rounded-md p-1.5 text-muted hover:bg-app hover:text-app transition"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Identity */}
                  <fieldset className="space-y-3">
                    <legend className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1">Identity</legend>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Property Name</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Marina Apt 1502"
                        className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Area</label>
                        <select
                          value={form.area}
                          onChange={(e) => setForm({ ...form, area: e.target.value })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        >
                          {DUBAI_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Type</label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm({ ...form, type: e.target.value })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        >
                          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </fieldset>

                  {/* Valuation */}
                  <fieldset className="space-y-3">
                    <legend className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1">Valuation</legend>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Purchase Price</label>
                        <input
                          type="number"
                          value={form.purchasePrice || ""}
                          onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Purchase Date</label>
                        <input
                          type="month"
                          value={form.purchaseDate}
                          onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Current Value (AED)</label>
                      <input
                        type="number"
                        value={form.currentValue || ""}
                        onChange={(e) => setForm({ ...form, currentValue: Number(e.target.value) })}
                        className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                      />
                    </div>
                  </fieldset>

                  {/* Income & expenses */}
                  <fieldset className="space-y-3">
                    <legend className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1">Income & Expenses</legend>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Monthly Rental (AED)</label>
                      <input
                        type="number"
                        value={form.monthlyRental || ""}
                        onChange={(e) => setForm({ ...form, monthlyRental: Number(e.target.value) })}
                        className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Annual Service Charge</label>
                        <input
                          type="number"
                          value={form.annualServiceCharge || ""}
                          onChange={(e) => setForm({ ...form, annualServiceCharge: Number(e.target.value) })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Annual Maintenance</label>
                        <input
                          type="number"
                          value={form.annualMaintenance || ""}
                          onChange={(e) => setForm({ ...form, annualMaintenance: Number(e.target.value) })}
                          className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                        />
                      </div>
                    </div>
                  </fieldset>

                  {/* Status & mortgage */}
                  <fieldset className="space-y-3">
                    <legend className="text-[10px] uppercase tracking-[0.2em] text-muted font-mono mb-1">Status & Mortgage</legend>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={form.hasMortgage}
                        onChange={(e) => setForm({ ...form, hasMortgage: e.target.checked })}
                        className="rounded accent-emerald-500"
                      />
                      Has Mortgage
                    </label>
                    {form.hasMortgage && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Monthly Payment</label>
                          <input
                            type="number"
                            value={form.monthlyMortgage || ""}
                            onChange={(e) => setForm({ ...form, monthlyMortgage: Number(e.target.value) })}
                            className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider text-secondary mb-1.5">Outstanding</label>
                          <input
                            type="number"
                            value={form.outstandingBalance || ""}
                            onChange={(e) => setForm({ ...form, outstandingBalance: Number(e.target.value) })}
                            className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app font-mono tabular-nums outline-none transition focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                          />
                        </div>
                      </div>
                    )}
                  </fieldset>
                </div>

                <div className="sticky bottom-0 flex items-center gap-2 border-t border-app bg-app-elevated/95 backdrop-blur px-5 py-3">
                  <button
                    onClick={closeForm}
                    className="rounded-lg border border-app bg-app px-4 py-2 text-sm text-secondary hover:text-app transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!form.name || form.purchasePrice <= 0}
                    className="ml-auto rounded-lg bg-tool-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editingId ? "Update" : "Add"} Property
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </AuthGate>
  );
}
