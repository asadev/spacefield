"use client";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  Suspense,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import PageHeader from "@/components/layout/PageHeader";
import ToolRecommendations from "@/components/ToolRecommendations";
import {
  DEVELOPERS,
  PROJECTS,
  STATUS_COLORS,
} from "@/lib/developer-pipeline-data";
import type { Developer, Project } from "@/lib/developer-pipeline-data";
import { useCanvasTone } from "@/lib/useCanvasTone";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type ViewMode = "kanban" | "timeline" | "list";
type Tab = "projects" | "developers" | "timeline";
type SortKey = "name" | "handover" | "price" | "percentComplete" | "units";
type DevSortKey = "deliveryScore" | "qualityScore" | "totalProjects";

const STATUS_ORDER: Project["status"][] = [
  "announced",
  "under-construction",
  "near-completion",
  "completed",
  "delayed",
];

const STATUS_LABELS: Record<Project["status"], string> = {
  "announced": "Announced",
  "under-construction": "Under Construction",
  "near-completion": "Near Completion",
  "completed": "Completed",
  "delayed": "Delayed",
};

/* ───────── Circular Gauge (Canvas) — themed ───────── */
function CircularGauge({
  value,
  label,
  size = 60,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 6;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (2 * Math.PI * value) / 100;

    // Read current accent from CSS var
    const accent =
      getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() ||
      "#f59e0b";

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(${tone},0.10)`;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.fillStyle = `rgb(${tone})`;
    ctx.font = `bold ${size * 0.24}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${value}`, cx, cy);
  }, [value, size, tone]);

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
      <span className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
    </div>
  );
}

/* ───────── Status Donut Chart (Canvas) ───────── */
function StatusDonut({ projects }: { projects: Project[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [projects]);

  // Status hue palette derived from amber theme + neutrals
  const colors: Record<string, string> = {
    announced: "#fcd34d",
    "under-construction": "#f59e0b",
    "near-completion": "#fbbf24",
    completed: "#a16207",
    delayed: "#ef4444",
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 180;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const total = projects.length;
    const cx = size / 2;
    const cy = size / 2;
    const r = 65;
    let currentAngle = -Math.PI / 2;

    Object.entries(statusCounts).forEach(([status, count]) => {
      const sliceAngle = (count / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, r, currentAngle, currentAngle + sliceAngle);
      ctx.arc(cx, cy, r - 20, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = colors[status] || "#666";
      ctx.fill();
      currentAngle += sliceAngle;
    });

    ctx.fillStyle = `rgb(${tone})`;
    ctx.font = "bold 24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${total}`, cx, cy - 8);
    ctx.font = "11px system-ui";
    ctx.fillStyle = `rgba(${tone},0.5)`;
    ctx.fillText("Projects", cx, cy + 12);
  }, [projects, statusCounts, tone]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} style={{ width: 180, height: 180 }} />
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div
            key={status}
            className="flex items-center gap-1.5 text-xs text-secondary"
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colors[status] }}
            />
            <span className="capitalize">{status.replace("-", " ")}</span>
            <span className="text-muted">({count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Developer Comparison Bar Chart (Canvas) ───────── */
function DeveloperChart({ developers }: { developers: Developer[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 600;
    const h = 300;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const accent =
      getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() ||
      "#f59e0b";
    const accentDeep =
      getComputedStyle(canvas).getPropertyValue("--tool-hue-deep").trim() ||
      "#b45309";

    const sorted = [...developers]
      .sort((a, b) => b.deliveryScore - a.deliveryScore)
      .slice(0, 10);
    const barWidth = 22;
    const gap = 38;
    const startX = 40;
    const baseY = h - 40;
    const maxH = h - 80;

    ctx.strokeStyle = `rgba(${tone},0.06)`;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = baseY - (maxH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(startX - 10, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${tone},0.3)`;
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${i * 25}`, startX - 14, y + 3);
    }

    sorted.forEach((dev, i) => {
      const x = startX + i * gap;
      const dH = (dev.deliveryScore / 100) * maxH;
      ctx.fillStyle = accent;
      ctx.fillRect(x, baseY - dH, barWidth, dH);
      const qH = (dev.qualityScore / 100) * maxH;
      ctx.fillStyle = accentDeep;
      ctx.fillRect(x + barWidth + 2, baseY - qH, barWidth, qH);
      ctx.fillStyle = `rgba(${tone},0.5)`;
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      ctx.save();
      ctx.translate(x + barWidth, baseY + 14);
      ctx.rotate(-0.4);
      ctx.fillText(dev.name.split(" ")[0], 0, 0);
      ctx.restore();
    });

    ctx.fillStyle = accent;
    ctx.fillRect(w - 160, 10, 10, 10);
    ctx.fillStyle = `rgba(${tone},0.6)`;
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Delivery", w - 145, 19);
    ctx.fillStyle = accentDeep;
    ctx.fillRect(w - 160, 28, 10, 10);
    ctx.fillStyle = `rgba(${tone},0.6)`;
    ctx.fillText("Quality", w - 145, 37);
  }, [developers, tone]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full max-w-[600px]"
      style={{ height: 300 }}
    />
  );
}

/* ───────── Units by Handover Year (Canvas) ───────── */
function UnitsByYearChart({ projects }: { projects: Project[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();
  const yearData = useMemo(() => {
    const data: Record<string, number> = {};
    projects.forEach((p) => {
      const year = p.expectedHandover.split("-")[0];
      data[year] = (data[year] || 0) + p.units;
    });
    return Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  }, [projects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 300;
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const accent =
      getComputedStyle(canvas).getPropertyValue("--tool-accent").trim() ||
      "#f59e0b";

    const maxUnits = Math.max(...yearData.map(([, u]) => u));
    const barWidth = 50;
    const gap = 20;
    const startX = (w - yearData.length * (barWidth + gap)) / 2;
    const baseY = h - 30;
    const maxH = h - 60;

    yearData.forEach(([year, units], i) => {
      const x = startX + i * (barWidth + gap);
      const bH = (units / maxUnits) * maxH;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x, baseY - bH, barWidth, bH, [4, 4, 0, 0]);
      ctx.fill();
      ctx.fillStyle = `rgba(${tone},0.6)`;
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(year, x + barWidth / 2, baseY + 16);
      ctx.fillStyle = `rgb(${tone})`;
      ctx.font = "bold 11px system-ui";
      ctx.fillText(units.toLocaleString(), x + barWidth / 2, baseY - bH - 8);
    });
  }, [yearData, tone]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full max-w-[300px]"
      style={{ height: 200 }}
    />
  );
}

/* ───────── In-tool app header ───────── */
function ToolAppHeader({
  stats,
  frame,
}: {
  stats: { activeCount: number; totalUnits: number; avgComplete: number };
  frame: boolean;
}) {
  return (
    <div
      className={`tool-hero relative overflow-hidden border-b border-app ${
        frame ? "" : "rounded-t-xl"
      }`}
    >
      {/* Faint blueprint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 28px)",
          color: "var(--tool-accent)",
          maskImage:
            "radial-gradient(ellipse at 80% 0%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 80% 0%, black 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-4 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-6 md:py-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent ring-1 ring-inset ring-tool-accent/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              Field Research
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-secondary md:inline">
              / Project Pipeline
            </span>
          </div>
          <h1 className="mt-2 text-[1.55rem] font-bold leading-tight tracking-tight text-app md:text-[1.85rem]">
            Developer Pipeline Tracker
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-secondary">
            Every major Dubai development — status, handover, construction
            progress, and developer reliability scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Active" value={String(stats.activeCount)} />
          <StatChip
            label="Units"
            value={stats.totalUnits.toLocaleString()}
          />
          <StatChip label="Avg %" value={`${stats.avgComplete}%`} accent />
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border px-3 py-1.5 ${
        accent
          ? "border-tool-accent/40 bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-secondary">
        {label}
      </span>
      <span
        className={`text-[13px] font-semibold leading-tight ${
          accent ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ───────── Project tile (used by kanban + list) ───────── */
function ProjectTile({
  project,
  expanded,
  onToggle,
  variant = "kanban",
}: {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
  variant?: "kanban" | "list";
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease }}
      onClick={onToggle}
      className={`group cursor-pointer rounded-xl border border-app bg-app-elevated p-3.5 transition hover:border-tool-accent/40 hover:bg-tool-accent-soft/20 ${
        variant === "list" ? "md:p-4" : ""
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight text-app">
            {project.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-secondary">
            {project.developer} · {project.area}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-semibold capitalize text-tool-accent ring-1 ring-inset ring-tool-accent/30">
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      {/* Completion bar — tool accent */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-[10px] text-muted">
          <span>Progress</span>
          <span className="font-semibold tabular-nums text-app">
            {project.percentComplete}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-app">
          <motion.div
            className="h-full rounded-full bg-tool-accent"
            initial={{ width: 0 }}
            animate={{ width: `${project.percentComplete}%` }}
            transition={{ duration: 0.6, ease }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-muted">Handover </span>
          <span className="text-app">{project.expectedHandover}</span>
        </div>
        <div>
          <span className="text-muted">Units </span>
          <span className="text-app">{project.units.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted">From </span>
          <span className="text-app">
            AED {(project.startPrice / 1000000).toFixed(1)}M
          </span>
        </div>
        <div>
          <span className="text-muted">PSF </span>
          <span className="text-app">
            AED {project.pricePerSqft.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-muted">
        Plan: {project.paymentPlan}
      </div>

      {project.highlights.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {project.highlights.slice(0, 3).map((h) => (
            <span
              key={h}
              className="rounded-full border border-app bg-app px-1.5 py-0.5 text-[10px] text-secondary"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 overflow-hidden border-t border-app pt-3"
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted">Type </span>
                <span className="capitalize text-secondary">{project.type}</span>
              </div>
              <div>
                <span className="text-muted">Launch </span>
                <span className="text-secondary">{project.launchDate}</span>
              </div>
              {project.actualHandover && (
                <div className="col-span-2">
                  <span className="text-muted">Actual handover </span>
                  <span className="text-tool-accent">
                    {project.actualHandover}
                  </span>
                </div>
              )}
            </div>
            {project.highlights.length > 3 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {project.highlights.slice(3).map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-app bg-app px-1.5 py-0.5 text-[10px] text-secondary"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═════════════════════════════ MAIN PAGE ═════════════════════════════ */
export default function DeveloperPipelinePage() {
  return (
    <Suspense fallback={null}>
      <DeveloperPipelineInner />
    </Suspense>
  );
}

function DeveloperPipelineInner() {
  const searchParams = useSearchParams();
  const frame = searchParams?.get("frame") === "1";

  const [activeTab, setActiveTab] = useState<Tab>("projects");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [selectedDevelopers, setSelectedDevelopers] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("percentComplete");
  const [devSortBy, setDevSortBy] = useState<DevSortKey>("deliveryScore");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [devFilter, setDevFilter] = useState<string | null>(null);
  const [showDevDropdown, setShowDevDropdown] = useState(false);

  const areas = useMemo(
    () => [...new Set(PROJECTS.map((p) => p.area))].sort(),
    []
  );
  const statuses: Project["status"][] = STATUS_ORDER;

  /* ───── Filtered projects ───── */
  const filteredProjects = useMemo(() => {
    let result = [...PROJECTS];
    if (devFilter) result = result.filter((p) => p.developer === devFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.developer.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q)
      );
    }
    if (selectedDevelopers.length > 0)
      result = result.filter((p) => selectedDevelopers.includes(p.developer));
    if (selectedStatus)
      result = result.filter((p) => p.status === selectedStatus);
    if (selectedArea) result = result.filter((p) => p.area === selectedArea);

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "handover":
          return a.expectedHandover.localeCompare(b.expectedHandover);
        case "price":
          return a.startPrice - b.startPrice;
        case "percentComplete":
          return b.percentComplete - a.percentComplete;
        case "units":
          return b.units - a.units;
        default:
          return 0;
      }
    });
    return result;
  }, [search, selectedDevelopers, selectedStatus, selectedArea, sortBy, devFilter]);

  /* ───── Kanban groups ───── */
  const kanbanGroups = useMemo(() => {
    const groups: Record<Project["status"], Project[]> = {
      "announced": [],
      "under-construction": [],
      "near-completion": [],
      "completed": [],
      "delayed": [],
    };
    filteredProjects.forEach((p) => groups[p.status].push(p));
    return groups;
  }, [filteredProjects]);

  /* ───── Summary stats ───── */
  const stats = useMemo(() => {
    const active = PROJECTS.filter((p) => p.status !== "completed");
    const totalUnits = active.reduce((s, p) => s + p.units, 0);
    const avgComplete = Math.round(
      active.reduce((s, p) => s + p.percentComplete, 0) / active.length
    );
    const upcoming = [...active].sort((a, b) =>
      a.expectedHandover.localeCompare(b.expectedHandover)
    );
    const nextHandover = upcoming.find((p) => p.percentComplete < 100);
    return {
      activeCount: active.length,
      totalUnits,
      avgComplete,
      nextHandover,
    };
  }, []);

  /* ───── Timeline data ───── */
  const timelineData = useMemo(() => {
    const grouped: Record<string, Project[]> = {};
    filteredProjects
      .filter((p) => p.status !== "completed")
      .forEach((p) => {
        const q = p.expectedHandover;
        if (!grouped[q]) grouped[q] = [];
        grouped[q].push(p);
      });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProjects]);

  /* ───── Sorted developers ───── */
  const sortedDevelopers = useMemo(() => {
    return [...DEVELOPERS].sort((a, b) => b[devSortBy] - a[devSortBy]);
  }, [devSortBy]);

  /* ───── Share / Export ───── */
  const copyScorecard = useCallback(() => {
    const lines = DEVELOPERS.sort(
      (a, b) => b.deliveryScore - a.deliveryScore
    ).map(
      (d) =>
        `${d.name}: Delivery ${d.deliveryScore}/100 | Quality ${d.qualityScore}/100 | Avg Delay ${d.avgDelay}mo`
    );
    const text = `Dubai Developer Scorecards\n${"=".repeat(40)}\n${lines.join(
      "\n"
    )}\n\nGenerated on example.com/tools/developer-pipeline`;
    navigator.clipboard.writeText(text);
  }, []);

  const shareWhatsApp = useCallback(() => {
    const text = encodeURIComponent(
      `Check out the Dubai Developer Pipeline Tracker - track construction progress, handover timelines & developer reliability scores:\nhttps://example.com/tools/developer-pipeline`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, []);

  const handleDevClick = useCallback((devName: string) => {
    setDevFilter(devName);
    setActiveTab("projects");
  }, []);

  const toggleDevFilter = useCallback((name: string) => {
    setSelectedDevelopers((prev) =>
      prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]
    );
  }, []);

  const hasActiveFilters =
    !!devFilter ||
    !!search ||
    selectedDevelopers.length > 0 ||
    !!selectedStatus ||
    !!selectedArea;

  const resetFilters = () => {
    setSearch("");
    setSelectedDevelopers([]);
    setSelectedStatus("");
    setSelectedArea("");
    setDevFilter(null);
  };

  return (
    <AuthGate>
      <div
        data-tool-theme="research"
        data-tool="developer-pipeline"
        className="tool-shell bg-app text-app"
      >
        {!frame && (
          <PageHeader
            label="Tool"
            title="Developer Pipeline Tracker"
            description="Track every major Dubai development — project status, handover timelines, construction progress, and developer reliability scores."
            color="amber"
          />
        )}

        <section
          className={`relative mx-auto ${
            frame
              ? "max-w-none px-3 pb-6 sm:px-4"
              : "max-w-[1280px] px-4 pb-24 sm:px-6 lg:px-10"
          }`}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="overflow-hidden rounded-xl border border-app bg-app-elevated ring-1 ring-tool-accent/10"
          >
            <ToolAppHeader stats={stats} frame={frame} />

            {/* Tab strip */}
            <div className="flex flex-wrap items-center gap-2 border-b border-app bg-tool-accent-soft/30 px-4 py-3 sm:px-5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                Section
              </span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { key: "projects", label: "Projects" },
                    { key: "developers", label: "Scorecard" },
                    { key: "timeline", label: "Timeline" },
                  ] as { key: Tab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      if (tab.key !== "projects") setDevFilter(null);
                    }}
                    className={`rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                      activeTab === tab.key
                        ? "bg-tool-accent text-black shadow-sm"
                        : "bg-app-elevated text-app hover:bg-tool-accent-soft hover:text-tool-accent"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={copyScorecard}
                  className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
                >
                  Copy Scorecard
                </button>
                <button
                  onClick={shareWhatsApp}
                  className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
                >
                  WhatsApp
                </button>
              </div>
            </div>

            {/* Active dev-filter chip */}
            {devFilter && (
              <div className="flex items-center gap-2 border-b border-app bg-tool-accent-soft/20 px-4 py-2 sm:px-5">
                <span className="text-[10px] uppercase tracking-widest text-secondary">
                  Filtered by
                </span>
                <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[11px] font-semibold text-tool-accent ring-1 ring-inset ring-tool-accent/30">
                  {devFilter}
                </span>
                <button
                  onClick={() => setDevFilter(null)}
                  className="text-[10px] uppercase tracking-widest text-muted transition hover:text-tool-accent"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="px-4 py-5 sm:px-5 sm:py-6">
              <AnimatePresence mode="wait">
                {/* ═══════════ PROJECTS TAB ═══════════ */}
                {activeTab === "projects" && (
                  <motion.div
                    key="projects"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Filters row */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search projects, developers, areas..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="min-w-[220px] flex-1 rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition placeholder:text-faint focus:border-app-focus focus:ring-2 focus:ring-tool-accent/40"
                      />

                      {/* Developer multi-select */}
                      <div className="relative">
                        <button
                          onClick={() => setShowDevDropdown(!showDevDropdown)}
                          className="min-w-[150px] rounded-lg border border-app bg-app-elevated px-3 py-2 text-left text-sm text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
                        >
                          {selectedDevelopers.length > 0
                            ? `${selectedDevelopers.length} developer${
                                selectedDevelopers.length > 1 ? "s" : ""
                              }`
                            : "All Developers"}
                        </button>
                        {showDevDropdown && (
                          <div className="absolute z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-app bg-app-elevated shadow-menu">
                            {DEVELOPERS.map((d) => (
                              <button
                                key={d.name}
                                onClick={() => toggleDevFilter(d.name)}
                                className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-tool-accent-soft ${
                                  selectedDevelopers.includes(d.name)
                                    ? "text-tool-accent"
                                    : "text-secondary"
                                }`}
                              >
                                {selectedDevelopers.includes(d.name)
                                  ? "✓ "
                                  : "  "}
                                {d.name}
                              </button>
                            ))}
                            <button
                              onClick={() => setShowDevDropdown(false)}
                              className="w-full border-t border-app py-1.5 text-center text-[10px] uppercase tracking-widest text-muted hover:text-tool-accent"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>

                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-secondary outline-none transition focus:ring-2 focus:ring-tool-accent/40"
                      >
                        <option value="">All Statuses</option>
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedArea}
                        onChange={(e) => setSelectedArea(e.target.value)}
                        className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-secondary outline-none transition focus:ring-2 focus:ring-tool-accent/40"
                      >
                        <option value="">All Areas</option>
                        {areas.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortKey)}
                        className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-secondary outline-none transition focus:ring-2 focus:ring-tool-accent/40"
                      >
                        <option value="percentComplete">Sort: % Complete</option>
                        <option value="name">Sort: Name</option>
                        <option value="handover">Sort: Handover</option>
                        <option value="price">Sort: Price</option>
                        <option value="units">Sort: Units</option>
                      </select>

                      {hasActiveFilters && (
                        <button
                          onClick={resetFilters}
                          className="text-[10px] uppercase tracking-widest text-muted transition hover:text-tool-accent"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* View-mode segmented control */}
                    <div className="mb-4 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-secondary">
                        View
                      </span>
                      <div className="inline-flex rounded-lg border border-app bg-app p-0.5">
                        {(
                          [
                            { key: "kanban", label: "Kanban" },
                            { key: "timeline", label: "Timeline" },
                            { key: "list", label: "List" },
                          ] as { key: ViewMode; label: string }[]
                        ).map((m) => (
                          <button
                            key={m.key}
                            onClick={() => setViewMode(m.key)}
                            className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                              viewMode === m.key
                                ? "bg-tool-accent text-black shadow-sm"
                                : "text-secondary hover:text-tool-accent"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <span className="ml-auto text-[10px] uppercase tracking-widest text-muted tabular-nums">
                        {filteredProjects.length} project
                        {filteredProjects.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* ───── KANBAN ───── */}
                    {viewMode === "kanban" && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                        {STATUS_ORDER.map((status) => {
                          const items = kanbanGroups[status];
                          return (
                            <div
                              key={status}
                              className="flex min-h-[120px] flex-col rounded-xl border border-app bg-app-elevated"
                            >
                              {/* Column header strip */}
                              <div className="rounded-t-xl border-b border-app bg-tool-accent-soft/40 px-3 py-2">
                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-tool-accent">
                                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                                    {STATUS_LABELS[status]}
                                  </span>
                                  <span className="text-[10px] tabular-nums text-secondary">
                                    {items.length}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 p-2">
                                {items.length === 0 ? (
                                  <div className="px-2 py-6 text-center text-[11px] text-muted">
                                    Empty
                                  </div>
                                ) : (
                                  items.map((p) => (
                                    <ProjectTile
                                      key={p.name}
                                      project={p}
                                      expanded={expandedProject === p.name}
                                      onToggle={() =>
                                        setExpandedProject(
                                          expandedProject === p.name
                                            ? null
                                            : p.name
                                        )
                                      }
                                    />
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ───── LIST (grid of tiles) ───── */}
                    {viewMode === "list" && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProjects.map((p) => (
                          <ProjectTile
                            key={p.name}
                            project={p}
                            variant="list"
                            expanded={expandedProject === p.name}
                            onToggle={() =>
                              setExpandedProject(
                                expandedProject === p.name ? null : p.name
                              )
                            }
                          />
                        ))}
                      </div>
                    )}

                    {/* ───── TIMELINE (within projects tab) ───── */}
                    {viewMode === "timeline" && (
                      <div className="relative">
                        {/* Horizontal rail */}
                        <div className="absolute left-0 right-0 top-3 h-px bg-app" />
                        <div className="space-y-6">
                          {timelineData.map(([quarter, projects]) => {
                            const totalUnits = projects.reduce(
                              (s, p) => s + p.units,
                              0
                            );
                            return (
                              <div key={quarter} className="relative pl-6">
                                {/* milestone dot */}
                                <div className="absolute left-0 top-2 flex h-6 w-6 items-center justify-center">
                                  <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-tool-accent opacity-50" />
                                  <span className="relative h-2.5 w-2.5 rounded-full bg-tool-accent ring-2 ring-app-elevated" />
                                </div>
                                <div className="mb-2 flex items-baseline gap-3">
                                  <h3 className="text-sm font-semibold text-app">
                                    {quarter}
                                  </h3>
                                  <span className="text-[11px] text-secondary">
                                    {projects.length} project
                                    {projects.length > 1 ? "s" : ""} ·{" "}
                                    {totalUnits.toLocaleString()} units
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                                  {projects.map((p) => (
                                    <ProjectTile
                                      key={p.name}
                                      project={p}
                                      expanded={expandedProject === p.name}
                                      onToggle={() =>
                                        setExpandedProject(
                                          expandedProject === p.name
                                            ? null
                                            : p.name
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filteredProjects.length === 0 && (
                      <div className="py-16 text-center text-sm text-muted">
                        No projects match your filters.
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ═══════════ DEVELOPERS TAB ═══════════ */}
                {activeTab === "developers" && (
                  <motion.div
                    key="developers"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-secondary">
                        Sort
                      </span>
                      {(
                        [
                          { key: "deliveryScore", label: "Delivery" },
                          { key: "qualityScore", label: "Quality" },
                          { key: "totalProjects", label: "Projects" },
                        ] as { key: DevSortKey; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setDevSortBy(opt.key)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                            devSortBy === opt.key
                              ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                              : "border-app bg-app-elevated text-secondary hover:border-tool-accent/30 hover:text-tool-accent"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {sortedDevelopers.map((dev) => (
                        <motion.div
                          key={dev.name}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, ease }}
                          onClick={() => handleDevClick(dev.name)}
                          className="cursor-pointer rounded-xl border border-app bg-app-elevated p-4 transition hover:border-tool-accent/40 hover:bg-tool-accent-soft/20"
                        >
                          <h3 className="text-sm font-semibold text-app">
                            {dev.name}
                          </h3>
                          <p className="mt-0.5 text-[10px] text-muted">
                            {dev.speciality} · Est. {dev.established}
                          </p>

                          <div className="mt-3 flex items-center gap-4">
                            <CircularGauge
                              value={dev.deliveryScore}
                              label="Delivery"
                              size={56}
                            />
                            <CircularGauge
                              value={dev.qualityScore}
                              label="Quality"
                              size={56}
                            />
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xs font-semibold text-app">
                                {dev.totalProjects}
                              </p>
                              <p className="text-[10px] text-muted">Total</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-app">
                                {dev.completedProjects}
                              </p>
                              <p className="text-[10px] text-muted">Done</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-app">
                                {dev.activeProjects}
                              </p>
                              <p className="text-[10px] text-muted">Active</p>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-between border-t border-app pt-3 text-xs">
                            <span className="text-muted">Avg Delay</span>
                            <span
                              className={`font-medium ${
                                dev.avgDelay <= 6
                                  ? "text-tool-accent"
                                  : dev.avgDelay <= 12
                                  ? "text-amber-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {dev.avgDelay} months
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-app bg-app-elevated p-5">
                        <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                          Top 10 — Delivery vs Quality
                        </h4>
                        <div className="flex justify-center overflow-x-auto">
                          <DeveloperChart developers={DEVELOPERS} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-app bg-app-elevated p-5">
                        <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                          Project Status Distribution
                        </h4>
                        <div className="flex justify-center">
                          <StatusDonut projects={PROJECTS} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ═══════════ TIMELINE TAB ═══════════ */}
                {activeTab === "timeline" && (
                  <motion.div
                    key="timeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-6 rounded-xl border border-app bg-app-elevated p-5">
                      <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                        Units by Handover Year
                      </h4>
                      <div className="flex justify-center">
                        <UnitsByYearChart projects={PROJECTS} />
                      </div>
                    </div>

                    {/* Vertical timeline rail with accent dots */}
                    <div className="relative space-y-5 pl-6">
                      <div className="absolute bottom-0 left-2 top-0 w-px bg-app" />
                      {timelineData.map(([quarter, projects]) => {
                        const totalUnits = projects.reduce(
                          (s, p) => s + p.units,
                          0
                        );
                        return (
                          <motion.div
                            key={quarter}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, ease }}
                            className="relative"
                          >
                            <span className="absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full bg-tool-accent ring-2 ring-app-elevated" />
                            <div className="mb-2 flex items-baseline gap-3">
                              <h3 className="text-sm font-semibold text-app">
                                {quarter}
                              </h3>
                              <span className="text-[11px] text-secondary">
                                {projects.length} project
                                {projects.length > 1 ? "s" : ""} ·{" "}
                                {totalUnits.toLocaleString()} units
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                              {projects.map((p) => (
                                <div
                                  key={p.name}
                                  className="rounded-xl border border-app bg-app-elevated p-3"
                                >
                                  <div className="mb-1.5 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-app">
                                        {p.name}
                                      </p>
                                      <p className="text-[10px] text-muted">
                                        {p.developer}
                                      </p>
                                    </div>
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-semibold capitalize text-tool-accent ring-1 ring-inset ring-tool-accent/30">
                                      {STATUS_LABELS[p.status]}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-app">
                                      <div
                                        className="h-full rounded-full bg-tool-accent"
                                        style={{
                                          width: `${p.percentComplete}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-[10px] tabular-nums text-secondary">
                                      {p.percentComplete}%
                                    </span>
                                  </div>
                                  <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                                    <span>
                                      {p.units.toLocaleString()} units
                                    </span>
                                    <span>
                                      AED{" "}
                                      {(p.startPrice / 1000000).toFixed(1)}M+
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Recommendations — hidden inside frame */}
          {!frame && (
            <div className="mt-12">
              <ToolRecommendations slug="developer-pipeline" />
            </div>
          )}
        </section>

        {/* Suppress unused-import warning for STATUS_COLORS — kept for future use */}
        <span className="hidden">{STATUS_COLORS.completed}</span>
      </div>
    </AuthGate>
  );
}
