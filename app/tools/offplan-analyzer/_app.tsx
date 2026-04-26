"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Off-Plan Payment Analyzer — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Inside-the-Window variant of `/tools/offplan-analyzer`. The standalone
   page (page.tsx) stays for direct visits / SEO / sharing. This file is
   mounted by the desktop's Window component when the user opens the tool
   from the workspace.

   Differences vs page.tsx:
     - No <AuthGate> (workspace handles auth at the shell level).
     - No frame=1 / macOS chrome / Suspense+useSearchParams (Window provides
       its own chrome and passes intent via NativeAppProps).
     - No PageHeader / back-links (workspace dock handles discovery).
     - No <ToolRecommendations> at the foot.
     - Layout collapses based on the live window width, not the viewport.

   All NPV / IRR / payment-plan math, hooks, and feature surface are
   preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import { useCanvasTone } from "@/lib/useCanvasTone";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ─── Types ─── */
interface Milestone {
  id: string;
  description: string;
  percentage: number;
  month: number;
}

interface PlanTemplate {
  name: string;
  key: string;
  milestones: (constructionMonths: number) => Milestone[];
}

interface PlanConfig {
  id: string;
  label: string;
  templateKey: string;
  propertyPrice: string;
  constructionMonths: string;
  handoverDate: string;
  appreciation: string;
  altReturn: string;
  milestones: Milestone[];
}

interface ScheduleRow {
  month: number;
  description: string;
  amount: number;
  cumulative: number;
  balance: number;
}

interface PlanResult {
  label: string;
  propertyPrice: number;
  schedule: ScheduleRow[];
  npv: number;
  opportunityCost: number;
  trueCost: number;
  effectivePremium: number;
  handoverValue: number;
  paperProfit: number;
  irr: number;
  totalDuringConstruction: number;
  handoverPayment: number;
  postHandover: number;
  totalPaid: number;
  constructionMonths: number;
}

let milestoneIdCounter = 0;
function mkId() {
  return `ms-${++milestoneIdCounter}`;
}

/* ─── Plan Templates ─── */
const TEMPLATES: PlanTemplate[] = [
  {
    name: "Standard 60/40",
    key: "60-40",
    milestones: (cm) => {
      const steps = Math.max(1, Math.floor(cm / 6));
      const perStep = 60 / steps;
      const ms: Milestone[] = [];
      for (let i = 0; i < steps; i++) {
        ms.push({ id: mkId(), description: `Construction ${i + 1}`, percentage: Math.round(perStep * 10) / 10, month: Math.round(((i + 1) / steps) * cm) });
      }
      ms[0].description = "Booking + SPA";
      ms.push({ id: mkId(), description: "Handover", percentage: 40, month: cm });
      return ms;
    },
  },
  {
    name: "Standard 80/20",
    key: "80-20",
    milestones: (cm) => {
      const steps = Math.max(1, Math.floor(cm / 4));
      const perStep = 80 / steps;
      const ms: Milestone[] = [];
      for (let i = 0; i < steps; i++) {
        ms.push({ id: mkId(), description: `Construction ${i + 1}`, percentage: Math.round(perStep * 10) / 10, month: Math.round(((i + 1) / steps) * cm) });
      }
      ms[0].description = "Booking + SPA";
      ms.push({ id: mkId(), description: "Handover", percentage: 20, month: cm });
      return ms;
    },
  },
  {
    name: "Emaar-style",
    key: "emaar",
    milestones: (cm) => {
      const ms: Milestone[] = [
        { id: mkId(), description: "Booking", percentage: 10, month: 0 },
        { id: mkId(), description: "SPA Signing", percentage: 10, month: 1 },
      ];
      const remaining = 40; // 40% during construction in 5% steps every 3 months
      const steps = Math.floor((cm - 3) / 3);
      const actualSteps = Math.min(steps, remaining / 5);
      for (let i = 0; i < actualSteps; i++) {
        ms.push({ id: mkId(), description: `Construction ${i + 1}`, percentage: 5, month: 3 + i * 3 });
      }
      const constructionPaid = 20 + actualSteps * 5;
      const leftover = 60 - constructionPaid;
      if (leftover > 0) {
        ms.push({ id: mkId(), description: "Pre-handover", percentage: leftover, month: cm - 1 });
      }
      ms.push({ id: mkId(), description: "Handover", percentage: 40, month: cm });
      return ms;
    },
  },
  {
    name: "DAMAC 1% Monthly",
    key: "damac-1",
    milestones: (cm) => {
      const ms: Milestone[] = [];
      const monthlySteps = Math.min(60, cm);
      for (let i = 0; i < monthlySteps; i++) {
        ms.push({ id: mkId(), description: `Month ${i + 1}`, percentage: 1, month: i });
      }
      const paid = monthlySteps;
      ms.push({ id: mkId(), description: "Handover", percentage: 100 - paid, month: cm });
      return ms;
    },
  },
  {
    name: "Post-handover 60/40",
    key: "post-60-40",
    milestones: (cm) => {
      const ms: Milestone[] = [
        { id: mkId(), description: "Booking", percentage: 10, month: 0 },
        { id: mkId(), description: "Construction", percentage: 10, month: Math.round(cm * 0.5) },
        { id: mkId(), description: "Handover", percentage: 40, month: cm },
      ];
      for (let i = 1; i <= 6; i++) {
        ms.push({ id: mkId(), description: `Post-handover ${i}`, percentage: Math.round((40 / 6) * 10) / 10, month: cm + i * 6 });
      }
      const sum = ms.reduce((s, m) => s + m.percentage, 0);
      if (Math.abs(sum - 100) > 0.1) {
        ms[ms.length - 1].percentage += Math.round((100 - sum) * 10) / 10;
      }
      return ms;
    },
  },
  {
    name: "Post-handover 70/30",
    key: "post-70-30",
    milestones: (cm) => {
      const ms: Milestone[] = [
        { id: mkId(), description: "Booking", percentage: 10, month: 0 },
        { id: mkId(), description: "During construction", percentage: 20, month: Math.round(cm * 0.5) },
      ];
      for (let i = 1; i <= 12; i++) {
        ms.push({ id: mkId(), description: `Post ${i}`, percentage: Math.round((70 / 12) * 10) / 10, month: cm + i * 3 });
      }
      const sum = ms.reduce((s, m) => s + m.percentage, 0);
      if (Math.abs(sum - 100) > 0.1) {
        ms[ms.length - 1].percentage += Math.round((100 - sum) * 10) / 10;
      }
      return ms;
    },
  },
  {
    name: "Custom",
    key: "custom",
    milestones: () => [
      { id: mkId(), description: "Booking", percentage: 20, month: 0 },
      { id: mkId(), description: "Handover", percentage: 80, month: 24 },
    ],
  },
];

/* ─── Financial Helpers ─── */
function calcNPV(cashflows: { month: number; amount: number }[], annualRate: number): number {
  const r = annualRate / 100 / 12;
  return cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + r, cf.month), 0);
}

function calcOpportunityCost(cashflows: { month: number; amount: number }[], annualRate: number, totalMonths: number): number {
  const r = annualRate / 100 / 12;
  return cashflows.reduce((sum, cf) => {
    const monthsRemaining = totalMonths - cf.month;
    return sum + cf.amount * (Math.pow(1 + r, Math.max(0, monthsRemaining)) - 1);
  }, 0);
}

function calcIRR(cashflows: { month: number; amount: number }[], finalValue: number, finalMonth: number): number {
  let guess = 0.005;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (const cf of cashflows) {
      npv += -cf.amount / Math.pow(1 + guess, cf.month);
      dnpv += cf.month * cf.amount / Math.pow(1 + guess, cf.month + 1);
    }
    npv += finalValue / Math.pow(1 + guess, finalMonth);
    dnpv += -finalMonth * finalValue / Math.pow(1 + guess, finalMonth + 1);
    const next = guess - npv / dnpv;
    if (Math.abs(next - guess) < 1e-10) {
      return (Math.pow(1 + next, 12) - 1) * 100;
    }
    guess = next;
    if (!isFinite(guess) || guess < -0.99) guess = 0.001;
  }
  return 0;
}

function computePlan(cfg: PlanConfig): PlanResult | null {
  const price = Number(cfg.propertyPrice);
  const cm = Number(cfg.constructionMonths) || 24;
  const appreciation = Number(cfg.appreciation) / 100;
  const altReturn = Number(cfg.altReturn) || 5;
  if (!price || price <= 0) return null;

  const milestones = cfg.milestones.filter((m) => m.percentage > 0);
  if (milestones.length === 0) return null;

  const cashflows: { month: number; amount: number }[] = [];
  const schedule: ScheduleRow[] = [];
  let cumulative = 0;

  for (const ms of milestones) {
    const amount = (ms.percentage / 100) * price;
    cumulative += amount;
    cashflows.push({ month: ms.month, amount });
    schedule.push({
      month: ms.month,
      description: ms.description,
      amount,
      cumulative,
      balance: price - cumulative,
    });
  }

  const totalPaid = cumulative;
  const lastMonth = Math.max(...milestones.map((m) => m.month), cm);

  const npv = calcNPV(cashflows, altReturn);
  const opportunityCost = calcOpportunityCost(cashflows, altReturn, lastMonth);
  const trueCost = npv + opportunityCost;
  const effectivePremium = ((trueCost - price) / price) * 100;
  const yearsToHandover = cm / 12;
  const handoverValue = price * Math.pow(1 + appreciation, yearsToHandover);
  const paperProfit = handoverValue - totalPaid;
  const irr = calcIRR(cashflows, handoverValue, cm);

  const totalDuringConstruction = cashflows.filter((cf) => cf.month < cm).reduce((s, cf) => s + cf.amount, 0);
  const handoverPayment = cashflows.filter((cf) => cf.month === cm).reduce((s, cf) => s + cf.amount, 0);
  const postHandover = cashflows.filter((cf) => cf.month > cm).reduce((s, cf) => s + cf.amount, 0);

  return {
    label: cfg.label,
    propertyPrice: price,
    schedule,
    npv,
    opportunityCost,
    trueCost,
    effectivePremium,
    handoverValue,
    paperProfit,
    irr,
    totalDuringConstruction,
    handoverPayment,
    postHandover,
    totalPaid,
    constructionMonths: cm,
  };
}

/* ─── Create Plan Config ─── */
let planIdCounter = 0;
function createPlan(label: string): PlanConfig {
  return {
    id: `plan-${++planIdCounter}`,
    label,
    templateKey: "60-40",
    propertyPrice: "",
    constructionMonths: "36",
    handoverDate: "",
    appreciation: "8",
    altReturn: "5",
    milestones: TEMPLATES[0].milestones(36),
  };
}

/* ─── Formatting ─── */
function fmt(n: number) {
  return `AED ${Math.round(n).toLocaleString()}`;
}
function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
  return `AED ${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/* ─── Risk Flag detection ─── */
type RiskTone = "accent" | "amber" | "rose";
interface RiskFlag {
  label: string;
  tone: RiskTone;
}

function getRiskFlags(plan: PlanConfig, result: PlanResult): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const frontloaded = result.schedule.filter((s) => s.month <= 6).reduce((sum, s) => sum + s.amount, 0);
  const frontloadPct = (frontloaded / result.propertyPrice) * 100;

  if (frontloadPct > 50) flags.push({ label: `Frontloaded ${frontloadPct.toFixed(0)}% in 6mo`, tone: "rose" });
  else if (frontloadPct > 30) flags.push({ label: `${frontloadPct.toFixed(0)}% paid in 6mo`, tone: "amber" });
  else flags.push({ label: `Cash-friendly entry`, tone: "accent" });

  if (result.effectivePremium > 5) flags.push({ label: `True cost +${result.effectivePremium.toFixed(0)}% over sticker`, tone: "rose" });
  else if (result.effectivePremium > 0) flags.push({ label: `Slight time-value drag`, tone: "amber" });
  else flags.push({ label: `Time-value advantage`, tone: "accent" });

  const cm = Number(plan.constructionMonths);
  if (cm > 48) flags.push({ label: `Long ${cm}mo build window`, tone: "amber" });
  else if (cm < 18) flags.push({ label: `Tight ${cm}mo timeline`, tone: "amber" });
  else flags.push({ label: `${cm}mo standard handover`, tone: "accent" });

  if (result.irr < 8) flags.push({ label: `IRR ${result.irr.toFixed(1)}% — weak`, tone: "rose" });
  else if (result.irr < 15) flags.push({ label: `IRR ${result.irr.toFixed(1)}% — moderate`, tone: "amber" });
  else flags.push({ label: `IRR ${result.irr.toFixed(1)}% — strong`, tone: "accent" });

  return flags;
}

/* ─── Developer Trust Dial ─── */
function getDeveloperTrustScore(templateKey: string): number {
  const base: Record<string, number> = {
    "emaar": 92,
    "damac-1": 78,
    "60-40": 80,
    "80-20": 70,
    "post-60-40": 75,
    "post-70-30": 72,
    "custom": 65,
  };
  return base[templateKey] || 70;
}

function TrustDial({ score }: { score: number }) {
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
      const cy = H / 2 + 8;
      const radius = Math.min(cx, cy) - 14;
      const lineWidth = 10;

      // Read the resolved --tool-accent from CSS so the dial inherits the theme.
      const accent = getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() || "#10b981";

      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI * 0.75, Math.PI * 2.25);
      ctx.strokeStyle = `rgba(${tone},0.10)`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();

      const pct = Math.max(0, Math.min(1, score / 100));
      const startA = Math.PI * 0.75;
      const endA = startA + pct * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startA, endA);
      ctx.strokeStyle = accent;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.font = "600 26px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(score)}`, cx, cy - 2);

      ctx.fillStyle = `rgba(${tone},0.45)`;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("/ 100", cx, cy + 18);
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [score, tone]);

  return (
    <div ref={containerRef} className="w-full h-[140px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ─── Cumulative Payment Area Chart ─── */
function CumulativeChart({ results }: { results: PlanResult[] }) {
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

      const pad = { top: 30, right: 20, bottom: 50, left: 70 };
      const chartW = W - pad.left - pad.right;
      const chartH = H - pad.top - pad.bottom;

      const accent = getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() || "#10b981";
      const accentSoft = `rgba(${tone},0.4)`;
      const colors = [accent, accentSoft, `rgba(${tone},0.65)`];
      const fills = [
        getComputedStyle(canvas).getPropertyValue("--tool-accent-soft").trim() || "rgba(16,185,129,0.14)",
        `rgba(${tone},0.06)`,
        `rgba(${tone},0.10)`,
      ];

      const maxMonth = Math.max(...results.map((r) => Math.max(...r.schedule.map((s) => s.month))));
      const maxVal = Math.max(...results.map((r) => Math.max(...r.schedule.map((s) => s.cumulative))));
      if (maxMonth === 0 || maxVal === 0) return;

      ctx.strokeStyle = `rgba(${tone},0.08)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = `rgba(${tone},0.4)`;
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const val = (maxVal * i) / 4;
        ctx.fillText(fmtShort(val), pad.left - 8, y);
      }

      ctx.fillStyle = `rgba(${tone},0.4)`;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xSteps = Math.min(6, maxMonth);
      for (let i = 0; i <= xSteps; i++) {
        const month = Math.round((maxMonth * i) / xSteps);
        const x = pad.left + (month / maxMonth) * chartW;
        ctx.fillText(`M${month}`, x, pad.top + chartH + 8);
      }

      results.forEach((res, ri) => {
        const points = [{ x: pad.left, y: pad.top + chartH }];
        for (const s of res.schedule) {
          const x = pad.left + (s.month / maxMonth) * chartW;
          const y = pad.top + chartH - (s.cumulative / maxVal) * chartH;
          points.push({ x, y });
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
        ctx.closePath();
        ctx.fillStyle = fills[ri % fills.length];
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.strokeStyle = colors[ri % colors.length];
        ctx.lineWidth = 2;
        ctx.stroke();

        for (let i = 1; i < points.length; i++) {
          ctx.beginPath();
          ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2);
          ctx.fillStyle = colors[ri % colors.length];
          ctx.fill();
        }
      });

      if (results.length > 1) {
        let lx = pad.left;
        results.forEach((res, ri) => {
          ctx.fillStyle = colors[ri % colors.length];
          ctx.fillRect(lx, pad.top - 20, 12, 3);
          ctx.fillStyle = `rgba(${tone},0.55)`;
          ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(res.label, lx + 16, pad.top - 18);
          lx += ctx.measureText(res.label).width + 36;
        });
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [results, tone]);

  return (
    <div ref={containerRef} className="w-full h-[280px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ─── Value vs Payments Dual Line Chart ─── */
function ValueVsPaymentsChart({ result }: { result: PlanResult }) {
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

      const pad = { top: 30, right: 20, bottom: 50, left: 70 };
      const chartW = W - pad.left - pad.right;
      const chartH = H - pad.top - pad.bottom;

      const accent = getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() || "#10b981";

      const appreciation = Number(result.handoverValue / result.propertyPrice);
      const cm = result.constructionMonths;
      const lastMonth = Math.max(cm, ...result.schedule.map((s) => s.month));

      const valuePoints: { month: number; value: number }[] = [];
      for (let m = 0; m <= lastMonth; m += Math.max(1, Math.round(lastMonth / 30))) {
        const yrs = m / 12;
        valuePoints.push({ month: m, value: result.propertyPrice * Math.pow(appreciation, yrs / (cm / 12)) });
      }
      valuePoints.push({ month: lastMonth, value: result.propertyPrice * Math.pow(appreciation, lastMonth / cm) });

      const payPoints = [{ month: 0, value: 0 }, ...result.schedule.map((s) => ({ month: s.month, value: s.cumulative }))];

      const maxVal = Math.max(...valuePoints.map((p) => p.value), ...payPoints.map((p) => p.value)) * 1.1;
      const maxMonth = lastMonth;
      if (maxMonth === 0 || maxVal === 0) return;

      ctx.strokeStyle = `rgba(${tone},0.08)`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${tone},0.4)`;
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtShort((maxVal * i) / 4), pad.left - 8, y);
      }

      ctx.fillStyle = `rgba(${tone},0.4)`;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xSteps = Math.min(6, maxMonth);
      for (let i = 0; i <= xSteps; i++) {
        const month = Math.round((maxMonth * i) / xSteps);
        const x = pad.left + (month / maxMonth) * chartW;
        ctx.fillText(`M${month}`, x, pad.top + chartH + 8);
      }

      // Property value line — accent
      ctx.beginPath();
      valuePoints.forEach((p, i) => {
        const x = pad.left + (p.month / maxMonth) * chartW;
        const y = pad.top + chartH - (p.value / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Payments line — neutral tone
      ctx.beginPath();
      payPoints.forEach((p, i) => {
        const x = pad.left + (p.month / maxMonth) * chartW;
        const y = pad.top + chartH - (p.value / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = `rgba(${tone},0.55)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (cm <= maxMonth) {
        const hx = pad.left + (cm / maxMonth) * chartW;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `rgba(${tone},0.20)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = `rgba(${tone},0.45)`;
        ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Handover", hx, pad.top + chartH + 24);
      }

      const legends = [
        { label: "Property Value", color: accent },
        { label: "Cumulative Paid", color: `rgba(${tone},0.55)` },
      ];
      let lx = pad.left;
      legends.forEach((l) => {
        ctx.fillStyle = l.color;
        ctx.fillRect(lx, pad.top - 20, 12, 3);
        ctx.fillStyle = `rgba(${tone},0.55)`;
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(l.label, lx + 16, pad.top - 18);
        lx += ctx.measureText(l.label).width + 36;
      });
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [result, tone]);

  return (
    <div ref={containerRef} className="w-full h-[280px]">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

/* ─── Risk chip ─── */
function RiskChip({ flag }: { flag: RiskFlag }) {
  const styles: Record<RiskTone, string> = {
    accent: "bg-tool-accent-soft text-tool-accent border border-tool-accent/30",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.08em] ${styles[flag.tone]}`}>
      {flag.label}
    </span>
  );
}

/* ─── Payment Plan Timeline (horizontal rail) ─── */
interface TimelineRow extends ScheduleRow {
  percentage: number;
}

function PaymentTimeline({ schedule, constructionMonths }: { schedule: TimelineRow[]; constructionMonths: number }) {
  const lastMonth = Math.max(constructionMonths, ...schedule.map((s) => s.month));
  if (lastMonth === 0) return null;

  return (
    <div className="relative pt-8 pb-12">
      {/* Rail */}
      <div className="relative h-px bg-app-elevated border-t border-app">
        <div className="absolute inset-y-0 left-0 h-px bg-tool-accent/40" style={{ width: "100%" }} />
        {/* Handover marker */}
        {constructionMonths <= lastMonth && (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${(constructionMonths / lastMonth) * 100}%` }}
          >
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-full mb-1 pb-1">
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted whitespace-nowrap">Handover</span>
            </div>
            <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 h-4 w-px bg-tool-accent/60" />
          </div>
        )}

        {/* Milestone dots */}
        {schedule.map((s, idx) => {
          const left = (s.month / lastMonth) * 100;
          return (
            <motion.div
              key={idx}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.04, duration: 0.3, ease }}
              className="absolute top-1/2 -translate-y-1/2 group"
              style={{ left: `${left}%` }}
            >
              <div className="-translate-x-1/2 flex flex-col items-center">
                {/* Dot */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-tool-accent/30 blur-sm" />
                  <div className="relative h-2.5 w-2.5 rounded-full bg-tool-accent ring-2 ring-app" />
                </div>
                {/* % chip below */}
                <div className="mt-2 px-1.5 py-0.5 rounded-md bg-tool-accent-soft text-tool-accent border border-tool-accent/30 text-[9px] font-mono font-semibold tabular-nums">
                  {s.percentage > 0 ? `${s.percentage}%` : "—"}
                </div>
                {/* Hover label */}
                <div className="absolute bottom-full mb-3 hidden group-hover:block px-2 py-1 rounded-md bg-app-elevated border border-app text-[10px] text-app whitespace-nowrap z-10 shadow-card">
                  {s.description} · M{s.month}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="relative mt-8 flex justify-between text-[10px] text-muted font-mono tabular-nums">
        <span>M0</span>
        <span>M{Math.round(lastMonth / 2)}</span>
        <span>M{lastMonth}</span>
      </div>
    </div>
  );
}

/* ─── Re-derive % from amount/price for timeline ─── */
function timelineFromResult(result: PlanResult): TimelineRow[] {
  return result.schedule.map((s) => ({
    ...s,
    percentage: Math.round((s.amount / result.propertyPrice) * 1000) / 10,
  }));
}

type ResultTab = "summary" | "schedule" | "charts" | "compare";

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function OffplanAnalyzerApp(props: NativeAppProps) {
  const { width, initialParams, initialParamsKey } = props;

  /* Width-driven breakpoints — based on the live window inner width, not the
     viewport. Tweaks the plan grid, hero stack, and tab layout. */
  const isWide = width >= 1100;
  const isMid = width >= 760;
  const isNarrow = width < 540;

  const [plans, setPlans] = useState<PlanConfig[]>([createPlan("Plan A")]);
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("summary");
  const xpAwarded = useRef(false);

  const updatePlan = useCallback((id: string, field: keyof PlanConfig, value: unknown) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    if (showResults) setShowResults(false);
  }, [showResults]);

  const setTemplate = useCallback((planId: string, templateKey: string, cm: number) => {
    const tmpl = TEMPLATES.find((t) => t.key === templateKey);
    if (!tmpl) return;
    const milestones = tmpl.milestones(cm);
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, templateKey, milestones } : p)));
    if (showResults) setShowResults(false);
  }, [showResults]);

  const addMilestone = useCallback((planId: string) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        return { ...p, milestones: [...p.milestones, { id: mkId(), description: "New milestone", percentage: 5, month: Number(p.constructionMonths) || 24 }] };
      })
    );
  }, []);

  const removeMilestone = useCallback((planId: string, msId: string) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        return { ...p, milestones: p.milestones.filter((m) => m.id !== msId) };
      })
    );
  }, []);

  const updateMilestone = useCallback((planId: string, msId: string, field: keyof Milestone, value: string | number) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        return { ...p, milestones: p.milestones.map((m) => (m.id === msId ? { ...m, [field]: value } : m)) };
      })
    );
    if (showResults) setShowResults(false);
  }, [showResults]);

  const addPlan = () => {
    if (plans.length >= 3) return;
    const labels = ["Plan A", "Plan B", "Plan C"];
    setPlans((prev) => [...prev, createPlan(labels[prev.length] || `Plan ${prev.length + 1}`)]);
  };

  const removePlan = useCallback((id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    if (showResults) setShowResults(false);
  }, [showResults]);

  /* Hydrate from initialParams when openApp() passes a property/plan context. */
  useEffect(() => {
    if (!initialParams) return;
    setPlans((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const first = { ...next[0] };
      const numericKeys: (keyof PlanConfig)[] = [
        "propertyPrice",
        "constructionMonths",
        "appreciation",
        "altReturn",
        "handoverDate",
      ];
      for (const k of numericKeys) {
        const v = initialParams[k as string];
        if (typeof v === "number") (first[k] as string) = String(v);
        else if (typeof v === "string") (first[k] as string) = v;
      }
      if (typeof initialParams.templateKey === "string") {
        const tmpl = TEMPLATES.find((t) => t.key === initialParams.templateKey);
        if (tmpl) {
          first.templateKey = initialParams.templateKey;
          first.milestones = tmpl.milestones(Number(first.constructionMonths) || 36);
        }
      }
      next[0] = first;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResults(true);
    setActiveResultTab("summary");
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "offplan-analyzer").catch(() => {});
    }
  };

  const results = useMemo(() => {
    if (!showResults) return [];
    return plans.map(computePlan).filter(Boolean) as PlanResult[];
  }, [plans, showResults]);

  const bestPlanIdx = useMemo(() => {
    if (results.length < 2) return -1;
    let best = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].irr > results[best].irr) best = i;
    }
    return best;
  }, [results]);

  const getShareText = useCallback(() => {
    if (results.length === 0) return "";
    const lines = ["Off-Plan Payment Plan Analysis", "via example.com/tools/offplan-analyzer", ""];
    results.forEach((r) => {
      lines.push(`--- ${r.label} ---`);
      lines.push(`Property: ${fmt(r.propertyPrice)}`);
      lines.push(`NPV of payments: ${fmt(r.npv)}`);
      lines.push(`Opportunity cost: ${fmt(r.opportunityCost)}`);
      lines.push(`Expected value at handover: ${fmt(r.handoverValue)}`);
      lines.push(`Paper profit at handover: ${fmt(r.paperProfit)}`);
      lines.push(`IRR: ${r.irr.toFixed(1)}%`);
      lines.push("");
    });
    return lines.join("\n");
  }, [results]);

  const copyBreakdown = useCallback(() => {
    navigator.clipboard.writeText(getShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getShareText]);

  const shareWhatsApp = useCallback(() => {
    const text = getShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [getShareText]);

  // Headline plan = first plan (or best plan when comparing)
  const heroResult = results.length > 0 ? results[bestPlanIdx >= 0 ? bestPlanIdx : 0] : null;
  const heroPlan = heroResult ? plans[bestPlanIdx >= 0 ? bestPlanIdx : 0] : null;
  const trustScore = heroPlan ? getDeveloperTrustScore(heroPlan.templateKey) : 0;
  const riskFlags = heroPlan && heroResult ? getRiskFlags(heroPlan, heroResult) : [];
  const npvIsPositive = heroResult ? heroResult.paperProfit > 0 : true;

  /* Width-driven plan grid — single column when narrow, 2 mid, 3 wide. */
  const planGridCols =
    plans.length === 1
      ? "1fr"
      : isWide
      ? `repeat(${Math.min(plans.length, 3)}, minmax(0,1fr))`
      : isMid
      ? "repeat(2, minmax(0,1fr))"
      : "1fr";

  /* Hero band: 2-col on wide, stacked on narrow. */
  const heroGridCols = isMid ? "1.4fr 1fr" : "1fr";

  return (
    <div
      data-tool-theme="investment"
      data-tool="offplan-analyzer"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      {/* HERO band */}
      {showResults && heroResult && (
        <section className={`${isNarrow ? "px-3 pt-4" : "px-4 sm:px-6 pt-5"}`}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
            className={`relative bg-tool-accent-soft border border-tool-accent/30 rounded-2xl ${isNarrow ? "p-4" : "p-6 sm:p-8"} overflow-hidden`}
          >
            <div aria-hidden className="absolute inset-0 tool-hero opacity-50 pointer-events-none" />
            <div
              className="relative grid gap-6 items-center"
              style={{ gridTemplateColumns: heroGridCols }}
            >
              {/* NPV verdict hero */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                    Paper Profit at Handover
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.15em] text-muted">
                    · {heroResult.label}
                  </span>
                </div>
                <p className={`font-mono ${isNarrow ? "text-4xl" : "text-5xl sm:text-6xl"} font-bold tabular-nums tracking-tight ${npvIsPositive ? "text-tool-accent" : "text-rose-500 dark:text-rose-400"}`}>
                  {npvIsPositive ? "+" : ""}{fmtShort(heroResult.paperProfit)}
                </p>
                <p className="text-sm text-secondary mt-2 font-mono tabular-nums">
                  {fmt(heroResult.totalPaid)} paid in
                  <span className="text-tool-accent mx-1.5">·</span>
                  {fmt(heroResult.handoverValue)} value out
                </p>

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {riskFlags.map((flag, i) => (
                    <RiskChip key={i} flag={flag} />
                  ))}
                </div>
              </div>

              {/* Developer trust dial */}
              <div className="border border-tool-accent/30 rounded-xl bg-app-elevated/40 backdrop-blur-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                    Developer Trust
                  </span>
                  <span className="text-[10px] font-mono text-tool-accent uppercase tracking-[0.15em]">
                    {trustScore >= 85 ? "Tier 1" : trustScore >= 70 ? "Tier 2" : "Tier 3"}
                  </span>
                </div>
                <TrustDial score={trustScore} />
                <p className="text-[10px] text-muted text-center -mt-2">
                  Based on plan template & track record
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {/* Internal tab nav (state buttons, not links) */}
      {showResults && results.length > 0 && (
        <nav className={`${isNarrow ? "px-3 pt-4" : "px-4 sm:px-6 pt-5"}`}>
          <div className="flex gap-1 bg-app-elevated rounded-xl p-1 border border-app overflow-x-auto">
            {([
              { id: "summary", label: "Summary" },
              { id: "schedule", label: "Schedule & Timeline" },
              { id: "charts", label: "Charts" },
              ...(results.length > 1 ? [{ id: "compare" as const, label: "Compare" }] : []),
            ] as const).map((t) => {
              const active = activeResultTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveResultTab(t.id)}
                  className={`flex-1 min-w-[110px] px-4 py-2 rounded-lg text-[12px] font-medium uppercase tracking-[0.08em] transition-colors ${
                    active
                      ? "bg-tool-accent text-white"
                      : "text-secondary hover:text-app hover:bg-surface"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* INPUT FORMS */}
      <section className={`${isNarrow ? "px-3 pt-4 pb-2" : "px-4 sm:px-6 pt-5 pb-2"}`}>
        <form onSubmit={handleCalculate}>
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: planGridCols, maxWidth: plans.length === 1 ? "42rem" : undefined }}
          >
            {plans.map((plan, pi) => {
              const totalPct = plan.milestones.reduce((s, m) => s + m.percentage, 0);
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: pi * 0.08, ease }}
                  className="rounded-2xl border border-app bg-app-elevated p-5"
                >
                  {/* Plan header */}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={plan.label}
                      onChange={(e) => updatePlan(plan.id, "label", e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-b border-app focus:border-tool-accent pb-1 text-[12px] font-semibold uppercase tracking-[0.15em] text-app outline-none transition-colors placeholder:text-muted"
                      placeholder="Plan name"
                    />
                    {plans.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePlan(plan.id)}
                        className="text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Template selector — state buttons */}
                  <div className="mb-4">
                    <label className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                      Payment Plan Template
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEMPLATES.map((tmpl) => {
                        const active = plan.templateKey === tmpl.key;
                        return (
                          <button
                            key={tmpl.key}
                            type="button"
                            onClick={() => setTemplate(plan.id, tmpl.key, Number(plan.constructionMonths) || 36)}
                            className={`px-2.5 py-2 rounded-lg text-[10px] uppercase tracking-[0.08em] font-medium transition-all ${
                              active
                                ? "bg-tool-accent text-white"
                                : "bg-app border border-app text-secondary hover:border-tool-accent/40 hover:text-app"
                            }`}
                          >
                            {tmpl.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                        Property Price (AED)
                      </label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 2000000"
                        value={plan.propertyPrice}
                        onChange={(e) => updatePlan(plan.id, "propertyPrice", e.target.value)}
                        className="w-full rounded-lg bg-app border border-app focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 px-3.5 py-2.5 text-sm font-mono tabular-nums text-app outline-none transition-colors placeholder:text-muted"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                        Construction Period (Months)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 36"
                        value={plan.constructionMonths}
                        onChange={(e) => {
                          updatePlan(plan.id, "constructionMonths", e.target.value);
                          if (plan.templateKey !== "custom") {
                            const cm = Number(e.target.value) || 36;
                            const tmpl = TEMPLATES.find((t) => t.key === plan.templateKey);
                            if (tmpl) {
                              setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, constructionMonths: e.target.value, milestones: tmpl.milestones(cm) } : p)));
                            }
                          }
                        }}
                        className="w-full rounded-lg bg-app border border-app focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 px-3.5 py-2.5 text-sm font-mono tabular-nums text-app outline-none transition-colors placeholder:text-muted"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                        Expected Handover Date
                      </label>
                      <input
                        type="month"
                        value={plan.handoverDate}
                        onChange={(e) => updatePlan(plan.id, "handoverDate", e.target.value)}
                        className="w-full rounded-lg bg-app border border-app focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 px-3.5 py-2.5 text-sm font-mono tabular-nums text-app outline-none transition-colors placeholder:text-muted"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                          Appreciation (%/yr)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="8"
                          value={plan.appreciation}
                          onChange={(e) => updatePlan(plan.id, "appreciation", e.target.value)}
                          className="w-full rounded-lg bg-app border border-app focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 px-3.5 py-2.5 text-sm font-mono tabular-nums text-app outline-none transition-colors placeholder:text-muted"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                          Alt. Return (%/yr)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="5"
                          value={plan.altReturn}
                          onChange={(e) => updatePlan(plan.id, "altReturn", e.target.value)}
                          className="w-full rounded-lg bg-app border border-app focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/20 px-3.5 py-2.5 text-sm font-mono tabular-nums text-app outline-none transition-colors placeholder:text-muted"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Milestone editor */}
                  <div className="mt-4 border-t border-app pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                        Milestones
                        <span className={`ml-2 font-mono ${Math.abs(totalPct - 100) > 0.5 ? "text-rose-500 dark:text-rose-400" : "text-tool-accent"}`}>
                          {totalPct.toFixed(1)}% / 100%
                        </span>
                      </span>
                      {plan.templateKey === "custom" && (
                        <button
                          type="button"
                          onClick={() => addMilestone(plan.id)}
                          className="text-[10px] uppercase tracking-[0.15em] text-tool-accent hover:opacity-80 transition-opacity font-medium"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                    <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                      {plan.milestones.map((ms) => (
                        <div key={ms.id} className="grid grid-cols-[1fr_56px_56px_24px] gap-1.5 items-center">
                          <input
                            type="text"
                            value={ms.description}
                            onChange={(e) => updateMilestone(plan.id, ms.id, "description", e.target.value)}
                            disabled={plan.templateKey !== "custom"}
                            className="rounded-md border border-app bg-app px-2 py-1.5 text-[11px] text-secondary focus:border-tool-accent outline-none transition-colors disabled:opacity-50 placeholder:text-muted"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={ms.percentage}
                            onChange={(e) => updateMilestone(plan.id, ms.id, "percentage", Number(e.target.value))}
                            disabled={plan.templateKey !== "custom"}
                            className="rounded-md border border-app bg-app px-1.5 py-1.5 text-center text-[11px] font-mono tabular-nums text-secondary focus:border-tool-accent outline-none transition-colors disabled:opacity-50"
                            title="Percentage"
                          />
                          <input
                            type="number"
                            value={ms.month}
                            onChange={(e) => updateMilestone(plan.id, ms.id, "month", Number(e.target.value))}
                            disabled={plan.templateKey !== "custom"}
                            className="rounded-md border border-app bg-app px-1.5 py-1.5 text-center text-[11px] font-mono tabular-nums text-secondary focus:border-tool-accent outline-none transition-colors disabled:opacity-50"
                            title="Month"
                          />
                          {plan.templateKey === "custom" && plan.milestones.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeMilestone(plan.id, ms.id)}
                              className="text-center text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-colors text-sm"
                            >
                              ×
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                    </div>
                    {plan.milestones.length > 0 && (
                      <div className="mt-1.5 grid grid-cols-[1fr_56px_56px_24px] gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted font-medium">
                        <span>Description</span>
                        <span className="text-center">%</span>
                        <span className="text-center">Mo.</span>
                        <span />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {plans.length < 3 && (
              <button
                type="button"
                onClick={addPlan}
                className="rounded-full border border-dashed border-app text-secondary hover:border-tool-accent hover:text-tool-accent px-5 py-2.5 text-[11px] uppercase tracking-[0.15em] font-medium transition-colors"
              >
                + Compare another plan
              </button>
            )}
            <button
              type="submit"
              className="flex-1 min-w-[200px] rounded-full bg-tool-accent text-white px-7 py-3 text-[12px] uppercase tracking-[0.15em] font-semibold hover:opacity-90 transition-opacity shadow-card"
            >
              Analyze Payment Plan{plans.length > 1 ? "s" : ""} →
            </button>
          </div>
        </form>
      </section>

      {/* RESULTS */}
      <AnimatePresence mode="wait">
        {showResults && results.length > 0 && (
          <motion.section
            key={activeResultTab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className={`${isNarrow ? "px-3" : "px-4 sm:px-6"} mt-6 pb-10`}
          >
            {activeResultTab === "summary" && (
              <div className="space-y-5">
                {results.map((res, ri) => (
                  <div key={ri} className="rounded-2xl border border-app bg-app-elevated p-5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                        {res.label}
                      </span>
                      {ri === bestPlanIdx && results.length > 1 && (
                        <span className="text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-tool-accent text-white font-semibold">
                          Best IRR
                        </span>
                      )}
                    </div>
                    <div className={`grid gap-3 ${isNarrow ? "grid-cols-2" : isMid ? "grid-cols-4" : "grid-cols-2"}`}>
                      {[
                        { label: "NPV of Payments", value: fmt(res.npv) },
                        { label: "Opportunity Cost", value: fmt(res.opportunityCost), tone: "rose" as RiskTone },
                        { label: "True Cost", value: fmt(res.trueCost) },
                        { label: "Effective Premium", value: fmtPct(res.effectivePremium), tone: (res.effectivePremium <= 0 ? "accent" : "rose") as RiskTone },
                        { label: "Value at Handover", value: fmt(res.handoverValue), tone: "accent" as RiskTone },
                        { label: "Paper Profit", value: fmt(res.paperProfit), tone: (res.paperProfit > 0 ? "accent" : "rose") as RiskTone },
                        { label: "IRR (Annualized)", value: `${res.irr.toFixed(1)}%`, tone: (res.irr > 0 ? "accent" : "rose") as RiskTone },
                        { label: "Total Paid", value: fmt(res.totalPaid) },
                      ].map((card, ci) => (
                        <motion.div
                          key={card.label}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: ci * 0.04, duration: 0.3, ease }}
                          className="rounded-xl border border-app bg-app p-3"
                        >
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                            {card.label}
                          </p>
                          <p
                            className={`mt-1.5 font-mono text-base font-semibold tabular-nums ${
                              card.tone === "accent"
                                ? "text-tool-accent"
                                : card.tone === "rose"
                                ? "text-rose-500 dark:text-rose-400"
                                : "text-app"
                            }`}
                          >
                            {card.value}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeResultTab === "schedule" && (
              <div className="space-y-5">
                {results.map((res, ri) => (
                  <div key={ri} className="rounded-2xl border border-app bg-app-elevated p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                        {res.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
                        Timeline · {res.constructionMonths}mo build
                      </span>
                    </div>

                    {/* Horizontal payment timeline rail */}
                    <PaymentTimeline schedule={timelineFromResult(res)} constructionMonths={res.constructionMonths} />

                    {/* Schedule table */}
                    <div className="mt-4 overflow-x-auto -mx-5 px-5">
                      <div className="min-w-[550px] rounded-xl border border-app bg-app overflow-hidden">
                        <div className="grid grid-cols-5 border-b border-app bg-app-elevated text-[10px] uppercase tracking-[0.12em] text-muted font-medium">
                          <div className="p-3">Month</div>
                          <div className="p-3">Description</div>
                          <div className="p-3">Amount</div>
                          <div className="p-3">Cumulative</div>
                          <div className="p-3">Balance</div>
                        </div>
                        {res.schedule.map((row, yi) => (
                          <motion.div
                            key={yi}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: yi * 0.025 }}
                            className={`grid grid-cols-5 text-sm font-mono tabular-nums ${yi < res.schedule.length - 1 ? "border-b border-app" : ""}`}
                          >
                            <div className="p-3 text-muted">M{row.month}</div>
                            <div className="p-3 text-secondary truncate font-sans">{row.description}</div>
                            <div className="p-3 text-app">{fmtShort(row.amount)}</div>
                            <div className="p-3 text-app">{fmtShort(row.cumulative)}</div>
                            <div className={`p-3 font-semibold ${row.balance > 0 ? "text-secondary" : "text-tool-accent"}`}>
                              {fmtShort(row.balance)}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeResultTab === "charts" && (
              <div className="space-y-5">
                {results.map((res, ri) => (
                  <div key={ri} className="rounded-2xl border border-app bg-app-elevated p-5">
                    <div className="mb-3">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                        {res.label} · Property Value vs Cumulative Payments
                      </span>
                    </div>
                    <ValueVsPaymentsChart result={res} />
                  </div>
                ))}

                <div className="rounded-2xl border border-app bg-app-elevated p-5">
                  <div className="mb-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                      Cumulative Payments{results.length > 1 ? " · All Plans" : ""}
                    </span>
                  </div>
                  <CumulativeChart results={results} />
                </div>
              </div>
            )}

            {activeResultTab === "compare" && results.length > 1 && (
              <div className="rounded-2xl border border-app bg-app-elevated p-5">
                <div className="mb-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-tool-accent font-semibold">
                    Plan Comparison
                  </span>
                </div>
                <div className="overflow-x-auto -mx-5 px-5">
                  <div
                    className="min-w-[600px] rounded-xl border border-app bg-app overflow-hidden"
                  >
                    <div
                      className="grid border-b border-app bg-app-elevated text-[10px] uppercase tracking-[0.12em] text-muted font-medium"
                      style={{ gridTemplateColumns: `200px repeat(${results.length}, 1fr)` }}
                    >
                      <div className="p-3">Metric</div>
                      {results.map((r, i) => (
                        <div key={i} className={`p-3 ${i === bestPlanIdx ? "text-tool-accent font-semibold" : ""}`}>
                          {r.label}{i === bestPlanIdx ? " · Best" : ""}
                        </div>
                      ))}
                    </div>
                    {[
                      { label: "During Construction", fn: (r: PlanResult) => fmt(r.totalDuringConstruction) },
                      { label: "Handover Payment", fn: (r: PlanResult) => fmt(r.handoverPayment) },
                      { label: "Post-Handover", fn: (r: PlanResult) => fmt(r.postHandover) },
                      { label: "NPV of Payments", fn: (r: PlanResult) => fmt(r.npv) },
                      { label: "Opportunity Cost", fn: (r: PlanResult) => fmt(r.opportunityCost) },
                      { label: "True Cost", fn: (r: PlanResult) => fmt(r.trueCost) },
                      { label: "Paper Profit", fn: (r: PlanResult) => fmt(r.paperProfit) },
                      { label: "IRR", fn: (r: PlanResult) => `${r.irr.toFixed(1)}%` },
                    ].map((row, rI, arr) => (
                      <div
                        key={rI}
                        className={`grid text-sm font-mono tabular-nums ${rI < arr.length - 1 ? "border-b border-app" : ""}`}
                        style={{ gridTemplateColumns: `200px repeat(${results.length}, 1fr)` }}
                      >
                        <div className="p-3 text-muted font-sans">{row.label}</div>
                        {results.map((r, i) => (
                          <div
                            key={i}
                            className={`p-3 ${i === bestPlanIdx ? "text-tool-accent font-semibold" : "text-secondary"}`}
                          >
                            {row.fn(r)}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Share buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-5 flex flex-wrap gap-3"
            >
              <button
                type="button"
                onClick={copyBreakdown}
                className="rounded-full border border-app bg-app-elevated text-secondary hover:text-app hover:border-tool-accent px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-medium transition-colors"
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                type="button"
                onClick={shareWhatsApp}
                className="rounded-full border border-tool-accent/30 bg-tool-accent-soft text-tool-accent hover:bg-tool-accent hover:text-white px-4 py-2 text-[11px] uppercase tracking-[0.15em] font-medium transition-colors"
              >
                Share via WhatsApp
              </button>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
